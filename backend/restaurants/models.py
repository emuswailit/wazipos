from django.db import models
from products.models import  DrinksCategory, Products
from core.models import EntityRelatedModel
from authentication.models import Counties, Entities, EntityBranches, SubCounties, Users, Countries
from django.utils.translation import gettext_lazy as _

from django_advance_thumbnail import AdvanceThumbnailField
from django.core.validators import MaxValueValidator, MinValueValidator
from django.contrib.gis.db import models as geomodel
from django.core.files import File
from io import BytesIO

from PIL import Image
TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

SINGLE = 1
DOUBLE = 2
ROOM_OCCUPANCY_CHOICES = (
    (SINGLE, 'Single'),
    (DOUBLE, 'Double'),
)

def compress_image(image):
    im = Image.open(image)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im_io = BytesIO()
    im.save(im_io, 'jpeg', quality=70,optimize=True)
    new_image = File(im_io, name=image.name)
    return new_image


class StatusOptions(models.TextChoices):
    INITIATED = "INITIATED", _("INITIATED")
    SUCCESS = "SUCCESS", _("SUCCESS")
    FAILED = "FAILED", _("FAILED")
    PENDING = "PENDING", _("PENDING")


class Menu(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Branch Menus"
        unique_together = (
            "title",
        )
    

    branch = models.ForeignKey(
        EntityBranches,
        related_name="branch_menu",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    served_on = models.CharField(max_length=256, null=True, blank=True)
    served_from = models.CharField(max_length=256, null=True, blank=True)
    served_to = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="menu_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Menu, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return self.title


class MenuItemImages(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Menu Item Images"
    menu_item = models.ForeignKey(
        "MenuItem",
        related_name="menu_item_images_menu_item",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="menu_item_images_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    image = models.FileField(upload_to="images")
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/images/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self,force_insert=False, force_update=False, using=None,*args, **kwargs):
        if self.image:
            image = self.image
            if image.size > 0.3*1024*1024: #if size greater than 300kb then it will send to compress image function
                self.image = compress_image(image)
        super(MenuItemImages, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"
    

class MenuItem(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Menu Items"
        unique_together = (
            "title",
            "menu",
            "entity",
        )


    branch = models.ForeignKey(
        EntityBranches,
        related_name="menu_item_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    menu = models.ForeignKey(
        Menu,
        related_name="menu_item_menu",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    images = models.ManyToManyField(MenuItemImages, related_name="images", blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="menu_item_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(MenuItem, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title}"


class BranchFoodItem(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Food Items"
    menu_item = models.ForeignKey(
        MenuItem,
        related_name="branch_food_item_item_menu",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        EntityBranches,
        related_name="branch_food_item_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.IntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    preparation_date= models.DateField()
    expiry_date= models.DateField()
    owner = models.ForeignKey(
        Users,
        related_name="branch_food_item_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.menu_item.title} - {self.price}"


class BranchTable(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Tables"
    title = models.CharField(max_length=256, null=True, blank=True)

    branch = models.ForeignKey(
        EntityBranches,
        related_name="table_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    attendant = models.ForeignKey(
        "employees.Employees",
        related_name="table_attendant_employee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    seats = models.IntegerField()
    description = models.CharField(max_length=48, null=True, blank=True)
    is_available = models.BooleanField(default=True)
    owner = models.ForeignKey(
        Users,
        related_name="table_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(BranchTable, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return self.title


class BarInventory(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Branch Drinks"

    category = models.ForeignKey(
        DrinksCategory,
        related_name="drink_category",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        EntityBranches,
        related_name="drink_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    bar_code = models.CharField(max_length=256, null=True, blank=True)
    batch = models.CharField(max_length=256, null=True, blank=True)
    product = models.ForeignKey(
        Products,
        related_name="branch_drink",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    supplier = models.ForeignKey(
        Entities,
        related_name="drink_source",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    manufacture_date = models.DateField(default=None, null=True, blank=True)
    expiry_date = models.DateField(default=None, null=True, blank=True)
    pack_quantity = models.IntegerField()
    unit_quantity = models.IntegerField()
    pack_buying_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    pack_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    unit_buying_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    unit_selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    owner = models.ForeignKey(
        Users,
        related_name="drink_added_by",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.product.title.upper()
        if self.product.bar_code:
            self.bar_code=self.product.bar_code
        self.unit_buying_price = float(self.pack_buying_price)/float(self.product.units_per_pack)
        self.unit_selling_price = float(self.pack_selling_price)/float(self.product.units_per_pack)
        self.unit_quantity = float(self.pack_quantity) * float(self.product.units_per_pack)
        super(BarInventory, self).save(*args, **kwargs)



    def __str__(self) -> str:
        return self.product.title


class OrderOriginOptions(models.TextChoices):
    CUSTOMER = "CUSTOMER", _("CUSTOMER")
    STAFF = "STAFF", _("STAFF")


class DeliveryMethodOptions(models.TextChoices):
    DELIVERY = "DELIVERY", _("DELIVERY")
    PICKUP = "PICKUP", _("PICKUP")


class BarInventoryOrder(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Bar Orders"

    customer_name = models.CharField(max_length=56, null=True, blank=True)
    customer_phone = models.CharField(max_length=56, null=True, blank=True)
    payment_reference_number = models.CharField(max_length=56, null=True, blank=True)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="bar_order_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    order_origin = models.CharField(
        verbose_name=_("Order Origin"),
        choices=OrderOriginOptions.choices,
        max_length=20,
        default="STAFF"
    )
    order_items_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    shipping_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    delivery_method = models.CharField(
        verbose_name=_("Delivery Method"),
        choices=DeliveryMethodOptions.choices,
        max_length=20,
        default="PICKUP"
    )
    branch_table = models.ForeignKey(
        BranchTable,
        related_name="bar_order_table",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        EntityBranches,
        related_name="bar_order_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    document_number = models.CharField(max_length=56)
    draft_id = models.CharField(max_length=56)

    description = models.CharField(max_length=48, null=True, blank=True)
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_served = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        Users,
        related_name="bar_order_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.document_number}"


class BarInventoryOrderItem(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Inventory Order Items"

    bar_inventory_order = models.ForeignKey(
        BarInventoryOrder,
        related_name="bar_order_items_order",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    bar_inventory = models.ForeignKey(
        BarInventory,
        related_name="drink_order_item_drink",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.IntegerField()
    owner = models.ForeignKey(
        Users,
        related_name="order_item_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def price(self):
        return self.charge.price
    
class OrderOriginOptions(models.TextChoices):
    CUSTOMER = "CUSTOMER", _("CUSTOMER")
    STAFF = "STAFF", _("STAFF")

class OrderChannelOptions(models.TextChoices):
    WEB = "WEB", _("WEB")
    ANDROID = "ANDROID", _("ANDROID")
    IOS = "IOS", _("IOS")
    WINDOWS = "WINDOWS", _("WINDOWS")

class DeliveryMethodOptions(models.TextChoices):
    DELIVERY = "DELIVERY", _("DELIVERY")
    PICKUP = "PICKUP", _("PICKUP")

class FoodOrderStatusOptions(models.TextChoices):
    ASSIGNED = "ASSIGNED", _("ASSIGNED")
    CANCELLED = "CANCELLED", _("CANCELLED")
    COMPLETED = "COMPLETED", _("COMPLETED")
    DISPATCHED = "DISPATCHED", _("DISPATCHED")
    DELIVERED = "DELIVERED", _("DELIVERED")
    PICKED = "PICKED", _("PICKED")
    PROCESSING = "PROCESSING", _("PROCESSING")
    RECEIVED = "RECEIVED", _("RECEIVED")
class BranchFoodOrder(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Food Orders"
    customer_name = models.CharField(max_length=56, null=True, blank=True)
    customer_phone = models.CharField(max_length=56, null=True, blank=True)
    branch = models.ForeignKey(
        EntityBranches,
        related_name="branch_food_order_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    status = models.CharField(
        verbose_name=_("Order Status"),
        choices=FoodOrderStatusOptions.choices,
        max_length=20,
        default=FoodOrderStatusOptions.PROCESSING
    )
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="food_order_payment_method",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    order_origin = models.CharField(
        verbose_name=_("Order Origin"),
        choices=OrderOriginOptions.choices,
        max_length=20,
        default="STAFF"
    )
    shipping_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    order_items_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    delivery_method = models.CharField(
        verbose_name=_("Delivery Method"),
        choices=DeliveryMethodOptions.choices,
        max_length=20,
        default="PICKUP"
    )
    bodaboda = models.ForeignKey(
        "entitylocations.BodaLocations",
        related_name="food_order_deliverer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch_table = models.ForeignKey(
        BranchTable,
        related_name="food_order_branch_table",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    document_number = models.CharField(max_length=56)
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_served = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    description = models.CharField(max_length=48, null=True, blank=True)

    owner = models.ForeignKey(
        Users,
        related_name="food_order_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    draft_id = models.CharField(
            max_length=256, null=True, blank=True,
        )
    city_name = models.CharField(
        max_length=256, null=True, blank=True,
    )
    order_origin = models.CharField(
        verbose_name=_("Order Origin"),
        choices=OrderOriginOptions.choices,
        max_length=20,
    )

    status = models.CharField(
        verbose_name=_("Order Status"),
        choices=FoodOrderStatusOptions.choices,
        max_length=20,
        default=FoodOrderStatusOptions.PROCESSING
    )
    order_channel = models.CharField(
        verbose_name=_("Order Source"),
        choices=OrderChannelOptions.choices,
        default=OrderChannelOptions.WEB,
        max_length=20,
    )

    origin_point = geomodel.PointField(null=True, blank=True, srid=4326)
    destination_point = geomodel.PointField(null=True, blank=True, srid=4326)
    order_tax_total = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    farness = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True
    )
    customer = models.ForeignKey(
        Users,
        related_name="branch_food_order_customer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        default=None,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    def save(self, *args, **kwargs):
        if self.customer:
            self.customer_name = f"{self.customer.first_name.upper()} {self.customer.last_name.upper()}"
            self.customer_phone = f"{self.customer.phone}"
        super(BranchFoodOrder, self).save(*args, **kwargs)
    def __str__(self) -> str:
        return f"{self.document_number}"

    class Meta:
        unique_together = (
            "document_number",
            "entity",
        )

class BranchFoodOrderItem(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Food Order Items"
    branch_food_order = models.ForeignKey(
        BranchFoodOrder,
        related_name="branch_food_order_items_food_order",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch_food_item = models.ForeignKey(
        BranchFoodItem,
        related_name="branch_food_order_item_menu_item",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.IntegerField()
    owner = models.ForeignKey(
        Users,
        related_name="food_order_item_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def price(self):
        return self.branch_food_item.price



class BarInventoryOrderPayment(EntityRelatedModel):
    # entity_collection_account = models.ForeignKey(
    #     EntityPSPCollectionAccount,
    #     related_name="drink_order_entity_collection_account",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True,
    # )
    bar_inventory_order = models.ForeignKey(
        BarInventoryOrder,
        blank=True,
        null=True,
        related_name="bar_inventory_order_payment_order",
        on_delete=models.CASCADE
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="bar_order_payment_payment_method",
        on_delete=models.CASCADE,
    )
    reference_number = models.CharField(max_length=50, default="")
    psp_reference_number = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    provider_reference_num = models.CharField(max_length=50, default="",null=True,blank=True)
    desc = models.CharField(max_length=256, default="",null=True,blank=True)
    telco_name = models.CharField(max_length=28, default="",null=True,blank=True)
    narration = models.CharField(max_length=50, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="bar_order_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Bar Orders Payments"
    def __str__(self) -> str:
        return f"{self.reference_number}-{self.amount}"

# class BarOrderPaymentSettlement(EntityRelatedModel):
#     branch_collection_account=models.ForeignKey(BranchCollectionAccount, related_name="settled_bar_order_branch_collection_account",on_delete=models.CASCADE,null=True,blank=True)
#     bar_order_payment=models.ForeignKey(BarInventoryOrderPayment, related_name="settled_bar_order",on_delete=models.CASCADE,null=True,blank=True)
#     reference_number = models.CharField(
#         max_length=56,
#     )
#     status = models.CharField(
#         verbose_name=_("Status"),
#         choices=StatusOptions.choices,
#         default=StatusOptions.INITIATED,
#         max_length=100,
#         null=True,
#         blank=True,
#     )
#     psp_reference_number = models.CharField(
#         max_length=56,
#     )
#     account_from = models.CharField(
#         max_length=56,
#     )
#     account_to = models.CharField(
#         max_length=56,
#     )
#     amount = models.DecimalField(max_digits=7, decimal_places=2)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)


class BranchFoodOrderPayment(EntityRelatedModel):
    # entity_collection_account = models.ForeignKey(
    #     EntityPSPCollectionAccount,
    #     related_name="food_order_payment_entity_collection_account",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True,
    # )
    branch_food_order = models.ForeignKey(
        BranchFoodOrder,
        blank=True,
        on_delete=models.CASCADE,null=True
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="food_order_payment_payment_method",
        on_delete=models.CASCADE,
    )
    reference_number = models.CharField(max_length=50, default="")
    psp_reference_number = models.CharField(max_length=50, default="")
    rrn = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    description = models.CharField(max_length=50, default="")
    provider_reference_num = models.CharField(max_length=50, default="",null=True,blank=True)
    desc = models.CharField(max_length=256, default="",null=True,blank=True)
    telco_name = models.CharField(max_length=28, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="food_order_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Food Orders Payments"
    def __str__(self) -> str:
        return f"{self.reference_number}-{self.amount}"


# class FoodOrderPaymentSettlement(EntityRelatedModel):
#     branch_collection_account=models.ForeignKey(BranchCollectionAccount, related_name="settled_food_order_branch_collection_account",on_delete=models.CASCADE,null=True,blank=True)
#     branch_food_order_payment=models.ForeignKey(BranchFoodOrderPayment, related_name="settled_accommodation_order",on_delete=models.CASCADE,null=True,blank=True)
#     reference_number = models.CharField(
#         max_length=56,
#     )
#     status = models.CharField(
#         verbose_name=_("Status"),
#         choices=StatusOptions.choices,
#         default=StatusOptions.INITIATED,
#         max_length=100,
#         null=True,
#         blank=True,
#     )
#     psp_reference_number = models.CharField(
#         max_length=56,
#     )
#     account_from = models.CharField(
#         max_length=56,
#     )
#     account_to = models.CharField(
#         max_length=56,
#     )
#     amount = models.DecimalField(max_digits=7, decimal_places=2)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)


class BranchRoomImages(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Room Images"
    branch_room = models.ForeignKey(
        "restaurants.BranchRoom",
        related_name="branch_room_image_branch_room",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="branch_room_image_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    image = models.FileField(upload_to="room_images")
    thumbnail = AdvanceThumbnailField(
        source_field="image",
        upload_to="thumbnails/images/",
        null=True,
        blank=True,
        size=(300, 300),
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.owner.first_name}'s photos"


class BranchRoom(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Accommodation Rooms"
    branch = models.ForeignKey(
        EntityBranches,
        related_name="branch_room_branch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
   
    title = models.CharField(max_length=256, null=True, blank=True)
    description = models.CharField(max_length=48, null=True, blank=True)
    free_parking = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_available = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    occupancy = models.IntegerField(
         choices=ROOM_OCCUPANCY_CHOICES,
    )
    free_wifi = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    free_cancellation = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    free_breakfast = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    stars = models.IntegerField( default=0,
        validators=[
            MaxValueValidator(5),
            MinValueValidator(0)
        ])
    
    room_images = models.ManyToManyField(BranchRoomImages, related_name="room_images", blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    owner = models.ForeignKey(
        Users,
        related_name="branch_room_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(BranchRoom, self).save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} - {self.branch}"
    

class BranchRoomRating(EntityRelatedModel):
    class Meta:
        verbose_name_plural = "Room Ratings"
        unique_together = (
            "branch_room",
            "owner",
        )
    branch_room = models.ForeignKey(
        BranchRoom,
        related_name="rating_branch_room",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    stars = models.IntegerField( default=1,
        validators=[
            MaxValueValidator(5),
            MinValueValidator(0)
        ])
    
    owner = models.ForeignKey(
        Users,
        related_name="room_rating_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class IdentifierType(models.TextChoices):
    NationalId = "NationalId", _("NationalId")
    Passport = "Passport", _("Passport")


class GenderChoices(models.TextChoices):
    Female = "Female", _("Female")
    Male = "Male", _("Male")


class BranchGuest(EntityRelatedModel):
    first_name = models.CharField(max_length=256, null=True, blank=True)
    last_name = models.CharField(max_length=256, null=True, blank=True)
    phone = models.CharField(max_length=56, null=True, blank=True)
    identifier_number = models.CharField(max_length=56, null=True, blank=True)
    identifier_type = models.CharField(
        verbose_name=_("Identifier Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    gender = models.CharField(
        verbose_name=_("Gender"),
        choices=GenderChoices.choices,
        max_length=50,
    )
    age_type = models.CharField(
        verbose_name=_("Age Type"),
        choices=IdentifierType.choices,
        max_length=50,
    )
    nationality = models.ForeignKey(
        Countries, on_delete=models.CASCADE, null=True, blank=True
    )
    owner = models.ForeignKey(
        Users,
        related_name="guest_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        EntityBranches,
        related_name="guest_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        Users,
        related_name="guest_user",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.gender}"


class BranchRoomBooking(EntityRelatedModel):
    branch= models.ForeignKey(
        EntityBranches,
        related_name="room_booking_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch_guest=models.ManyToManyField(BranchGuest)
    checkin_date =models.DateField()
    checkout_date =models.DateField()
    owner = models.ForeignKey(
        Users,
        related_name="room_booking_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch_room = models.ForeignKey(
        BranchRoom,
        related_name="room_booking_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class AccomodationOrder(EntityRelatedModel):
    branch = models.ForeignKey(
        EntityBranches,
        related_name="accommodation_order_branch_collection_account",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    # entity_collection_account = models.ForeignKey(
    #     EntityPSPCollectionAccount,
    #     related_name="accommodation_order_entity_collection_account",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True,
    # )
    document_number = models.CharField(max_length=50, default="")
    room_bookings = models.ManyToManyField(BranchRoomBooking)
    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="accommodation_order_payment_method",
        on_delete=models.CASCADE,
    )
    order_items_cost = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True, default=0.00
    )
    is_paid = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        Users,
        related_name="accommodation_order_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class AccomodationOrderPayments(EntityRelatedModel):
    # entity_collection_account = models.ForeignKey(
    #     EntityPSPCollectionAccount,
    #     related_name="accommodation_order_payment_entity_collection_account",
    #     on_delete=models.CASCADE,
    #     null=True,
    #     blank=True,
    # )
    accommodation_order = models.ForeignKey(
        AccomodationOrder,
        related_name="room_rating_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    payment_method = models.ForeignKey(
        "payments.PaymentMethods",
        related_name="accommodation_order_payment_payment_method",
        on_delete=models.CASCADE,
    )
    reference_number = models.CharField(max_length=50, default="")
    psp_reference_number = models.CharField(max_length=50, default="")
    currency = models.CharField(max_length=50, default="")
    provider_reference_num = models.CharField(max_length=50, default="",null=True,blank=True)
    desc = models.CharField(max_length=256, default="",null=True,blank=True)
    telco_name = models.CharField(max_length=28, default="",null=True,blank=True)
    status = models.CharField(
        verbose_name=_("Status"),
        choices=StatusOptions.choices,
        max_length=100,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    transaction_charge = models.DecimalField(
        max_digits=7, decimal_places=2, default=0.00
    )
    is_settled = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        Users,
        related_name="accommodation_payment_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    class Meta:
        verbose_name_plural="Accomodation Payments"
    def __str__(self) -> str:
        return f"{self.reference_number}-{self.amount}"


# class AccommodationOrderPaymentSettlement(EntityRelatedModel):
#     branch_collection_account=models.ForeignKey(BranchCollectionAccount, related_name="settled_branch_collection_account",on_delete=models.CASCADE,null=True,blank=True)
#     accommodation_order_payment=models.ForeignKey(AccomodationOrderPayments, related_name="settled_food_order",on_delete=models.CASCADE,null=True,blank=True)
#     reference_number = models.CharField(
#         max_length=56,
#     )
#     status = models.CharField(
#         verbose_name=_("Status"),
#         choices=StatusOptions.choices,
#         default=StatusOptions.INITIATED,
#         max_length=100,
#         null=True,
#         blank=True,
#     )
#     psp_reference_number = models.CharField(
#         max_length=56,
#     )
#     account_from = models.CharField(
#         max_length=56,
#     )
#     account_to = models.CharField(
#         max_length=56,
#     )
#     amount = models.DecimalField(max_digits=7, decimal_places=2)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)