from django.db import models
from core.models import EntityRelatedModel,OrganizationRelatedModel
from django.contrib.auth import get_user_model
from authentication.models import Departments,Entities,Counties
from django.utils.translation import gettext_lazy as _


# Create your models here.
User = get_user_model()

### Organization 


class OrganizationStore(OrganizationRelatedModel):
    title = models.CharField(max_length=256,)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(OrganizationStore, self).save(*args, **kwargs)

class OrganizationSubStore(OrganizationRelatedModel):
    organization_store = models.ForeignKey(OrganizationStore,null=True,blank=True,on_delete=models.CASCADE)
    title = models.CharField(max_length=256, unique=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(OrganizationSubStore, self).save(*args, **kwargs)

class EntityStore(EntityRelatedModel):
    organization_store=models.ForeignKey(OrganizationStore,null=True,blank=True,on_delete=models.CASCADE)
    organization_sub_store=models.ForeignKey(OrganizationSubStore,null=True,blank=True,on_delete=models.CASCADE)
    description = models.CharField(max_length=256,null=True,blank=True)
    title = models.CharField(max_length=256, unique=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(EntityStore, self).save(*args, **kwargs)





class EntitySubStore(EntityRelatedModel):
    entity_store = models.ForeignKey(
        EntityStore, related_name="entity_sub_store_entity_store",on_delete=models.CASCADE,null=True,blank=True)
    department = models.ForeignKey(
        Departments, related_name="entity_substore_department",on_delete=models.CASCADE,null=True,blank=True)
    title = models.CharField(max_length=256)
    description = models.CharField(max_length=256,null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(EntitySubStore, self).save(*args, **kwargs)

    class Meta:
        unique_together = ("entity", "title")
### Entity Store Ledger
class EntityStoreReceipts(EntityRelatedModel):
    """Entity store receives from organization store, organization sub store or another entity"""
    entity_store = models.ForeignKey(
        EntityStore, related_name="entity_sub_store_receipt_entity_store",on_delete=models.CASCADE,null=True,blank=True)
    product = models.ForeignKey(
        "products.Products", related_name="entity_store_receipt_product",on_delete=models.CASCADE)
    source_organization_store = models.ForeignKey(
        OrganizationStore, related_name="entity_store_receipt_source_organization_store",on_delete=models.CASCADE,null=True,blank=True)
    source_organization_sub_store = models.ForeignKey(
        OrganizationSubStore, related_name="entity_store_receipt_source",on_delete=models.CASCADE,null=True,blank=True)
    source_entity = models.ForeignKey(
        Entities, related_name="entity_store_receipt_source_entity",on_delete=models.CASCADE,null=True,blank=True)
    received_pack_quantity=models.IntegerField()
    current_pack_quantity=models.IntegerField()
    delivery_number = models.CharField(max_length=256,null=True,blank=True)
    batch = models.CharField(max_length=56,null=True,blank=True)
    pack_buying_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    pack_selling_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    unit_buying_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    unit_selling_price=models.DecimalField(decimal_places=2,max_digits=12,default=0.00)
    manufacture_date=models.DateField(null=True,blank=True)
    expiry_date=models.DateField(null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    
class EntityStoreIssues(EntityRelatedModel):
    """Entity store receives from organization store, organization sub store or another entity"""
    entity_store_receipt = models.ForeignKey(
        EntityStoreReceipts, related_name="entity_store_issue_entity_store_receipt",on_delete=models.CASCADE)
    destination_entity_sub_store = models.ForeignKey(
        EntitySubStore, related_name="entity_store_issue_destination_sub_store",on_delete=models.CASCADE,null=True)
    pack_quantity=models.IntegerField()
    despatch_number = models.CharField(max_length=256,null=True,blank=True)
    pack_buying_price=models.DecimalField(decimal_places=2,max_digits=12)
    manufacture_date=models.DateField()
    expiry_date=models.DateField()
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)


class EntitySubStoreReceipts(EntityRelatedModel):
    """facility Store receives from County Sub Store"""
    entity_sub_store = models.ForeignKey(
        EntitySubStore, related_name="entity_store_receipt_entity_sub_store",on_delete=models.CASCADE)
    source_entity_store = models.ForeignKey(
        EntityStore, related_name="entity_sub_store_receipt_source_entity_store",on_delete=models.CASCADE,null=True,blank=True)
    source_entity = models.ForeignKey(
        Entities, related_name="entity_sub_store_receipt_source_entity",on_delete=models.CASCADE,null=True,blank=True)
    product = models.ForeignKey(
        "products.Products", related_name="entity_sub_store_receipt_product",on_delete=models.CASCADE,null=True,blank=True)
    entity_store_issue = models.ForeignKey(
        EntityStoreIssues, related_name="entity_sub_store_receipt_entity_store_issue",on_delete=models.CASCADE,null=True,blank=True)
    received_pack_quantity=models.IntegerField()
    current_pack_quantity=models.IntegerField()
    received_unit_quantity=models.IntegerField()
    current_unit_quantity=models.IntegerField()
    pack_buying_price=models.DecimalField(decimal_places=2,max_digits=12)
    pack_selling_price=models.DecimalField(decimal_places=2,max_digits=12)
    unit_buying_price=models.DecimalField(decimal_places=2,max_digits=12)
    unit_selling_price=models.DecimalField(decimal_places=2,max_digits=12)
    batch = models.CharField(max_length=56,null=True,blank=True)
    manufacture_date=models.DateField(null=True,blank=True)
    expiry_date=models.DateField(null=True,blank=True)
    created = models.DateTimeField(auto_now=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE)
    

    def __str__(self) -> str:
        return self.product.title
    def save(self, *args, **kwargs):
        if  self.received_pack_quantity:
            self.current_pack_quantity=self.received_pack_quantity
            self.received_unit_quantity = int(self.received_pack_quantity)*int(self.product.units_per_pack)
            self.current_unit_quantity = int(self.received_pack_quantity)*int(self.product.units_per_pack)
        

        
        if  self.pack_buying_price:
            self.unit_buying_price = float(self.pack_buying_price)/self.product.units_per_pack
        
        if  self.pack_selling_price:
            self.unit_selling_price = float(self.pack_selling_price)/self.product.units_per_pack
            
        super(EntitySubStoreReceipts, self).save(*args, **kwargs)



# =====================================================================
# Deliveries
#
# A Shipment carries one order (a RetailerOrder: wholesaler -> retailer, or a
# CustomerOrder: retailer -> customer) and is split into ShipmentLegs:
#   LOCAL      a DeliveryAgent, origin -> destination
#   HANDOVER   an agent takes it to a long-haul courier's CollectionPoint
#   TRANSIT    the courier entity carries it to the destination CollectionPoint
#   LAST_MILE  final drop-off
#
# Who delivers:
#   - the seller's own delivery persons (DeliveryAgent.entity = the seller);
#   - an outsourced delivery company's persons (DeliveryAgent.entity = that
#     company), usable by sellers that list it as a DeliveryPartner;
#   - couriers: always outsourced entities (DeliveryPartner kind COURIER).
# Pricing: the DeliveryRate of whoever does the leg (seller, delivery company
# or courier), by distance + weight.
# Payout once a leg is done: the seller's own agent -> their
# payments.UserPayoutAccounts; an outsourced company's agent or a courier ->
# that entity's payments.PayoutAccounts.
# Logic: logistics/utils/deliveries.py.
# =====================================================================

from django.contrib.gis.db import models as geomodels  # noqa: E402


class DeliveryMode(models.TextChoices):
    FOOT = "FOOT", _("On foot")
    BICYCLE = "BICYCLE", _("Bicycle")
    MOTORBIKE = "MOTORBIKE", _("Motorbike")
    CAR = "CAR", _("Car")
    VAN = "VAN", _("Van / pickup")
    TRUCK = "TRUCK", _("Truck")
    COURIER = "COURIER", _("Long-haul courier")


class DeliveryPartner(EntityRelatedModel):
    """An outsourced delivery company or courier a seller (entity) works with."""

    class Kind(models.TextChoices):
        DELIVERY_COMPANY = "DELIVERY_COMPANY", _("Delivery company")
        COURIER = "COURIER", _("Long-haul courier")

    partner = models.ForeignKey(Entities, related_name="delivery_partner_of", on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Delivery Partners"
        constraints = [
            models.UniqueConstraint(fields=["entity", "partner", "kind"], name="uniq_delivery_partner"),
        ]

    def __str__(self):
        return f"{self.entity} -> {self.partner} ({self.kind})"


class DeliveryAgent(EntityRelatedModel):
    """
    A delivery person. entity = who employs them: the seller itself, or an
    outsourced delivery company.
    """

    user = models.ForeignKey(User, related_name="delivery_agent_profiles", on_delete=models.CASCADE)
    mode = models.CharField(max_length=20, choices=DeliveryMode.choices, default=DeliveryMode.MOTORBIKE)
    max_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    vehicle_registration = models.CharField(max_length=20, null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_point = geomodels.PointField(null=True, blank=True, srid=4326)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Delivery Agents"
        constraints = [
            models.UniqueConstraint(fields=["entity", "user"], name="uniq_delivery_agent_per_entity"),
        ]

    def __str__(self):
        return f"{self.user} ({self.get_mode_display()}) - {self.entity}"


class DeliveryRate(EntityRelatedModel):
    """
    Distance-based price for one mode, set by whoever delivers: a seller for
    its own agents, a delivery company for its agents, or a courier.
    cost = max(min_fee, base_fee + rate_per_km * km + rate_per_kg * kg)
    """

    mode = models.CharField(max_length=20, choices=DeliveryMode.choices)
    base_fee = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    rate_per_km = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    rate_per_kg = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    min_fee = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    max_distance_km = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    max_weight_kg = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Delivery Rates"
        constraints = [
            models.UniqueConstraint(fields=["entity", "mode"], name="uniq_delivery_rate_per_entity_mode"),
        ]

    def __str__(self):
        return f"{self.entity} {self.mode}: {self.base_fee} + {self.rate_per_km}/km"


class ShipmentStatus(models.TextChoices):
    QUOTED = "QUOTED", _("Quoted")
    CONFIRMED = "CONFIRMED", _("Confirmed")
    IN_TRANSIT = "IN_TRANSIT", _("In transit")
    AWAITING_PICKUP = "AWAITING_PICKUP", _("Awaiting pickup")
    DELIVERED = "DELIVERED", _("Delivered")
    FAILED = "FAILED", _("Failed")
    CANCELLED = "CANCELLED", _("Cancelled")


class Shipment(EntityRelatedModel):
    """Delivery of one order. entity = the seller (who ships)."""

    class Method(models.TextChoices):
        PICKUP = "PICKUP", _("Buyer collects")
        LOCAL = "LOCAL", _("Local delivery")
        COURIER = "COURIER", _("Long-haul courier")

    retailer_order = models.OneToOneField(
        "wholesalers.RetailerOrders", related_name="shipment",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    customer_order = models.OneToOneField(
        "retailers.CustomerOrders", related_name="shipment",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    food_order = models.OneToOneField(
        "restaurants.FoodOrder", related_name="shipment",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.LOCAL)
    status = models.CharField(max_length=20, choices=ShipmentStatus.choices, default=ShipmentStatus.QUOTED)
    origin_point = geomodels.PointField(null=True, blank=True, srid=4326)
    destination_point = geomodels.PointField(null=True, blank=True, srid=4326)
    destination_collection_point = models.ForeignKey(
        "authentication.CollectionPoints", related_name="inbound_shipments",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    recipient_name = models.CharField(max_length=256, null=True, blank=True)
    recipient_phone = models.CharField(max_length=32, null=True, blank=True)
    chargeable_weight_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    distance_km = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tracking_number = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    # The recipient gives this code to the last agent to prove delivery.
    delivery_code = models.CharField(max_length=8, null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Shipments"
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(retailer_order__isnull=False, customer_order__isnull=True, food_order__isnull=True)
                    | models.Q(retailer_order__isnull=True, customer_order__isnull=False, food_order__isnull=True)
                    | models.Q(retailer_order__isnull=True, customer_order__isnull=True, food_order__isnull=False)
                ),
                name="shipment_exactly_one_order_v2",
            ),
        ]

    def __str__(self):
        return f"Shipment {self.tracking_number or self.pk} ({self.status})"


class LegStatus(models.TextChoices):
    PENDING = "PENDING", _("Pending")
    ASSIGNED = "ASSIGNED", _("Assigned")
    PICKED_UP = "PICKED_UP", _("Picked up")
    HANDED_OVER = "HANDED_OVER", _("Handed over")
    DELIVERED = "DELIVERED", _("Delivered")
    FAILED = "FAILED", _("Failed")
    CANCELLED = "CANCELLED", _("Cancelled")


class ShipmentLeg(EntityRelatedModel):
    """One step of a shipment, done by an agent or a courier, and paid to them."""

    class Kind(models.TextChoices):
        LOCAL = "LOCAL", _("Local delivery")
        HANDOVER = "HANDOVER", _("To courier")
        TRANSIT = "TRANSIT", _("Courier transit")
        LAST_MILE = "LAST_MILE", _("Last mile")

    shipment = models.ForeignKey(Shipment, related_name="legs", on_delete=models.CASCADE)
    sequence = models.PositiveSmallIntegerField(default=1)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.LOCAL)
    mode = models.CharField(max_length=20, choices=DeliveryMode.choices, default=DeliveryMode.MOTORBIKE)
    status = models.CharField(max_length=20, choices=LegStatus.choices, default=LegStatus.PENDING)

    origin_point = geomodels.PointField(null=True, blank=True, srid=4326)
    destination_point = geomodels.PointField(null=True, blank=True, srid=4326)
    origin_collection_point = models.ForeignKey(
        "authentication.CollectionPoints", related_name="departing_legs",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    destination_collection_point = models.ForeignKey(
        "authentication.CollectionPoints", related_name="arriving_legs",
        on_delete=models.SET_NULL, null=True, blank=True,
    )

    # Who does it. provider = the entity whose rates price the leg and that is
    # paid when an outsourced party does it (the seller, a delivery company or
    # a courier). agent = the person, when a person carries it.
    provider = models.ForeignKey(Entities, related_name="provided_legs", on_delete=models.SET_NULL, null=True, blank=True)
    agent = models.ForeignKey(DeliveryAgent, related_name="legs", on_delete=models.SET_NULL, null=True, blank=True)
    waybill_number = models.CharField(max_length=60, null=True, blank=True)

    distance_km = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Payout once the leg is done (snapshot of where the money goes): the
    # seller's own agent -> payout_user_account; outsourced -> payout_entity_account.
    payout_user_account = models.ForeignKey(
        "payments.UserPayoutAccounts", related_name="shipment_legs",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    payout_entity_account = models.ForeignKey(
        "payments.PayoutAccounts", related_name="shipment_legs",
        on_delete=models.SET_NULL, null=True, blank=True,
    )
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_payable = models.BooleanField(default=False)
    is_settled = models.BooleanField(default=False)
    settled_at = models.DateTimeField(null=True, blank=True)
    pay_out_reference_number = models.CharField(max_length=120, null=True, blank=True)

    assigned_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Shipment Legs"
        ordering = ["shipment", "sequence"]
        constraints = [
            models.UniqueConstraint(fields=["shipment", "sequence"], name="uniq_leg_sequence_per_shipment"),
        ]

    def __str__(self):
        return f"{self.shipment} leg {self.sequence} {self.kind} ({self.status})"


class Fulfilment(EntityRelatedModel):
    """
    Getting one paid order ready: prepared -> packed -> ready, then either
    collected by the buyer (or someone they sent) or dispatched (Shipment).
    entity = the seller.
    """

    class Stage(models.TextChoices):
        PENDING = "PENDING", _("Waiting")
        PREPARING = "PREPARING", _("Preparing")
        PACKED = "PACKED", _("Packed")
        READY = "READY", _("Ready")
        COLLECTED = "COLLECTED", _("Collected")

    retailer_order = models.OneToOneField(
        "wholesalers.RetailerOrders", related_name="fulfilment",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    customer_order = models.OneToOneField(
        "retailers.CustomerOrders", related_name="fulfilment",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.PENDING)
    prepared_by = models.ForeignKey(User, related_name="fulfilments_prepared", on_delete=models.SET_NULL, null=True, blank=True)
    preparing_at = models.DateTimeField(null=True, blank=True)
    packed_by = models.ForeignKey(User, related_name="fulfilments_packed", on_delete=models.SET_NULL, null=True, blank=True)
    packed_at = models.DateTimeField(null=True, blank=True)
    package_count = models.PositiveIntegerField(default=1)
    package_weight_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ready_by = models.ForeignKey(User, related_name="fulfilments_readied", on_delete=models.SET_NULL, null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    # Pickup orders: the buyer gives this code to whoever hands the goods over.
    pickup_code = models.CharField(max_length=8, null=True, blank=True)
    collector_name = models.CharField(max_length=256, null=True, blank=True)
    collector_phone = models.CharField(max_length=32, null=True, blank=True)
    collector_id_number = models.CharField(max_length=64, null=True, blank=True)
    code_verified = models.BooleanField(default=False)
    handed_over_by = models.ForeignKey(User, related_name="fulfilments_handed_over", on_delete=models.SET_NULL, null=True, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Fulfilments"
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(retailer_order__isnull=False, customer_order__isnull=True)
                    | models.Q(retailer_order__isnull=True, customer_order__isnull=False)
                ),
                name="fulfilment_exactly_one_order",
            ),
        ]

    def __str__(self):
        return f"Fulfilment {self.pk} ({self.stage})"
