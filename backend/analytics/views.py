from django.shortcuts import render

# Create your views here.
# analytics/views.py

from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination

from core.responses import custom_success_message, custom_errors_response
from retailers.retail_permissions import EntitySubscriptionPermission

from analytics import utils
from analytics import serializers


@api_view(["POST"])
@permission_classes([EntitySubscriptionPermission, permissions.IsAuthenticated])
def analyticsAPIView(request):
    """
    Single-entry command endpoint for inventory analytics.

    Route:  POST /api/v1/analytics/inventory
    Body:   { "action": "<ActionName>", ...payload }

    Supported actions:
        GetInventoryOverview    entity-level metrics dashboard
        GetAlerts               filterable list of alerts
        GetAlertDetails         one alert
        AcknowledgeAlert        mark acknowledged
        ResolveAlert            mark resolved
        GetExpiryRisks          at-risk lots by probability
        GetExpiringLots         drill-down list of lots near expiry
        GetProductProfile       product-level rollup + underlying lots
        GetCampaignCandidates   wholesaler campaign suggestions
    """
    try:
        action = request.data["action"]
    except KeyError:
        raise exceptions.ValidationError("Action is not supplied")

    # =================================================================
    # Dashboard
    # =================================================================

    if action == "GetInventoryOverview":
        errors, result = utils.get_inventory_overview(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Overview could not be retrieved", errors)

        # result = {"as_of_date": ..., "latest": [...], "trend": [...]}
        return custom_success_message(
            0,
            "Overview retrieved successfully",
            {
                "as_of_date": result["as_of_date"],
                "latest": serializers.InventoryMetricSnapshotSerializer(
                    result["latest"], many=True,
                ).data,
                "trend": result["trend"],
            },
            "overview",
        )

    # =================================================================
    # Alerts
    # =================================================================

    elif action == "GetAlerts":
        errors, qs = utils.get_alerts(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Alerts could not be retrieved", errors)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.InventoryAlertListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetAlertDetails":
        errors, alert = utils.get_alert_details(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Alert could not be retrieved", errors)

        serializer = serializers.InventoryAlertSerializer(
            alert, many=False, context={"request": request},
        )
        return custom_success_message(
            0, "Alert retrieved successfully", serializer.data, "alert",
        )

    elif action == "AcknowledgeAlert":
        errors, alert = utils.acknowledge_alert(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Alert could not be acknowledged", errors)

        serializer = serializers.InventoryAlertSerializer(
            alert, many=False, context={"request": request},
        )
        return custom_success_message(
            0, "Alert acknowledged", serializer.data, "alert",
        )

    elif action == "ResolveAlert":
        errors, alert = utils.resolve_alert(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Alert could not be resolved", errors)

        serializer = serializers.InventoryAlertSerializer(
            alert, many=False, context={"request": request},
        )
        return custom_success_message(
            0, "Alert resolved", serializer.data, "alert",
        )

    # =================================================================
    # Expiry
    # =================================================================

    elif action == "GetExpiryRisks":
        errors, qs = utils.get_expiry_risks(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Expiry risks could not be retrieved", errors)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.ExpiryRiskListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetExpiringLots":
        errors, qs = utils.get_expiring_lots(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Expiring lots could not be retrieved", errors)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.InventorySnapshotListSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    # =================================================================
    # Product drill-down
    # =================================================================

    elif action == "GetProductProfile":
        errors, result = utils.get_product_profile(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Product profile could not be retrieved", errors)

        return custom_success_message(
            0,
            "Product profile retrieved successfully",
            {
                "profiles": serializers.ProductInventoryProfileSerializer(
                    result["profiles"], many=True,
                ).data,
                "lots": serializers.InventorySnapshotListSerializer(
                    result["lots"], many=True,
                ).data,
            },
            "product_profile",
        )

    # =================================================================
    # Campaign candidates
    # =================================================================

    elif action == "GetCampaignCandidates":
        errors, result = utils.get_campaign_candidates(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Campaign candidates could not be computed", errors)

        return custom_success_message(
            0,
            "Campaign candidates computed successfully",
            result,
            "campaign_candidates",
        )
# analytics/views.py — inside the action dispatcher, before the final else

    # =================================================================
    # Demand forecasting
    # =================================================================

    elif action == "GetDemandProfile":
        errors, qs = utils.get_demand_profile(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Demand profiles could not be retrieved", errors)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializers.ProductDemandProfileSerializer(
            page, many=True, context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)

    elif action == "GetForecast":
        errors, result = utils.get_forecast(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Forecast could not be retrieved", errors)

        return custom_success_message(
            0,
            "Forecast retrieved successfully",
            {
                "product_id": result["product_id"],
                "run_date": result["run_date"],
                "forecasts": serializers.DemandForecastSerializer(
                    result["forecasts"], many=True,
                ).data,
            },
            "forecast",
        )

    elif action == "GetForecastAccuracy":
        errors, qs = utils.get_forecast_accuracy(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Forecast accuracy could not be retrieved", errors)

        return custom_success_message(
            0,
            "Forecast accuracy retrieved successfully",
            serializers.ForecastAccuracySerializer(qs, many=True).data,
            "forecast_accuracy",
        )

    # =================================================================
    # Bulk forecast
    # =================================================================

    # =================================================================
    # Profit & turnover outlook, AI analyst, demand adjustments
    # =================================================================

    elif action in ("GetProfitOutlook", "GetAiInsights", "ApplyForecastAdjustment", "ListForecastAdjustments", "RemoveForecastAdjustment", "GetKitchenOutlook", "GetKitchenInsights"):
        return _analyst(action, request)

    elif action == "GetBulkForecast":
        errors, result = utils.get_bulk_forecast_action(request.data, request.user)
        if errors:
            return custom_errors_response(1, "Bulk forecast could not be computed", errors)

        return custom_success_message(
            0,
            "Bulk forecast computed successfully",
            result,
            "bulk_forecast",
        )
    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")


def _analyst(action, request):
    """Profit outlook and the AI analyst (analytics/services/ai_analyst.py), with plain errors."""
    import logging

    from django.http import JsonResponse

    from analytics.services import ai_analyst as an
    from analytics.utils.domains import tier_of

    user = request.user
    data = request.data
    from analytics.services import kitchen_forecast as kf

    entity = getattr(user, "entity", None)
    if action in ("GetKitchenOutlook", "GetKitchenInsights"):
        if not entity or entity.entity_type not in kf.RESTAURANT_TYPES:
            return custom_errors_response(1, "Not available", ["Sign in to your restaurant or hotel to see its forecasts"])
        is_admin = user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()
        try:
            if action == "GetKitchenOutlook":
                return custom_success_message(0, "Outlook", kf.kitchen_outlook(entity), "outlook")
            if not is_admin:
                return custom_errors_response(1, "Not allowed", ["Only your business's admin can use the AI analyst"])
            return custom_success_message(0, "Insights", kf.kitchen_insights(entity, data.get("notes")), "insights")
        except an.AnalystError as e:
            return custom_errors_response(1, e.message, e.errors)
        except Exception:  # noqa: BLE001
            logging.getLogger(__name__).exception("analytics %s failed for %s", action, getattr(user, "pk", None))
            return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)

    tier = data.get("tier") or (tier_of(entity.entity_type) if entity else None)
    if not entity or tier not in ("WHOLESALER", "RETAILER"):
        return custom_errors_response(1, "Not available", ["Sign in to your shop or wholesale business to see forecasts"])
    is_admin = user.roles.filter(entity=entity, value=f"{entity.entity_type}SuperAdmin").exists()
    try:
        if action == "GetProfitOutlook":
            return custom_success_message(0, "Outlook", an.profit_outlook(entity.id, tier), "outlook")
        if action == "ListForecastAdjustments":
            return custom_success_message(0, "Adjustments", an.list_adjustments(entity, tier), "adjustments")
        if not is_admin:
            return custom_errors_response(1, "Not allowed", ["Only your business's admin can use the AI analyst and change forecasts"])
        if action == "GetAiInsights":
            refresh = str(data.get("refresh")).lower() in ("1", "true", "yes")
            return custom_success_message(0, "Insights", an.ai_insights(entity.id, tier, data.get("notes"), refresh), "insights")
        if action == "ApplyForecastAdjustment":
            return custom_success_message(0, "Adjustment saved — it applies from the next forecast run", an.apply_adjustment(entity, user, tier, data), "adjustment")
        return custom_success_message(0, "Adjustment removed", an.remove_adjustment(entity, data), "adjustment")
    except an.AnalystError as e:
        return custom_errors_response(1, e.message, e.errors)
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).exception("analytics %s failed for %s", action, getattr(user, "pk", None))
        return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)
