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
    else:
        raise exceptions.ValidationError(f"Action {action} is unknown")