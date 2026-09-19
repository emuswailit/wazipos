// api/analyticsApi.ts

import client from "./client";

/**
 * Unified analytics endpoint.
 *
 * Server route: POST /api/v1/analytics/
 * Body always carries an `action` that dispatches to a handler.
 */

const analyticsAction = (data: {
    action: string;
    [key: string]: any;
}) => {
    return client.post("/analytics/", data);
};

/* =========================================================
 * Named wrappers — one per server action
 * ======================================================= */

const getBulkForecastAction = (data: {
    tier?: "RETAILER" | "WHOLESALER";
    lead_time_days: number;
    order_days: number;
    product_ids?: string[];
    min_avg_daily_demand?: number;
    include_daily?: boolean;
    include_offers?: boolean;
    include_campaigns?: boolean;
    run_date?: string;
    entity_id?: string;
}) => {
    return analyticsAction({
        action: "GetBulkForecast",
        ...data,
    });
};

const getForecastAction = (data: {
    product_id: string;
    tier?: "RETAILER" | "WHOLESALER";
    horizon_days?: number;
    run_date?: string;
}) => {
    return analyticsAction({
        action: "GetForecast",
        ...data,
    });
};

const getDemandProfileAction = (data: {
    tier?: "RETAILER" | "WHOLESALER";
    demand_pattern?: string;
    product_id?: string;
}) => {
    return analyticsAction({
        action: "GetDemandProfile",
        ...data,
    });
};

const getForecastAccuracyAction = (data: {
    tier?: "RETAILER" | "WHOLESALER";
    model_name?: string;
    segment?: string;
    limit?: number;
}) => {
    return analyticsAction({
        action: "GetForecastAccuracy",
        ...data,
    });
};

const getInventoryOverviewAction = (data: {
    as_of_date?: string;
    tier?: "RETAILER" | "WHOLESALER";
}) => {
    return analyticsAction({
        action: "GetInventoryOverview",
        ...data,
    });
};

const getAlertsAction = (data: {
    status?: "active" | "resolved" | "all";
    severity?: "info" | "low" | "medium" | "high" | "critical";
    alert_type?: string;
    tier?: "RETAILER" | "WHOLESALER";
    product_id?: string;
}) => {
    return analyticsAction({
        action: "GetAlerts",
        ...data,
    });
};

const acknowledgeAlertAction = (data: { alert_id: string }) => {
    return analyticsAction({
        action: "AcknowledgeAlert",
        ...data,
    });
};

const resolveAlertAction = (data: {
    alert_id: string;
    reason?: string;
}) => {
    return analyticsAction({
        action: "ResolveAlert",
        ...data,
    });
};

const getExpiryRisksAction = (data: {
    as_of_date?: string;
    tier?: "RETAILER" | "WHOLESALER";
    min_probability?: number;
    max_days_to_expiry?: number;
    recommended_action?: string;
}) => {
    return analyticsAction({
        action: "GetExpiryRisks",
        ...data,
    });
};

const getExpiringLotsAction = (data: {
    days?: number;
    tier?: "RETAILER" | "WHOLESALER";
    as_of_date?: string;
}) => {
    return analyticsAction({
        action: "GetExpiringLots",
        ...data,
    });
};

const getProductProfileAction = (data: {
    product_id: string;
    as_of_date?: string;
    tier?: "RETAILER" | "WHOLESALER";
}) => {
    return analyticsAction({
        action: "GetProductProfile",
        ...data,
    });
};

const getCampaignCandidatesAction = (data: {
    as_of_date?: string;
    wholesaler_id?: string;
}) => {
    return analyticsAction({
        action: "GetCampaignCandidates",
        ...data,
    });
};

export default {
    analyticsAction,
    getBulkForecastAction,
    getForecastAction,
    getDemandProfileAction,
    getForecastAccuracyAction,
    getInventoryOverviewAction,
    getAlertsAction,
    acknowledgeAlertAction,
    resolveAlertAction,
    getExpiryRisksAction,
    getExpiringLotsAction,
    getProductProfileAction,
    getCampaignCandidatesAction,
};