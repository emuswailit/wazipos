# onboarding/services.py — self sign-up from account to approved business.
#
# The owner's checklist (GetOnboarding), in order:
#   1. email confirmed (link)           authentication usersAPIView SendMyEmailLink
#   2. phone confirmed (SMS code)       SendMyPhoneCode / ConfirmMyPhone
#   3. identity: ID / passport + copy   CompleteSellerProfile
#   4. business + GPS location          CreateMyBusiness (any self-service type)
#   5. payout account                   SavePayoutAccount (here)
#   6. opening stock / menu             the business's own inventory screens
#   7. submit -> WaziPOS approves       SubmitForApproval / AdminApprove
#
# Approving starts the free month (billing.start_trial), confirms the business
# (is_verified) and its payout account, and tells the owner. Sending it back
# needs a reason and texts the owner (they must act).

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from onboarding.models import EntityApprovals

Users = get_user_model()


class OnboardingError(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = list(errors or [message])


# What "stock" means per kind of business: (model label, what, app route, required)
STOCK = {
    "GeneralRetailer": ("retailers.RetailerReceipts", "products in stock", "/(retailers)/retailerInventory", True),
    "PharmaceuticalRetailer": ("retailers.RetailerReceipts", "products in stock", "/(retailers)/retailerInventory", True),
    "GeneralWholesaler": ("wholesalers.WholesalerReceipts", "products in stock", "/(wholesalers)/inventory", True),
    "PharmaceuticalWholesaler": ("wholesalers.WholesalerReceipts", "products in stock", "/(wholesalers)/inventory", True),
    "GeneralDistributor": ("distributors.DistributorReceipts", "products in stock", "/(distributors)/distributorStock", True),
    "PharmaceuticalDistributor": ("distributors.DistributorReceipts", "products in stock", "/(distributors)/distributorStock", True),
    "GeneralManufacturer": ("manufacturers.ManufacturerVariations", "products", "/(manufacturers)/manufacturerProducts", False),
    "PharmaceuticalManufacturer": ("manufacturers.ManufacturerVariations", "products", "/(manufacturers)/manufacturerProducts", False),
    "Publisher": ("manufacturers.ManufacturerVariations", "titles", "/(manufacturers)/manufacturerProducts", False),
    "Restaurant": ("restaurants.MenuItem", "menu items", "/(dining)/restaurantMenu", False),
    "Hotel": ("restaurants.MenuItem", "menu items", "/(hotel)/hotelMenu", False),
}


def _is_admin(user, entity):
    from billing.services import is_entity_admin

    return is_entity_admin(user, entity)


def _platform_admin(user):
    from billing.services import is_platform_admin

    return is_platform_admin(user)


def open_setup(entity, user):
    """Called when an owner creates a business themselves (seller_onboarding)."""
    row, _ = EntityApprovals.objects.get_or_create(entity=entity, defaults={"created_by": user})
    return row


def _stock_count(entity):
    from django.apps import apps

    spec = STOCK.get(entity.entity_type)
    if not spec:
        return None, None
    try:
        model = apps.get_model(spec[0])
        return model.objects.filter(entity=entity).count(), spec
    except Exception:
        return 0, spec


def _has_location(entity):
    try:
        from entitylocations.models import Locations

        return Locations.objects.filter(entity=entity, point__isnull=False).exists()
    except Exception:
        return False


def _payouts(entity):
    from payments.models import PayoutAccounts

    return PayoutAccounts.objects.filter(entity=entity).order_by("-is_active", "-updated")


def checklist(entity, owner):
    """The steps for one business and its owner. Each: key, label, done, required, detail."""
    from authentication.utils.admin_users import has_real_email
    from authentication.utils.seller_onboarding import seller_readiness

    email_ok = has_real_email(owner) and str(owner.is_email_verified).lower() == "true"
    phone_ok = str(owner.phone_otp_verified).lower() == "true"
    ready = seller_readiness(owner)
    steps = [
        {"key": "email", "label": "Confirm your email", "done": email_ok, "required": True,
         "detail": owner.email if has_real_email(owner) else "Add an email address in your profile"},
        {"key": "phone", "label": "Confirm your phone", "done": phone_ok, "required": True, "detail": owner.phone or "Add a phone number"},
        {"key": "identity", "label": "Your ID / passport", "done": bool(ready["ready"]), "required": True,
         "detail": "On file" if ready["ready"] else "Number and a photo of the document"},
    ]
    if entity is None:
        steps.append({"key": "business", "label": "Your business & location", "done": False, "required": True, "detail": "Name, kind and GPS location"})
        steps.append({"key": "payout", "label": "Where we pay you", "done": False, "required": True, "detail": "M-Pesa, till, paybill or bank"})
        return steps
    located = _has_location(entity)
    steps.append({"key": "business", "label": "Your business & location", "done": located, "required": True,
                  "detail": f"{entity.title}" + ("" if located else " — set the location")})
    active = _payouts(entity).filter(is_active="true").first()
    steps.append({"key": "payout", "label": "Where we pay you", "done": bool(active), "required": True,
                  "detail": f"{active.account_type} {active.account_number}" if active else "M-Pesa, till, paybill or bank"})
    count, spec = _stock_count(entity)
    if spec:
        steps.append({"key": "stock", "label": "Add your stock" if "stock" in spec[1] else f"Add your {spec[1]}", "done": (count or 0) > 0,
                      "required": spec[3], "detail": f"{count or 0} {spec[1]}", "route": spec[2], "count": count or 0})
    return steps


def _entity_out(entity):
    return {
        "id": str(entity.id), "title": entity.title, "entity_type": entity.entity_type,
        "town": getattr(entity, "town", None), "road": getattr(entity, "road", None), "building": getattr(entity, "building", None),
        "phone": getattr(entity, "phone", None), "email": getattr(entity, "email", None),
        "is_verified": str(getattr(entity, "is_verified", "")).lower() == "true",
    }


def _approval_out(row):
    if not row:
        return None
    return {
        "status": row.status, "reason": row.reason or None,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "submissions": row.submissions,
    }


def _current_setup(user):
    """The business this owner is setting up: the current one if it came through
    self sign-up and isn't approved, else their latest unapproved one."""
    entity = getattr(user, "entity", None)
    if entity is not None and entity.owner_id == user.pk:
        row = EntityApprovals.objects.filter(entity=entity).first()
        if row:
            return entity, row
    row = (
        EntityApprovals.objects.filter(entity__owner=user).exclude(status=EntityApprovals.Status.APPROVED)
        .select_related("entity").order_by("-created").first()
    )
    return (row.entity, row) if row else (None, None)


def state(user):
    entity, row = _current_setup(user)
    steps = checklist(entity, user)
    missing = [s["label"] for s in steps if s["required"] and not s["done"]]
    can_submit = bool(entity) and not missing and row is not None and row.status in (EntityApprovals.Status.SETUP, EntityApprovals.Status.REJECTED)
    return {
        "business": _entity_out(entity) if entity else None,
        "is_current": bool(entity and getattr(user, "entity_id", None) == entity.id),
        "approval": _approval_out(row),
        "steps": steps,
        "missing": missing,
        "can_submit": can_submit,
        "progress": int(100 * sum(1 for s in steps if s["done"]) / max(1, len(steps))),
    }


# ---------------------------------------------------------------- payout account

def payout_accounts(user):
    from payments import serializers as ps

    entity = getattr(user, "entity", None)
    if not entity or not _is_admin(user, entity):
        raise OnboardingError("Not allowed", ["Only the business's admins manage where it is paid"])
    return ps.PayoutAccountsSerializer(_payouts(entity), many=True).data


def save_payout_account(user, data):
    """{payout_account_details, payout_account_id?} for the user's current business. Saved unverified."""
    from payments import serializers as ps
    from payments.models import PayoutAccounts
    from payments.utils import admin_payout_accounts as pa

    entity = getattr(user, "entity", None)
    if not entity or not _is_admin(user, entity):
        raise OnboardingError("Not allowed", ["Only the business's admins manage where it is paid"])
    details = dict(data.get("payout_account_details") or {})
    details["entity"] = str(entity.id)
    details.pop("is_verified", None)
    instance = None
    if data.get("payout_account_id"):
        instance = PayoutAccounts.objects.filter(id=data["payout_account_id"], entity=entity).first()
        if not instance:
            raise OnboardingError("Not found", ["That payout account does not exist"])
    errors, fields = pa._validate(details, instance=instance)
    if errors:
        raise OnboardingError("Check the payout account", errors)
    fields["entity"] = entity
    with transaction.atomic():
        if instance is None:
            account = PayoutAccounts.objects.create(
                **fields, is_active=pa._bool_str(details.get("is_active"), default="true"), is_verified=False, owner=user,
            )
        else:
            account = instance
            changed = any((fields.get(f) or None) != (getattr(account, f) or None) for f in pa.DESTINATION_FIELDS)
            for k, v in fields.items():
                setattr(account, k, v)
            if "is_active" in details:
                account.is_active = pa._bool_str(details.get("is_active"))
            if changed:
                account.is_verified, account.verified_by = False, None
            account.save()
    return ps.PayoutAccountsSerializer(account).data


# ---------------------------------------------------------------- submit

def submit(user):
    from core.notify import deliver_to_users, later

    entity, row = _current_setup(user)
    if not entity or not row:
        raise OnboardingError("Nothing to submit", ["Create your business first"])
    if not _is_admin(user, entity):
        raise OnboardingError("Not allowed", ["Only the owner can submit the business"])
    if row.status == EntityApprovals.Status.PENDING:
        raise OnboardingError("Already submitted", ["WaziPOS is reviewing your business — we'll let you know"])
    if row.status == EntityApprovals.Status.APPROVED:
        raise OnboardingError("Already approved", ["Your business is already live"])
    steps = checklist(entity, user)
    missing = [s["label"] for s in steps if s["required"] and not s["done"]]
    if missing:
        raise OnboardingError("Finish setting up first", missing)
    row.status = EntityApprovals.Status.PENDING
    row.submitted_at = timezone.now()
    row.submissions += 1
    row.checklist = {s["key"]: {"done": s["done"], "detail": s.get("detail")} for s in steps}
    row.save()
    title, kind, owner_name = entity.title, entity.entity_type, (user.get_full_name() if hasattr(user, "get_full_name") else user.email)

    def build():
        staff = list(Users.objects.filter(Q(is_staff=True) | Q(is_superuser=True), is_active=True)[:25])
        deliver_to_users(staff, f"New business to approve: {title}",
                         [f"{owner_name} submitted {title} ({kind}) for approval.", "Open Admin → Sign-ups & approvals on WaziPOS to review it."],
                         push=True, data={"type": "entity_approval", "entity": str(entity.id)})
        deliver_to_users([user], f"{title} submitted to WaziPOS",
                         ["Thanks — we're checking your details. Most businesses are approved within one working day.",
                          "You can keep adding stock meanwhile. Your free month starts when we approve you."])

    later(build)
    return state(user)


# ---------------------------------------------------------------- WaziPOS admins

def _need_admin(user):
    if not _platform_admin(user):
        raise OnboardingError("Not allowed", ["Only WaziPOS admins review sign-ups"])


def _owner_out(u, request=None):
    from authentication.utils.admin_users import admin_user_out, has_real_email

    out = admin_user_out(u, request) if u else None
    if out is not None:
        out["email_verified"] = has_real_email(u) and str(u.is_email_verified).lower() == "true"
        out["phone_verified"] = str(u.phone_otp_verified).lower() == "true"
        out["joined"] = u.created_at.isoformat() if getattr(u, "created_at", None) else None
    return out


def admin_approvals(user, data, request=None):
    _need_admin(user)
    status = str(data.get("status") or "PENDING").upper()
    qs = EntityApprovals.objects.select_related("entity", "entity__owner", "decided_by")
    if status != "ALL":
        qs = qs.filter(status=status)
    term = str(data.get("q") or "").strip()
    if term:
        qs = qs.filter(Q(entity__title__icontains=term) | Q(entity__owner__email__icontains=term) | Q(entity__owner__phone__icontains=term))
    qs = qs.order_by("submitted_at" if status == "PENDING" else "-updated")
    rows = []
    for r in qs[:150]:
        e = r.entity
        owner = e.owner
        steps = checklist(e, owner) if owner else []
        location = None
        try:
            from entitylocations.models import Locations

            loc = Locations.objects.filter(entity=e, point__isnull=False).first()
            location = {"latitude": loc.point.y, "longitude": loc.point.x} if loc else None
        except Exception:
            pass
        payout = _payouts(e).filter(is_active="true").first()
        rows.append({
            "entity": _entity_out(e), "approval": _approval_out(r), "owner": _owner_out(owner, request),
            "steps": steps, "location": location, "admin_note": r.admin_note or None,
            "decided_by": r.decided_by.email if r.decided_by_id else None,
            "payout": {"account_type": payout.account_type, "account_name": payout.account_name, "account_number": payout.account_number,
                       "is_verified": payout.is_verified} if payout else None,
            "created": r.created.isoformat(),
        })
    counts = {s: EntityApprovals.objects.filter(status=s).count() for s in EntityApprovals.Status.values}
    return {"results": rows, "counts": counts}


def admin_signups(user, data, request=None):
    """New accounts in the last N days and how far each got."""
    _need_admin(user)
    from datetime import timedelta

    days = min(90, max(1, int(data.get("days") or 14)))
    since = timezone.now() - timedelta(days=days)
    qs = Users.objects.filter(created_at__gte=since).select_related("entity").order_by("-created_at")
    term = str(data.get("q") or "").strip()
    if term:
        qs = qs.filter(Q(email__icontains=term) | Q(phone__icontains=term) | Q(first_name__icontains=term) | Q(last_name__icontains=term))
    users = list(qs[:200])
    owned = {}
    for r in EntityApprovals.objects.filter(entity__owner__in=users).select_related("entity"):
        owned.setdefault(r.entity.owner_id, []).append({"id": str(r.entity_id), "title": r.entity.title, "entity_type": r.entity.entity_type, "status": r.status})
    out = []
    for u in users:
        o = _owner_out(u, request)
        o["businesses"] = owned.get(u.pk, [])
        out.append(o)
    total = Users.objects.filter(created_at__gte=since).count()
    return {
        "results": out, "days": days,
        "totals": {
            "signups": total,
            "email_verified": Users.objects.filter(created_at__gte=since, is_email_verified__iexact="true").count(),
            "phone_verified": Users.objects.filter(created_at__gte=since, phone_otp_verified__iexact="true").count(),
            "businesses": EntityApprovals.objects.filter(created__gte=since).count(),
            "pending": EntityApprovals.objects.filter(status=EntityApprovals.Status.PENDING).count(),
        },
    }


def _row_for(data):
    row = EntityApprovals.objects.select_related("entity", "entity__owner").filter(entity_id=data.get("entity")).first()
    if not row:
        raise OnboardingError("Not found", ["That business is not waiting for a decision"])
    return row


def admin_approve(user, data):
    from billing.services import start_trial
    from core.notify import deliver_to_entity, later

    _need_admin(user)
    row = _row_for(data)
    if row.status == EntityApprovals.Status.APPROVED:
        raise OnboardingError("Already approved", [f"{row.entity.title} is already live"])
    entity = row.entity
    with transaction.atomic():
        row.status = EntityApprovals.Status.APPROVED
        row.decided_at, row.decided_by = timezone.now(), user
        row.reason = ""
        row.admin_note = str(data.get("note") or row.admin_note or "")[:2000]
        row.save()
        try:
            entity.is_verified = "true"
            entity.save(update_fields=["is_verified"])
        except Exception:
            pass
        # One click: the business's active payout account is confirmed with it.
        _payouts(entity).filter(is_active="true", is_verified=False).update(is_verified=True, verified_by=user)
        wallet = start_trial(entity, by=user)
    ends = wallet.trial_ends_at.strftime("%d %b %Y") if wallet.trial_ends_at else ""
    later(lambda: deliver_to_entity(
        entity, f"{entity.title} is approved — welcome to WaziPOS",
        [f"Great news: {entity.title} is live on WaziPOS.",
         f"Your free month runs until {ends}. After that you pay only for what you use with WaziPOS tokens — no monthly fee.",
         "Open the app and make your first sale."],
        push=True, data={"type": "entity_approval", "entity": str(entity.id), "status": "APPROVED"},
    ))
    return {"entity": str(entity.id), "status": row.status, "trial_ends_at": wallet.trial_ends_at.isoformat() if wallet.trial_ends_at else None}


def admin_reject(user, data):
    from core.notify import deliver_to_entity, later

    _need_admin(user)
    reason = str(data.get("reason") or "").strip()
    if len(reason) < 5:
        raise OnboardingError("Check the details", ["Say what the owner must fix"])
    row = _row_for(data)
    if row.status == EntityApprovals.Status.APPROVED and not data.get("force"):
        raise OnboardingError("Already approved", ["This business is live; suspend it from Entities instead"])
    row.status = EntityApprovals.Status.REJECTED
    row.decided_at, row.decided_by, row.reason = timezone.now(), user, reason[:2000]
    row.save()
    entity = row.entity
    later(lambda: deliver_to_entity(
        entity, f"{entity.title}: a few changes needed",
        [f"We couldn't approve {entity.title} yet:", reason, "Fix it in the Business tab on WaziPOS and submit again."],
        sms=True, sms_text=f"WaziPOS: {entity.title} needs changes before approval: {reason[:90]}. Open the app to fix and resubmit.",
        push=True, data={"type": "entity_approval", "entity": str(entity.id), "status": "REJECTED"},
    ))
    return {"entity": str(entity.id), "status": row.status}


def admin_note(user, data):
    _need_admin(user)
    row = _row_for(data)
    row.admin_note = str(data.get("note") or "")[:2000]
    row.save(update_fields=["admin_note", "updated"])
    return {"entity": str(row.entity_id), "admin_note": row.admin_note}
