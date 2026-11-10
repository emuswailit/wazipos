from django.apps import AppConfig


class ProductsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'products'

    def ready(self):
        # Live catalogue pushes on product / image changes (see products/signals.py).
        from . import signals  # noqa: F401
