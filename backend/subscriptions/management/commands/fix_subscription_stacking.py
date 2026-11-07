"""
Re-chain an entity's subscriptions so none overlap: each one that started before the
previous one ended is moved to start the day after it ends, keeping its length.
Fixes renewals processed by code older than the stacking fix.

Usage:
    # 1. List recent successful payments and their subscriptions
    python manage.py fix_subscription_stacking

    # 2. Preview the re-chained dates for an entity (no changes saved)
    python manage.py fix_subscription_stacking --entity "CHAKA PHARMACY"
    python manage.py fix_subscription_stacking --reference <PAYMENT_REFERENCE>

    # 3. Save
    python manage.py fix_subscription_stacking --entity "CHAKA PHARMACY" --apply

    # One payment was charged for N months but its subscription was given 1:
    python manage.py fix_subscription_stacking --reference <REF> --months 2 --apply
"""
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from authentication.models import Entities
from subscriptions.models import Subscription, SubscriptionPayment
from subscriptions.periods import next_period_start, period_end


def fmt(dt):
    return timezone.localtime(dt).strftime("%b %d, %Y %H:%M")


def days_left(end_date):
    return max(0, (end_date - timezone.now()).days)


class Command(BaseCommand):
    help = "Re-chain an entity's subscriptions so renewals follow each other instead of overlapping."

    def add_arguments(self, parser):
        parser.add_argument("--entity", help="Entity title (exact, case-insensitive) or id")
        parser.add_argument("--reference", help="A payment reference; its entity is re-chained")
        parser.add_argument("--months", type=int, help="With --reference: months that payment covered")
        parser.add_argument("--apply", action="store_true", help="Save the changes (default is a preview)")

    def handle(self, *args, **options):
        entity_arg, reference = options.get("entity"), options.get("reference")
        if not entity_arg and not reference:
            self.list_recent_payments()
            return

        override_payment, override_months = None, options.get("months")
        if reference:
            override_payment = (
                SubscriptionPayment.objects.filter(
                    Q(reference_number=reference) | Q(psp_reference_number=reference)
                ).order_by("-created").first()
            )
            if not override_payment:
                raise CommandError(f"No subscription payment with reference '{reference}'.")
            entity = override_payment.entity
        else:
            lookup = Q(title__iexact=entity_arg)
            try:
                lookup |= Q(id=uuid.UUID(entity_arg))
            except ValueError:
                pass  # not an id, match by title only
            entity = Entities.objects.filter(lookup).first()
            if not entity:
                raise CommandError(f"No entity matching '{entity_arg}'.")
        if override_months is not None and override_months < 1:
            raise CommandError("--months must be at least 1")

        subs = list(Subscription.objects.filter(entity=entity).select_related("payment").order_by("created", "start_date"))
        if not subs:
            raise CommandError(f"{entity} has no subscriptions.")

        self.stdout.write(f"Entity: {entity}\n")
        changes = []
        chain_end = None
        for sub in subs:
            months = sub.months or 1
            paid_months = getattr(sub.payment, "months", None) if sub.payment else None
            if override_payment and sub.payment_id == override_payment.id and override_months:
                months = override_months
            elif paid_months and paid_months > months:
                months = paid_months  # payment recorded more months than the subscription got

            # No overlaps: anything starting on or before the previous end moves to the next day.
            start = sub.start_date
            if chain_end and start <= chain_end:
                start = next_period_start(chain_end)
            if months != (sub.months or 1):
                end = period_end(start, months)  # corrected month count
            else:
                end = start + (sub.end_date - sub.start_date)  # keep its original length

            changed = (start, end, months) != (sub.start_date, sub.end_date, sub.months)
            marker = "  -> " if changed else "     "
            self.stdout.write(
                f"{marker}{sub.type:5} {fmt(sub.start_date)} – {fmt(sub.end_date)} ({sub.months} mo)"
                + (f"\n        now {fmt(start)} – {fmt(end)} ({months} mo)" if changed else "")
            )
            if changed:
                changes.append((sub, start, end, months))
            chain_end = end if chain_end is None else max(chain_end, end)

        self.stdout.write(f"\nCovered until: {fmt(chain_end)} ({days_left(chain_end)} days left)")

        if not changes:
            self.stdout.write(self.style.SUCCESS("Nothing to fix."))
            return
        if not options.get("apply"):
            self.stdout.write(self.style.WARNING(f"Preview only: {len(changes)} subscription(s) would change. Re-run with --apply."))
            return

        with transaction.atomic():
            for sub, start, end, months in changes:
                sub.start_date, sub.end_date, sub.months = start, end, months
                sub.save(update_fields=["start_date", "end_date", "months", "updated"])

        try:
            from subscriptions.tasks import broadcast_subscription_update
            broadcast_subscription_update()
        except Exception:
            pass  # the banner picks it up on its next refresh

        self.stdout.write(self.style.SUCCESS(f"Saved {len(changes)} subscription(s)."))

    def list_recent_payments(self):
        payments = SubscriptionPayment.objects.filter(status="SUCCESS").order_by("-created")[:15]
        if not payments:
            self.stdout.write("No successful subscription payments found.")
            return
        self.stdout.write("Recent successful payments (newest first):\n")
        for p in payments:
            sub = Subscription.objects.filter(payment=p).first()
            sub_text = f"{fmt(sub.start_date)} – {fmt(sub.end_date)} ({sub.months} mo)" if sub else "NO SUBSCRIPTION"
            self.stdout.write(
                f"  {p.reference_number}  {fmt(p.created)}  {p.entity}  KES {p.amount}  "
                f"months={getattr(p, 'months', '?')}  sub: {sub_text}"
            )
        self.stdout.write('\nPreview a fix with: python manage.py fix_subscription_stacking --entity "<ENTITY TITLE>"')
