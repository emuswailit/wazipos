from django.db.models.signals import pre_save,post_save
from django.dispatch import receiver
from .models import Users
import pyotp

def generate_key():
    """ User otp key generator """
    key = pyotp.random_base32()
    if is_unique(key):
        return key
    generate_key()

def is_unique(key):
    try:
        Users.objects.get(key=key)
    except Users.DoesNotExist:
        return True
    return False

def send_sms(instance):
    print('Send sms',instance)

@receiver(pre_save, sender=Users)
def create_key(sender, instance, **kwargs):
    """This creates the key for users that don't have keys"""
    if not instance.key:
        instance.key = generate_key()
        send_sms(instance.key)