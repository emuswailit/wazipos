# retailers/tests.py
"""
Tests for live driver-location tracking.
"""

import pytest
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.gis.geos import Point
from django.urls import path, reverse
from django.utils import timezone
from rest_framework.test import APIClient

from authentication.models import Entities
from entitylocations.models import BodaLocations
from retailers.consumers import BodaLocationConsumer, OrderTrackingConsumer
from retailers.models import CustomerOrders


User = get_user_model()

LIVE_STATUSES = ("ASSIGNED", "DISPATCHED", "PICKED")
TERMINAL_STATUSES = ("DELIVERED", "CANCELLED", "COMPLETED")

# ⚠️ IMPORTANT: Update this to your actual customer orders URL path or use reverse()
# If your url name is 'customer-orders', you can use: reverse("customer-orders")
CUSTOMER_ORDERS_URL = "/api/v1/retailers/customer-orders/" 


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture
def customer(db):
    return User.objects.create_user(
        email="customer@example.com",
        phone="+254700000001",
        password="x",
        first_name="Cust",
    )


@pytest.fixture
def retailer_owner(db):
    return User.objects.create_user(
        email="retailer@example.com",
        phone="+254700000002",
        password="x",
        first_name="Retail",
    )


@pytest.fixture
def driver_user(db):
    return User.objects.create_user(
        email="driver@example.com",
        phone="+254700000003",
        password="x",
        first_name="Driver",
    )


@pytest.fixture
def stranger(db):
    return User.objects.create_user(
        email="stranger@example.com",
        phone="+254700000004",
        password="x",
        first_name="Strange",
    )


@pytest.fixture
def entity(db, retailer_owner):
    # Note: Add any other required fields for your Entities model here (e.g., entity_type)
    return Entities.objects.create(
        title="Test Pharmacy",
        owner=retailer_owner,
        administrator=retailer_owner,
    )


@pytest.fixture
def sacco_personnel(db, driver_user):
    from transport.models import SaccoPersonnel

    # Note: Add any other required fields for your SaccoPersonnel model here
    return SaccoPersonnel.objects.create(user=driver_user)


@pytest.fixture
def boda(db, sacco_personnel, driver_user):
    return BodaLocations.objects.create(
        boda=sacco_personnel,
        owner=driver_user,
        is_active="true",
        farness="0",
        point=Point(36.8172, -1.2864, srid=4326),  # x=lng, y=lat
    )


@pytest.fixture
def make_order(db, entity, customer, retailer_owner):
    def _make(status="ASSIGNED", boda=None, destination=None):
        return CustomerOrders.objects.create(
            entity=entity,
            owner=retailer_owner,
            customer=customer,
            user=customer,
            order_origin="CUSTOMER",
            delivery_method="DELIVERY",
            status=status,
            bodaboda=boda,
            destination_point=destination or Point(36.9, -1.3, srid=4326),
            customer_name="Test Customer",
            customer_phone="+254700000001",
        )

    return _make


@pytest.fixture
def order(make_order):
    return make_order(status="ASSIGNED")


@pytest.fixture
def order_with_boda(make_order, boda):
    return make_order(status="ASSIGNED", boda=boda)


# --------------------------------------------------------------------------- #
# App factories for the communicators
# --------------------------------------------------------------------------- #

def _tracking_app():
    return URLRouter([
        path(
            "ws/orders/<int:order_id>/tracking/",
            OrderTrackingConsumer.as_asgi(),
        ),
    ])


def _boda_app():
    return URLRouter([
        path("ws/boda/location/", BodaLocationConsumer.as_asgi()),
    ])


# --------------------------------------------------------------------------- #
# Signal tests
# --------------------------------------------------------------------------- #

def _patch_channel_layer(monkeypatch):
    """
    Replace `get_channel_layer` inside `retailers.models` with a fake
    that records every group_send.
    """
    captured = []

    async def fake_group_send(group, message):
        captured.append((group, message))

    class FakeLayer:
        group_send = staticmethod(fake_group_send)

    # Using the string path ensures monkeypatch finds it even if imported locally
    monkeypatch.setattr(
        "retailers.models.get_channel_layer", lambda: FakeLayer()
    )
    return captured


@pytest.mark.django_db
def test_status_change_broadcasts_order_status(monkeypatch, order):
    captured = _patch_channel_layer(monkeypatch)

    order.status = "DISPATCHED"
    order.save()

    status_msgs = [(g, m) for g, m in captured if m.get("type") == "order.status"]
    assert any(
        g == f"order_{order.id}" and m["status"] == "DISPATCHED"
        for g, m in status_msgs
    )


@pytest.mark.django_db
def test_unrelated_save_does_not_broadcast(monkeypatch, order):
    captured = _patch_channel_layer(monkeypatch)

    order.customer_name = "Renamed"
    order.save()

    assert [m for _, m in captured if m.get("type") == "order.status"] == []


@pytest.mark.django_db
def test_terminal_status_broadcasts_and_closes_path(monkeypatch, order):
    captured = _patch_channel_layer(monkeypatch)

    order.status = "DELIVERED"
    order.save()

    status_msgs = [
        m for _, m in captured
        if m.get("type") == "order.status" and m["status"] == "DELIVERED"
    ]
    assert status_msgs, "terminal status must be broadcast"


@pytest.mark.django_db
def test_boda_assignment_notifies_driver(monkeypatch, make_order, boda, driver_user):
    order = make_order(status="ASSIGNED", boda=None)
    captured = _patch_channel_layer(monkeypatch)

    order.bodaboda = boda
    order.save()

    driver_msgs = [
        (g, m) for g, m in captured if g == f"bodaboda_{driver_user.id}"
    ]
    assert driver_msgs, "driver must be told about new assignment"
    assert any(
        m["type"] == "send_bodaboda_assigned_order" for _, m in driver_msgs
    )


@pytest.mark.django_db
def test_creating_order_does_not_emit_order_status(monkeypatch, make_order):
    captured = _patch_channel_layer(monkeypatch)

    make_order(status="ASSIGNED")

    status_msgs = [m for _, m in captured if m.get("type") == "order.status"]
    assert status_msgs == []


# --------------------------------------------------------------------------- #
# OrderTrackingConsumer tests
# --------------------------------------------------------------------------- #

@pytest.mark.django_db(transaction=True)
async def test_tracking_rejects_unauthenticated(order):
    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = AnonymousUser()

    connected, _ = await comm.connect()
    assert connected is False


@pytest.mark.django_db(transaction=True)
async def test_tracking_rejects_stranger(order, stranger):
    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = stranger

    connected, _ = await comm.connect()
    assert connected is False


@pytest.mark.django_db(transaction=True)
async def test_tracking_rejects_unknown_order(customer):
    comm = WebsocketCommunicator(
        _tracking_app(), "/ws/orders/999999/tracking/"
    )
    comm.scope["user"] = customer

    connected, _ = await comm.connect()
    assert connected is False


@pytest.mark.django_db(transaction=True)
async def test_tracking_accepts_customer_and_sends_snapshot(
    order_with_boda, customer,
):
    comm = WebsocketCommunicator(
        _tracking_app(),
        f"/ws/orders/{order_with_boda.id}/tracking/",
    )
    comm.scope["user"] = customer

    connected, _ = await comm.connect()
    assert connected is True

    msg = await comm.receive_json_from()
    assert msg["type"] == "boda.location"
    assert msg["lat"] == pytest.approx(-1.2864, rel=1e-5)
    assert msg["lng"] == pytest.approx(36.8172, rel=1e-5)
    assert msg["order"]["status"] == "ASSIGNED"
    assert msg["order"]["destination"] == {
        "lat": pytest.approx(-1.3, rel=1e-5),
        "lng": pytest.approx(36.9, rel=1e-5),
    }
    assert msg["driver"]["name"]
    assert msg["driver"]["phone"] == "+254700000003"

    await comm.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_tracking_accepts_retailer_owner(order_with_boda, retailer_owner):
    comm = WebsocketCommunicator(
        _tracking_app(),
        f"/ws/orders/{order_with_boda.id}/tracking/",
    )
    comm.scope["user"] = retailer_owner

    connected, _ = await comm.connect()
    assert connected is True
    await comm.receive_json_from()  # snapshot
    await comm.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_tracking_terminal_status_accepts_then_closes(order, customer):
    order.status = "DELIVERED"
    await sync_to_async(order.save)()

    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = customer

    connected, _ = await comm.connect()
    assert connected is True

    msg = await comm.receive_json_from()
    assert msg["type"] == "order.status"
    assert msg["status"] == "DELIVERED"

    output = await comm.receive_output()
    assert output["type"] == "websocket.close"
    assert output["code"] == 4000


@pytest.mark.django_db(transaction=True)
async def test_tracking_forward_and_close_on_status_change(order, customer):
    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = customer
    connected, _ = await comm.connect()
    assert connected is True
    await comm.receive_json_from()  # snapshot

    layer = get_channel_layer()
    await layer.group_send(
        f"order_{order.id}",
        {
            "type": "order.status",
            "status": "DELIVERED",
            "ts": timezone.now().isoformat(),
        },
    )

    msg = await comm.receive_json_from()
    assert msg["type"] == "order.status"
    assert msg["status"] == "DELIVERED"

    output = await comm.receive_output()
    assert output["type"] == "websocket.close"
    assert output["code"] == 4000


@pytest.mark.django_db(transaction=True)
async def test_tracking_forward_boda_location_event(order, customer):
    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = customer
    connected, _ = await comm.connect()
    await comm.receive_json_from()  # snapshot

    layer = get_channel_layer()
    await layer.group_send(
        f"order_{order.id}",
        {
            "type": "boda.location",
            "lat": -1.30,
            "lng": 36.82,
            "ts": timezone.now().isoformat(),
        },
    )

    msg = await comm.receive_json_from()
    assert msg["type"] == "boda.location"
    assert msg["lat"] == pytest.approx(-1.30)
    assert msg["lng"] == pytest.approx(36.82)
    assert "driver" not in msg  # not in live pings

    await comm.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_tracking_ping_pong(order, customer):
    comm = WebsocketCommunicator(
        _tracking_app(), f"/ws/orders/{order.id}/tracking/"
    )
    comm.scope["user"] = customer
    connected, _ = await comm.connect()
    await comm.receive_json_from()  # snapshot

    await comm.send_json_to({"type": "ping"})
    msg = await comm.receive_json_from()
    assert msg["type"] == "pong"
    assert "ts" in msg

    await comm.disconnect()


# --------------------------------------------------------------------------- #
# BodaLocationConsumer tests
# --------------------------------------------------------------------------- #

@pytest.mark.django_db(transaction=True)
async def test_boda_rejects_non_driver(customer):
    comm = WebsocketCommunicator(_boda_app(), "/ws/boda/location/")
    comm.scope["user"] = customer

    connected, _ = await comm.connect()
    assert connected is False


@pytest.mark.django_db(transaction=True)
async def test_boda_accepts_driver_and_announces(boda, driver_user):
    comm = WebsocketCommunicator(_boda_app(), "/ws/boda/location/")
    comm.scope["user"] = driver_user

    connected, _ = await comm.connect()
    assert connected is True

    ready = await comm.receive_json_from()
    assert ready["type"] == "boda.ready"
    assert ready["boda_id"] == str(boda.id)

    await comm.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_boda_rejects_invalid_coords(boda, driver_user):
    comm = WebsocketCommunicator(_boda_app(), "/ws/boda/location/")
    comm.scope["user"] = driver_user
    connected, _ = await comm.connect()
    assert connected is True
    await comm.receive_json_from()  # boda.ready

    await comm.send_json_to({"lat": 0, "lng": 0})
    err = await comm.receive_json_from()
    assert err["type"] == "boda.error"

    await comm.send_json_to({"lat": 200, "lng": 36})
    err = await comm.receive_json_from()
    assert err["type"] == "boda.error"

    await comm.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_boda_persists_point(boda, driver_user):
    comm = WebsocketCommunicator(_boda_app(), "/ws/boda/location/")
    comm.scope["user"] = driver_user
    connected, _ = await comm.connect()
    assert connected is True
    await comm.receive_json_from()  # boda.ready

    await comm.send_json_to({"lat": -1.3000, "lng": 36.8200})
    await comm.receive_json_from()  # echo

    from entitylocations.models import BodaLocations as BL

    refreshed = await sync_to_async(BL.objects.get)(pk=boda.pk)
    assert refreshed.point is not None
    assert refreshed.point.y == pytest.approx(-1.3000, rel=1e-5)
    assert refreshed.point.x == pytest.approx(36.8200, rel=1e-5)

    await comm.disconnect()


# --------------------------------------------------------------------------- #
# End-to-end: driver → watcher
# --------------------------------------------------------------------------- #

@pytest.mark.django_db(transaction=True)
async def test_end_to_end_driver_ping_reaches_watcher(
    order_with_boda, customer, driver_user,
):
    # Watcher (customer) joins
    watcher = WebsocketCommunicator(
        _tracking_app(),
        f"/ws/orders/{order_with_boda.id}/tracking/",
    )
    watcher.scope["user"] = customer
    connected, _ = await watcher.connect()
    assert connected is True
    await watcher.receive_json_from()  # snapshot

    # Driver joins
    driver = WebsocketCommunicator(_boda_app(), "/ws/boda/location/")
    driver.scope["user"] = driver_user
    connected, _ = await driver.connect()
    assert connected is True
    await driver.receive_json_from()  # boda.ready

    # Driver reports a new location
    await driver.send_json_to({"lat": -1.31, "lng": 36.83})

    # Driver gets its echo
    echo = await driver.receive_json_from()
    assert echo["type"] == "boda.location"
    assert echo["lat"] == pytest.approx(-1.31)

    # Watcher receives the same ping
    pushed = await watcher.receive_json_from()
    assert pushed["type"] == "boda.location"
    assert pushed["lat"] == pytest.approx(-1.31)
    assert pushed["lng"] == pytest.approx(36.83)

    await driver.disconnect()
    await watcher.disconnect()


# --------------------------------------------------------------------------- #
# REST fallback (customerOrdersAPIView.GetOrderDriverLocation)
# --------------------------------------------------------------------------- #

@pytest.mark.django_db
def test_rest_fallback_customer_sees_location(order_with_boda, customer):
    client = APIClient()
    client.force_authenticate(user=customer)

    response = client.post(
        CUSTOMER_ORDERS_URL,
        {
            "action": "GetOrderDriverLocation",
            "customer_order": str(order_with_boda.id),
        },
        format="json",
    )
    body = response.json()
    assert body["response_code"] == 0
    assert body["location"]["lat"] == pytest.approx(-1.2864, rel=1e-5)
    assert body["location"]["lng"] == pytest.approx(36.8172, rel=1e-5)
    assert body["location"]["order_status"] == "ASSIGNED"
    assert body["location"]["driver_phone"] == "+254700000003"


@pytest.mark.django_db
def test_rest_fallback_retailer_sees_location(order_with_boda, retailer_owner):
    client = APIClient()
    client.force_authenticate(user=retailer_owner)

    response = client.post(
        CUSTOMER_ORDERS_URL,
        {
            "action": "GetOrderDriverLocation",
            "customer_order": str(order_with_boda.id),
        },
        format="json",
    )
    body = response.json()
    assert body["response_code"] == 0
    assert body["location"]["lat"] == pytest.approx(-1.2864, rel=1e-5)


@pytest.mark.django_db
def test_rest_fallback_stranger_denied(order_with_boda, stranger):
    client = APIClient()
    client.force_authenticate(user=stranger)

    response = client.post(
        CUSTOMER_ORDERS_URL,
        {
            "action": "GetOrderDriverLocation",
            "customer_order": str(order_with_boda.id),
        },
        format="json",
    )
    body = response.json()
    assert body["response_code"] == 1


@pytest.mark.django_db
def test_rest_fallback_terminal_order_returns_error(order_with_boda, customer):
    order_with_boda.status = "DELIVERED"
    order_with_boda.save()

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        CUSTOMER_ORDERS_URL,
        {
            "action": "GetOrderDriverLocation",
            "customer_order": str(order_with_boda.id),
        },
        format="json",
    )
    body = response.json()
    assert body["response_code"] == 1


@pytest.mark.django_db
def test_rest_fallback_no_boda_returns_error(make_order, customer):
    order = make_order(status="ASSIGNED", boda=None)
    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        CUSTOMER_ORDERS_URL,
        {
            "action": "GetOrderDriverLocation",
            "customer_order": str(order.id),
        },
        format="json",
    )
    body = response.json()
    assert body["response_code"] == 1