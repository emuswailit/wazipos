
from datetime import datetime, timedelta
from django.utils import timezone
from intergrations.jambopay.jambopay_wallet import jambopay_check_wallet_payment_status
from transport.models import TicketPayment, SaccoSubscriptionPayment, TransferBookings,JourneyBookings
from celery import Celery
from transport.transport_utils import get_unsynced_today_ticket_payments,create_sacco_subscription_settlement, create_cashless_ticket_settlement,get_administrator_account,get_unsynced_today_sacco_subscription_payments
from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status
from authentication.utils.utils import generate_reference_number
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

app = Celery()
channel_layer = get_channel_layer()



#@app.task
def check_jambopay_wallet_transport_payment_status():
    expiring_tickets = []
    
    thirty_minutes_ago = datetime.now() + timedelta(minutes=30)
    
    if TicketPayment.objects.filter(is_settled=False,payment_method__title="JAMBOPAY WALLET",status="PENDING",).exists():
        ticket_payments = TicketPayment.objects.filter(is_settled=False,payment_method__title="JAMBOPAY WALLET",status="PENDING",).all()
        print("PENDING TRX", ticket_payments)
        print("PENDING TRX", ticket_payments)

        for payment in ticket_payments:
            print("Created", payment.created)
            print("TMA", thirty_minutes_ago)
            print("Payment ref", payment.psp_reference_number)
            result_json = jambopay_check_wallet_payment_status(payment.psp_reference_number)
            print("Trx status - JP wallet", result_json)
            if "status" in result_json:
                if result_json['status']=="PENDING":
                    # if payment.created
                    pass
                    # payment.status = "FAILED"
                    # payment.save()
                elif result_json['status']=="SUCCESS":
                    payment.status=result_json['status']
                    if not result_json['providerRef']==None:
                        payment.provider_reference_number=result_json['providerRef']
                    else:
                        payment.provider_reference_number= "N/A"
                    payment.psp_reference_number=result_json['ref']
                    payment.description = result_json['description']
                    payment.save()
                    print("Ticket Payment success")
                    for ticket in payment.tickets.all():
                        if result_json['status'] == 'SUCCESS':
                            ticket.is_paid="true"
                            ticket.payment_narrative=result_json['description']
                            ticket.payment_reference=result_json['ref']
                            ticket.payment_method = payment.payment_method
                            ticket.save()
                        if not result_json['providerRef']==None:
                            ticket.payment_reference=result_json['providerRef']
                        else:
                            ticket.payment_reference = "N/A"

                        ticket.payment_narrative=result_json['description']
                        ticket.payment_reference=result_json['ref']
                        ticket.save()
                elif result_json['status']=="FAILED":
                    payment.status=result_json['status']
                    if not result_json['providerRef']==None:
                        payment.provider_reference_number=result_json['providerRef']
                    else:
                        payment.provider_reference_number= "N/A"
                    payment.psp_reference_number=result_json['ref']
                    payment.description = result_json['description']
                    payment.save()
                    for ticket in payment.tickets.all():
                        if result_json['status'] == 'FAILED':
                            ticket.is_paid="false"
                            ticket.payment_narrative=result_json['description']
                            ticket.payment_reference=result_json['ref']
                            ticket.payment_method = payment.payment_method
                            ticket.save()
                        if not result_json['providerRef']==None:
                            ticket.payment_reference=result_json['providerRef']
                        else:
                            ticket.payment_reference = "N/A"

                        ticket.payment_narrative=result_json['description']
                        ticket.payment_reference=result_json['ref']
                        ticket.save()
                    
                    print("Give the ticket a chance")
      
            else:
                for ticket in payment.tickets.all():
                    if result_json['status'] == 'FAILED':
                        if result_json['description']:
                            ticket.payment_narrative=result_json['description']
                            ticket.payment_reference=result_json['ref']
                            ticket.payment_method = payment.payment_method
                            ticket.save()
                print("Errors in retrieving transaction details")     
    else:
        print("No pending wallet transport payments")

#@app.task
def check_jambopay_transport_payment_status():
    reference_number=""
    if TicketPayment.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").exists():
        ticket_payments = TicketPayment.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").all()
        for payment in ticket_payments:
            print("Checking ticket payment  status.....",payment.reference_number)
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Transport Ticket status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_number=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.description=result_json['description']
                    payment.save()
                    print("Ticket Payment success")
                    for ticket in payment.tickets.all():
                        ticket.is_paid="true"
                        ticket.payment_reference=result_json['providerRef']
                        ticket.payment_narrative=result_json['description'] +" : "+result_json['ref']
                        ticket.save()

                if result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    # payment.provider_reference_number=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.description=result_json['description']
                    payment.save()
                    print("Ticket Payment success")
                    for ticket in payment.tickets.all():
                        ticket.is_paid="false"
                        if result_json['providerRef']:
                            ticket.payment_reference=result_json['providerRef']
                            ticket.save()
                        if result_json['description']:
                            ticket.payment_narrative=result_json['description'] +" : "+result_json['ref']
                            ticket.save()   
                
                    # payment.status ="FAILED"
                    payment.save()
                    for ticket in payment.tickets.all():
                        ticket.payment_narrative=result_json['description']
                        ticket.save()
                    return 
   


    else:
        print("No pending transport payments")


#@app.task
def process_vehicle_collection_account_settlement():
    print("Process vehicle collection settlement")
   

#@app.task
def clean_up_old_incomplete_transactions():

    five_minutes_ago = timezone.now()-timezone.timedelta(minutes=5)
    if TicketPayment.objects.filter(created__gte=five_minutes_ago, status ="PENDING").exists():
        queryset =    TicketPayment.objects.filter(created__gte=five_minutes_ago, status ="PENDING").all()

        for ticket in queryset:
            # ticket.status= "FAILED"
            ticket.save()
            print("Old teicket", ticket)
    else:
        print("No old ticket payments to clean up")


@app.task
def settle_cashless_ticket_payments():
    unsettled_ticket_payments = get_unsynced_today_ticket_payments()
    if len(unsettled_ticket_payments)>0:
        print(f"We got {len(unsettled_ticket_payments)} unsettled ticket payments")
        for utp in unsettled_ticket_payments:
            print("CASHLESS TICKET PAYMENT", utp)
            if  utp.vehicle.administrator:
                admin = utp.vehicle.administrator
                print("Admin ako",utp.vehicle.administrator )
                admin_account = get_administrator_account( admin)
                if admin_account:
                    print("Account ya admin iko", admin_account.account_number)
                    create_cashless_ticket_settlement(utp,admin_account)
            else:
                print(f"{utp.vehicle} has no administrator to receive funds")

    else:
        print("No unsynced cashless ticket payments")


@app.task
def check_sacco_subscription_payment_status():
    queryset = []
    five_minutes_ago = timezone.now()-timezone.timedelta(minutes=5)

    if SaccoSubscriptionPayment.objects.filter( status ="PENDING").exists():
        queryset =    SaccoSubscriptionPayment.objects.filter( status ="PENDING").all()

    if SaccoSubscriptionPayment.objects.filter( status ="INITIATED").exists():
        queryset =    SaccoSubscriptionPayment.objects.filter( status ="INITIATED").all()

    if len(queryset)>0:
        for ssp in queryset:
            errors, result_json= jambopay_check_payment_status(ssp.psp_reference_number)
            if len(errors)>0:
                print("Errors at check payments status")
            elif result_json:
                ssp.narrative = result_json["description"]
                ssp.status = result_json["status"]
                ssp.provider_reference_number = result_json["providerRef"]
                ssp.save()

    else:
        print("NO PENDING SUBSCRIPTION PAYMENTS")


#@app.task
def settle_sacco_subscription_payments():
    unsettled_subscription_payments = get_unsynced_today_sacco_subscription_payments()
    if len(unsettled_subscription_payments)>0:
        print(f"We got {len(unsettled_subscription_payments)} unsettled ticket payments")
        for usp in unsettled_subscription_payments:
            if usp.sacco_subscription.sacco_settlement_account:
                account =usp.sacco_subscription.sacco_settlement_account
                reference_number = generate_reference_number(account.entity,account.owner)
     
                create_sacco_subscription_settlement(usp,account,reference_number)
            else:
                print(f"{usp.sacco_subscription} has no collection account to receive funds")

    else:
        print("No unsynced ticket payments")


#@app.task
def check_transfer_payments_status():
    reference_number=""
    if TransferBookings.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").exists():
        transfer_bookings = TransferBookings.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").all()
        for transfer_booking in transfer_bookings:
            print("Checking ticket transfer_booking  status.....",transfer_booking.reference_number)
            errors, result_json= jambopay_check_payment_status(transfer_booking.payment_reference)
            if result_json:
                print("Transfer payments Ticket status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    transfer_booking.status="SUCCESS"
                    transfer_booking.provider_reference_number=result_json['providerRef']
                    transfer_booking.psp_reference_number=result_json['ref']
                    transfer_booking.description=result_json['description']
                    transfer_booking.save()
                    print("Transfer Payment success")
                    for ticket in transfer_booking.tickets.all():
                        transfer_booking.is_setlled=True
                        ticket.is_paid="true"
                        ticket.transfer_booking_reference=result_json['providerRef']
                        ticket.transfer_booking_narrative=result_json['description'] +" : "+result_json['ref']
                        ticket.save()

                if result_json and result_json["status"]=="FAILED":
                    transfer_booking.status="FAILED"
                    # transfer_booking.provider_reference_number=result_json['providerRef']
                    # transfer_booking.psp_reference_number=result_json['ref']
                    transfer_booking.description=result_json['description']
                    transfer_booking.is_settled=True
                    transfer_booking.save()
                    print("Transfer Payment failed")
                    # for ticket in transfer_booking.tickets.all():
                    #     ticket.is_paid="false"
                    #     if result_json['providerRef']:
                    #         ticket.transfer_booking_reference=result_json['providerRef']
                    #         ticket.save()
                    #     if result_json['description']:
                    #         ticket.transfer_booking_narrative=result_json['description'] +" : "+result_json['ref']
                    #         ticket.save()   
                
                    # transfer_booking.status ="FAILED"
                    transfer_booking.save()
                    # for ticket in transfer_booking.tickets.all():
                    #     ticket.transfer_booking_narrative=result_json['description']
                    #     ticket.save()
                    return 
#@app.task
def check_journey_payments_status():
    reference_number=""
    if JourneyBookings.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").exists():
        journey_bookings = JourneyBookings.objects.filter(is_settled=False,payment_method__title="MOBILE MONEY",status="PENDING").all()
        for journey_booking in journey_bookings:
            print("Checking ticket journey_booking  status.....",journey_booking.reference_number)
            errors, result_json= jambopay_check_payment_status(journey_booking.payment_reference)
            if result_json:
                print("Journey payments Ticket status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    journey_booking.status="SUCCESS"
                    journey_booking.provider_reference_number=result_json['providerRef']
                    journey_booking.psp_reference_number=result_json['ref']
                    journey_booking.description=result_json['description']
                    journey_booking.is_setlled=True
                    journey_booking.save()
                    print("Journey Payment success")
                    # for ticket in journey_booking.tickets.all():
                    #     ticket.is_paid="true"
                    #     ticket.journey_booking_reference=result_json['providerRef']
                    #     ticket.journey_booking_narrative=result_json['description'] +" : "+result_json['ref']
                    #     ticket.save()

                elif result_json and result_json["status"]=="FAILED":
                    journey_booking.status="FAILED"
                    # journey_booking.provider_reference_number=result_json['providerRef']
                    # journey_booking.psp_reference_number=result_json['ref']
                    journey_booking.description=result_json['description']
                    journey_booking.is_settled=True
                    journey_booking.save()
                    print("Ticket Payment success")
                    # for ticket in transfer_booking.tickets.all():
                    #     ticket.is_paid="false"
                    #     if result_json['providerRef']:
                    #         ticket.transfer_booking_reference=result_json['providerRef']
                    #         ticket.save()
                    #     if result_json['description']:
                    #         ticket.transfer_booking_narrative=result_json['description'] +" : "+result_json['ref']
                    #         ticket.save()   
                
                    # transfer_booking.status ="FAILED"
                    journey_booking.save()
                    # for ticket in transfer_booking.tickets.all():
                    #     ticket.transfer_booking_narrative=result_json['description']
                    #     ticket.save()
                else:
                    return 
                

# Sacco personnel for agent web socket task

#@app.task
def load_agent_sacco_personnel():

    result= async_to_sync(channel_layer.group_send)(
            'agent-sacco-personnel',
            {
                "type": "send_agent_sacco_personnel"
            },
        )
    return result


# Vehicles for agent web socket task

#@app.task
def load_agent_vehicles():

    result= async_to_sync(channel_layer.group_send)(
            'agent-vehicles',
            {
                "type": "send_agent_vehicles"
            },
        )
    return result

# Send sacco personnel trips

#@app.task
def load_sacco_personnel_trips():

    result= async_to_sync(channel_layer.group_send)(
            'sacco-personnel-trips',
            {
                "type": "send_sacco_personnel_trips"
            },
        )
    return result