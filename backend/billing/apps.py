from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "billing"
    verbose_name = "WaziPOS Tokens (pay-per-use billing)"

    def ready(self):
        # Meter tokens from successful order payments (billing/signals.py).
        from billing import signals

        signals.connect()
