from django.apps import AppConfig


class WholesalersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'wholesalers'

    def ready(self):
        # Wire up signals
        import wholesalers.signals  # noqa: F401