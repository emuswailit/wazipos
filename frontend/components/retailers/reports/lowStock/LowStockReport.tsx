// components/retailers/reports/lowStock/LowStockReport.tsx

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';

import { LowStockReportMobileView } from './LowStockReportMobileView';
import { LowStockReportWebView } from './LowStockReportWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const SEARCH_DEBOUNCE_MS = 400;

/* =========================================================
 * Types
 * ======================================================= */

export type LowStockUrgency = 'OUT' | 'CRITICAL' | 'WARNING' | 'SOON';

export interface LowStockKPI {
    reorder_count: number;
    out_of_stock_count: number;
    critical_count: number;
    warning_count: number;
    soon_count: number;
    estimated_total_units: number;
    estimated_total_cost: string;
    zero_velocity_count: number;

    /* ---- Offer coverage ---- */
    products_with_offers: number;
    products_with_discounted_offers: number;
    products_with_cheaper_offer: number;
    estimated_savings_on_orders: string;
}

export interface LowStockUrgencyRow {
    key: LowStockUrgency;
    label: string;
    count: number;
    estimated_cost: string;
}

export interface LowStockCategoryRow {
    category_id: string | null;
    category: string;
    count: number;
    total_units: number;
    total_cost: string;
}

export interface LowStockPriceDiscount {
    id: string;
    title: string;
    percent: string;
    normal_price: string;
    offer_price: string;
}

export interface LowStockQuantityDiscount {
    id: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
}

export interface LowStockOffer {
    receipt_id: string;
    product_id: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
    batch: string;
    expiry_date: string | null;
    days_to_expiry: number | null;
    available_units: number;
    pack_size: number;
    unit_price: string;
    effective_unit_price: string;
    price_discount: LowStockPriceDiscount | null;
    quantity_discount: LowStockQuantityDiscount | null;
    has_discount: boolean;
    recommended_retail_price: string | null;
    /* Added by the ranking pass */
    savings_per_unit: string;
    savings_on_suggested: string;
    covers_suggested: boolean;
}

export interface LowStockBestOffer {
    receipt_id: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
    effective_unit_price: string;
    has_discount: boolean;
    covers_suggested: boolean;
    savings_per_unit: string;
    savings_on_suggested: string;
}

export interface LowStockProductRow {
    product_id: string;
    product_title: string;
    category_id: string | null;
    category: string;
    sub_category_id: string | null;
    sub_category: string;
    current_stock: number;
    pack: number;
    receipt_count: number;
    reorder_level: number;
    danger_stock: number;
    maximum_stock: number;
    lead_time_days: number;
    target_stock: number;
    shortfall: number;
    suggested_quantity: number;
    avg_daily_sales: number;
    days_of_cover: number | null;
    sales_lookback: number;
    last_sale: string | null;
    days_since_sale: number | null;
    urgency: LowStockUrgency;
    is_out_of_stock: boolean;
    is_danger: boolean;
    unit_cost: string;
    line_cost: string;
    last_wholesaler_id: string | null;
    last_wholesaler_title: string;
    /* Offer enrichment */
    wholesale_offers: LowStockOffer[];
    wholesale_offer_count: number;
    best_offer: LowStockBestOffer | null;
    best_offer_savings_on_suggested: string;
}

export interface LowStockWholesalerGroupProduct {
    product_id: string;
    product_title: string;
    current_stock: number;
    suggested_quantity: number;
    unit_cost: string;
    line_cost: string;
    urgency: LowStockUrgency;
    has_best_offer: boolean;
    best_offer_wholesaler: string | null;
    best_offer_price: string | null;
    best_offer_has_discount: boolean;
    savings_on_line: string;
}

export interface LowStockWholesalerGroup {
    wholesaler_id: string | null;
    wholesaler_title: string;
    line_count: number;
    total_units: number;
    total_cost: string;
    total_savings: string;
    products: LowStockWholesalerGroupProduct[];
}

export interface LowStockReportData {
    period: {
        as_of: string;
        lookback_days: number;
        cover_days: number;
    };
    filters: {
        category: string | null;
        wholesaler: string | null;
        search: string | null;
        only_danger: boolean;
        include_zero_velocity: boolean;
        include_offers: boolean;
    };
    entity: { id: string; title: string };
    kpi: LowStockKPI;
    urgency_rollup: LowStockUrgencyRow[];
    category_rollup: LowStockCategoryRow[];
    wholesaler_groups: LowStockWholesalerGroup[];
    products: LowStockProductRow[];
}

/* =========================================================
 * Shell
 * ======================================================= */

const LowStockReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [report, setReport] = useState<LowStockReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /* ---- Filters ---- */
    const [coverDays, setCoverDays] = useState(30);
    const [onlyDanger, setOnlyDanger] = useState(false);

    /* ---- Search: debounced ---- */
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    /* ---- Stale-response guard ---- */
    const requestSeq = useRef(0);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(search);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    /* ---- Fetch ---- */
    const fetchReport = useCallback(async () => {
        const seq = ++requestSeq.current;

        setLoading(true);
        setError(null);

        try {
            const res = await retailersApi.getLowStockReportAction({
                cover_days: coverDays,
                only_danger: onlyDanger || undefined,
                search: debouncedSearch.trim() || undefined,
                include_offers: true,
            });

            // A newer request started since this one — drop the
            // response so it can't overwrite fresher state.
            if (seq !== requestSeq.current) return;

            const body = res.data as any;
            if (body?.response_code === 0 && body.report) {
                setReport(body.report);
            } else {
                setError(body?.response_message ?? 'Could not build report');
            }
        } catch (e: any) {
            if (seq !== requestSeq.current) return;
            setError(e?.message ?? 'Network error');
        } finally {
            if (seq === requestSeq.current) {
                setLoading(false);
            }
        }
    }, [coverDays, onlyDanger, debouncedSearch]);

    useEffect(() => {
        void fetchReport();
    }, [fetchReport]);

    const onRefresh = useCallback(() => {
        void fetchReport();
    }, [fetchReport]);

    const common = {
        report,
        loading,
        error,
        coverDays,
        onCoverDaysChange: setCoverDays,
        onlyDanger,
        onOnlyDangerToggle: () => setOnlyDanger((v) => !v),
        search,
        onSearchChange: setSearch,
        onRefresh,
    };

    return isLarge ? (
        <LowStockReportWebView {...common} />
    ) : (
        <LowStockReportMobileView {...common} />
    );
};

export default LowStockReport;