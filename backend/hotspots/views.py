import datetime
from django.shortcuts import render
from django.utils import timezone
from django.db import connections
from django.views.decorators.clickjacking import xframe_options_exempt
import json
import requests
import time
from django.http import JsonResponse
from utils.logging import create_log
from wifi.models import WifiSubscriptions, WifiTarrifs, WifiSubscriptionPayments, WifiRouters
from authentication.utils.utils import get_telco_by_phone_number, generate_reference_number, use_reference_number
from intergrations.jambopay.jambopay_check_payment_status import check_payment_status
from decouple import config
import re
import datetime
from django.db import transaction, connections
from django.utils import timezone
from django.shortcuts import render, redirect
from payments.models import UserAccounts
import datetime
from django.utils import timezone
from django.db import connections
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.clickjacking import xframe_options_exempt
import requests
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
import urllib.parse


@xframe_options_exempt
def hotspot_login_view(request):
    """
    Handles the landing page logic (GET) by looking up subscriptions natively 
    in Kenyan local time, and initializes M-Pesa STK checkouts (POST).
    """
    tariffs = []
    router_obj = None

    # --- 📡 FIRST HANDSHAKE SUB-BRANCH (GET) ---
    if request.method == "GET":
        mac = request.GET.get('mac', '').strip().lower()
        nas_id = request.GET.get('nas_id', '').strip()
        router_ip = request.GET.get('router_ip', '').strip()
        login_url = request.GET.get('login_url', '').strip()
        
        create_log("info", f"First Handshake GET - MAC: {mac}, NAS: {nas_id}")
        
        router_obj = WifiRouters.objects.filter(nas_id=nas_id).first() if nas_id else None
        if router_obj and router_obj.entity:
            tariffs = WifiTarrifs.objects.filter(entity=router_obj.entity).exclude(price=0).order_by('price')
        
        # 🛠️ RAW NATIVE LOCAL TIME: Fetches local time directly without UTC translation shifts
        now_local = datetime.datetime.now()
        
        # Validate unexpired access directly inside raw local database indices
        active_sub = WifiSubscriptions.objects.filter(
            mac_address=mac, 
            is_active="true", 
            valid_to__gt=now_local  # Directly evaluated against local Kenyan Time
        ).order_by('-valid_to').first()
        
        # 🔑 SUBSCRIPTION FOUND: Sync to RADIUS and log the client in instantly
        if active_sub:
            create_log("info", f"Active subscription valid until {active_sub.valid_to} matched for device: {mac}.")
            
            # FreeRADIUS month-first padding adjustment layout for single-digit days
            day = active_sub.valid_to.day
            day_str = f" {day}" if day < 10 else str(day)
            expiration_string = active_sub.valid_to.strftime(f"%b {day_str} %Y %H:%M:%S")
            
            remaining_seconds = int((active_sub.valid_to.replace(tzinfo=None) - now_local).total_seconds())
            bandwidth_limit = getattr(active_sub.tariff_selected, 'bandwidth_limit', "2M/4M")
            
            try:
                with connections['radius'].cursor() as cursor:
                    cursor.execute("DELETE FROM radcheck WHERE username = %s", [mac])
                    cursor.execute("DELETE FROM radreply WHERE username = %s", [mac])
                    
                    cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Cleartext-Password', ':=', %s)", [mac, mac])
                    cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Expiration', ':=', %s)", [mac, expiration_string])
                    cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Session-Timeout', '=', %s)", [mac, str(remaining_seconds)])
                    cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Mikrotik-Rate-Limit', '=', %s)", [mac, bandwidth_limit])
                create_log("info",f"URL: {login_url}")
                return render(request, 'hotspots/connecting.html', {
                    'login_url': login_url, 'username': mac, 'password': mac, 'psp_ref': '', 'nas_id': nas_id,
                    'message': 'Welcome back! Syncing your active session parameters...'
                })
            except Exception as radius_error:
                create_log("error", f"Auto-Sync FreeRADIUS GET view failure: {str(radius_error)}")
        else:
            create_log("info", "No active subscription")
        # Check if this specific device has already consumed a trial at this router node
        has_used_trial = WifiSubscriptions.objects.filter(
            mac_address=mac,
            tariff_selected__price=0,
            tariff_selected__router__router_ip=router_ip
        ).exists()

        # The device is eligible only if no prior free tier records match the current router node
        eligible_for_trial = not has_used_trial
        
        # Default Fallback: No subscription active -> serve landing choice screen
        return render(request, 'hotspots/login.html', {
            'title': router_obj.title if router_obj else 'Wazi WiFi',
            'router_ip': router_ip, 'mac': mac, 'tariffs': tariffs, 'login_url': login_url, 'nas_id': nas_id, 'eligible_for_trial': eligible_for_trial,
            'message': 'Router identification error' if (nas_id and not router_obj) else ''
        })

    # --- 💳 STK PAYMENT CHECKOUT INITIALIZATION (POST) ---
    if request.method == "POST":
        tariff_id = request.POST.get('tariff')
        phone = request.POST.get('phone_number', '').strip()
        router_ip = request.POST.get('router_ip', '').strip()
        mac = request.POST.get('mac_address', '').strip().lower()
        nas_id = request.POST.get('nas_id', '').strip()
        login_url = request.POST.get('login_url', '').strip()
        
        router_obj = WifiRouters.objects.filter(nas_id=nas_id).first() if nas_id else None
        if router_obj and router_obj.entity:
            tariffs = WifiTarrifs.objects.filter(entity=router_obj.entity).exclude(price=0).order_by('price')
            
        if not router_obj or not router_obj.entity.administrator:
            query_params = urllib.parse.urlencode({
            'message': 'Router details not retrieved.',
            'login_url': login_url,
            'mac': mac,
            'nas_id': nas_id,
            'router_ip': router_ip
            })
            return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
            # return render(request, 'hotspots/payment_failed.html', {'message': 'Entity administrator configuration error.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

        user_account = UserAccounts.objects.filter(owner=router_obj.entity.administrator).first()
        tariff_obj = WifiTarrifs.objects.filter(id=tariff_id).first()
        
        if not user_account or not tariff_obj:
            query_params = urllib.parse.urlencode({
            'message': 'System collection account tracking failure status.',
            'login_url': login_url,
            'mac': mac,
            'nas_id': nas_id,
            'router_ip': router_ip
            })
            return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
            # return render(request, 'hotspots/payment_failed.html', {'message': 'System account tracking failure status.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

        telco, formatted_phone_number = get_telco_by_phone_number(phone)
        reference_number = generate_reference_number(tariff_obj.entity, tariff_obj.owner)

        payload_data = {
            "orderId": reference_number, "amount": int(tariff_obj.price), "accountTo": config('WAZIPOS_JAMBOPAY_COLLECTION_ACCOUNT'),
            "description": f"WiFi Sub - {mac}", "modeOfPayment": "MOBILE_MONEY",
            "provider": "Mpesa" if telco == "MPESA" else "AIRTELMONEY",
            "data": {"phoneNumber": formatted_phone_number, "serviceType": "TOPUP"}, "callBackUrl": "https://webhook.site"
        }
        if telco == "AIRTELMONEY": 
            payload_data["currency"] = "KES"

        try:
            auth_data = {"client_id": config("JAMBOPAY_CLIENT_ID"), "client_secret": config("JAMBOPAY_CLIENT_SECRET"), "grant_type": config("JAMBOPA_GRANT_TYPE")}
            auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=auth_data, timeout=8)
            token = auth_res.json().get("access_token")
            
            checkout_res = requests.post(config("JAMBOPAY_BASE_URL") + "/checkout/express", data=json.dumps(payload_data), headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "Accept": "*/*"}, timeout=10)
            result_json = checkout_res.json()
        except Exception as e:
            create_log("error", f"Payment Gateway Handshake Interrupted: {str(e)}")
            query_params = urllib.parse.urlencode({
            'message': 'Payment services offline. Please attempt again shortly.',
            'login_url': login_url,
            'mac': mac,
            'nas_id': nas_id,
            'router_ip': router_ip
            })
            return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
            # return render(request, 'hotspots/payment_failed.html', {'message': 'Payment services offline. Please attempt again shortly.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

        if result_json and result_json.get("ref"):
            psp_ref = result_json["ref"]
            
            WifiSubscriptionPayments.objects.create(
                tariff=tariff_obj, reference_number=reference_number, status="PENDING",
                amount=int(tariff_obj.price), entity=tariff_obj.entity, currency="KES",
                psp_reference_number=psp_ref, telco=telco, is_settled="false",account=user_account
            )
            use_reference_number(reference_number)

            return render(request, 'hotspots/connecting.html', {
                'login_url': login_url, 'username': mac, 'password': mac, 'psp_ref': psp_ref,
                'nas_id': nas_id, 'tariff_id': tariff_id,
                'message': 'STK Push prompt dispatched! Enter your PIN on your phone to connect.'
            })
        query_params = urllib.parse.urlencode({
        'message': 'Express transaction processing checkout drop.',
        'login_url': login_url,
        'mac': mac,
        'nas_id': nas_id,
        'router_ip': router_ip
        })
        return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
        # return render(request, 'hotspots/payment_failed.html', {'message': 'Express transaction processing checkout drop.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})



@xframe_options_exempt
def check_payment_status_api(request):
    """
    Asynchronous JSON Endpoint polled by connecting.html.
    Prioritizes real-time gateway checks via psp_ref, updates payment rows,
    and handles downstream subscription creation and RADIUS synchronization.
    """
    psp_ref = request.GET.get('ref', '').strip()
    nas_id = request.GET.get('nas_id', '').strip()
    mac = request.GET.get('mac', '').strip().lower()
    tariff_id = request.GET.get('tariff_id', '').strip()

    if not psp_ref:
        return JsonResponse({"status": "PENDING", "error": "Missing transaction token reference."})

    # Locate tracking entry row parameters
    payment = WifiSubscriptionPayments.objects.filter(psp_reference_number=psp_ref).first()
    if not payment:
        return JsonResponse({"status": "PENDING", "error": "Internal tracking record not found."})

    # =========================================================================
    # 🎯 STEP 1: PRIORITIZE GATEWAY QUERY (Fetch status straight from JamboPay)
    # =========================================================================
    gateway_status = "PENDING"
    try:
        auth_data = {
            "client_id": config("JAMBOPAY_CLIENT_ID"),
            "client_secret": config("JAMBOPAY_CLIENT_SECRET"),
            "grant_type": config("JAMBOPA_GRANT_TYPE")
        }
        auth_res = requests.post(config("JAMBOPAY_AUTH_URL1"), data=auth_data, timeout=4)
        token = auth_res.json().get("access_token")
        
        if token:
            # Active check request hitting the payment processing node directly
            status_res = check_payment_status(psp_ref, token)
            
            # Safe tuple/dictionary unpacking handler blocks
            if isinstance(status_res, tuple):
                response_dict = status_res[1] if len(status_res) > 1 else {}
                gateway_status = response_dict.get("status", "PENDING") if isinstance(response_dict, dict) else "PENDING"
            else:
                gateway_status = status_res.get("status", "PENDING") if status_res else "PENDING"
            
            create_log("info", f"JamboPay Real-Time Status Check result for Ref [{psp_ref}]: {gateway_status}")
    except Exception as api_err:
        create_log("error", f"Proactive payment status validation fetch error: {str(api_err)}")
        # Fallback to local DB record state if payment provider endpoint severs packets temporarily
        gateway_status = payment.status

    # =========================================================================
    # 💾 STEP 2: IMMEDIATELY UPDATE WIFISUBSCRIPTIONPAYMENTS WITH THE RESULT
    # =========================================================================
    if gateway_status in ["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"]:
        if payment.status != gateway_status:
            payment.status = gateway_status
            payment.save()
            create_log("info", f"Updated WifiSubscriptionPayments row status index to: {gateway_status}")

    # =========================================================================
    # 🔑 STEP 3: IF SUCCESS, CREATE SUBSCRIPTION, UPDATE RADIUS, LOG USER IN
    # =========================================================================
    if payment.status == "SUCCESS":
        # Check layout constraints to ensure we do not generate duplicate database subscriptions
        sub_exists = WifiSubscriptions.objects.filter(payment=payment).exists()
        
        if not sub_exists:
            tariff_obj = WifiTarrifs.objects.filter(id=tariff_id).first()
            
            # NATIVE LOCAL TIME ANCHORING: No UTC translation loops
            now_local = datetime.datetime.now()
            length = tariff_obj.length if tariff_obj else 1
            duration_unit = tariff_obj.duration.lower() if tariff_obj else "hour"
            
            if duration_unit == "hour": expiry_local = now_local + datetime.timedelta(hours=length)
            elif duration_unit == "day": expiry_local = now_local + datetime.timedelta(days=length)
            elif duration_unit == "week": expiry_local = now_local + datetime.timedelta(weeks=length)
            elif duration_unit == "month": expiry_local = now_local + datetime.timedelta(days=length * 30)
            else: expiry_local = now_local + datetime.timedelta(hours=1)
            
            session_timeout_seconds = int((expiry_local - now_local).total_seconds())

            try:
                # Atomically write local subscription parameters to the DB
                with transaction.atomic(using='default'):
                    WifiSubscriptions.objects.create(
                        entity=getattr(tariff_obj, 'entity', None),
                        tariff_selected=tariff_obj,
                        mac_address=mac,
                        username=mac,
                        password=mac,
                        payment=payment,
                        owner=getattr(tariff_obj, 'owner', None),
                        valid_from=now_local,   # Written explicitly as Local Time
                        valid_to=expiry_local,  # Written explicitly as Local Time
                        is_active="true"
                    )
                
                # Format strict month-first space-padding schema for FreeRADIUS ("Jun  9 2026 14:15:00")
                day = expiry_local.day
                day_str = f" {day}" if day < 10 else str(day)
                expiration_string = expiry_local.strftime(f"%b {day_str} %Y %H:%M:%S")

                # Inject accounting validation rows straight into FreeRADIUS memory tables
                with connections['radius'].cursor() as cursor:
                    cursor.execute("DELETE FROM radcheck WHERE username = %s", [mac])
                    cursor.execute("DELETE FROM radreply WHERE username = %s", [mac])
                    
                    cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Cleartext-Password', ':=', %s)", [mac, mac])
                    cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Expiration', ':=', %s)", [mac, expiration_string])
                    cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Session-Timeout', '=', %s)", [mac, str(session_timeout_seconds)])
                
                create_log("info", f"Local registration saved & RADIUS table synced successfully for device: {mac}")
            except Exception as async_err:
                create_log("error", f"Downstream profile tracking generation pipeline failure: {str(async_err)}")
                return JsonResponse({"status": "PENDING", "error": "AAA data synchronization failure"})

        # Signal frontend JavaScript to trigger automatic form submit event to log user into wifi
        return JsonResponse({"status": "SUCCESS"})

    elif payment.status in ["FAILED", "CANCELLED", "TIMEOUT"]:
        return JsonResponse({"status": "FAILED"})

    # Catch-all default state keeps frontend polling spin active
    return JsonResponse({"status": "PENDING"})

def payment_failed_view(request):
    """
    Renders the custom fallback error screen when transactions break.
    """
    return render(request, 'hotspots/payment_failed.html', {
        'message': request.GET.get('message', 'Transaction processing dropped.'),
        'login_url': request.GET.get('login_url', ''),
        'mac': request.GET.get('mac', ''),
        'nas_id': request.GET.get('nas_id', ''),
        'router_ip': request.GET.get('router_ip', '')
    })

# Strict regex to validate any MAC address format uniformly
MAC_REGEX = re.compile(r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$')

@xframe_options_exempt
def hotspot_trial_view(request):
    """
    Handles localized 20-minute trial subscription records generation workflow routines.
    Enforces identical raw local time checks to completely block reuse loops.
    """
    if request.method != "POST":
        return redirect('hotspots:login')

    mac = request.POST.get('mac_address', '').strip().lower()
    nas_id = request.POST.get('nas_id', '').strip()
    router_ip = request.POST.get('router_ip', '').strip()
    login_url = request.POST.get('login_url', '').strip()

    if not mac or not MAC_REGEX.match(mac):
        query_params = urllib.parse.urlencode({
        'message': 'Invalid device mac identifier hardware properties.',
        'login_url': login_url,
        'mac': mac,
        'nas_id': nas_id,
        'router_ip': router_ip
        })
        return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
        # return render(request, 'hotspots/payment_failed.html', {'message': 'Invalid device mac identifier hardware properties.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

    tariffs = []
    router_obj = WifiRouters.objects.filter(nas_id=nas_id).first() if nas_id else None
    if router_obj and router_obj.entity:
        tariffs = WifiTarrifs.objects.filter(entity=router_obj.entity).order_by('price')

    # Validate against past trials using the exact pricing match rule
    already_used = WifiSubscriptions.objects.filter(mac_address=mac, tariff_selected__price=0).exists()
    if already_used:
        return render(request, 'hotspots/login.html', {
            'tariffs': tariffs, 'nas_id': nas_id, 'mac': mac, 'router_ip': router_ip, 'login_url': login_url,
            'title': router_obj.title if router_obj else 'Wazi WiFi',
            'message': 'This device has already exhausted its free trial allocation.'
        })

    trial_tariff = WifiTarrifs.objects.filter(entity=router_obj.entity, price=0).first() if router_obj else None
    if not trial_tariff:
        trial_tariff = WifiTarrifs.objects.filter(price=0).first()

    if not trial_tariff:
        return render(request, 'hotspots/login.html', {
            'tariffs': tariffs, 'nas_id': nas_id, 'mac': mac, 'router_ip': router_ip, 'login_url': login_url,
            'title': router_obj.title if router_obj else 'Wazi WiFi',
            'message': 'Free trial access package is currently unconfigured on this network node.'
        })

    # 🛠️ NATIVE LOCAL TIME ANCHORS: Disabling UTC offset operations completely
    trial_minutes = 20
    trial_speed = "1M/2M"
    now_local = datetime.datetime.now()
    expiry_local = now_local + datetime.timedelta(minutes=trial_minutes)
    
    session_timeout_seconds = trial_minutes * 60
    
    day = expiry_local.day
    day_str = f" {day}" if day < 10 else str(day)
    expiration_string = expiry_local.strftime(f"%b {day_str} %Y %H:%M:%S")

    subscription = None
    try:
        with transaction.atomic(using='default'):
            subscription = WifiSubscriptions.objects.create(
                entity=getattr(trial_tariff, 'entity', None), tariff_selected=trial_tariff,
                mac_address=mac, username=mac, password=mac, payment=None,
                owner=getattr(trial_tariff, 'owner', None), valid_from=now_local, valid_to=expiry_local, is_active="true"
            )
        create_log("success", f"Trial Profile Saved: {subscription}")
    except Exception as local_error:
        create_log("error", f"Main DB trial save failure: {str(local_error)}")
        query_params = urllib.parse.urlencode({
        'message': 'Internal database storage tracking processing pipeline processing failure.',
        'login_url': login_url,
        'mac': mac,
        'nas_id': nas_id,
        'router_ip': router_ip
        })
        return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
        # return render(request, 'hotspots/payment_failed.html', {'message': 'Internal database storage tracking processing pipeline processing failure.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

    try:
        with connections['radius'].cursor() as cursor:
            cursor.execute("DELETE FROM radcheck WHERE username = %s", (mac,))
            cursor.execute("DELETE FROM radreply WHERE username = %s", (mac,))
            cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Cleartext-Password', ':=', %s)", (mac, mac))
            cursor.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (%s, 'Expiration', ':=', %s)", (mac, expiration_string))
            cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Session-Timeout', '=', %s)", (mac, str(session_timeout_seconds)))
            cursor.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (%s, 'Mikrotik-Rate-Limit', '=', %s)", (mac, trial_speed))
    except Exception as radius_error:
        if subscription:
            subscription.delete()
        create_log("error", f"FreeRADIUS Remote engine trial sync failed: {str(radius_error)}")
        query_params = urllib.parse.urlencode({
        'message': 'Radius profile injection timeout. Access not updated.',
        'login_url': login_url,
        'mac': mac,
        'nas_id': nas_id,
        'router_ip': router_ip
        })
        return redirect(f"{reverse('hotspots:payment_failed')}?{query_params}")
        # return render(request, 'hotspots/payment_failed.html', {'message': 'Radius profile injection timeout. Access not updated.', 'login_url': login_url, 'mac': mac, 'nas_id': nas_id, 'router_ip': router_ip})

    return render(request, 'hotspots/connecting.html', {
        'login_url': login_url, 'username': mac, 'password': mac, 'psp_ref': '', 'nas_id': nas_id,
        'message': 'Free trial access granted! Establishing your session...'
    })
