// components/retailers/reports/profitAndLoss/ProfitAndLossReport.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import retailersApi from '@/api/retailersApi';

import { ProfitAndLossReportMobileView } from './ProfitAndLossReportMobileView';
import { ProfitAndLossReportWebView } from './ProfitAndLossReportWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;

/* =========================================================
 * Types — match the backend report envelope
 * ======================================================= */

export interface PlRevenue {
    orders_count: number;
    gross_sales: string;
    tax_collected: string;
    discounts: string;
    shipping_charged: string;
    net_sales: string;
    returns_value: string;
    net_revenue: string;
    paid_total: string;
}

export interface PlExpenseCategory {
    category_id: string | null;
    category: string;
    amount: string;
    count: number;
}

export interface PlCogs {
    sold_cost: string;
    returned_cost: string;
    net_cogs: string;
    units_sold: string;
    units_returned: string;
    expense_categories: PlExpenseCategory[];
    expense_categories_total: string;
    total: string;
}

interface PlPaymentFees {
    fees: string;
    transactions: number;
}

interface PlWriteOffBreakdown {
    reason: string;
    cost: string;
    quantity: number;
}

interface PlWriteOffs {
    total_cost: string;
    total_quantity: number;
    breakdown: PlWriteOffBreakdown[];
}

export interface PlOperatingExpenses {
    categories: PlExpenseCategory[];
    categories_total: string;
    payment_fees: PlPaymentFees;
    inventory_write_offs: PlWriteOffs;
    total: string;
}

export interface PlStockPosition {
    units: number;
    cost_value: string;
    retail_value: string;
}

export interface ProfitAndLossData {
    period: { from: string; to: string; days: number };
    entity: { id: string; title: string };
    revenue: PlRevenue;
    cogs: PlCogs;
    gross_profit: string;
    gross_margin_percent: string;
    operating_expenses: PlOperatingExpenses;
    net_profit: string;
    net_margin_percent: string;
    stock_position: PlStockPosition;
}

/* =========================================================
 * Period helpers
 * ======================================================= */

export type PeriodPreset =
    | 'THIS_MONTH'
    | 'LAST_MONTH'
    | 'THIS_YEAR'
    | 'CUSTOM';

function presetRange(preset: PeriodPreset): {
    from: string;
    to: string;
} {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate(),
        ).padStart(2, '0')}`;

    switch (preset) {
        case 'THIS_MONTH':
            return {
                from: iso(new Date(y, m, 1)),
                to: iso(new Date(y, m + 1, 0)),
            };
        case 'LAST_MONTH':
            return {
                from: iso(new Date(y, m - 1, 1)),
                to: iso(new Date(y, m, 0)),
            };
        case 'THIS_YEAR':
            return {
                from: iso(new Date(y, 0, 1)),
                to: iso(new Date(y, 11, 31)),
            };
        default:
            return { from: '', to: '' };
    }
}

/* =========================================================
 * Shell
 * ======================================================= */

const ProfitAndLossReport: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [report, setReport] = useState<ProfitAndLossData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const initial = presetRange('THIS_MONTH');
    const [from, setFrom] = useState(initial.from);
    const [to, setTo] = useState(initial.to);
    const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await retailersApi.getProfitAndLossAction({
                from: from || undefined,
                to: to || undefined,
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
    }, [from, to]);

    useEffect(() => {
        void fetchReport();
    }, [fetchReport]);

    const onRefresh = useCallback(() => {
        void fetchReport();
    }, [fetchReport]);

    const onPresetChange = useCallback((next: PeriodPreset) => {
        setPreset(next);
        if (next === 'CUSTOM') return;
        const r = presetRange(next);
        setFrom(r.from);
        setTo(r.to);
    }, []);

    const onFromChange = useCallback((v: string) => {
        setFrom(v);
        setPreset('CUSTOM');
    }, []);

    const onToChange = useCallback((v: string) => {
        setTo(v);
        setPreset('CUSTOM');
    }, []);

    const common = {
        report,
        loading,
        error,
        from,
        onFromChange,
        to,
        onToChange,
        preset,
        onPresetChange,
        onRefresh,
    };

    return isLarge ? (
        <ProfitAndLossReportWebView {...common} />
    ) : (
        <ProfitAndLossReportMobileView {...common} />
    );
};

export default ProfitAndLossReport;