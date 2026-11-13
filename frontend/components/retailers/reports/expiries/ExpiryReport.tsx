// components/retailers/reports/expiries/ExpiryReport.tsx

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';

import { ExpiryReportMobileView } from './ExpiryReportMobileView';
import { ExpiryReportWebView } from './ExpiryReportWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const SEARCH_DEBOUNCE_MS = 400;

/* =========================================================
 * Types
 * ======================================================= */

export type ExpiryBucket =
    | 'EXPIRED'
    | '0_7'
    | '8_30'
    | '31_60'
    | '61_90'
    | '91_PLUS';

export interface ExpiryKPI {
    total_batches: number;
    total_units: number;
    cost_value_at_risk: string;
    retail_value_at_risk: string;
    expired_batches: number;
    expired_units: number;
    expired_cost_value: string;
    urgent_batches: number;
    urgent_units: number;
    urgent_cost_value: string;
}

export interface ExpiryBucketRow {
    key: ExpiryBucket;
    label: string;
    batches: number;
    units: number;
    cost_value: string;
    retail_value: string;
}

export interface ExpiryWholesalerRow {
    wholesaler_id: string | null;
    wholesaler_title: string;
    batches: number;
    units: number;
    cost_value: string;
}

export interface ExpiryReceiptRow {
    id: string;
    product_id: string | null;
    product_title: string;
    batch: string;
    supplier_invoice: string;
    expiry_date: string;
    days_until_expiry: number;
    bucket: ExpiryBucket;
    quantity: number;
    unit_cost: string;
    cost_value: string;
    retail_value: string;
    wholesaler_id: string | null;
    wholesaler_title: string;
}

export interface ExpiryReportData {
    period: { as_of: string; window_days: number };
    filters: {
        bucket: ExpiryBucket | null;
        product: string | null;
        wholesaler: string | null;
        search: string | null;
    };
    entity: { id: string; title: string };
    kpi: ExpiryKPI;
    buckets: ExpiryBucketRow[];
    wholesaler_breakdown: ExpiryWholesalerRow[];
    receipts: ExpiryReceiptRow[];
}

/* =========================================================
 * Shell
 * ======================================================= */

const ExpiryReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [report, setReport] = useState<ExpiryReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [days, setDays] = useState(90);
    const [bucket, setBucket] = useState<ExpiryBucket | 'ALL'>('ALL');

    // Raw value from the input — what the user is currently typing.
    const [search, setSearch] = useState('');
    // Debounced value actually sent to the server.
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Monotonic request counter. Only the response matching the
    // latest issued request is allowed to update state — prevents an
    // older slow response from overwriting a newer fast one.
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
            const res = await retailersApi.getExpiryReportAction({
                days,
                bucket: bucket === 'ALL' ? undefined : bucket,
                search: debouncedSearch.trim() || undefined,
            });

            // A newer request has been issued since this one started.
            // Drop the response — the newer one owns the state.
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
    }, [days, bucket, debouncedSearch]);

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
        days,
        onDaysChange: setDays,
        bucket,
        onBucketChange: setBucket,
        search,
        onSearchChange: setSearch,
        onRefresh,
    };

    return isLarge ? (
        <ExpiryReportWebView {...common} />
    ) : (
        <ExpiryReportMobileView {...common} />
    );
};

export default ExpiryReport;