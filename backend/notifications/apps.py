from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
    verbose_name = "Order, payment and payout notifications"

    def ready(self):
        # Email / SMS / push on orders, pay-ins and payouts (notifications/signals.py).
        from notifications import signals

        signals.connect()
