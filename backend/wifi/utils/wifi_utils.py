from .. import models
from django.utils import timezone
from payments.models import UserAccounts
# Wifi Routers
def create_wifi_router(data, user):
    """
    Create a new wifi router for the user.
    """
    errors = []
    wifi_router = None

    if not data.get("title") or data.get("title").strip() == "":
        errors.append("Title is required.")

    if not data.get("router_ip") or data.get("router_ip") == "":
        errors.append("Router IP is required")

    if not data.get("brand") or data.get("brand").strip() == "":
        errors.append("Router brand is required.")

    if not data.get("model") or data.get("model").strip() == "":
        errors.append("Router model is required.")
    
    if not data.get("contact") or data.get("contact").strip() == "":
        errors.append("User support contact is required.")

    if len(errors) > 0:
        return errors, wifi_router
    try:
        wifi_router = models.WifiRouters.objects.create(
            title=data["title"],
            router_ip=data["router_ip"],
            brand=data["brand"],
            model=data.get("model"),
            contact=data.get("contact"),
            owner=user,
            entity=user.entity
        )
    except Exception as e:
        errors.append(str(e))

    return errors, wifi_router

def update_wifi_router(data, user):
    """
    Update an existing wifi router for the user.
    """
    errors = []
    wifi_router = None

    if not data.get("id"):
        errors.append("ID is required to update the tariff.")
        return errors, wifi_router

    try:
        wifi_router = models.WifiRouters.objects.get(id=data["id"], owner=user)
    except models.WifiRouters.DoesNotExist:
        errors.append("Wifi router not found.")
        return errors, wifi_router
    
    if "is_active" in data:
        wifi_router.is_active = data["is_active"]

    try:
        wifi_router.save()
    except Exception as e:
        errors.append(str(e))

    return errors, wifi_router

def get_wifi_routers(user):
        wifi_routers = []
        if models.WifiRouters.objects.filter(entity=user.entity).exists():
            wifi_routers = models.WifiRouters.objects.filter(entity=user.entity).all()
        return wifi_routers

# Wifi Tariffs


def create_wifi_tariff(data, user):
    """
    Create a new wifi tariff for the user.
    """
    errors = []
    wifi_tariff = None
    router=None

    if not data.get("router_id") or data.get("router_id").strip() == "":
        errors.append("Router ID is required.")
    else:
        if models.WifiRouters.objects.filter(id=data.get("router_id")).exists():
            router =models.WifiRouters.objects.filter(id=data.get("router_id")).first()

    if not data.get("title") or data.get("title").strip() == "":
        errors.append("Title is required.")


    if not data.get("duration") or data.get("duration") == "":
        errors.append("Duration is required.")

    if not data.get("length") or data.get("length") == "":
        errors.append("Tariff length is required.")

    if len(errors) > 0:
        return errors, wifi_tariff
    try:
        wifi_tariff = models.WifiTarrifs.objects.create(
            router=router,
            price=float(data["price"]),
            title=data["title"],
            duration=data["duration"],
            length=data["length"],
            is_active="true",
            owner=user,
            entity=user.entity
        )
    except Exception as e:
        errors.append(str(e))

    return errors, wifi_tariff

def update_wifi_tariff(data, user):
    """
    Update an existing wifi tariff for the user.
    """
    errors = []
    wifi_tariff = None

    if not data.get("id"):
        errors.append("ID is required to update the tariff.")
        return errors, wifi_tariff

    try:
        wifi_tariff = models.WifiTarrifs.objects.get(id=data["id"])
    except models.WifiTarrifs.DoesNotExist:
        errors.append("Wifi tariff not found.")
        return errors, wifi_tariff

    if data.get("title"):
        wifi_tariff.title = data["title"].upper()
    
    if data.get("price") and data["price"] > 0:
        wifi_tariff.price = data["price"]

    
    if "is_active" in data:
        wifi_tariff.is_active = data["is_active"]

    try:
        wifi_tariff.save()
    except Exception as e:
        errors.append(str(e))

    return errors, wifi_tariff

def get_wifi_tariffs(data, user):
        wifi_tariffs = []
        if models.WifiTarrifs.objects.filter(entity=user.entity,is_active="true").exists():
            wifi_tariffs = models.WifiTarrifs.objects.filter(entity=user.entity,is_active="true").exclude(price=0)
        return wifi_tariffs

def delete_wifi_tariff(data, user):
    """
    Delete an existing wifi tariff.
    """
    errors = []
    wifi_tariff = None

    if not data.get("id"):
        errors.append("ID is required to delete the tariff.")
        return errors, wifi_tariff

    try:
        wifi_tariff = models.WifiTarrifs.objects.get(id=data["id"], owner=user)
        wifi_tariff.delete()
    except models.WifiTarrifs.DoesNotExist:
        errors.append("Wifi tariff not found.")
    except Exception as e:
        errors.append(str(e))

    return errors, wifi_tariff  



def get_wifi_subscriptions(user):
    wifi_tariff_subscriptions=[]
    if models.WifiSubscriptions.objects.filter(entity=user.entity).exists():
        wifi_tariff_subscriptions=models.WifiSubscriptions.objects.filter(entity=user.entity).all().order_by('-created')
    return wifi_tariff_subscriptions 
 
def get_wifi_subscription_payments(user):
    wifi_subscription_payments=[]
    if user.is_staff:
        if models.WifiSubscriptionPayments.objects.exists():
            wifi_subscription_payments=models.WifiSubscriptionPayments.objects.all().order_by('-created')
    else:
        if not user == user.entity.administrator:
            return
        account = UserAccounts.objects.get(owner=user)
        if account:
            if models.WifiSubscriptionPayments.objects.filter(entity=user.entity,status="SUCCESS",account=account).exists():
                wifi_subscription_payments=models.WifiSubscriptionPayments.objects.filter(entity=user.entity,status="SUCCESS",account=account).all().order_by('-created')
    return wifi_subscription_payments  
