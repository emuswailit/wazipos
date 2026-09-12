# retailers/apps.py

from django.apps import AppConfig


class RetailersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'retailers'

    def ready(self):
        # Register signal handlers
        from . import signals  # noqa: F401