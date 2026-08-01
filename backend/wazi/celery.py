from __future__ import absolute_import, unicode_literals
import os
from celery import Celery
from celery.schedules import crontab


# set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wazi.settings.development")

app = Celery("wazi")

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.

app.config_from_object("django.conf:settings", namespace="CELERY")


app.conf.enable_utc=False
app.conf.update(timezone='Africa/Nairobi')

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print("Request: {0!r}".format(self.request))


app.conf.beat_schedule = {
    
  
    "process_wifi_payments": {"task": "payments.tasks.process_wifi_payments", "schedule": 30.0,'args':None},
    "process_retailer_order_payments": {"task": "payments.tasks.process_retailer_order_payments", "schedule": 30.0,'args':None},
    "deactivate_expired_price_discounts": {"task": "wholesalers.tasks.deactivate_expired_price_discounts", "schedule": 60.0,'args':None},

}
