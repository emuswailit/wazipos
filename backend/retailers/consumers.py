# import json
import simplejson as json
from symtable import Function
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer,WebsocketConsumer
from asgiref.sync import async_to_sync
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from retailers.models import OutOfStock, RetailerReceipts,CustomerOrders,Prescriptions
from retailers.serializers import RetailerReceiptsSerializer,OutOfStocksSerializer,CustomerOrdersSerializer,MiniCustomerOrdersSerializer,RetailPrescriptionsSerializer
from products.models import Products
from authentication.serializers import UsersSerializer
from authentication.models import Users
from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.observer import model_observer
from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.mixins import ListModelMixin
from djangochannelsrestframework import permissions
from uuid import UUID
from core.date_utils import get_formatted_from_date, get_formatted_to_date
import asyncio
import logging
import dateutil.parser
from django.utils import timezone
from datetime import date, datetime, timedelta
import json
import uuid 

logger = logging.getLogger("retailers.consumers")

# class UUIDEncoder(json.JSONEncoder):
#     def default(self, obj):
#         if isinstance(obj, UUID):
#             # if the obj is uuid, we simply return the value of uuid
#             return obj.hex
#         return json.JSONEncoder.default(self, obj)

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            # Explicitly return the standard string representation
            return str(obj)
        return super().default(obj)

# class WholesaleDiscountsConsumer(JsonWebsocketConsumer):
#     def connect(self):
#         print("Am at the connect")
#         async_to_sync(self.channel_layer.group_add('wholesaler-discounts',self.channel_name))
#         self.accept()
    
#     def disconnect(self, code):
#         print("Disconnected!")
#         async_to_sync(self.channel_layer.group_discard('wholesaler-discounts',self.channel_name))
#         return super().disconnect(code)

       
#     def send_wholesaler_discounts(self, event):
#         print("Am at the consumer")
#         print("Event", event)
#         discounts_message = event['data']
#         print("messs",json.loads(discounts_message))
#         # receipts=RetailerReceipts.objects.filter(unit_quantity__gte=0).all()
#         # retailer_receipts =RetailerReceiptsSerializer(receipts,many=True).data
#         async_to_sync(self.send(json.loads(discounts_message))) 



# from channels.generic.websocket import AsyncWebsocketConsumer

class WholesaleDiscountsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print("Am at the connect")
        await self.channel_layer.group_add('wholesaler-discounts',self.channel_name)
        await self.accept()

    async def disconnect(self):
        await self.channel_layer.group_discard('wholesaler-discounts',self.channel_name)

    async def send_wholesaler_discounts(self, event):
        print("Am at the consumer")
        print("Event", event)
        discounts_message = event['data']
        print("messs",discounts_message)
        await self.send(discounts_message)



import asyncio
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer



class RetailerOutOfStocksConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'oss',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'out_of_stocks': json.loads(self.datum),
                    
                })


        

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'oss',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        os_items = OutOfStock.objects.all()
        print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.out_of_stocks = os_items
        sers =OutOfStocksSerializer(os_items,many=True,).data
        data=json.dumps(sers,cls=UUIDEncoder)
        print("Data as s2s",data)
        self.datum=data


    async def send_retailer_out_of_stocks(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'out_of_stocks': json.loads(self.datum)
                   
                })
# retailers/consumers.py

import json
import time
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from sklearn.linear_model import LinearRegression

from products.models import Products
from retailers.models import (
    CustomerOrderItems,
    IndentItemSource,
    OutOfStock,
    RetailerIndent,
    RetailerIndentItem,
    RetailerOrderItems,
    RetailerReceipts,
)
from wholesalers.models import (
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)


class UUIDEncoder(json.JSONEncoder):
    """Encoder for UUID / date / datetime / Decimal."""

    def default(self, obj):
        import datetime
        import decimal
        import uuid

        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return str(obj)
        return super().default(obj)


class RetailerInventoryPredictionConsumer(AsyncJsonWebsocketConsumer):
    """
    Real-time inventory prediction feed.

    Mirrors the structure of RetailerInventoryConsumer:
      - connect()             → join group, run helper_func, push
      - disconnect()          → leave group
      - send_retailer_predictions(event)
                              → re-run helper_func, push
      - helper_func()         → compute + serialize into self.datum
    """

    # =========================================================
    # Lifecycle
    # =========================================================

    @database_sync_to_async
    def _resolve_entity(self, user):
        """
        Resolve the user's entity inside a thread pool.
        `connect` runs on the async event loop; accessing
        `user.entity` triggers a lazy sync FK query.
        """
        if not user or not user.is_authenticated:
            return None
        return getattr(user, "entity", None)

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)

        if not self.user.is_authenticated:
            await self.close()
            return

        entity = await self._resolve_entity(self.user)
        if not entity:
            await self.close()
            return

        self.entity = entity
        self.entity_id = str(entity.id)
        self.group_name = f"retailer-predictions-{self.entity_id}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            "predictions": json.loads(self.datum),
        })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    # =========================================================
    # Broadcast handler
    # =========================================================

    async def send_retailer_predictions(self, event):
        # Re-run the helper to refresh self.datum
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
            "predictions": json.loads(self.datum),
        })

    # =========================================================
    # Main computation
    # =========================================================

    @sync_to_async
    def helper_func(self):
        started = time.time()

        # Use the cached entity — no sync FK lookup
        entity = getattr(self, "entity", None)
        if not entity:
            self.datum = json.dumps([])
            return

        print(
            f"[PREDICTION] START entity={entity.id} "
            f"user={self.user.id}"
        )

        # ---- 1. Open indent ----
        indent = (
            RetailerIndent.objects
            .filter(entity=entity, is_open="true")
            .order_by("-created")
            .first()
        )

        if not indent:
            indent = RetailerIndent.objects.create(
                entity=entity,
                owner=self.user,
                order_days=getattr(entity, "order_days", 30) or 30,
                lead_time=0,
                is_open="true",
            )

        cycle_days = int(indent.order_days or 30)
        budget_amount = indent.budget_amount
        budget_enforced = indent.budget_enforced == "true"
        pricing_percentage = float(
            indent.pricing_percentage or 30
        )
        indent_lead_override = int(indent.lead_time or 0)

        self.cycle_days = cycle_days
        self.budget_amount = (
            float(budget_amount) if budget_amount else None
        )
        self.budget_enforced = budget_enforced
        self.pricing_percentage = pricing_percentage

        today = timezone.now().date()

        # ---- 2. Candidate products ----
        r_pids = list(
            RetailerReceipts.objects
            .filter(entity=entity, is_active="true")
            .values_list("product_id", flat=True)
        )
        o_pids = list(
            OutOfStock.objects
            .filter(entity=entity)
            .values_list("product_id", flat=True)
        )
        pending_pids = set(
            RetailerOrderItems.objects
            .filter(
                retailer_order__retailer=entity,
                is_received="false",
            )
            .values_list(
                "wholesaler_receipt__product_id", flat=True
            )
        )

        candidate_pids = (set(r_pids) | set(o_pids)) - pending_pids

        # ---- 3. Compute predictions ----
        compiled = []
        failed = 0

        for p_id in candidate_pids:
            try:
                result = self._predict_product(
                    p_id,
                    entity,
                    cycle_days,
                    today,
                    indent_lead_override,
                )
                if result:
                    compiled.append(result)
            except Exception as e:
                failed += 1
                print(
                    f"[PREDICTION] FAILED product={p_id}: "
                    f"{type(e).__name__}: {e}"
                )

        # ---- 4. Sort by urgency ----
        compiled = self._sort_by_urgency(compiled)

        # ---- 5. Sync indent + budget ----
        try:
            indent, budget_info = self._sync_indent(
                entity, indent, cycle_days, compiled, today
            )
            self.retailer_indent_id = str(indent.id)
            self.budget_info = budget_info
        except Exception as e:
            print(
                f"[PREDICTION] INDENT SYNC FAILED: "
                f"{type(e).__name__}: {e}"
            )
            self.retailer_indent_id = None
            self.budget_info = None

        # ---- 6. Lead time aggregate ----
        lead_time_summary = self._compute_lead_time_summary(
            compiled
        )

        try:
            indent.average_lead_time_days = (
                lead_time_summary["average_lead_time_days"]
            )
            indent.lead_time_updated_at = timezone.now()
            indent.save(update_fields=[
                "average_lead_time_days",
                "lead_time_updated_at",
            ])
        except Exception:
            pass

        # ---- 7. Serialize ----
        payload = {
            "retailer_id": str(entity.id),
            "retailer_name": getattr(
                entity, "title", self.user.email
            ),
            "retailer_indent_id": self.retailer_indent_id,
            "config": {
                "order_days": cycle_days,
                "lead_time_override": indent_lead_override,
                "budget_amount": self.budget_amount,
                "budget_enforced": budget_enforced,
                "pricing_percentage": pricing_percentage,
            },
            "lead_time_summary": lead_time_summary,
            "budget": self.budget_info,
            "predictions": compiled,
        }

        self.datum = json.dumps(payload, cls=UUIDEncoder)

        print(
            f"[PREDICTION] DONE entity={entity.id} "
            f"candidates={len(candidate_pids)} "
            f"compiled={len(compiled)} failed={failed} "
            f"avg_lead={lead_time_summary['average_lead_time_days']} "
            f"in {time.time() - started:.2f}s"
        )

    # =========================================================
    # Lead time
    # =========================================================

    def _estimate_supplier_lead_time(
        self, entity, product=None, supplier=None,
        lookback_days=365,
    ):
        since = timezone.now() - timedelta(days=lookback_days)

        qs = RetailerReceipts.objects.filter(
            entity=entity,
            is_active="true",
            retailer_order__isnull=False,
            retailer_order__created__gte=since,
        )
        if product is not None:
            qs = qs.filter(product=product)
        if supplier is not None:
            qs = qs.filter(received_from=supplier)

        rows = qs.values("created", "retailer_order__created")

        deltas = []
        for r in rows:
            placed = r["retailer_order__created"]
            delivered = r["created"]
            if placed and delivered and delivered > placed:
                days = (delivered - placed).days
                if 0 <= days <= 90:
                    deltas.append(days)

        if len(deltas) < 3:
            return None

        mean = sum(deltas) / len(deltas)
        variance = (
            sum((d - mean) ** 2 for d in deltas) / len(deltas)
            if len(deltas) > 1 else 0
        )

        return {
            "mean": round(mean, 2),
            "stddev": round(variance ** 0.5, 2),
            "samples": len(deltas),
        }

    def _resolve_lead_time(
        self, entity, product, supplier,
        indent_lead_override,
    ):
        learned = self._estimate_supplier_lead_time(
            entity, product=product, supplier=supplier
        )
        source = "per_sku_supplier"

        if not learned:
            learned = self._estimate_supplier_lead_time(
                entity, product=product
            )
            source = "per_sku"

        if not learned:
            learned = self._estimate_supplier_lead_time(
                entity, supplier=supplier
            )
            source = "per_supplier"

        if indent_lead_override and indent_lead_override > 0:
            return (
                int(indent_lead_override),
                int(round(learned["stddev"])) if learned else 2,
                "indent_override",
            )

        if not learned:
            return (5, 2, "default")

        return (
            max(1, int(round(learned["mean"]))),
            max(0, int(round(learned["stddev"]))),
            source,
        )

    def _compute_lead_time_summary(self, compiled):
        if not compiled:
            return {
                "average_lead_time_days": 0.0,
                "average_variance_days": 0.0,
                "min_lead_time_days": 0,
                "max_lead_time_days": 0,
                "item_count": 0,
            }

        lead_days_list = []
        variance_list = []
        weights = []

        for p in compiled:
            metrics = p.get("calculated_metrics", {})
            lead_days_list.append(
                metrics.get("supplier_lead_time_days", 0)
            )
            variance_list.append(
                metrics.get("supplier_delay_days", 0)
            )

            suggested = (
                p.get("order_suggestion", {})
                .get("suggested_order_quantity", 0) or 0
            )
            unit_price = (
                p.get("order_suggestion", {})
                .get("supplier", {})
                .get("unit_price") or 0
            )
            weights.append(suggested * unit_price)

        total_weight = sum(weights) or 1

        avg_lead = sum(
            d * w for d, w in zip(lead_days_list, weights)
        ) / total_weight
        avg_var = sum(
            v * w for v, w in zip(variance_list, weights)
        ) / total_weight

        return {
            "average_lead_time_days": round(avg_lead, 2),
            "average_variance_days": round(avg_var, 2),
            "min_lead_time_days": min(lead_days_list),
            "max_lead_time_days": max(lead_days_list),
            "item_count": len(lead_days_list),
        }

    # =========================================================
    # Urgency sort
    # =========================================================

    def _sort_by_urgency(self, predictions):
        def key(p):
            metrics = p.get("calculated_metrics", {})
            daily = metrics.get("average_daily_demand", 0) or 0
            lead = metrics.get("supplier_lead_time_days", 5) or 5
            stock = (
                p.get("current_stock_status", {})
                .get("good_usable_units", 0) or 0
            )
            if daily <= 0:
                return 999
            days_left = stock / daily
            return days_left / max(lead, 1)

        return sorted(predictions, key=key)

    # =========================================================
    # Indent sync + budget
    # =========================================================

    def _sync_indent(
        self, entity, indent, cycle_days, compiled, today,
    ):
        with transaction.atomic():
            indent.order_days = cycle_days
            indent.save(update_fields=["order_days"])

            RetailerIndentItem.objects.filter(
                retailer_indent=indent,
                entity=entity,
                source=IndentItemSource.PREDICTION,
            ).delete()

            budget_amount = (
                Decimal(str(indent.budget_amount))
                if indent.budget_amount else None
            )
            budget_enforced = indent.budget_enforced == "true"

            included, excluded = self._apply_budget(
                compiled, budget_amount, budget_enforced
            )

            for p in included:
                metrics = p.get("calculated_metrics", {})
                self._persist_indent_item(
                    entity=entity,
                    indent=indent,
                    prediction=p,
                    today=today,
                    lead_days=metrics.get(
                        "supplier_lead_time_days", 0
                    ),
                    lead_var=metrics.get(
                        "supplier_delay_days", 0
                    ),
                    lead_source=metrics.get(
                        "supplier_lead_time_source", "default"
                    ),
                )

            total_cost = sum(
                self._line_cost(p) for p in included
            )
            total_profit = Decimal("0")
            total_revenue = Decimal("0")

            for p in included:
                est = (
                    p.get("order_suggestion", {})
                    .get("profit_estimate") or {}
                )
                if est:
                    total_profit += Decimal(
                        str(est.get("total_profit", 0))
                    )
                    total_revenue += Decimal(
                        str(est.get("total_revenue", 0))
                    )

            budget_info = None
            if budget_amount is not None:
                budget_info = {
                    "amount": float(budget_amount),
                    "enforced": budget_enforced,
                    "used": round(float(total_cost), 2),
                    "remaining": round(
                        float(
                            max(
                                Decimal("0"),
                                budget_amount - total_cost,
                            )
                        ),
                        2,
                    ),
                    "over_budget": total_cost > budget_amount,
                    "included_count": len(included),
                    "excluded_count": len(excluded),
                    "projected_revenue": round(
                        float(total_revenue), 2
                    ),
                    "projected_profit": round(
                        float(total_profit), 2
                    ),
                }

        return indent, budget_info

    def _apply_budget(
        self, predictions, budget_amount, enforce,
    ):
        if (
            budget_amount is None
            or budget_amount <= 0
            or not enforce
        ):
            return predictions, []

        included = []
        excluded = []
        running = Decimal("0")

        for p in predictions:
            cost = self._line_cost(p)
            if running + cost <= budget_amount:
                included.append(p)
                running += cost
            else:
                excluded.append(p)

        return included, excluded

    def _line_cost(self, prediction):
        suggested = (
            prediction.get("order_suggestion", {})
            .get("suggested_order_quantity", 0) or 0
        )
        unit_price = (
            prediction.get("order_suggestion", {})
            .get("supplier", {})
            .get("unit_price") or 0
        )
        return Decimal(str(suggested)) * Decimal(str(unit_price))

    # =========================================================
    # Persist indent item
    # =========================================================

    def _persist_indent_item(
        self, entity, indent, prediction, today,
        lead_days, lead_var, lead_source,
    ):
        product_id = prediction.get("product_id")
        if not product_id:
            return

        product = Products.objects.filter(id=product_id).first()
        if not product:
            return

        suggestion = prediction.get("order_suggestion", {})
        supplier_info = suggestion.get("supplier", {})

        quantity = int(
            suggestion.get("suggested_order_quantity", 0) or 0
        )
        if quantity <= 0:
            return

        target_receipt = None
        supplier_id = supplier_info.get("id")
        if supplier_id:
            target_receipt = (
                WholesalerReceipts.objects
                .filter(
                    product=product,
                    entity_id=supplier_id,
                    current_unit_quantity__gt=0,
                )
                .order_by("final_unit_selling_price")
                .first()
            )

        base_price = Decimal("0.00")
        if target_receipt:
            base_price = Decimal(
                str(target_receipt.unit_selling_price or 0)
            )
        else:
            last_receipt = (
                RetailerReceipts.objects
                .filter(entity=entity, product=product)
                .order_by("-created")
                .first()
            )
            if last_receipt and last_receipt.unit_buying_price:
                base_price = Decimal(
                    str(last_receipt.unit_buying_price)
                )

        p_disc = self._resolve_active_price_discount(
            target_receipt, today
        )

        final_unit_price = (
            Decimal(str(p_disc.offer_price))
            if p_disc else base_price
        )

        q_disc = self._resolve_active_quantity_discount(
            target_receipt, quantity, today
        )
        total_quantity, _, _ = self._compute_bonus_quantity(
            quantity, q_disc
        )

        gross = Decimal(str(quantity)) * base_price
        net = Decimal(str(quantity)) * final_unit_price

        profit = self._compute_profit(
            receipt=target_receipt,
            quantity=quantity,
            final_unit_price=float(final_unit_price),
        )

        RetailerIndentItem.objects.create(
            entity=entity,
            owner=self.user,
            retailer_indent=indent,
            wholesale_receipt=target_receipt,
            wholesaler_price_discount=p_disc,
            wholesaler_quantity_discount=q_disc,
            required_quantity=quantity,
            total_quantity=total_quantity,
            final_unit_price=final_unit_price,
            item_gross_total_amount=gross,
            item_net_total_amount=net,
            profit_estimate=profit,
            source=IndentItemSource.PREDICTION,
            lead_time_days=lead_days,
            lead_time_variance_days=lead_var,
            lead_time_source=lead_source,
        )

    # =========================================================
    # Discount resolution
    # =========================================================

    def _resolve_active_price_discount(self, receipt, today):
        if not receipt:
            return None
        return (
            WholesalerPriceDiscounts.objects
            .filter(
                wholesaler_receipt=receipt,
                is_active="true",
                start__lte=today,
                end__gte=today,
            )
            .order_by("-percent")
            .first()
        )

    def _resolve_active_quantity_discount(
        self, receipt, quantity, today,
    ):
        if not receipt or quantity <= 0:
            return None
        return (
            WholesalerQuantityDiscounts.objects
            .filter(
                wholesaler_receipt=receipt,
                is_active="true",
                start__lte=today,
                end__gte=today,
                limit_quantity__lte=quantity,
            )
            .prefetch_related("quantity_discount_banners")
            .order_by("-limit_quantity")
            .first()
        )

    def _compute_bonus_quantity(self, quantity, discount):
        if not discount or not discount.limit_quantity:
            return quantity, 0, 0

        full_blocks = quantity // discount.limit_quantity
        bonus = full_blocks * discount.awarded_quantity

        return quantity + bonus, bonus, full_blocks

    # =========================================================
    # Profit
    # =========================================================

    def _compute_profit(
        self, receipt, quantity, final_unit_price,
    ):
        cost_per_unit = Decimal(str(final_unit_price or 0))

        if receipt and receipt.recommended_retail_price:
            sell_per_unit = Decimal(
                str(receipt.recommended_retail_price)
            )
            pricing_source = "recommended_retail_price"
        else:
            markup = (
                Decimal(str(self.pricing_percentage or 30))
                / Decimal("100")
            )
            sell_per_unit = cost_per_unit * (
                Decimal("1") + markup
            )
            pricing_source = "retailer_markup"

        profit_per_unit = sell_per_unit - cost_per_unit

        total_cost = cost_per_unit * Decimal(str(quantity))
        total_revenue = sell_per_unit * Decimal(str(quantity))
        total_profit = total_revenue - total_cost

        margin_percent = Decimal("0")
        if sell_per_unit > 0:
            margin_percent = (
                profit_per_unit / sell_per_unit
            ) * Decimal("100")

        return {
            "cost_per_unit": float(cost_per_unit),
            "sell_per_unit": float(sell_per_unit),
            "pricing_source": pricing_source,
            "profit_per_unit": float(
                round(profit_per_unit, 2)
            ),
            "margin_percent": float(
                round(margin_percent, 2)
            ),
            "total_cost": float(round(total_cost, 2)),
            "total_revenue": float(
                round(total_revenue, 2)
            ),
            "total_profit": float(
                round(total_profit, 2)
            ),
        }

    # =========================================================
    # Per-product prediction
    # =========================================================

    def _predict_product(
        self, p_id, entity, cycle_days, today,
        indent_lead_override,
    ):
        product = Products.objects.filter(
            id=p_id, active=True
        ).first()
        if not product:
            return None

        sales_rows = list(
            CustomerOrderItems.objects
            .filter(
                retailer_receipt__product_id=product.id,
                customer_order__entity=entity,
                customer_order__status="COMPLETED",
            )
            .values(
                "customer_order__created",
                "purchased_quantity",
            )
        )

        oos_rows = list(
            OutOfStock.objects
            .filter(product_id=product.id, entity=entity)
            .values("created", "required_quantity")
        )

        daily_demand = self._estimate_daily_demand(
            sales_rows, oos_rows
        )
        if daily_demand is None:
            return None

        supplier_receipt = (
            WholesalerReceipts.objects
            .filter(
                product=product,
                current_unit_quantity__gt=0,
            )
            .select_related("received_from")
            .order_by("final_unit_selling_price")
            .first()
        )

        supplier_entity = (
            supplier_receipt.received_from
            if supplier_receipt
            and supplier_receipt.received_from
            else None
        )

        lead_days, lead_var, lead_source = (
            self._resolve_lead_time(
                entity=entity,
                product=product,
                supplier=supplier_entity,
                indent_lead_override=indent_lead_override,
            )
        )

        total_days = lead_days + lead_var + cycle_days
        cutoff = today + timedelta(days=int(total_days))

        batches = (
            RetailerReceipts.objects
            .filter(
                product=product,
                entity=entity,
                is_active="true",
                current_unit_quantity__gt=0,
            )
            .order_by("expiry_date")
        )

        usable = 0
        expiring = 0
        batch_log = []

        for b in batches:
            will_expire = bool(
                b.expiry_date and b.expiry_date <= cutoff
            )
            batch_log.append({
                "batch_number": b.batch,
                "expiry_date": (
                    b.expiry_date.isoformat()
                    if b.expiry_date else None
                ),
                "units_remaining": b.current_unit_quantity,
                "will_expire_during_plan_period": will_expire,
            })
            if will_expire:
                expiring += b.current_unit_quantity
            else:
                usable += b.current_unit_quantity

        pending = (
            RetailerOrderItems.objects
            .filter(
                wholesaler_receipt__product_id=product.id,
                retailer_order__retailer=entity,
                retailer_order__status__in=[
                    "SUBMITTED", "PROCESSING", "DISPATCHED",
                ],
                is_received="false",
            )
            .aggregate(t=Sum("purchased_quantity"))["t"]
            or 0
        )

        backlog = (
            OutOfStock.objects
            .filter(
                product=product,
                entity=entity,
                is_ordered="false",
                created__gte=(
                    today - timedelta(days=int(cycle_days))
                ),
            )
            .aggregate(t=Sum("required_quantity"))["t"]
            or 0
        )

        safety_stock = self._estimate_safety_stock(
            sales_rows, oos_rows
        )

        needed = (
            int(round(daily_demand * total_days)) + safety_stock
        )
        suggested = max(
            0, (needed - usable - pending)
        ) + backlog

        if suggested <= 0:
            return None

        active_price_disc = self._resolve_active_price_discount(
            supplier_receipt, today
        )
        active_qty_disc = self._resolve_active_quantity_discount(
            supplier_receipt, int(suggested), today
        )
        total_quantity, bonus_quantity, full_blocks = (
            self._compute_bonus_quantity(
                int(suggested), active_qty_disc
            )
        )

        effective_purchase_price = 0.0
        if active_price_disc:
            effective_purchase_price = float(
                active_price_disc.offer_price
            )
        elif supplier_receipt:
            effective_purchase_price = float(
                supplier_receipt.unit_selling_price
            )

        profit = self._compute_profit(
            receipt=supplier_receipt,
            quantity=int(suggested),
            final_unit_price=effective_purchase_price,
        )

        supplier_payload = {
            "id": (
                str(supplier_receipt.received_from.id)
                if supplier_receipt
                and supplier_receipt.received_from
                else None
            ),
            "name": (
                supplier_receipt.received_from.title
                if supplier_receipt
                and supplier_receipt.received_from
                else None
            ),
            "unit_price": effective_purchase_price,
            "normal_price": (
                float(supplier_receipt.unit_selling_price)
                if supplier_receipt else None
            ),
            "is_discounted": active_price_disc is not None,
            "discount_percent": (
                float(active_price_disc.percent)
                if active_price_disc else 0.0
            ),
            "price_promotion": (
                {
                    "title": active_price_disc.title,
                    "start": active_price_disc.start.isoformat(),
                    "end": active_price_disc.end.isoformat(),
                }
                if active_price_disc else None
            ),
            "quantity_promotion": (
                {
                    "id": str(active_qty_disc.id),
                    "title": active_qty_disc.title,
                    "buy_quantity": active_qty_disc.limit_quantity,
                    "free_quantity": active_qty_disc.awarded_quantity,
                    "start": active_qty_disc.start.isoformat(),
                    "end": active_qty_disc.end.isoformat(),
                    "blocks_earned": full_blocks,
                }
                if active_qty_disc else None
            ),
        }

        return {
            "product_id": str(product.id),
            "product_title": product.product_name(),
            "sku": getattr(product, "bar_code", None),
            "is_drug": product.check_is_drug,
            "calculated_metrics": {
                "average_daily_demand": float(
                    round(daily_demand, 4)
                ),
                "supplier_lead_time_days": lead_days,
                "supplier_lead_time_source": lead_source,
                "supplier_delay_days": lead_var,
                "safety_stock_units": safety_stock,
                "total_days_planned_for": total_days,
                "total_units_needed": needed,
            },
            "current_stock_status": {
                "total_physical_on_hand": usable + expiring,
                "good_usable_units": usable,
                "expiring_units_warning": expiring,
                "units_already_ordered": int(pending),
                "customer_waitlist_units": int(backlog),
                "existing_expiries": batch_log,
            },
            "order_suggestion": {
                "suggested_order_quantity": int(suggested),
                "total_quantity_after_bonus": total_quantity,
                "bonus_quantity_earned": bonus_quantity,
                "supplier": supplier_payload,
                "profit_estimate": profit,
            },
        }

    # =========================================================
    # Demand + safety stock helpers
    # =========================================================

    def _estimate_daily_demand(self, sales_rows, oos_rows):
        daily = self._combine_daily(sales_rows, oos_rows)
        if len(daily) < 3:
            return None

        df = pd.DataFrame(daily)
        df["d"] = pd.to_datetime(df["d"])
        df.set_index("d", inplace=True)

        monthly = df.resample("ME")["q"].sum().reset_index()
        if len(monthly) < 3:
            return None

        monthly["idx"] = np.arange(len(monthly))

        model = LinearRegression().fit(
            monthly[["idx"]].values,
            monthly["q"].values,
        )

        next_total = max(
            0,
            float(model.predict(np.array([[len(monthly)]]))[0]),
        )
        return next_total / 30.4

    def _estimate_safety_stock(self, sales_rows, oos_rows):
        daily = self._combine_daily(sales_rows, oos_rows)
        if len(daily) < 2:
            return 0

        df = pd.DataFrame(daily)
        df["d"] = pd.to_datetime(df["d"])
        df.set_index("d", inplace=True)

        weekly = df.resample("W")["q"].sum()
        if len(weekly) < 2 or pd.isna(weekly.std()):
            return 0

        return int(round((weekly.std() / 7) * 1.65))

    def _combine_daily(self, sales_rows, oos_rows):
        combined = []
        for r in sales_rows:
            dt = r["customer_order__created"]
            if dt is None:
                continue
            combined.append({
                "d": dt.date() if hasattr(dt, "date") else dt,
                "q": int(r["purchased_quantity"] or 0),
            })
        for r in oos_rows:
            dt = r["created"]
            if dt is None:
                continue
            combined.append({
                "d": dt.date() if hasattr(dt, "date") else dt,
                "q": int(r["required_quantity"] or 0),
            })
        return combined

class RetailerInventoryConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'retail-inventory',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory': json.loads(self.datum),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retail-inventory',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        retailer_receipts = RetailerReceipts.objects.filter(entity=self.user.entity,current_unit_quantity__gte=0)
        self.retailer_receipts = retailer_receipts
        sers =RetailerReceiptsSerializer(retailer_receipts,many=True,context={'request': None}).data
        data=json.dumps(sers,cls=UUIDEncoder)
 
        
        self.datum=data


    async def send_retailer_receipts(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory': json.loads(self.datum),
                    
                })
        
class ShopInventoryConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        self.selected_query_entity = self.scope["selected_query_entity"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'shop-inventory',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'shop_inventory': json.loads(self.shop_inventory),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'shop-inventory',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):

        shop_inventory = RetailerReceipts.objects.filter(unit_quantity__gte=0,entity_id=self.selected_query_entity).exclude(product__is_pom=True)
       
        sers =RetailerReceiptsSerializer(shop_inventory,many=True,context={'request': None}).data
        data=json.dumps(sers,cls=UUIDEncoder)
 
        self.shop_inventory = data
        


    async def send_shop_inventory(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'shop_inventory': json.loads(self.shop_inventory),
                    
                })
        


class RetailerDashboardsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'retailer-dashboard',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_dashboard': json.loads(self.retailer_dashboard),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'retailer-dashboard',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from retailers.models import CustomerOrderItems,CustomerOrders,RetailerReceipts,CustomerOrderPayment
        from wholesalers.models import RetailerOrders
        final={}
        weekly_orders =[]
        days=[]
        now = datetime.now()

        for x in range(7):
            items_value=0.00
            all_payments_value=0.00
            orders=[]
            d = now - timedelta(days=x)
            next_d = d + timedelta(days=1)
            days.append(d)
            all_payments = CustomerOrderPayment.objects.filter(entity=self.user.entity,status="SUCCESS").all()
            for payment in all_payments:
                all_payments_value=all_payments_value+float(payment.amount)

            all_receipts = RetailerReceipts.objects.filter(entity=self.user.entity).all()
            all_orders = CustomerOrders.objects.filter(entity=self.user.entity,).all()
            all_requisitions = RetailerOrders.objects.filter(entity=self.user.entity,).all()
            final["retailer_receipts"]=len(all_receipts)
            final["customer_orders"]=len(all_orders)
            final["wholesale_requisitions"]=len(all_requisitions)
            final["all_payments_count"]=len(all_payments)
            final["all_payments_value"]=all_payments_value

            followers = self.user.entity.followers.all()
            final["followers"]=len(followers)

            ## Filtering order items and orders

            items = CustomerOrderItems.objects.filter(entity=self.user.entity,created__gte=d,created__lt=next_d,customer_order__is_paid="true")
            orders = CustomerOrders.objects.filter(entity=self.user.entity,created__gte=d,created__lt=next_d,is_paid="true").all()
            for item in items:
                items_value=items_value+ float(item.item_price_total)
                print(item.created)
            weekly_orders.append({"date":d.strftime("%Y-%m-%d"),"items":len(items),"value":items_value,"orders":len(orders)})
        
        final["weekly_orders"]=weekly_orders

        data=json.dumps(final,cls=UUIDEncoder)
 
        self.retailer_dashboard = data
        


    async def send_retailer_dashboard(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'retailer_dashboard': json.loads(self.retailer_dashboard),
                    
                })
        



class BodabodaAssignedOrdersConsumer(AsyncJsonWebsocketConsumer):
    print("Am here at boda")
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            print("No user")
            return
        else:
            print("user at boda", self.user)
        
        await self.channel_layer.group_add(
            f'bodaboda-assigned-order',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        if self.bodaboda_assigned_order and len(self.bodaboda_assigned_order)>0:
            await self.send_json({
                        'bodaboda_assigned_order': json.loads(self.bodaboda_assigned_order),
                        
                    })
        else:
            await self.send_json({
                        'bodaboda_assigned_order': None,
                        
                    })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'bodaboda-assigned-order',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        from entitylocations.models import BodaLocations

        bodaboda = None
        bodaboda_assigned_order=None
        self.bodaboda_assigned_order=None
        data=None
        yesterday = dateutil.parser.parse(str( date.today() - timedelta(days = 1))).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        # yesterday = date.today() - timedelta(days = 1)
        print("Yesterday", yesterday)
        if BodaLocations.objects.filter(owner=self.user).exists():
            bodaboda = BodaLocations.objects.filter(owner=self.user).first()

            if CustomerOrders.objects.filter(bodaboda=bodaboda,created__gte=yesterday,status="ASSIGNED").exists():
                bodaboda_assigned_order = CustomerOrders.objects.filter(bodaboda=bodaboda,created__gte=yesterday,status="ASSIGNED").all()
     

                self.bodaboda_assigned_order = bodaboda_assigned_order
        
                orders =CustomerOrdersSerializer(bodaboda_assigned_order,many=True,context={'request': None}).data
                data=json.dumps(orders,cls=UUIDEncoder)
                
                self.bodaboda_assigned_order=data
            else:
                self.bodaboda_assigned_order=None

        else:
            self.bodaboda_assigned_order=None

    async def send_bodaboda_assigned_order(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        if self.bodaboda_assigned_order and len(self.bodaboda_assigned_order)>0:
            await self.send_json({
                        'bodaboda_assigned_order': json.loads(self.bodaboda_assigned_order),
                        
                    })
        else:
            await self.send_json({
                        'bodaboda_assigned_order': None,
                        
                    })
        

        

class CustomerOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'customer-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.customer_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'customer-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        formatted_from_date = dateutil.parser.parse(str(timezone.now().date())).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        customer_orders = CustomerOrders.objects.filter(entity=self.user.entity,created__gte=formatted_from_date).order_by('-created')

        self.customer_orders = customer_orders
        
        orders =CustomerOrdersSerializer(customer_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.customer_orders=data


    async def send_customer_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.customer_orders),
                    
                })
class UserOrdersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):

        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'user-orders',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_orders': json.loads(self.user_orders),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'user-orders',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_orders = CustomerOrders.objects.filter(customer=self.user)[:10]

        self.user_orders = user_orders
        
        orders =CustomerOrdersSerializer(user_orders,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.user_orders=data


    async def send_user_orders(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_orders': json.loads(self.user_orders),
                    
                })
        
class UserPrescriptionsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'user-prescriptions',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_prescriptions': json.loads(self.user_prescriptions),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'user-prescriptions',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        user_prescriptions = Prescriptions.objects.filter(created_by=self.user)

        self.user_prescriptions = user_prescriptions
        
        orders =RetailPrescriptionsSerializer(user_prescriptions,many=True,context={'request': None}).data
        data=json.dumps(orders,cls=UUIDEncoder)
        
        self.user_prescriptions=data


    async def send_user_prescriptions(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'user_prescriptions': json.loads(self.user_prescriptions),
                    
                })
        


# class CustomerOrderNotificationConsumer(ListModelMixin, GenericAsyncAPIConsumer):

#     queryset = CustomerOrders.objects.all()
#     serializer_class = CustomerOrdersSerializer
#     permissions = (permissions.AllowAny,)

#     async def connect(self, **kwargs):
#         self.user = self.scope["user"]
#         logger.warn("Connected to retailer consumer")
#         await self.model_change.subscribe()
#         await super().connect()

#     @model_observer(CustomerOrders)
#     async def model_change(self, message, observer=None, **kwargs):
#         logger.warn("message", message)
#         await self.send_json(message)

#     @model_change.serializer
#     def model_serialize(self, instance, action, **kwargs):
#         print("the instance",instance)
#         data = dict(data=CustomerOrdersSerializer(instance=instance).data,context={'request':  None}, action=action.value)
#         data_j=json.dumps(data,cls=UUIDEncoder)
#         self.retailer_receipts= data_j
#         logger.warn(self.retailer_receipts)
#         return json.loads(self.retailer_receipts)
    

class RetailerReceiptsConsumer(ListModelMixin, GenericAsyncAPIConsumer):

    queryset = RetailerReceipts.objects.all()
    serializer_class = RetailerReceiptsSerializer
    permissions = (permissions.AllowAny,)

    async def connect(self, **kwargs):
        logger.warn("Connected to retailer consumer")
        await self.model_change.subscribe()
        await super().connect()

    @model_observer(RetailerReceipts)
    async def model_change(self, message, observer=None, **kwargs):
        logger.warn("message", message)
        await self.send_json(message)

    @model_change.serializer
    def model_serialize(self, instance, action, **kwargs):
        data = dict(data=RetailerReceiptsSerializer(instance=instance).data,context={'request':  None}, action=action.value)
        data_j=json.dumps(data,cls=UUIDEncoder)
        self.retailer_receipts= data_j
        logger.warn(self.retailer_receipts)
        return json.loads(self.retailer_receipts)
# class RetailerReceiptsConsumer(GenericAsyncAPIConsumer):
#     queryset = Users.objects.all()
#     serializer_class = UsersSerializer

#     @model_observer(RetailerReceipts)
#     async def retailer_receipts_activity(
#         self,
#         message: RetailerReceiptsSerializer,
#         observer=None,
#         subscribing_request_ids=[],
#         **kwargs
#     ):
#         print("receipts",message.data)
#         await self.send_json(message.data)

#     @retailer_receipts_activity.serializer
#     def retailer_receipts_activity(self, instance: RetailerReceipts, action, **kwargs) -> RetailerReceiptsSerializer:
#         """This will return the retailer receipts serializer"""
#         return RetailerReceiptsSerializer(instance)

#     @retailer_receipts_activity.groups_for_signal
#     def retailer_receipts_activity(self, instance: RetailerReceipts, **kwargs):
#         # this block of code is called very often *DO NOT make DB QUERIES HERE*
#         yield f'-user__{instance.id}'  #! the string **user** is the ``Comment's`` user field.

#     @retailer_receipts_activity.groups_for_consumer
#     def retailer_receipts_activity(self, school=None, classroom=None, **kwargs):
#         # This is called when you subscribe/unsubscribe
#         yield f'-user__{self.scope["user"].pk}'

#     @action()
#     async def subscribe_to_retailer_receipts_activity(self, request_id, **kwargs):
#         # We will check if the user is authenticated for subscribing.
#         if "user" in self.scope and self.scope["user"].is_authenticated:
#             print("logged in user",self.scope["user"]['first_name'])
#             await self.retailer_receipts_activity.subscribe(request_id=request_id)


class CustomerOrderNotificationsConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        if user.is_authenticated:
            self.group_name = f"user_{user.id}"
            async_to_sync(self.channel_layer.group_add)(
                self.group_name, self.channel_name
            )
            self.accept()
        else:
            self.close()

    def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            print("Disconnecting from group", self.group_name)
            print("Channel name", self.channel_name)

            async_to_sync(self.channel_layer.group_discard)(
                self.group_name, self.channel_name
            )

    def send_notification(self, event):
        print("Event data received in consumer:", event)

        customer_name = event["customer_name"]
        customer_phone = event["customer_phone"]
        delivery_method = event["delivery_method"]
        is_received = event["is_received"]
        is_delivered = event["is_delivered"]
        selected_payment_method = event["selected_payment_method"]
        selected_payment_method_title = event["selected_payment_method_title"]
        is_paid = event["is_paid"]
        shipping_cost = event["shipping_cost"]
        order_price_total = event["order_price_total"]
        entity = event["entity"]
        entity_title = event["entity_title"]
        owner = event["owner"]
        status = event["status"]
        id = event["id"]
        self.send(text_data=json.dumps({
           "customer_name": customer_name,
           "customer_phone": customer_phone,
           "delivery_method": delivery_method,
           "is_received": is_received,
           "is_delivered": is_delivered,
           "selected_payment_method": selected_payment_method,
           "selected_payment_method_title": selected_payment_method_title,
           "is_paid": is_paid,
           "shipping_cost": shipping_cost,
           "order_price_total": order_price_total,
           "entity": entity,
           "entity_title": entity_title,
           "owner": owner,

           "status": status,
           "id": id,    
      
        }))

class InventoryPredictionsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'inventory-predictions',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory_predictions': json.loads(self.inventory_predictions),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'inventory-predictions',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        inventory_predictions = json.dumps({"name":"Mike"})

        self.inventory_predictions = inventory_predictions
        
        # orders =RetailPrescriptionsSerializer(inventory_predictions,many=True,context={'request': None}).data
        # data=json.dumps(orders,cls=UUIDEncoder)
        
        # self.inventory_predictions=data


    async def send_inventory_predictions(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'inventory_predictions': json.loads(self.inventory_predictions),
                    
                })
        


        

class OrderDetailsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'customer-order-details',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_order_details': json.loads(self.datum),
                    
                })


        

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'customer-order-details',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        order_id = self.scope["url_route"]["kwargs"]["order_id"]
        customer_order = CustomerOrders.objects.filter(id=order_id).first()
       
        self.customer_order = customer_order
        sers =CustomerOrdersSerializer(customer_order,many=False,).data
        data=json.dumps(sers,cls=UUIDEncoder)
        print("Data as s2s",data)
        self.datum=data


    async def send_customer_order_details(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'customer_order_details': json.loads(self.datum)
                   
                })


# retailers/consumers.py

import json
import time
from datetime import timedelta
from decimal import Decimal

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from products.models import Products
from retailers.helpers import (
    UUIDEncoder,
    apply_budget,
    compute_bonus_quantity,
    compute_lead_time_summary,
    compute_profit,
    estimate_daily_demand,
    estimate_safety_stock,
    line_cost,
    resolve_lead_time,
    sort_by_urgency,
)
from retailers.models import (
    CustomerOrderItems,
    IndentItemSource,
    OutOfStock,
    RetailerIndent,
    RetailerIndentItem,
    RetailerOrderItems,
    RetailerReceipts,
)
from wholesalers.models import (
    WholesalerPriceDiscounts,
    WholesalerQuantityDiscounts,
    WholesalerReceipts,
)


class RetailerInventoryPredictionConsumer(AsyncJsonWebsocketConsumer):
    """
    Real-time inventory prediction feed.

    Group:  retailer-predictions-<entity_id>
    Event:  send.retailer.predictions
    """

    # =========================================================
    # Lifecycle
    # =========================================================

    @database_sync_to_async
    def _resolve_entity(self, user):
        if not user or not user.is_authenticated:
            return None
        return getattr(user, "entity", None)

    async def connect(self):
        self.user = self.scope["user"]
        print("User at connect", self.user)

        if not self.user.is_authenticated:
            await self.close()
            return

        entity = await self._resolve_entity(self.user)
        if not entity:
            await self.close()
            return

        self.entity = entity
        self.entity_id = str(entity.id)
        self.group_name = f"retailer-predictions-{self.entity_id}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )
        await self.accept()

        await self.helper_func()

        await self.send_json({
            "predictions": json.loads(self.datum),
        })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        await self.close()

    async def send_retailer_predictions(self, event):
        await self.helper_func()
        await self.send_json({
            "predictions": json.loads(self.datum),
        })

    # =========================================================
    # Orchestration
    # =========================================================

    @sync_to_async
    def helper_func(self):
        started = time.time()

        entity = getattr(self, "entity", None)
        if not entity:
            self.datum = json.dumps({"predictions": []})
            return

        print(
            f"[PREDICTION] START entity={entity.id} "
            f"user={self.user.id}"
        )

        indent = self._get_or_create_indent(entity)

        cycle_days = int(indent.order_days or 30)
        budget_amount = indent.budget_amount
        budget_enforced = indent.budget_enforced == "true"
        pricing_percentage = float(
            indent.pricing_percentage or 30
        )
        indent_lead_override = int(indent.lead_time or 0)

        self.cycle_days = cycle_days
        self.budget_amount = (
            float(budget_amount) if budget_amount else None
        )
        self.budget_enforced = budget_enforced
        self.pricing_percentage = pricing_percentage

        today = timezone.now().date()

        candidate_pids = self._get_candidate_product_ids(entity)

        compiled = []
        failed = 0

        for p_id in candidate_pids:
            try:
                result = self._predict_product(
                    p_id,
                    entity,
                    cycle_days,
                    today,
                    indent_lead_override,
                    pricing_percentage,
                )
                if result:
                    compiled.append(result)
            except Exception as e:
                failed += 1
                print(
                    f"[PREDICTION] FAILED product={p_id}: "
                    f"{type(e).__name__}: {e}"
                )

        compiled = sort_by_urgency(compiled)

        try:
            indent, budget_info = self._sync_indent(
                entity, indent, cycle_days, compiled, today
            )
            self.retailer_indent_id = str(indent.id)
            self.budget_info = budget_info
        except Exception as e:
            print(
                f"[PREDICTION] INDENT SYNC FAILED: "
                f"{type(e).__name__}: {e}"
            )
            self.retailer_indent_id = None
            self.budget_info = None

        lead_time_summary = compute_lead_time_summary(compiled)

        try:
            indent.average_lead_time_days = (
                lead_time_summary["average_lead_time_days"]
            )
            indent.lead_time_updated_at = timezone.now()
            indent.save(update_fields=[
                "average_lead_time_days",
                "lead_time_updated_at",
            ])
        except Exception:
            pass

        payload = {
            "retailer_id": str(entity.id),
            "retailer_name": getattr(
                entity, "title", self.user.email
            ),
            "retailer_indent_id": self.retailer_indent_id,
            "config": {
                "order_days": cycle_days,
                "lead_time_override": indent_lead_override,
                "budget_amount": self.budget_amount,
                "budget_enforced": budget_enforced,
                "pricing_percentage": pricing_percentage,
            },
            "lead_time_summary": lead_time_summary,
            "budget": self.budget_info,
            "predictions": compiled,
        }

        self.datum = json.dumps(payload, cls=UUIDEncoder)

        print(
            f"[PREDICTION] DONE entity={entity.id} "
            f"candidates={len(candidate_pids)} "
            f"compiled={len(compiled)} failed={failed} "
            f"avg_lead={lead_time_summary['average_lead_time_days']} "
            f"in {time.time() - started:.2f}s"
        )

    # =========================================================
    # Indent bootstrap
    # =========================================================

    def _get_or_create_indent(self, entity):
        indent = (
            RetailerIndent.objects
            .filter(entity=entity, is_open="true")
            .order_by("-created")
            .first()
        )
        if indent:
            return indent
        return RetailerIndent.objects.create(
            entity=entity,
            owner=self.user,
            order_days=30,
            lead_time=0,
            is_open="true",
        )

    def _get_candidate_product_ids(self, entity):
        r_pids = list(
            RetailerReceipts.objects
            .filter(entity=entity, is_active="true")
            .values_list("product_id", flat=True)
        )
        o_pids = list(
            OutOfStock.objects
            .filter(entity=entity)
            .values_list("product_id", flat=True)
        )
        pending_pids = set(
            RetailerOrderItems.objects
            .filter(
                retailer_order__retailer=entity,
                is_received="false",
            )
            .values_list(
                "wholesaler_receipt__product_id", flat=True
            )
        )
        return (set(r_pids) | set(o_pids)) - pending_pids

    # =========================================================
    # Per-product prediction
    # =========================================================

    def _predict_product(
        self, p_id, entity, cycle_days, today,
        indent_lead_override, pricing_percentage,
    ):
        product = Products.objects.filter(
            id=p_id, active=True
        ).first()
        if not product:
            return None

        sales_rows = list(
            CustomerOrderItems.objects
            .filter(
                retailer_receipt__product_id=product.id,
                customer_order__entity=entity,
                customer_order__status="COMPLETED",
            )
            .values(
                "customer_order__created",
                "purchased_quantity",
            )
        )

        oos_rows = list(
            OutOfStock.objects
            .filter(product_id=product.id, entity=entity)
            .values("created", "required_quantity")
        )

        daily_demand = estimate_daily_demand(
            sales_rows, oos_rows
        )
        if daily_demand is None:
            return None

        supplier_receipt = (
            WholesalerReceipts.objects
            .filter(
                product=product,
                current_unit_quantity__gt=0,
            )
            .select_related("received_from")
            .order_by("final_unit_selling_price")
            .first()
        )

        supplier_entity = (
            supplier_receipt.received_from
            if supplier_receipt
            and supplier_receipt.received_from
            else None
        )

        lead_days, lead_var, lead_source = (
            self._resolve_lead_time(
                entity=entity,
                product=product,
                supplier=supplier_entity,
                indent_lead_override=indent_lead_override,
            )
        )

        total_days = lead_days + lead_var + cycle_days
        cutoff = today + timedelta(days=int(total_days))

        usable, expiring, batch_log = self._split_stock(
            entity, product, cutoff
        )

        pending = (
            RetailerOrderItems.objects
            .filter(
                wholesaler_receipt__product_id=product.id,
                retailer_order__retailer=entity,
                retailer_order__status__in=[
                    "SUBMITTED", "PROCESSING", "DISPATCHED",
                ],
                is_received="false",
            )
            .aggregate(t=Sum("purchased_quantity"))["t"]
            or 0
        )

        backlog = (
            OutOfStock.objects
            .filter(
                product=product,
                entity=entity,
                is_ordered="false",
                created__gte=(
                    today - timedelta(days=int(cycle_days))
                ),
            )
            .aggregate(t=Sum("required_quantity"))["t"]
            or 0
        )

        safety_stock = estimate_safety_stock(
            sales_rows, oos_rows
        )

        needed = (
            int(round(daily_demand * total_days)) + safety_stock
        )
        suggested = max(
            0, (needed - usable - pending)
        ) + backlog

        if suggested <= 0:
            return None

        # =========================================================
        # No supplier — informational line with zeroed money
        # =========================================================
        if not supplier_receipt:
            return {
                "product_id": str(product.id),
                "product_title": product.product_name(),
                "sku": getattr(product, "bar_code", None),
                "is_drug": product.check_is_drug,
                "availability": "unavailable",
                "calculated_metrics": {
                    "average_daily_demand": float(
                        round(daily_demand, 4)
                    ),
                    "supplier_lead_time_days": lead_days,
                    "supplier_lead_time_source": lead_source,
                    "supplier_delay_days": lead_var,
                    "safety_stock_units": safety_stock,
                    "total_days_planned_for": total_days,
                    "total_units_needed": needed,
                },
                "current_stock_status": {
                    "total_physical_on_hand": (
                        usable + expiring
                    ),
                    "good_usable_units": usable,
                    "expiring_units_warning": expiring,
                    "units_already_ordered": int(pending),
                    "customer_waitlist_units": int(backlog),
                    "existing_expiries": batch_log,
                },
                "order_suggestion": {
                    "suggested_order_quantity": int(
                        suggested
                    ),
                    "total_quantity_after_bonus": 0,
                    "bonus_quantity_earned": 0,
                    "supplier": None,
                    "profit_estimate": None,
                    "final_unit_price": 0.00,
                    "item_gross_total_amount": 0.00,
                    "item_net_total_amount": 0.00,
                    "reason": "no_wholesaler_offer",
                    "reason_text": (
                        "No wholesaler currently stocks this "
                        "item. Source it before ordering."
                    ),
                    "is_urgent": backlog > 0,
                },
            }

        # =========================================================
        # Has supplier — full prediction
        # =========================================================
        active_price_disc = self._resolve_active_price_discount(
            supplier_receipt, today
        )
        active_qty_disc = self._resolve_active_quantity_discount(
            supplier_receipt, int(suggested), today
        )
        total_quantity, bonus_quantity, full_blocks = (
            compute_bonus_quantity(
                int(suggested), active_qty_disc
            )
        )

        effective_purchase_price = 0.0
        if active_price_disc:
            effective_purchase_price = float(
                active_price_disc.offer_price
            )
        elif supplier_receipt:
            effective_purchase_price = float(
                supplier_receipt.unit_selling_price
            )

        profit = compute_profit(
            receipt=supplier_receipt,
            quantity=int(suggested),
            final_unit_price=effective_purchase_price,
            pricing_percentage=pricing_percentage,
        )

        supplier_payload = self._build_supplier_payload(
            supplier_receipt=supplier_receipt,
            effective_purchase_price=effective_purchase_price,
            active_price_disc=active_price_disc,
            active_qty_disc=active_qty_disc,
            full_blocks=full_blocks,
        )

        return {
            "product_id": str(product.id),
            "product_title": product.product_name(),
            "sku": getattr(product, "bar_code", None),
            "is_drug": product.check_is_drug,
            "availability": "available",
            "calculated_metrics": {
                "average_daily_demand": float(
                    round(daily_demand, 4)
                ),
                "supplier_lead_time_days": lead_days,
                "supplier_lead_time_source": lead_source,
                "supplier_delay_days": lead_var,
                "safety_stock_units": safety_stock,
                "total_days_planned_for": total_days,
                "total_units_needed": needed,
            },
            "current_stock_status": {
                "total_physical_on_hand": usable + expiring,
                "good_usable_units": usable,
                "expiring_units_warning": expiring,
                "units_already_ordered": int(pending),
                "customer_waitlist_units": int(backlog),
                "existing_expiries": batch_log,
            },
            "order_suggestion": {
                "suggested_order_quantity": int(suggested),
                "total_quantity_after_bonus": total_quantity,
                "bonus_quantity_earned": bonus_quantity,
                "supplier": supplier_payload,
                "profit_estimate": profit,
            },
        }

    # =========================================================
    # Lead time
    # =========================================================

    def _estimate_supplier_lead_time(
        self, entity, product=None, supplier=None,
        lookback_days=365,
    ):
        since = timezone.now() - timedelta(days=lookback_days)

        qs = RetailerReceipts.objects.filter(
            entity=entity,
            is_active="true",
            retailer_order__isnull=False,
            retailer_order__created__gte=since,
        )
        if product is not None:
            qs = qs.filter(product=product)
        if supplier is not None:
            qs = qs.filter(received_from=supplier)

        rows = qs.values("created", "retailer_order__created")

        deltas = []
        for r in rows:
            placed = r["retailer_order__created"]
            delivered = r["created"]
            if placed and delivered and delivered > placed:
                days = (delivered - placed).days
                if 0 <= days <= 90:
                    deltas.append(days)

        if len(deltas) < 3:
            return None

        mean = sum(deltas) / len(deltas)
        variance = (
            sum((d - mean) ** 2 for d in deltas) / len(deltas)
            if len(deltas) > 1 else 0
        )

        return {
            "mean": round(mean, 2),
            "stddev": round(variance ** 0.5, 2),
            "samples": len(deltas),
        }

    def _resolve_lead_time(
        self, entity, product, supplier,
        indent_lead_override,
    ):
        return resolve_lead_time(
            learned_per_sku_supplier=(
                self._estimate_supplier_lead_time(
                    entity,
                    product=product,
                    supplier=supplier,
                )
            ),
            learned_per_sku=(
                self._estimate_supplier_lead_time(
                    entity, product=product
                )
            ),
            learned_per_supplier=(
                self._estimate_supplier_lead_time(
                    entity, supplier=supplier
                )
            ),
            indent_lead_override=indent_lead_override,
        )

    # =========================================================
    # Stock split
    # =========================================================

    def _split_stock(self, entity, product, cutoff):
        batches = (
            RetailerReceipts.objects
            .filter(
                product=product,
                entity=entity,
                is_active="true",
                current_unit_quantity__gt=0,
            )
            .order_by("expiry_date")
        )

        usable = 0
        expiring = 0
        batch_log = []

        for b in batches:
            will_expire = bool(
                b.expiry_date and b.expiry_date <= cutoff
            )
            batch_log.append({
                "batch_number": b.batch,
                "expiry_date": (
                    b.expiry_date.isoformat()
                    if b.expiry_date else None
                ),
                "units_remaining": b.current_unit_quantity,
                "will_expire_during_plan_period": will_expire,
            })
            if will_expire:
                expiring += b.current_unit_quantity
            else:
                usable += b.current_unit_quantity

        return usable, expiring, batch_log

    # =========================================================
    # Discounts
    # =========================================================

    def _resolve_active_price_discount(self, receipt, today):
        if not receipt:
            return None
        return (
            WholesalerPriceDiscounts.objects
            .filter(
                wholesaler_receipt=receipt,
                is_active="true",
                start__lte=today,
                end__gte=today,
            )
            .order_by("-percent")
            .first()
        )

    def _resolve_active_quantity_discount(
        self, receipt, quantity, today,
    ):
        if not receipt or quantity <= 0:
            return None
        return (
            WholesalerQuantityDiscounts.objects
            .filter(
                wholesaler_receipt=receipt,
                is_active="true",
                start__lte=today,
                end__gte=today,
                limit_quantity__lte=quantity,
            )
            .order_by("-limit_quantity")
            .first()
        )

    # =========================================================
    # Supplier payload
    # =========================================================

    def _build_supplier_payload(
        self,
        supplier_receipt,
        effective_purchase_price,
        active_price_disc,
        active_qty_disc,
        full_blocks,
    ):
        return {
            "id": (
                str(supplier_receipt.received_from.id)
                if supplier_receipt
                and supplier_receipt.received_from
                else None
            ),
            "name": (
                supplier_receipt.received_from.title
                if supplier_receipt
                and supplier_receipt.received_from
                else None
            ),
            "unit_price": effective_purchase_price,
            "normal_price": (
                float(supplier_receipt.unit_selling_price)
                if supplier_receipt else None
            ),
            "is_discounted": active_price_disc is not None,
            "discount_percent": (
                float(active_price_disc.percent)
                if active_price_disc else 0.0
            ),
            "price_promotion": (
                {
                    "title": active_price_disc.title,
                    "start": active_price_disc.start.isoformat(),
                    "end": active_price_disc.end.isoformat(),
                }
                if active_price_disc else None
            ),
            "quantity_promotion": (
                {
                    "id": str(active_qty_disc.id),
                    "title": active_qty_disc.title,
                    "buy_quantity": (
                        active_qty_disc.limit_quantity
                    ),
                    "free_quantity": (
                        active_qty_disc.awarded_quantity
                    ),
                    "start": (
                        active_qty_disc.start.isoformat()
                    ),
                    "end": active_qty_disc.end.isoformat(),
                    "blocks_earned": full_blocks,
                }
                if active_qty_disc else None
            ),
        }

    # =========================================================
    # Sync indent + budget
    # =========================================================

    def _sync_indent(
        self, entity, indent, cycle_days, compiled, today,
    ):
        with transaction.atomic():
            indent.order_days = cycle_days
            indent.save(update_fields=["order_days"])

            RetailerIndentItem.objects.filter(
                retailer_indent=indent,
                entity=entity,
                source=IndentItemSource.PREDICTION,
            ).delete()

            budget_amount = (
                Decimal(str(indent.budget_amount))
                if indent.budget_amount else None
            )
            budget_enforced = indent.budget_enforced == "true"

            # Only items with offers are budgetable
            budgetable = [
                p for p in compiled
                if p.get("availability") == "available"
            ]

            included, excluded = apply_budget(
                budgetable, budget_amount, budget_enforced
            )

            # ---- Persist included items ----
            for p in included:
                cost = line_cost(p)
                print(
                    f"[PREDICTION] include line "
                    f"product={p.get('product_id')} "
                    f"qty="
                    f"{p.get('order_suggestion', {}).get('suggested_order_quantity')} "
                    f"cost={cost}"
                )

                metrics = p.get("calculated_metrics", {})
                self._persist_indent_item(
                    entity=entity,
                    indent=indent,
                    prediction=p,
                    today=today,
                    lead_days=metrics.get(
                        "supplier_lead_time_days", 0
                    ),
                    lead_var=metrics.get(
                        "supplier_delay_days", 0
                    ),
                    lead_source=metrics.get(
                        "supplier_lead_time_source", "default"
                    ),
                )

            # ---- Log excluded items with their cost ----
            for p in excluded:
                cost = line_cost(p)
                print(
                    f"[PREDICTION] exclude line "
                    f"product={p.get('product_id')} "
                    f"qty="
                    f"{p.get('order_suggestion', {}).get('suggested_order_quantity')} "
                    f"cost={cost} "
                    f"reason=over_budget"
                )

            # ---- Totals from DB (user edits counted) ----
            db_items = RetailerIndentItem.objects.filter(
                retailer_indent=indent,
                entity=entity,
            )

            total_cost = Decimal("0")
            total_profit = Decimal("0")
            total_revenue = Decimal("0")

            for item in db_items:
                total_cost += Decimal(
                    str(item.item_net_total_amount or 0)
                )
                if item.profit_estimate:
                    total_profit += Decimal(
                        str(
                            item.profit_estimate.get(
                                "total_profit", 0
                            )
                        )
                    )
                    total_revenue += Decimal(
                        str(
                            item.profit_estimate.get(
                                "total_revenue", 0
                            )
                        )
                    )

            budget_info = None
            if budget_amount is not None:
                budget_info = {
                    "amount": float(budget_amount),
                    "enforced": budget_enforced,
                    "used": round(float(total_cost), 2),
                    "remaining": round(
                        float(
                            max(
                                Decimal("0"),
                                budget_amount - total_cost,
                            )
                        ),
                        2,
                    ),
                    "over_budget": total_cost > budget_amount,
                    "included_count": db_items.count(),
                    "excluded_count": len(excluded),
                    "projected_revenue": round(
                        float(total_revenue), 2
                    ),
                    "projected_profit": round(
                        float(total_profit), 2
                    ),
                }

        return indent, budget_info

    # =========================================================
    # Persist one indent item
    # =========================================================

    def _persist_indent_item(
        self, entity, indent, prediction, today,
        lead_days, lead_var, lead_source,
    ):
        product_id = prediction.get("product_id")
        if not product_id:
            return

        product = Products.objects.filter(id=product_id).first()
        if not product:
            return

        suggestion = prediction.get("order_suggestion", {})
        supplier_info = suggestion.get("supplier") or {}

        quantity = int(
            suggestion.get("suggested_order_quantity", 0) or 0
        )
        if quantity <= 0:
            return

        target_receipt = None
        supplier_id = supplier_info.get("id")
        if supplier_id:
            target_receipt = (
                WholesalerReceipts.objects
                .filter(
                    product=product,
                    entity_id=supplier_id,
                    current_unit_quantity__gt=0,
                )
                .order_by("final_unit_selling_price")
                .first()
            )

        base_price = Decimal("0.00")
        if target_receipt:
            base_price = Decimal(
                str(target_receipt.unit_selling_price or 0)
            )
        else:
            last_receipt = (
                RetailerReceipts.objects
                .filter(entity=entity, product=product)
                .order_by("-created")
                .first()
            )
            if last_receipt and last_receipt.unit_buying_price:
                base_price = Decimal(
                    str(last_receipt.unit_buying_price)
                )

        p_disc = self._resolve_active_price_discount(
            target_receipt, today
        )

        final_unit_price = (
            Decimal(str(p_disc.offer_price))
            if p_disc else base_price
        )

        q_disc = self._resolve_active_quantity_discount(
            target_receipt, quantity, today
        )
        total_quantity, _, _ = compute_bonus_quantity(
            quantity, q_disc
        )

        gross = Decimal(str(quantity)) * base_price
        net = Decimal(str(quantity)) * final_unit_price

        profit = compute_profit(
            receipt=target_receipt,
            quantity=quantity,
            final_unit_price=float(final_unit_price),
            pricing_percentage=self.pricing_percentage,
        )

        RetailerIndentItem.objects.create(
            entity=entity,
            owner=self.user,
            retailer_indent=indent,
            wholesale_receipt=target_receipt,
            wholesaler_price_discount=p_disc,
            wholesaler_quantity_discount=q_disc,
            required_quantity=quantity,
            total_quantity=total_quantity,
            final_unit_price=final_unit_price,
            item_gross_total_amount=gross,
            item_net_total_amount=net,
            profit_estimate=profit,
            source=IndentItemSource.PREDICTION,
            lead_time_days=lead_days,
            lead_time_variance_days=lead_var,
            lead_time_source=lead_source,
        )
# import json, numpy as np, pandas as pd
# from decimal import Decimal
# from django.utils import timezone
# from django.db.models import Sum
# from channels.generic.websocket import AsyncJsonWebsocketConsumer
# from asgiref.sync import sync_to_async
# from sklearn.linear_model import LinearRegression
# from products.models import Products
# from .models import RetailerReceipts, OutOfStock, CustomerOrderItems, RetailerOrders, RetailerOrderItems, WholesalerReceipts

# class InventoryPredictionConsumer(AsyncJsonWebsocketConsumer):
#     async def connect(self):
#         self.user = self.scope["user"]
#         print(f"User at connect {self.user}")
#         if not self.user.is_authenticated: return
#         await self.channel_layer.group_add('inventory-predictions', self.channel_name)
#         await self.accept()
#         await self.helper_func()
#         await self.send_json({'status': 'completed', 'retailer_id': str(self.retailer_id) if self.retailer_id else None, 'retailer_name': self.retailer_name, 'predictions': json.loads(self.predictions)})

#     async def disconnect(self, close_code):
#         await self.channel_layer.group_discard('inventory-predictions', self.channel_name)
#         await self.close()

#     @sync_to_async
#     def helper_func(self):
#         ent = getattr(self.user, 'entity', None) or getattr(getattr(self.user, 'employee', None), 'entity', None)
#         if not ent:
#             self.retailer_id, self.retailer_name, self.predictions = None, None, json.dumps([])
#             return
#         self.retailer_id, self.retailer_name, cycle_days, today = ent.id, getattr(ent, 'title', self.user.username), getattr(ent, 'order_days', 30), timezone.now().date()
        
#         r_pids = list(RetailerReceipts.objects.filter(received_from=ent, is_active="true").values_list('product_id', flat=True))
#         if not r_pids: r_pids = list(RetailerReceipts.objects.filter(owner=self.user, is_active="true").values_list('product_id', flat=True))
#         o_pids = list(OutOfStock.objects.filter(owner_id=self.user.id).values_list('product_id', flat=True))
#         p_ids = set(r_pids + o_pids)
#         compiled = []

#         for p_id in p_ids:
#             try:
#                 p = Products.objects.filter(id=p_id, active=True).first()
#                 if not p: continue
                
#                 s_qs = list(CustomerOrderItems.objects.filter(retailer_receipt__product_id=p.id, customer_order__entity=ent, customer_order__status="COMPLETED").values('customer_order__created', 'purchased_quantity'))
#                 if not s_qs: s_qs = list(CustomerOrderItems.objects.filter(retailer_receipt__product_id=p.id, customer_order__owner=self.user, customer_order__status="COMPLETED").values('customer_order__created', 'purchased_quantity'))
#                 o_qs = list(OutOfStock.objects.filter(product_id=p.id, owner_id=self.user.id).values('created', 'required_quantity'))

#                 cl_s = [{'d': i['customer_order__created'].date() if hasattr(i['customer_order__created'], 'date') else pd.to_datetime(i['customer_order__created']).date(), 'q': int(i['purchased_quantity'])} for i in s_qs]
#                 cl_o = [{'d': i['created'].date() if hasattr(i['created'], 'date') else pd.to_datetime(i['created']).date(), 'q': int(i['required_quantity'])} for i in o_qs]

#                 if len(cl_s) + len(cl_o) < 3: daily_demand, safety_stock = Decimal('0.0000'), 0
#                 else:
#                     df = pd.concat([pd.DataFrame(cl_s) if cl_s else pd.DataFrame(columns=['d','q']), pd.DataFrame(cl_o) if cl_o else pd.DataFrame(columns=['d','q'])], ignore_index=True)
#                     df['d'] = pd.to_datetime(df['d'])
#                     df.set_index('d', inplace=True)
#                     m = df.resample('ME')['q'].sum().reset_index()
#                     if len(m) < 3: daily_demand, safety_stock = Decimal('0.0000'), 0
#                     else:
#                         m['idx'] = np.arange(len(m))
#                         daily_demand = Decimal(str(max(0, int(round(LinearRegression().fit(m[['idx']].values, m['q'].values).predict(np.array([[len(m)]]))))))) / Decimal('30.4')
#                         w = df.resample('W')['q'].sum()
#                         safety_stock = int(round((w.std() / 7) * 1.65)) if len(w) > 1 and not pd.isna(w.std()) else 0

#                 sup = WholesalerReceipts.objects.filter(product=p, current_unit_quantity__gt=0).select_related('received_from').order_by('final_unit_selling_price').first()
#                 l_days, l_var = 5, 2
#                 if sup and sup.received_from:
#                     po = list(RetailerOrders.objects.filter(wholesaler=sup.received_from, retailer=ent, status="RECEIVED", is_received="true").values('created', 'received_at')[:10])
#                     if not po: po = list(RetailerOrders.objects.filter(wholesaler=sup.received_from, owner=self.user, status="RECEIVED", is_received="true").values('created', 'received_at')[:10])
#                     if len(po) >= 2:
#                         durs = pd.Series([(o['received_at'].date() - o['created'].date()).days if hasattr(o['received_at'], 'date') else (o['received_at'] - o['created']).days for o in po])
#                         if len(durs) > 1 and not pd.isna(durs.std()): l_days, l_var = max(1, int(round(durs.mean()))), max(0, int(round(durs.std())))

#                 total_days = l_days + l_var + cycle_days
#                 cutoff = today + timezone.timedelta(days=int(total_days))
                
#                 batches = RetailerReceipts.objects.filter(product=p, owner=self.user, is_active="true", current_unit_quantity__gt=0).order_by('expiry_date')
#                 if not batches.exists(): batches = RetailerReceipts.objects.filter(product=p, received_from=ent, is_active="true", current_unit_quantity__gt=0).order_by('expiry_date')
#                 usable, expired, batch_log = 0, 0, []
                
#                 for b in batches:
#                     is_exp = b.expiry_date <= cutoff if b.expiry_date else False
#                     batch_log.append({"batch_number": b.batch, "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None, "units_remaining": b.current_unit_quantity, "will_expire_during_plan_period": is_exp})
#                     if is_exp: expired += b.current_unit_quantity
#                     else: usable += b.current_unit_quantity

#                 pending = RetailerOrderItems.objects.filter(wholesaler_receipt__product_id=p.id, retailer_order__retailer=ent, retailer_order__status__in=["SUBMITTED", "PROCESSING", "DISPATCHED"], is_received="false").aggregate(t=Sum('purchased_quantity'))['t'] or 0
#                 if pending == 0: pending = RetailerOrderItems.objects.filter(wholesaler_receipt__product_id=p.id, retailer_order__owner=self.user, retailer_order__status__in=["SUBMITTED", "PROCESSING", "DISPATCHED"], is_received="false").aggregate(t=Sum('purchased_quantity'))['t'] or 0
                
#                 backlog = OutOfStock.objects.filter(product=p, owner_id=self.user.id, is_ordered="false", created__gte=today - timezone.timedelta(days=int(cycle_days))).aggregate(t=Sum('required_quantity'))['t'] or 0
                
#                 needed = int(round(daily_demand * total_days)) + safety_stock
#                 suggested = max(0, (needed - usable - pending)) + backlog

#                 # CRITICAL RESTOCK FILTER: Skip items completely if they don't need any new units purchased
#                 if suggested > 0:
#                     compiled.append({
#                         "product_id": p.id, "product_title": p.product_name(), "sku": getattr(p, 'bar_code', None), "is_drug": p.check_is_drug,
#                         "calculated_metrics": {"average_daily_demand": float(round(daily_demand, 4)), "supplier_lead_time_days": l_days, "supplier_delay_days": l_var, "safety_stock_units": safety_stock, "total_days_planned_for": total_days, "total_units_needed": needed},
#                         "current_stock_status": {"total_physical_on_hand": usable + expired, "good_usable_units": usable, "expiring_units_warning": expired, "units_already_ordered": pending, "customer_waitlist_units": backlog, "existing_expiries": batch_log},
#                         "order_suggestion": {"suggested_order_quantity": suggested, "supplier": {"id": sup.received_from.id if sup and sup.received_from else None, "name": sup.received_from.title if sup and sup.received_from else None, "unit_price": float(sup.final_unit_selling_price) if sup else None}}
#                     })
#             except: continue
#         self.predictions = json.dumps(compiled, default=lambda o: str(o) if hasattr(o, 'hex') else o)

#     async def send_inventory_predictions(self, event):
#         await self.helper_func()
#         await self.send_json({'status': 'completed', 'retailer_id': str(self.retailer_id) if self.retailer_id else None, 'retailer_name': self.retailer_name, 'predictions': json.loads(self.predictions)})

#     locals()["send_inventory-predictions"] = send_inventory_predictions
