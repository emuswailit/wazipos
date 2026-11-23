from django.apps import AppConfig


class WifiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'wifi'

    def ready(self):
        # Live payment updates (wifi/signals.py -> ws/wifi/...).
        from wifi import signals

        signals.connect()
