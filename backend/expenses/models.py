from django.db import models
from authentication.models import Users
import uuid
from retailers.models import RetailerReceipts
from authentication.models import Entities
from core.models import EntityRelatedModel

# Create your models here.

TRUE_FALSE_OPTIONS = (
    ("true", "true"),
    ("false", "false"),
)

class WishLists(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256)
    limit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    is_closed = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    expiry_date = models.DateField(null=True, blank=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Wish Lists"

    def __str__(self) -> str:
        return self.title
    
    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(WishLists, self).save(*args, **kwargs)

class WishListProducts(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist = models.ForeignKey(
        WishLists,
        related_name="wishlist_products",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    product = models.ForeignKey(
        RetailerReceipts,
        related_name="wishlist_item_product",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    vendor = models.ForeignKey(
        Entities,
        related_name="wishlist_product_vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.PositiveIntegerField(default=1)
    item_price_total = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_product_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


    class Meta:
        verbose_name_plural = "Wish List Products" 
        unique_together = ('wishlist', 'product')
    
class WishListServices(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist = models.ForeignKey(
        WishLists,
        related_name="wishlist_services",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    title = models.CharField(max_length=256,)
    description = models.TextField(max_length=300, null=True, blank=True)
    vendor = models.ForeignKey(
        Entities,
        related_name="wishlist_service_vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_service_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.PositiveIntegerField(default=1)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title  


class WishListOrders(models.Model): 
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist = models.ForeignKey(
        WishLists,
        related_name="wishlist_order_items",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    vendor = models.ForeignKey(
        Entities,
        related_name="wishlist_order_vendor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    quantity = models.PositiveIntegerField(default=1)
    total_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    is_active = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="true"
    )
    reference_number = models.CharField(max_length=120, unique=True, null=True, blank=True)
    psp_reference_number = models.CharField(max_length=120, unique=True, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_order_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)



class WishListOrderProducts(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist_order = models.ForeignKey(
        WishListOrders,
        related_name="wishlist_order_products_order",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    wishlist_product = models.ForeignKey(
        WishListProducts,
        related_name="wishlist_order_product",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_order_product_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )  
    item_total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class WishListOrderServices(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist_order = models.ForeignKey(
        WishListOrders,
        related_name="wishlist_order_services_order",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    wishlist_service = models.ForeignKey(
        WishListServices,
        related_name="wishlist_order_service",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        related_name="wishlist_order_service_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )   
    service_total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class EntityExpenseCategories(EntityRelatedModel):
    title = models.CharField(max_length=256, unique=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    created_by = models.ForeignKey(
        Users,
        related_name="entity_expense_creator",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        Users,
        related_name="entity_expense_updater",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title
    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.upper()
        super(EntityExpenseCategories, self).save(*args, **kwargs)

class EntityExpense(EntityRelatedModel):
    draft_id = models.CharField(
        max_length=256, null=True, blank=True,
    )
    expense_category = models.ForeignKey(
        EntityExpenseCategories,
        related_name="entity_expense_category",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    expense_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, )
    description = models.TextField(max_length=300, null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="entity_expense_subscription_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class RecurretBills(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=256, unique=True)
    description = models.TextField(max_length=300, null=True, blank=True)
    frequency = models.CharField(max_length=50, choices=[
        ("DAILY", "DAILY"),
        ("WEEKLY", "WEEKLY"),
        ("MONTHLY", "MONTHLY"),
        ("QUARTERLY", "QUARTERLY"),
        ("YEARLY", "YEARLY"),
    ], default="MONTHLY")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="recurrent_bills_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_purchased = models.CharField(
        max_length=50, choices=TRUE_FALSE_OPTIONS, default="false"
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

class RecurretBillSubscriptions(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recurrent_bill = models.ForeignKey(
        RecurretBills,
        related_name="subscription_recurrent_bill",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    expiry_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        Users,
        related_name="recurrent_bill_product_owner",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)