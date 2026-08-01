
from rest_framework import exceptions, serializers
from . import models
from core.date_utils import get_today,get_first_and_last_days_of_month,get_first_day_of_current_month
from utils.logging import create_log
from authentication.serializers import GenericUserSerializer




class PropertyImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PropertyImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "property",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("property", "thumbnail", "owner", "entity")


class PropertySerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField(read_only=True)
    current_revenue = serializers.SerializerMethodField(read_only=True)
    number_of_units = serializers.SerializerMethodField(read_only=True)
    defaulted_revenue = serializers.SerializerMethodField(read_only=True)
    monthly_revenue = serializers.SerializerMethodField(read_only=True)
    county_title = serializers.SerializerMethodField(read_only=True)
    country_title = serializers.SerializerMethodField(read_only=True)
    property_units = serializers.SerializerMethodField(read_only=True)
    images = PropertyImageSerializer(many=True, read_only=True)
    class Meta:
        model = models.Property
        fields = ("id","entity","owner","care_taker","title","description","country","country_title","county","county_title","town","street_address","estate","plot_area","property_type","disposal_type","number_of_units","total_floors","is_published","property_number","monthly_revenue","current_revenue","defaulted_revenue","created", "updated","images","property_units","location")
        read_only_fields = ("id", "created", "owner", "updated",)
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }
    def get_county_title(self, obj):
        try:
            return obj.county.title
        except:
            return ""
    def get_country_title(self, obj):
        try:
            return obj.country.title
        except:
            return ""
        
    def get_property_units(self, obj):
        try:
            units = models.PropertyUnits.objects.filter(property=obj)
            return PropertyUnitSerializer(units, many=True).data
        except:
            return []
    def get_location(self, obj):
        from entitylocations.models import PropertyLocations
        from entitylocations.serializers import PropertyLocationsSerializer
        try:
            if PropertyLocations.objects.filter(property=obj).exists():
                location = PropertyLocations.objects.filter(property=obj).first()
                if location:
                    return PropertyLocationsSerializer(location, context=self.context, many=False).data
                else:
                    return None
            else:
                return None
        except Exception as e:
            print(e)
            return None
        
    def get_monthly_revenue(self, obj):
        try:
            total = 0
            units = models.PropertyUnits.objects.filter(property=obj)
            for unit in units:
                total +=unit.price
            return total
        except:
            return 0.0
        
    def get_current_revenue(self, obj):
        try:
            total = 0
            units = models.PropertyUnits.objects.filter(property=obj)
            for unit in units:
                
                if  models.PropertyUnitPayments.objects.filter(property_unit=unit, valid_to__gte=get_first_day_of_current_month(),).exists():
                    total +=unit.price
            return total
        except:
            return 0.0
    def get_defaulted_revenue(self, obj):
        try:
            total = 0
            units = models.PropertyUnits.objects.filter(property=obj)
            for unit in units:
                if not models.PropertyUnitPayments.objects.filter(property_unit=unit, valid_to__gte=get_first_day_of_current_month(),).exists():
                    total +=unit.price
            return total
        except Exception as e:
            print("error calculating defaulted revenue",str(e))
            return 0.0
        
    def get_number_of_units(self, obj):
        try:
            return models.PropertyUnits.objects.filter(property=obj).count()
        except:
            return 0
        

class PropertyUnitImagesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PropertyUnitImages
        fields = (
            "id",
            "image",
            "thumbnail",
            "owner",
            "property_unit",
            "entity",
            "created",
            "updated",
        )
        read_only_fields = ("product", "thumbnail", "owner", "entity")

class PropertyReviewSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = models.PropertyReview
        fields = ['id', 'user', 'rating', 'comment', 'created_at']

class PropertyUnitTenantsSerializer(serializers.ModelSerializer):
    reviews = PropertyReviewSerializer(many=True, read_only=True)
    average_rating = serializers.ReadOnlyField()
   
    entity = serializers.SerializerMethodField(read_only=True)
    first_name = serializers.SerializerMethodField(read_only=True)
    last_name = serializers.SerializerMethodField(read_only=True)
    gender = serializers.SerializerMethodField(read_only=True)
    date_of_birth = serializers.SerializerMethodField(read_only=True)
    property_title = serializers.SerializerMethodField(read_only=True)
    property_unit_title = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.PropertyUnitTenants
        fields = ("id","contract",
                  "property_unit",
                  "tenant",
                  "entity",
                  "first_name",
                  "last_name",
                  "gender",
                  "date_of_birth",
                  "lease_start",
                  "lease_end",
                  "property_title",
                  "property_unit_title",
                  "is_active","created","updated")
 
    def get_first_name(self,obj):
        try:
            return obj.tenant.first_name
        except:
            return ""
    def get_last_name(self,obj):
        try:
            return obj.tenant.last_name
        except:
            return ""
    def get_gender(self,obj):
        try:
            return obj.tenant.gender
        except:
            return ""
        
    def get_date_of_birth(self,obj):
        try:
            return obj.tenant.date_of_birth
        except:
            return ""
        
    def get_property_title(self,obj):
        try:
            return obj.property_unit.property.title
        except:
            return ""
        
    def get_property_unit_title(self,obj):
        try:
            return obj.property_unit.title
        except:
            return ""
        
    def get_entity(self,obj):
        try:
            return obj.tenant.entity.name
        except:
            return ""

      




class PropertyUnitSerializer(serializers.ModelSerializer):
    
    payments = serializers.SerializerMethodField(read_only=True)
    property_details = serializers.SerializerMethodField(read_only=True)
    is_paid = serializers.SerializerMethodField(read_only=True)
    property_title = serializers.SerializerMethodField(read_only=True)
    property_county_title = serializers.SerializerMethodField(read_only=True)
    property_town = serializers.SerializerMethodField(read_only=True)
    tenant = serializers.SerializerMethodField(read_only=True)
    images = PropertyImageSerializer(many=True, read_only=True)
    class Meta:
        model = models.PropertyUnits
        fields = ("entity","property_unit_type","property","property_details","property_title","property_town","reference_number","property_county_title","title","floor","disposal_type","bedrooms","bathrooms","area","price","price_due_date","is_available","description","id","owner","created", "updated","images","is_paid","tenant","payments")
        read_only_fields = ("id","entity", "created", "owner", "updated","images")
        extra_kwargs = {
            "images": {
                "required": False,
            }
        }

    def get_property_title(self, obj):
        try:
            return obj.property.title
        except:
            return ""
    def get_property_county_title(self, obj):
        try:
            return obj.property.county.title
        except:
            return ""
    def get_property_town(self, obj):
        try:
            return obj.property.town
        except:
            return ""
        
    def get_is_paid(self,obj):
        try:
            today = get_today()
            if models.PropertyUnitPayments.objects.filter(property_unit=obj,valid_to_gte=today).exists():
                return "true"
            else:
                return "false"
        except:
            return "false"
    def get_tenant(self,obj):
        try:
            tenant =None
            if models.PropertyUnitTenants.objects.filter(property_unit=obj,is_active="true").exists():
                tenant = models.PropertyUnitTenants.objects.filter(property_unit=obj,is_active="true").first()
                obj.is_available="false"
                obj.save()
                return PropertyUnitTenantsSerializer(tenant,context=self.context,many=False).data
            else:
                obj.is_available="true"
                obj.save()
                return []
        except Exception as e:
            create_log(f"info","Error while retrieving tenant for {obj}")
            return []
        
    def get_property_details(self,obj):
        try:
            return obj.property.id
        except:
            return None
    def get_payments(self,obj):
        try:
            payments =[]
            if models.PropertyUnitPayments.objects.filter(property_unit=obj).exists():
                payments =models.PropertyUnitPayments.objects.filter(property_unit=obj).all()
                return PropertyUnitPaymentsSerializer(payments,context=self.context,many=True).data
            else:
                return []
        except:
            return []

        

class PropertyUnitPaymentsSerializer(serializers.ModelSerializer):
    account_number = serializers.SerializerMethodField(read_only=True)
    payment_months = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = models.PropertyUnitPayments
        fields = ("id",
                  "entity",
                  "property_unit",
                  "amount",
                  "valid_from",
                  "valid_to",
                  "payment_method",
                  "description",
                  "reference_number",
                  "msisdn",
                  "psp_reference_number",
                  "telco",
                  "provider_reference_number",
                  "currency",
                  "account",
                  "account_number",
                  "payment_months"
                  )
    def get_account_number(self,obj):
        try:
            return obj.account.account_number
        except:
            return None
        
    def get_payment_months(self,obj):
        try:
            payment_months =[]
            if models.PropertyUnitPaymentMonths.objects.filter(payment=obj).exists():
                payment_months =models.PropertyUnitPaymentMonths.objects.filter(payment=obj).all()
                return PropertyUnitPaymentMonthsSerializer(payment_months,context=self.context,many=True).data
            else:
                return []
        except:
            return []
        
class PropertyUnitPaymentMonthsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PropertyUnitPayments
        fields = ("id","payment","month","created","updated")
        read_only_fields=("id","created","updated")

class PropertyFacilitiesSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PropertyFacilities
        fields = ("id","entity","title","icon","created","updated")
        read_only_fields=("id","created","updated")