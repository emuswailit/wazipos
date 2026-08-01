import email
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q

from django.contrib.auth import get_user_model

from authentication.models import Users

User = get_user_model()


class UserNamePhoneAuthBackend(ModelBackend):
    """UserName or Phone Authentication Backend.

    Allows user sign in with email or phone then check password is valid
    or not and return user else return none
    """

    def authenticate(self, request, phone_or_email=None, password=None, role=None):

        try:
            user = User.objects.get(
                (Q(phone=phone_or_email)| Q(email=phone_or_email)))

        except ObjectDoesNotExist:
            return None
        else:
            if user.check_password(password):
                return user
            else:
                return None

    def get_user(self, user_id):
        try:
            return Users.objects.get(id=user_id)
        except ObjectDoesNotExist:
            return None
