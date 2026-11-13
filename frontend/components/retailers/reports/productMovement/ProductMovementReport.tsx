// components/retailers/reports/productMovement/ProductMovementReport.tsx

import { useLocalSearchParams } from 'expo-router';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import type { ProductMovementType } from '@/api/retailersApi';
import retailersApi from '@/api/retailersApi';
import { useProductsSync } from '@/context/ProductsSyncContext';

import { ProductMovementMobileView } from './ProductMovementMobileView';
import {
    ProductMovementWebView,
    type ProductOptionLike,
} from './ProductMovementWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const DEFAULT_LOOKBACK_DAYS = 30;

/* =========================================================
 * Types
 * ======================================================= */

export interface MovementRow {
    datetime: string;
    date: string;
    type: ProductMovementType;
    direction: 'IN' | 'OUT';
    quantity: number;
    signed_quantity: number;
    reference: string;
    batch: string;
    expiry_date: string | null;
    note: string;
    user_id: string | null;
    source_id: string;
    source_type: string;
    receipt_id: string;
    balance_after: number;
    order_id?: string | null;
    return_intent?: string;
}

export interface DailySummaryRow {
    date: string;
    in: number;
    out: number;
    net: number;
    balance: number;
}

export interface ReceiptBreakdownRow {
    receipt_id: string;
    batch: string;
    expiry_date: string | null;
    received: number;
    sold: number;
    current: number;
    is_active: boolean;
}

export interface MovementKPIs {
    opening_balance: number;
    closing_balance: number;
    total_in: number;
    total_out: number;
    net_change: number;
    movement_count: number;
    receipts_count: number;
    sales_count: number;
    adjustments_count: number;
}

export interface ProductMovementReportData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    product: {
        id: string;
        title: string;
        category: string | null;
        current_stock: number;
        receipt_count: number;
    };
    filters: {
        retailer_receipt: string | null;
        movement_types: ProductMovementType[] | null;
    };
    kpi: MovementKPIs;
    movements: MovementRow[];
    daily_summary: DailySummaryRow[];
    receipt_breakdown: ReceiptBreakdownRow[];
}

/* =========================================================
 * Movement type options
 * ======================================================= */

const MOVEMENT_TYPE_OPTIONS: Array<{
    value: ProductMovementType;
    label: string;
    tint: string;
}> = [
        { value: 'RECEIPT', label: 'Receipt', tint: '#10b981' },
        { value: 'SALE', label: 'Sale', tint: '#0ea5e9' },
        { value: 'ADJUSTMENT', label: 'Adjustment', tint: '#64748b' },
        { value: 'CORRECTION', label: 'Correction', tint: '#94a3b8' },
        { value: 'EXPIRY_WRITE_OFF', label: 'Expired', tint: '#dc2626' },
        { value: 'DAMAGE_WRITE_OFF', label: 'Damaged', tint: '#ea580c' },
        { value: 'WHOLESALER_RETURN', label: 'To wholesaler', tint: '#f59e0b' },
        { value: 'CUSTOMER_RETURN', label: 'From customer', tint: '#8b5cf6' },
    ];

/* =========================================================
 * Date helpers
 * ======================================================= */

function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

/* =========================================================
 * ID + title readers — mirror the view's shape adapter
 * ======================================================= */

function readId(raw: any): string {
    return String(
        raw?.remote_id ?? raw?.product_id ?? raw?.id ?? '',
    ).trim();
}

function readTitle(raw: any): string {
    return (
        raw?.title ??
        raw?.product_title ??
        raw?.long_title ??
        raw?.product_name ??
        'Unknown product'
    );
}

/* =========================================================
 * Shell
 * ======================================================= */

const ProductMovementReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const params = useLocalSearchParams<{
        product?: string;
        title?: string;
    }>();

    /* ---- Catalog from products context ---- */
    const { productsList } = useProductsSync();

    /* Pass raw items through. The view's readOption() adapter handles
       any of: db ProductItem, admin ProductItem, or the legacy shape. */
    const productOptions = useMemo<ProductOptionLike[]>(
        () =>
            (productsList as unknown as ProductOptionLike[]).filter(
                (p) => readId(p) !== '',
            ),
        [productsList],
    );

    const pickerLoading = productsList.length === 0;

    /* ---- Selected product ---- */
    const [productId, setProductId] = useState<string | null>(
        params.product ?? null,
    );
    const [productTitle, setProductTitle] = useState<string | null>(
        params.title ?? null,
    );

    /* ---- Report ---- */
    const [report, setReport] =
        useState<ProductMovementReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ---- Filters ---- */
    const [from, setFrom] = useState(isoDaysAgo(DEFAULT_LOOKBACK_DAYS));
    const [to, setTo] = useState(todayISO());
    const [activeTypes, setActiveTypes] = useState<ProductMovementType[]>(
        [],
    );

    /* ---- Stale-response guard ---- */
    const requestSeq = useRef(0);

    /* ---- Fetch report ---- */
    const fetchReport = useCallback(async () => {
        if (!productId) return;

        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);

        try {
            const res = await retailersApi.getProductMovementReportAction({
                product: productId,
                from: from || undefined,
                to: to || undefined,
                movement_types:
                    activeTypes.length > 0 ? activeTypes : undefined,
            });

            if (seq !== requestSeq.current) return;

            const body = res.data as any;
            if (body?.response_code === 0 && body.report) {
                setReport(body.report);
                if (!productTitle && body.report.product?.title) {
                    setProductTitle(body.report.product.title);
                }
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
    }, [productId, from, to, activeTypes, productTitle]);

    useEffect(() => {
        void fetchReport();
    }, [fetchReport]);

    const onRefresh = useCallback(() => {
        void fetchReport();
    }, [fetchReport]);

    /* ---- Selection ---- */
    const onSelectProduct = useCallback((opt: ProductOptionLike) => {
        const id = readId(opt);
        if (!id) return;
        setProductId(id);
        setProductTitle(readTitle(opt));
        setReport(null);
        setError(null);
    }, []);

    const onClearProduct = useCallback(() => {
        setProductId(null);
        setProductTitle(null);
        setReport(null);
        setError(null);
    }, []);

    /* ---- Filters ---- */
    const onToggleType = useCallback((t: ProductMovementType) => {
        setActiveTypes((prev) =>
            prev.includes(t)
                ? prev.filter((x) => x !== t)
                : [...prev, t],
        );
    }, []);

    const onClearTypes = useCallback(() => setActiveTypes([]), []);

    const onResetPeriod = useCallback(() => {
        setFrom(isoDaysAgo(DEFAULT_LOOKBACK_DAYS));
        setTo(todayISO());
    }, []);

    /* ---- Shared props ---- */
    const common = {
        productId,
        productTitle,
        onClearProduct,

        productOptions,
        pickerLoading,
        onSelectProduct,

        report,
        loading,
        error,

        from,
        onFromChange: setFrom,
        to,
        onToChange: setTo,
        activeTypes,
        onToggleType,
        onClearTypes,
        onResetPeriod,
        typeOptions: MOVEMENT_TYPE_OPTIONS,

        onRefresh,
    };

    return isLarge ? (
        <ProductMovementWebView {...common} />
    ) : (
        <ProductMovementMobileView {...common} />
    );
};

export default ProductMovementReport;