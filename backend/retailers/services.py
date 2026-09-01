import datetime
import math
from decimal import Decimal

# --- Import Helpers from your helpers.py file ---
from .helpers import (
    get_entity_interacted_products,
    calculate_single_product_metrics,
    find_wholesaler_procurement_offers
)

class EntityPurchasePredictionService:
    @classmethod
    def calculate_entity_predictions(
        cls, 
        entity, 
        days_to_order: int, 
        lead_time_days: int, 
        lookback_days: int = 30,
        max_shelf_days: int = 90
    ) -> list:
        """
        Orchestrates and calculates purchase predictions for a retailer's catalog.
        Delegates granular stock metrics gathering and marketplace discount exploration 
        to global helper methods.
        """
        predictions = []
        today = datetime.date.today()
        
        # 1. Establish pipeline horizons and lookback limits
        history_cutoff = today - datetime.timedelta(days=lookback_days)
        total_horizon_days = days_to_order + lead_time_days
        horizon_expiry_threshold = today + datetime.timedelta(days=total_horizon_days)
        
        # 2. Extract unique products the vendor has records for
        master_products = get_entity_interacted_products(entity.owner)

        # 3. Process calculations for each product item
        for product in master_products:
            # Gather inventory, velocity, expiries, age, and backlog metrics
            m = calculate_single_product_metrics(
                product=product,
                entity_owner=entity.owner,
                total_horizon_days=total_horizon_days,
                horizon_expiry_threshold=horizon_expiry_threshold,
                history_cutoff=history_cutoff,
                max_shelf_days=max_shelf_days,
                lookback_days=lookback_days
            )

            # 4. Forecast Algorithm Math (Pieces calculation)
            safety_stock_buffer = 10 if not m["has_overstayed"] else 0
            base_demand = m["avg_daily_sales"] * Decimal(total_horizon_days)
            total_needed = base_demand + Decimal(safety_stock_buffer)
            
            predicted_purchase_pieces = max(Decimal(0), total_needed - Decimal(m["usable_stock_calculated"]))
            final_predicted_pieces = int(predicted_purchase_pieces.quantize(Decimal('1.'), rounding='ROUND_UP'))

            # 5. Enforce Shelf-Age dead stock constraints
            if m["has_overstayed"] and final_predicted_pieces > 0:
                final_quantity_pieces = int(m["validated_backlog_demand"])
                recommendation_notes = f"Warning: Item overstayed ({m['shelf_age_days']} days). Restock blocked."
            else:
                final_quantity_pieces = final_predicted_pieces + int(m["validated_backlog_demand"])
                recommendation_notes = "Normal restocking recommendation."

            # 6. Convert units from Pieces to Packs for Wholesaler fulfillment
            final_quantity_packs = int(math.ceil(final_quantity_pieces / m["pack_factor"]))

            # 7. Match active supplier bulk or cash deals
            proposed_offers = find_wholesaler_procurement_offers(
                product=product,
                final_quantity_packs=final_quantity_packs,
                today=today
            )

            # Update offer metrics details with pieces context calculations
            for offer in proposed_offers:
                offer["procurement_optimization"]["predicted_requirement_pieces"] = final_quantity_pieces

            # 8. Append full representation payload mapping dataset
            predictions.append({
                "product_id": product.id,
                "title": product.product_name(), 
                "bar_code": product.bar_code,
                "units_per_pack": m["pack_factor"],
                "metrics_in_pieces": {
                    "total_physical_stock": m["total_physical_stock"],
                    "expiring_stock_hidden": m["expiring_stock_hidden"],
                    "usable_stock_calculated": m["usable_stock_calculated"],
                    "shelf_age_days": m["shelf_age_days"],
                    "average_daily_sales": round(float(m["avg_daily_sales"]), 2),
                    "raw_backlog_demand": m["raw_backlog_demand"],
                    "validated_backlog_demand": m["validated_backlog_demand"],
                },
                "flags": {
                    "expiry_warning": m["expiring_stock_hidden"] > 0,
                    "has_overstayed_on_shelf": m["has_overstayed"],
                    "has_inventory_discrepancy": m["has_inventory_discrepancy"],
                },
                "discrepancy_details": m["discrepancy_note"],
                "recommendation_notes": recommendation_notes,
                "predicted_purchase_pieces": final_quantity_pieces,
                "predicted_purchase_packs": final_quantity_packs,
                "wholesaler_procurement_offers": proposed_offers
            })
            
        return predictions
