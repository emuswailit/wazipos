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