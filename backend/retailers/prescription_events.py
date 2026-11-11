"""
Live prescription events.

Groups (dedicated, so consumers that share `user_<id>` never get a message type
they have no handler for):
    rx_user_<user id>      the customer who owns the prescription
    rx_entity_<entity id>  staff of a pharmacy that has the prescription

Consumer: PrescriptionEventsConsumer at ws/retailers/prescriptions/events/.
Each event: {"event": <name>, "prescription": <serialized for that audience>}.
Pharmacies only ever receive their own quotation (never competitors' prices).
"""
import json
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction

logger = logging.getLogger(__name__)

EVENT_DIGITIZED = "prescription.digitized"
EVENT_QUOTED = "prescription.quoted"
EVENT_REQUESTED = "prescription.quotation_requested"


def user_group(user_id):
    return f"rx_user_{user_id}"


def entity_group(entity_id):
    return f"rx_entity_{entity_id}"


def _serialize(prescription, viewer):
    from .serializers import RetailPrescriptionsSerializer

    data = RetailPrescriptionsSerializer(prescription, context={"request": None, "viewer": viewer}).data
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def _for_owner(prescription):
    return _serialize(prescription, (prescription.owner, None, False))


def _for_pharmacy(prescription, pharmacy_id):
    return _serialize(prescription, (None, pharmacy_id, False))


def _send(group, event, prescription_data):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group, {"type": "prescription.event", "event": event, "prescription": prescription_data})
    except Exception:
        logger.exception("Prescription event to %s failed", group)


def _push(user, title, body, data):
    token = getattr(user, "notification_token", None)
    if not token:
        return
    try:
        from core.utils import send_push_notification

        send_push_notification(token, title, body, data)
    except Exception:
        logger.exception("Prescription push to user %s failed", getattr(user, "id", None))


def notify_digitized(prescription):
    """Customer: it's digitized. Pharmacies that have it: refresh."""

    def _go():
        _send(user_group(prescription.owner_id), EVENT_DIGITIZED, _for_owner(prescription))
        for entity_id in _pharmacy_ids(prescription):
            _send(entity_group(entity_id), EVENT_DIGITIZED, _for_pharmacy(prescription, entity_id))
        who = prescription.digitized_by_entity.title if prescription.digitized_by_entity else "WaziPOS"
        _push(
            prescription.owner,
            "Prescription digitized",
            f"{who} has read your prescription. Pharmacies can now send quotations.",
            {"type": EVENT_DIGITIZED, "prescription": str(prescription.id)},
        )

    transaction.on_commit(_go)


def notify_quoted(quotation):
    """Customer: a pharmacy sent its quotation."""

    def _go():
        prescription = quotation.prescription
        _send(user_group(prescription.owner_id), EVENT_QUOTED, _for_owner(prescription))
        _send(entity_group(quotation.entity_id), EVENT_QUOTED, _for_pharmacy(prescription, quotation.entity_id))
        order = quotation.customer_order
        lines = order.parent_order.count() if order else 0
        total = order.order_net_price_total if order else 0
        _push(
            prescription.owner,
            "New quotation",
            f"{quotation.entity.title} quoted {lines} item{'s' if lines != 1 else ''} for KES {total}. Tap to compare and buy.",
            {"type": EVENT_QUOTED, "prescription": str(prescription.id)},
        )

    transaction.on_commit(_go)


def notify_quotation_requested(quotation):
    """Pharmacy staff: a prescription was sent to you for quotation."""

    def _go():
        prescription = quotation.prescription
        _send(entity_group(quotation.entity_id), EVENT_REQUESTED, _for_pharmacy(prescription, quotation.entity_id))
        _send(user_group(prescription.owner_id), EVENT_REQUESTED, _for_owner(prescription))

    transaction.on_commit(_go)


def _pharmacy_ids(prescription):
    from .models import PrescriptionQuotations

    ids = set(PrescriptionQuotations.objects.filter(prescription=prescription).values_list("entity_id", flat=True))
    if prescription.entity_id:
        ids.add(prescription.entity_id)
    return ids
