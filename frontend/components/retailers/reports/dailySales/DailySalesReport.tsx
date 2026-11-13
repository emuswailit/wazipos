// components/retailers/reports/dailySales/DailySalesReport.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';

import { DailySalesReportMobileView } from './DailySalesReportMobileView';
import { DailySalesReportWebView } from './DailySalesReportWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;

/* =========================================================
 * Types — match the backend report envelope
 * ======================================================= */

export interface DailySalesKPI {
    orders_count: number;
    gross_sales: string;
    tax_total: string;
    discount_total: string;
    shipping_total: string;
    net_sales: string;
    paid_total: string;
    balance_due_total: string;
    units_sold: string;
    returns_count: number;
    units_returned: string;
    returns_value: string;
    net_after_returns: string;
    receipts_on_hand_units: number;
    receipts_on_hand_value: string;
}

export interface OriginCount {
    order_origin: string;
    orders_count: number;
    net: string;
    paid: string;
}

export interface ChannelCount {
    order_channel: string;
    orders_count: number;
    net: string;
}

export interface PaymentRow {
    payment_method_id: string | null;
    payment_method_title: string;
    orders_count: number;
    gross?: string;
    net: string;
    paid: string;
}

export interface CollectionRow {
    payment_method_id: string | null;
    payment_method_title: string;
    transactions: number;
    collected: string;
}

export interface OriginPaymentRow {
    order_origin: string;
    summary: { orders_count: number; net: string; paid: string };
    methods: PaymentRow[];
}

export interface ProductRow {
    product_id: string;
    product_title: string;
    sold_quantity: string;
    gross_value: string;
    net_value: string;
    order_count: number;
    returned_quantity: number;
    return_count: number;
    net_quantity: string;
    current_stock: number;
    stock_value: string;
}

export interface DailySalesTotals {
    sold_quantity: string;
    gross_value: string;
    net_value: string;
    returned_quantity: string;
    current_stock: number;
    stock_value: string;
}

export interface DailySalesReportData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    filters: { include_cancelled: boolean };
    kpi: DailySalesKPI;
    origin_counts: OriginCount[];
    channel_counts: ChannelCount[];
    payment_breakdown: PaymentRow[];
    collections_breakdown: CollectionRow[];
    origin_payment_breakdown: OriginPaymentRow[];
    product_breakdown: ProductRow[];
    totals: DailySalesTotals;
}

/* =========================================================
 * Shell
 * ======================================================= */

const DailySalesReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [report, setReport] = useState<DailySalesReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [includeCancelled, setIncludeCancelled] = useState(false);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await retailersApi.getDailySalesReportAction({
                from: from || undefined,
                to: to || undefined,
                include_cancelled: includeCancelled,
            });
            const body = res.data as any;
            if (body?.response_code === 0 && body.report) {
                setReport(body.report);
            } else {
                setError(body?.response_message ?? 'Could not build report');
            }
        } catch (e: any) {
            setError(e?.message ?? 'Network error');
        } finally {
            setLoading(false);
        }
    }, [from, to, includeCancelled]);

    useEffect(() => {
        void fetchReport();
    }, [fetchReport]);

    const onRefresh = useCallback(() => {
        void fetchReport();
    }, [fetchReport]);

    const onClearPeriod = useCallback(() => {
        setFrom('');
        setTo('');
    }, []);

    const onToggleCancelled = useCallback(() => {
        setIncludeCancelled((v) => !v);
    }, []);

    const common = {
        report,
        loading,
        error,
        from,
        onFromChange: setFrom,
        to,
        onToChange: setTo,
        includeCancelled,
        onToggleCancelled,
        onClearPeriod,
        onRefresh,
        exporting: false,
        onExportExcel: () => undefined,
        onExportPdf: () => undefined,
    };

    return isLarge ? (
        <DailySalesReportWebView {...common} />
    ) : (
        <DailySalesReportMobileView {...common} />
    );
};

export default DailySalesReport;