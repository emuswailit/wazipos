from rest_framework import exceptions, serializers
from products.models import ProductImages
from products.serializers import ProductImageSerializer
from . import models
from datetime import datetime
from entitylocations.serializers import BodaLocationsSerializer


class MenuItemImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MenuItemImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "menu_item",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("menu_item", "thumbnail", "owner", "entity")


class MenuItemsSerializer(serializers.ModelSerializer):
    menu_title = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    branch_title = serializers.SerializerMethodField(read_only=True)
    images = MenuItemImageSerializer(many=True, read_only=True)

    class Meta:
        model = models.MenuItem
        fields = (
            "id",
            "entity",
            "entity_title",
            "branch",
            "branch_title",
            "menu",
            "menu_title",
            "title",
            "description",
            "images",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }
    def get_menu_title(self, obj):
        return obj.menu.title
    
    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
    
    def get_branch_title(self, obj):
        if obj.branch:
            return obj.branch.title
        else:
            return ""
        
class BranchFoodItemSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField(read_only=True)
    menu_item_title = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BranchFoodItem
        fields = (
            "id",
            "entity",
            "price",
            "quantity",
            "menu_item",
            "menu_item_title",
            "title",
            "branch",
            "preparation_date",
            "expiry_date",
            "images",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    def get_title(self, obj):
        return obj.menu_item.title
    def get_menu_item_title(self, obj):
        return obj.menu_item.title
    def get_images(self, obj):
        images =[]
        if models.MenuItemImages.objects.filter(menu_item=obj.menu_item).exists():
            images=models.MenuItemImages.objects.filter(menu_item=obj.menu_item).all()
        return MenuItemImageSerializer(images, context=self.context, many=True).data



class TablesSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    attendant_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.BranchTable
        fields = (
            "id",
            "entity",
            "branch",
            "branch_title",
            "attendant",
            "attendant_title",
            "seats",
            "title",
            "description",
            "is_available",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_branch_title(self, obj):
        return obj.branch.title
    
    def get_attendant_title(self, obj):
        if obj.attendant:
            return f"{obj.attendant.user.first_name} {obj.attendant.user.last_name}"
        else:
            return " "
        
class BranchRoomImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.BranchRoomImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "branch_room",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("menu_item", "thumbnail", "owner", "entity")

class BranchRoomSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    is_available = serializers.SerializerMethodField(read_only=True)
    room_images = BranchRoomImageSerializer(many=True, read_only=True)
    class Meta:
        model = models.BranchRoom
        fields = (
            "id",
            "entity",
            "branch",
            "branch_title",
            "stars",
            "occupancy",
            "free_parking",
            "free_cancellation",
            "free_breakfast",
            "free_wifi",
            "room_images",
            "title",
            "price",
            "room_images",
            "description",
            "is_available",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
        extra_kwargs = {
            "room_images": {
                "required": False,
            }
        }

    def get_branch_title(self, obj):
        if obj.branch:
            return obj.branch.title
        else:
            return ""
    def get_is_available(self, obj):
        return models.BranchRoomBooking.objects.filter(branch_room=obj, checkout_date__lte=datetime.today() ).count()<1


class MenusSerializer(serializers.ModelSerializer):
    menu_items = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    branch_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Menu
        fields = (
            "id",
            "entity",
            "entity_title",
            "branch",
            "branch_title",
            "title",
            "served_on",
            "served_from",
            "served_to",
            "description",
            "menu_items",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "title", "created", "updated", "entity", "id")

    def get_menu_items(self, obj):
        menu_items = []
        if models.MenuItem.objects.filter(menu=obj).exists():
            menu_items = models.MenuItem.objects.filter(menu=obj).all()
        return MenuItemsSerializer(menu_items, context=self.context, many=True).data
    
    def get_entity_title(self, obj):
        if obj.entity:
            return obj.entity.title
        else:
            return ""
    
    def get_branch_title(self, obj):
        if obj.branch:
            return obj.branch.title
        else:
            return ""

class FoodOrderSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField(read_only=True)
    order_total_amount = serializers.SerializerMethodField(read_only=True)
    table_title = serializers.SerializerMethodField(read_only=True)
    branch_title = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    psp_reference_number = serializers.SerializerMethodField(read_only=True)
    payment_status = serializers.SerializerMethodField(read_only=True)
    payment_description = serializers.SerializerMethodField(read_only=True)
    provider_reference_number = serializers.SerializerMethodField(read_only=True)
    bodaboda_title = serializers.SerializerMethodField(read_only=True)
    bodaboda_farness = serializers.SerializerMethodField(read_only=True)
 

    class Meta:
        model = models.BranchFoodOrder
        fields = (
            "id",
            "entity",
            "entity_title",
            "customer_name",
            "customer_phone",
            "branch_table",
            "branch",
            "payment_method",
            "order_total_amount",
            "document_number",
            "branch_title",
            "table_title",
            "description",
            "status",
            "order_origin",
            "bodaboda",
            "delivery_method",
            "shipping_cost",
            "psp_reference_number",
            "payment_status",
            "payment_description",
            "provider_reference_number",
            "bodaboda_title",
            "bodaboda_farness",
            "items",
            "is_paid",
            "is_served",
            "owner",
            "owner_title",
            "payment_method_title",
            "origin_point",
            "destination_point",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_items(self, obj):
        items = []
        if models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).exists():
            items = models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).all()
        return FoodOrderItemsSerializer(items, context=self.context, many=True).data

    def get_order_total_amount(self, obj):
        total_amount = 0.00
        if models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).exists():
            items = models.BranchFoodOrderItem.objects.filter(branch_food_order=obj).all()
            for item in items:
                total_amount = total_amount + (
                    float(item.quantity) * float(item.branch_food_item.price)
                )
        return float(total_amount)

    def get_table_title(self, obj):
        if obj.branch_table:
            return obj.branch_table.title
        else:
            return ""
        
    def get_bodaboda_title(self,obj):
        if obj.bodaboda:
            return f"{obj.bodaboda.owner.first_name}, {obj.bodaboda.owner.phone}"
        else:
            return ""
        
    def get_entity_title(self,obj):
        if obj.entity:
            return f"{obj.entity.title}"
        else:
            return ""
        
    def get_bodaboda_farness(self,obj):
        if obj.bodaboda:
            return f"{obj.bodaboda.farness}km"
        else:
            return ""

    def get_branch_title(self, obj):
        return obj.branch.title

    def get_owner_title(self, obj):
        return f"{obj.owner.first_name} {obj.owner.last_name}"
    
    def get_payment_method_title(self, obj):
        return f"{obj.payment_method.title}"

    def get_psp_reference_number(self, obj):
        if models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj
        ).exists():
            payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj
            ).first()
            return payment.psp_reference_number
        else:
            return ""
    def get_payment_status(self, obj):
        if models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj,status="SUCCESS"
        ).exists():
            payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj,status="SUCCESS"
            ).first()
            return payment.status
        elif models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj,status="FAILED"
        ).exists():
                payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj,status="FAILED"
            ).first()
                return payment.status
        elif models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj,status="PENDING"
        ).exists():
                payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj,status="PENDING"
            ).first()
                return payment.status
        else:
            return "UNAVAILABLE"
            
    def get_payment_description(self, obj):
        if models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj
        ).exists():
            payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj
            ).first()
            return payment.desc
        else:
            return ""
    def get_provider_reference_number(self, obj):
        if models.BranchFoodOrderPayment.objects.filter(
            branch_food_order=obj
        ).exists():
            payment = models.BranchFoodOrderPayment.objects.filter(
                branch_food_order=obj
            ).first()
            return payment.provider_reference_num
        else:
            return ""
    
class FoodOrderItemsSerializer(serializers.ModelSerializer):
    item_total_amount = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    price = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.BranchFoodOrderItem
        fields = (
            "id",
            "entity",
            "branch_food_order",
            "branch_food_item",
            "item_total_amount",
            "price",
            "title",
            "quantity",
            "images",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated","images", "entity", "id")

    def get_item_total_amount(self, obj):
        item_total_amount = 0.00
        if obj.quantity and obj.branch_food_item:
            item_total_amount = float(obj.quantity) * float(obj.branch_food_item.price)
        return float(item_total_amount)

    def get_title(self, obj):
        return obj.branch_food_item.menu_item.title

    def get_price(self, obj):
        return obj.branch_food_item.price
        
    def get_images(self, obj):
        images =[]
        if obj.branch_food_item.menu_item:
            if models.MenuItemImages.objects.filter(menu_item=obj.branch_food_item.menu_item).exists():
                images = models.MenuItemImages.objects.filter(menu_item=obj.branch_food_item.menu_item).all()
        return  MenuItemImageSerializer(
                images, context=self.context,many=True,
            ).data
    
class BarInventorySerializer(serializers.ModelSerializer):
    manufacturer = serializers.SerializerMethodField(read_only=True)
    manufacturer_title = serializers.SerializerMethodField(read_only=True)
    branch_title = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    supplier_title = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    packaging = serializers.SerializerMethodField(read_only=True)
    images = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BarInventory
        fields = (
            "id",
             "bar_code",
            "batch",
            "branch",
            "branch_title",
            "category",
             "entity",
            "expiry_date",
            "title",
            "units_per_pack",
            "packaging",
            "manufacturer",
            "manufacturer_title",
            "manufacture_date",
            "pack_quantity",
            "pack_buying_price",
            "pack_selling_price",
            "product",
            "supplier",
            "supplier_title",
            "unit_quantity",
            "unit_buying_price",
            "unit_selling_price",
            "images",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_branch_title(self, obj):
        return obj.branch.title
    
    def get_title(self, obj):
        return obj.product.title
    
    def get_units_per_pack(self, obj):
        return obj.product.units_per_pack
    
    def get_packaging(self, obj):
        return obj.product.packaging
    
    def get_supplier_title(self, obj):
        if obj.supplier:
            return obj.supplier.title
        else:
            return ""
    def get_manufacturer(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.id
        else:
            return ""
    def get_manufacturer_title(self, obj):
        if obj.product.manufacturer:
            return obj.product.manufacturer.title
        else:
            return ""
    def get_images(self, obj):
        images =[]
        if obj.product:
            if ProductImages.objects.filter(product=obj.product).exists():
                images = ProductImages.objects.filter(product=obj.product).all()
        return  ProductImageSerializer(
                images, context=self.context,many=True,
            ).data
     
        


class BarInventoryOrderSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField(read_only=True)
    order_total_amount = serializers.SerializerMethodField(read_only=True)
    table_title = serializers.SerializerMethodField(read_only=True)
    branch_title = serializers.SerializerMethodField(read_only=True)
    owner_title = serializers.SerializerMethodField(read_only=True)
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    telco = serializers.SerializerMethodField(read_only=True)
    provider_reference_num = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.BarInventoryOrder
        fields = (
            "id",
            "draft_id",
            "entity",
            "customer_name",
            "customer_phone",
            "branch_table",
            "branch",
            "order_origin",
            "shipping_cost",
            "delivery_method",
            "payment_method",
            "order_total_amount",
            "document_number",
            "branch_title",
            "table_title",
            "telco",
            "provider_reference_num",
            "description",
            "items",
            "is_paid",
            "is_served",
            "owner",
            "owner_title",
            "payment_method_title",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_telco(self,obj):
        if models.BarInventoryOrderPayment.objects.filter(bar_inventory_order=obj).exists():
            order_payment = models.BarInventoryOrderPayment.objects.filter(bar_inventory_order=obj).first()
            return order_payment.telco_name
        else:
            return ""
        
    def get_provider_reference_num(self,obj):
        if models.BarInventoryOrderPayment.objects.filter(bar_inventory_order=obj).exists():
            order_payment = models.BarInventoryOrderPayment.objects.filter(bar_inventory_order=obj).first()
            return order_payment.provider_reference_num
        else:
            return ""
            
    def get_items(self, obj):
        items = []
        if models.BarInventoryOrderItem.objects.filter(bar_inventory_order=obj).exists():
            items = models.BarInventoryOrderItem.objects.filter(bar_inventory_order=obj).all()
        return BarInventoryOrderItemsSerializer(items, context=self.context, many=True).data

    def get_order_total_amount(self, obj):
        total_amount = 0.00
        if models.BarInventoryOrderItem.objects.filter(bar_inventory_order=obj).exists():
            items = models.BarInventoryOrderItem.objects.filter(bar_inventory_order=obj).all()
            for item in items:
                total_amount = total_amount + (
                    float(item.quantity) * float(item.bar_inventory.unit_selling_price)
                )
        return float(total_amount)

    def get_table_title(self, obj):
        if obj.branch_table:
            return obj.branch_table.title
        else:
            return ""

    def get_branch_title(self, obj):
        return obj.branch.title

    def get_owner_title(self, obj):
        return f"{obj.owner.first_name} {obj.owner.last_name}"
    def get_payment_method_title(self, obj):
        return f"{obj.payment_method.title}"


class BarInventoryOrderItemsSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField(read_only=True)
    item_total_amount = serializers.SerializerMethodField(read_only=True)
    title = serializers.SerializerMethodField(read_only=True)
    unit_selling_price = serializers.SerializerMethodField(read_only=True)
    pack_selling_price = serializers.SerializerMethodField(read_only=True)
    units_per_pack = serializers.SerializerMethodField(read_only=True)
    packaging = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.BarInventoryOrderItem
        fields = (
            "id",
            "entity",
            "bar_inventory_order",
            "bar_inventory",
            "item_total_amount",
            "unit_selling_price",
            "pack_selling_price",
            "title",
            "units_per_pack",
            "packaging",
            "quantity",
            "images",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }
    def get_item_total_amount(self, obj):
        item_total_amount = 0.00
        if obj.quantity and obj.bar_inventory:
            item_total_amount = float(obj.quantity) * float(obj.bar_inventory.unit_selling_price)
        return float(item_total_amount)

    def get_title(self, obj):
        return obj.bar_inventory.product.title

    def get_unit_selling_price(self, obj):
        return obj.bar_inventory.unit_selling_price
    
    def get_pack_selling_price(self, obj):
        return obj.bar_inventory.pack_selling_price
    
    def get_units_per_pack(self, obj):
        return obj.bar_inventory.product.units_per_pack
    
    def get_packaging(self, obj):
        return obj.bar_inventory.product.packaging
    
    def get_images(self, obj):
        images =[]
        if ProductImages.objects.filter(product=obj.bar_inventory.product).exists():
            images=ProductImages.objects.filter(product=obj.bar_inventory.product).all()
        return ProductImageSerializer(images, context=self.context, many=True).data



class BranchRoomBookingSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    entity_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BranchRoomBooking
        fields = (
            "id",
            "entity",
            "entity_title",
            "branch",
            "branch_title",
            "branch_guest",
            "branc_room",
            "checkin_date",
            "checkout_date",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    
    def get_branch_title(self, obj):
        return obj.branch.title
    def get_entity_title(self, obj):
        return obj.branch.entity.title
    

class BranchRoomBookingSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BranchRoomBooking
        fields = (
            "id",
            "entity",
            "branch",
            "branch_title",
            "branch_guest",
            "checkin_date",
            "checkout_date",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    
    def get_branch_title(self, obj):
        return obj.branch.title
    
class AccomodationOrderSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.AccomodationOrder
        fields = (
            "id",
            "entity",
            "branch",
            "branch_title",
            "entity_collection_account",
            "payment_method",
            "document_number",
            "room_bookings",
            "is_paid",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    
    def get_branch_title(self, obj):
        return obj.branch.title
    

class AccomodationOrderPaymentsSerializer(serializers.ModelSerializer):
    branch_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.AccomodationOrderPayments
        fields = (
            "id",
            "entity_collection_account",
            "accommodation_order",
            "payment_method",
            "reference_number",
            "psp_reference_number",
            "currency",
            "provider_reference_number",
            "status",
            "amount",
            "transaction_charge",
            "is_settled",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")
    
    def get_branch_title(self, obj):
        return obj.branch.title
    

class BarInventoryOrderPaymentSerializer(serializers.ModelSerializer):
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BarInventoryOrderPayment
        fields = (
            "id",
            "entity",
            "bar_inventory_order",
            "entity_collection_account",
            "payment_method_title",
            "reference_number",
            "psp_reference_number",
            "provider_reference_num",
            "status",
            "amount",
            "is_settled",
            "desc",
            "telco_name",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_payment_method_title(self, obj):
        return obj.payment_method.title
    
# class BarOrderPaymentSettlementsSerializer(serializers.ModelSerializer):
#     class Meta:
#         # model = models.BarOrderPaymentSettlement
#         fields = (
#             "id",
#             "entity",
#             "bar_order_payment",
#             "entity_collection_account",
#             "reference_number",
#             "psp_reference_number",
#             "account_from",
#             "account_to",
#             "status",
#             "amount",
#             "status",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("owner", "created", "updated", "entity", "id") 
    
class BranchFoodOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.BranchFoodOrderPayment
        fields = (
            "id",
            "entity",
            "branch_food_order",
            "entity_collection_account",
            "payment_method_title",
            "reference_number",
            "psp_reference_number",
            "provider_reference_num",
            "status",
            "amount",
            "is_settled",
            "desc",
            "telco_name",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_payment_method_title(self, obj):
        return obj.payment_method.title

# class FoodOrderPaymentSettlementsSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.FoodOrderPaymentSettlement
#         fields = (
#             "id",
#             "entity",
#             "branch_food_order_payment",
#             "entity_collection_account",
#             "reference_number",
#             "psp_reference_number",
#             "status",
#             "amount",
#             "account_from",
#             "account_to",
#             "status",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("owner", "created", "updated", "entity", "id") 

class AccomodationOrderPaymentsSerializer(serializers.ModelSerializer):
    payment_method_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.AccomodationOrderPayments
        fields = (
            "id",
            "entity",
            "accommodation_order",
            "entity_collection_account",
            "payment_method_title",
            "reference_number",
            "psp_reference_number",
            "provider_reference_num",
            "status",
            "amount",
            "is_settled",
            "desc",
            "telco_name",
            "owner",
            "created",
            "updated",
        )
        read_only_fields = ("owner", "created", "updated", "entity", "id")

    def get_payment_method_title(self, obj):
        return obj.payment_method.title
    
# class AccomodationOrderPaymentSettlementsSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = models.AccommodationOrderPaymentSettlement
#         fields = (
#             "id",
#             "entity",
#             "accommodation_order_payment",
#             "entity_collection_account",
#             "reference_number",
#             "psp_reference_number",
#             "status",
#             "amount",
#             "account_from",
#             "account_to",
#             "created",
#             "updated",
#         )
#         read_only_fields = ("owner", "created", "updated", "entity", "id")

    