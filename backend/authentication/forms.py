# authentication/forms.py
from django import forms

from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import Users, Entities


class LoginForm(forms.Form):
    phone_or_email = forms.CharField(max_length=63)
    password = forms.CharField(max_length=63, widget=forms.PasswordInput)


class SignupForm(UserCreationForm):
    email = forms.EmailField(max_length=200, help_text='Required')
    entity = forms.CharField(widget=forms.HiddenInput(), required=False)

    class Meta:
        model = Users
        fields = ('entity', 'first_name', 'last_name',  'gender',
                  'email', 'phone', 'date_of_birth', 'password1', 'password2')

    def clean_entity(self):
        entity = self.cleaned_data.get('entity')
        if not entity:
            return Entities.objects.filter(entity_type='Default').first()
