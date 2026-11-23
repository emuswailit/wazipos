# python manage.py check_wifi_payout <payment reference | payment id> [--apply]
#
# Shows what JamboPay says about a WiFi payment and its payout, raw: the pay-in
# (by our orderId and JamboPay's ref) and the payout (by JamboPay's payout ref and
# our payout orderId). Read-only unless --apply, which updates the payout the same
# way the payouts job does (payments.utils.order_payouts.apply_payout_status).

import json

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q


class Command(BaseCommand):
    help = "Show JamboPay's raw status for a WiFi payment and its payout"

    def add_arguments(self, parser):
        parser.add_argument("ref", help="payment reference number, JamboPay ref or payment id")
        parser.add_argument("--apply", action="store_true", help="update the payout from JamboPay's answer")

    def handle(self, *args, **opts):
        from payments.utils.order_payouts import apply_payout_status
        from payments.utils.system_till import fetch_transaction, get_jambopay_token
        from wifi.models import WifiSubscriptionPayments
        from wifi.payments import payout_of, payout_stage

        ref = opts["ref"].strip()
        q = Q(reference_number=ref) | Q(psp_reference_number=ref) | Q(provider_reference_number=ref)
        if len(ref) >= 32:
            q |= Q(pk=ref)
        p = WifiSubscriptionPayments.objects.filter(q).select_related("entity", "tariff").first()
        if not p:
            raise CommandError(f"No WiFi payment matches {ref!r}")

        error, token = get_jambopay_token()
        if error:
            raise CommandError(f"JamboPay token: {error}")

        def show(title, tx):
            self.stdout.write(f"  {title}: " + (json.dumps(tx, indent=2, default=str) if tx else "not found"))

        self.stdout.write(self.style.MIGRATE_HEADING(f"Payment {p.reference_number} ({p.entity.title if p.entity_id else '?'})"))
        self.stdout.write(f"  status={p.status} amount={p.amount} tariff={p.tariff.title if p.tariff_id else '-'} settled={p.is_settled}")
        show(f"pay-in by orderId {p.reference_number}", fetch_transaction(p.reference_number, token) if p.reference_number else None)
        if p.psp_reference_number:
            show(f"pay-in by JamboPay ref {p.psp_reference_number}", fetch_transaction(p.psp_reference_number, token))

        row = payout_of(p)
        self.stdout.write(self.style.MIGRATE_HEADING("Payout"))
        if not row:
            self.stdout.write("  none yet (queued by the monitor once JamboPay confirms the pay-in)")
            return
        self.stdout.write(
            f"  status={row.status} stage={payout_stage(row)} amount={row.amount} fee={row.commission_amount} "
            f"attempts={row.attempts} orderId={row.reference_number} jambopay_ref={row.psp_reference} note={row.note!r}"
        )
        if row.psp_reference:
            show(f"payout by JamboPay ref {row.psp_reference}", fetch_transaction(row.psp_reference, token))
        if row.reference_number:
            show(f"payout by orderId {row.reference_number}", fetch_transaction(row.reference_number, token))
        if opts["apply"]:
            if row.status != "PROCESSING":
                self.stdout.write(f"  --apply: nothing to update (payout is {row.status})")
                return
            state = apply_payout_status(row, token)
            row.refresh_from_db()
            self.stdout.write(self.style.SUCCESS(f"  applied: {state} -> payout now {row.status} {row.note!r}"))
