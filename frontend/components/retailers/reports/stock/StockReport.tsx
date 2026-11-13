// components/retailers/reports/stock/StockReport.tsx

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';

import { StockReportMobileView } from './StockReportMobileView';
import { StockReportWebView } from './StockReportWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const SEARCH_DEBOUNCE_MS = 400;

/* =========================================================
 * Types
 * ======================================================= */

export interface StockKPI {
    sku_count: number;
    batch_count: number;
    total_units: number;
    cost_value: string;
    retail_value: string;
    potential_margin: string;
    margin_percent: string;
    dead_sku_count: number;
    expiring_within_30: number;
    already_expired: number;
    cost_basis_missing_count?: number;
}

export interface StockCategoryRow {
    category_id: string | null;
    category: string;
    sku_count: number;
    units: number;
    cost_value: string;
    retail_value: string;
    margin: string;
    margin_percent: string;
}

export interface StockProductRow {
    product_id: string;
    product_title: string;
    category_id: string | null;
    category: string;
    sub_category_id: string | null;
    sub_category: string;
    units: number;
    receipt_count: number;
    unit_cost: string;
    cost_value: string;
    retail_value: string;
    margin: string;
    margin_percent: string;
    nearest_expiry: string | null;
    days_to_expiry: number | null;
    last_sale: string | null;
    days_since_sale: number | null;
    is_dead: boolean;
    cost_basis_missing?: boolean;
}

export interface StockReportData {
    period: { as_of: string; dead_days: number };
    filters: {
        category: string | null;
        sub_category: string | null;
        search: string | null;
        dead_only: boolean;
        expiring_within: number | null;
    };
    entity: { id: string; title: string };
    kpi: StockKPI;
    category_rollup: StockCategoryRow[];
    products: StockProductRow[];
}

/* =========================================================
 * Shell
 * ======================================================= */

const StockReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [report, setReport] = useState<StockReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [deadOnly, setDeadOnly] = useState(false);
    const [deadDays, setDeadDays] = useState(30);

    // Raw input value — immediate.
    const [search, setSearch] = useState('');
    // Debounced value — drives the fetch.
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Monotonic sequence to drop stale responses.
    const requestSeq = useRef(0);

    /* -------- Debounce the search input -------- */
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(search);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    /* -------- Fetch -------- */
    const fetchReport = useCallback(async () => {
        const seq = ++requestSeq.current;

        setLoading(true);
        setError(null);

        try {
            const res = await retailersApi.getStockReportAction({
                search: debouncedSearch.trim() || undefined,
                dead_only: deadOnly || undefined,
                dead_days: deadDays,
            });

            // A newer request has been issued. Drop this response.
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
    }, [debouncedSearch, deadOnly, deadDays]);

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
        search,
        onSearchChange: setSearch,
        deadOnly,
        onDeadOnlyToggle: () => setDeadOnly((v) => !v),
        deadDays,
        onDeadDaysChange: setDeadDays,
        onRefresh,
    };

    return isLarge ? (
        <StockReportWebView {...common} />
    ) : (
        <StockReportMobileView {...common} />
    );
};

export default StockReport;