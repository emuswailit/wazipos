# authentication/management/commands/prune_access_logs.py
#
#   python manage.py prune_access_logs            # older than ACCESS_LOG_RETENTION_DAYS (90)
#   python manage.py prune_access_logs --days 30
#
# The log writer also prunes every few hours; this is for cron or a one-off cleanup.

from django.core.management.base import BaseCommand

from core.access_log import RETENTION_DAYS, prune_access_logs


class Command(BaseCommand):
    help = "Delete API access log rows older than the retention period."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=RETENTION_DAYS)

    def handle(self, *args, **options):
        deleted = prune_access_logs(options["days"])
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted} access log rows older than {options['days']} days"))
