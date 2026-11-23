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

/* ---------------------------------------------------------------- profit outlook + AI analyst */

export type OutlookFlag = 'STOCKOUT_SOON' | 'SLOW' | 'EXPIRY_RISK' | 'THIN_MARGIN' | 'LOW_CONFIDENCE';

export interface OutlookProduct {
    product_id: string;
    title: string | null;
    model: string | null;
    adjusted: boolean;
    abc: string | null;
    xyz: string | null;
    forecast_units: number;
    forecast_p90_units: number;
    avg_daily: number;
    sold_last_30: number;
    accuracy_pct: number | null;
    on_hand: number;
    days_of_cover: number | null;
    stockout_on: string | null;
    reorder_qty: number;
    unit_price: number;
    unit_cost: number | null;
    margin_pct: number | null;
    projected_revenue: number;
    projected_profit: number | null;
    profit_at_risk: number | null;
    turnover_per_year: number | null;
    gmroi: number | null;
    slow_stock_value: number | null;
    expiry_write_off_risk: number;
    flags: OutlookFlag[];
}

export interface OutlookTotals {
    projected_revenue: number;
    projected_profit: number;
    margin_pct: number | null;
    profit_at_risk: number;
    slow_stock_value: number;
    expiry_write_off_risk: number;
    inventory_at_cost: number;
    turnover_per_year: number | null;
    forecast_accuracy_pct: number | null;
    stockouts_soon: number;
    products: number;
}

export interface ProfitOutlook {
    run_date: string | null;
    horizon_days: number;
    lead_time_days: number;
    products: OutlookProduct[];
    totals: OutlookTotals;
    note?: string;
}

export interface AiAction {
    product_id: string;
    title: string | null;
    action: 'REORDER' | 'REDUCE_ORDERS' | 'MARKDOWN' | 'PROMOTE' | 'PRICE_REVIEW' | 'HOLD' | 'CHECK_DATA';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    figures: Partial<OutlookProduct>;
}

export interface AiAdjustment {
    product_id: string;
    title: string | null;
    pct: number;
    starts_on: string;
    ends_on: string;
    reason: string;
}

export interface AiInsights {
    headline: string;
    summary: string;
    actions: AiAction[];
    adjustments: AiAdjustment[];
    risks: string[];
    totals: OutlookTotals;
    generated_at: string;
    cached: boolean;
}

export interface ForecastAdjustment extends AiAdjustment {
    id: string;
    source: 'AI' | 'USER';
    is_active: boolean;
    created: string;
}

const getProfitOutlookAction = () => analyticsAction({ action: "GetProfitOutlook" });
const getAiInsightsAction = (notes?: string, refresh = false) => analyticsAction({ action: "GetAiInsights", notes, refresh });
const applyForecastAdjustmentAction = (a: { product_id: string; pct: number; starts_on: string; ends_on: string; reason: string; source?: 'AI' | 'USER' }) =>
    analyticsAction({ action: "ApplyForecastAdjustment", ...a });
const listForecastAdjustmentsAction = () => analyticsAction({ action: "ListForecastAdjustments" });
const removeForecastAdjustmentAction = (adjustment_id: string) => analyticsAction({ action: "RemoveForecastAdjustment", adjustment_id });

/* ---------------------------------------------------------------- restaurants & hotels */

export type KitchenFlag = 'RUNS_OUT_SOON' | 'BELOW_REORDER_LEVEL' | 'HIGH_WASTE' | 'SLOW' | 'LOW_CONFIDENCE' | 'EXPIRES_BEFORE_USED';

export interface KitchenItem {
    id: string;
    kind: 'SUPPLY' | 'DRINK';
    title: string;
    unit: string;
    category?: string;
    on_hand: number;
    avg_daily: number;
    forecast_28: number;
    days_of_cover: number | null;
    runs_out_on: string | null;
    reorder_qty: number;
    reorder_cost: number;
    unit_cost: number;
    used_last_30: number;
    wasted_last_30: number;
    waste_value_30: number;
    accuracy_pct: number | null;
    model: string;
    flags: KitchenFlag[];
    reorder_level?: number;
    expiry_date?: string | null;
    sells_tots?: boolean;
    projected_revenue?: number;
    projected_profit?: number | null;
    margin_pct?: number | null;
}

export interface KitchenOutlook {
    as_of: string;
    horizon_days: number;
    lead_time_days: number;
    order_days: number;
    supplies: KitchenItem[];
    drinks: KitchenItem[];
    totals: {
        items: number;
        running_out_soon: number;
        restock_cost_next_10_days: number;
        waste_value_30: number;
        bar_projected_profit: number;
        bar_projected_revenue: number;
        forecast_accuracy_pct: number | null;
        payday_effect_pct: number | null;
    };
}

export interface KitchenInsights {
    headline: string;
    summary: string;
    actions: { item_id: string; title: string; kind: 'SUPPLY' | 'DRINK'; action: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string; figures: Partial<KitchenItem> }[];
    risks: string[];
    cached: boolean;
}

const getKitchenOutlookAction = () => analyticsAction({ action: "GetKitchenOutlook" });
const getKitchenInsightsAction = (notes?: string) => analyticsAction({ action: "GetKitchenInsights", notes });

export default {
    getKitchenOutlookAction,
    getKitchenInsightsAction,
    getProfitOutlookAction,
    getAiInsightsAction,
    applyForecastAdjustmentAction,
    listForecastAdjustmentsAction,
    removeForecastAdjustmentAction,
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