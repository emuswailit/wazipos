from django.apps import AppConfig


class ChurchesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "churches"
    verbose_name = "Churches (family register, groups, notices, SMS)"
