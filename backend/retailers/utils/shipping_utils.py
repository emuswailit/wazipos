# retailers/utils/shipping_utils.py

import math
from decimal import Decimal
from django.contrib.gis.geos import Point
from retailers.models import ShippingConfiguration, RetailerReceipts

def calculate_haversine_distance(point1: Point, point2: Point) -> float:
    """
    Calculate exact distance in km between two GeoDjango Points.
    (x = longitude, y = latitude)
    """
    if not point1 or not point2:
        return 0.0
        
    lon1, lat1 = point1.x, point1.y
    lon2, lat2 = point2.x, point2.y
    
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Earth radius in kilometers
    return c * 6371

def calculate_chargeable_weight(order_items_data: list) -> Decimal:
    """
    Calculates weight securely from the DB using Volumetric vs Actual Weight.
    order_items_data: [{'retailer_receipt_id': '...', 'quantity': 2}, ...]
    """
    total_chargeable_weight = Decimal("0.00")

    for item in order_items_data:
        receipt_id = item.get("retailer_receipt_id")
        qty = Decimal(str(item.get("quantity", 1)))
        
        receipt = RetailerReceipts.objects.select_related("product").filter(id=receipt_id).first()
        if not receipt or not receipt.product:
            continue
            
        product = receipt.product
        
        # 1. Actual Weight (fallback to 0.50kg if not set on product)
        actual_w = (product.weight_kg or Decimal("0.50")) * qty
        
        # 2. Volumetric Weight (L x W x H / 5000)
        vol_w = Decimal("0.00")
        if product.length_cm and product.width_cm and product.height_cm:
            vol_w = (product.length_cm * product.width_cm * product.height_cm) / Decimal("5000")
            vol_w = vol_w * qty
            
        # Chargeable weight is the greater of the two
        item_weight = max(actual_w, vol_w)
        total_chargeable_weight += item_weight

    return total_chargeable_weight

def calculate_shipping_rate(shop_location, destination_point, is_pickup: bool, order_items_data, order_value):
    """
    Calculates the final shipping cost based on Distance, Weight, and Order Value.
    """
    config = ShippingConfiguration.objects.filter(is_active=True).first()
    if not config:
        return Decimal("0.00"), 0.0, Decimal("0.0"), ["Global shipping config missing."]

    # 1. Distance
    distance_km = calculate_haversine_distance(shop_location, destination_point)
    
    # 2. Weight
    chargeable_weight = calculate_chargeable_weight(order_items_data)

    # 3. Base Rates based on Delivery Method
    if is_pickup:
        distance_fee = Decimal(str(distance_km)) * config.intercounty_rate_per_km
    else:
        distance_fee = Decimal(str(distance_km)) * config.local_rate_per_km

    weight_fee = chargeable_weight * config.surcharge_per_kg
    
    # 4. Value-Based Insurance Fee
    value_fee = Decimal("0.00")
    if config.value_insurance_percentage > 0 and order_value > 0:
        value_fee = order_value * (config.value_insurance_percentage / Decimal("100"))
        
        # Apply the maximum cap for insurance
        if value_fee > config.max_value_insurance_fee:
            value_fee = config.max_value_insurance_fee

    # 5. Total
    total_shipping_cost = config.base_dispatch_fee + distance_fee + weight_fee + value_fee

    # Cap absolute shipping so it doesn't exceed a certain flat max
    max_shipping_cap = Decimal("5000.00")
    if total_shipping_cost > max_shipping_cap:
        total_shipping_cost = max_shipping_cap

    return (
        total_shipping_cost.quantize(Decimal("0.01")), 
        round(distance_km, 2), 
        chargeable_weight, 
        []
    )