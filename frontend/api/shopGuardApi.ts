// api/shopGuardApi.ts
//
// Owner-away protection (backend shopguard/, /api/v1/shopguard/): staff clock in /
// out with a blind cash count, sales commissions, the owner's watch report and alerts.

import { ApiResponse } from 'apisauce';

import client from './client';

export interface Shift {
    id: string;
    user: string;
    name: string | null;
    is_owner: boolean;
    status: 'OPEN' | 'CLOSED';
    clock_in_at: string;
    clock_out_at: string | null;
    in_inside: boolean | null;
    in_distance_m: number | null;
    out_distance_m: number | null;
    auto_closed: boolean;
    note: string;
    /** Only after the blind count (or to the owner). */
    opening_float?: string;
    counted_cash?: string | null;
    expected_cash?: string;
    cash_variance?: string;
    non_cash_total?: string;
    sales_count?: number;
    sales_total?: string;
}

export interface GuardSettings {
    alerts_enabled: boolean;
    commissions_enabled: boolean;
    geofence_m: number;
    idle_alert_minutes: number;
    unknown_scan_alert: number;
    cash_variance_alert: string;
    alert_phone: string;
    shop_located: boolean;
}

export interface GuardAlert {
    id: string;
    kind: 'IDLE' | 'CASH_VARIANCE' | 'OUTSIDE_SHOP' | 'UNKNOWN_SCANS' | 'LONG_SHIFT' | 'FOUND_STOCK';
    kind_label: string;
    message: string;
    user: string | null;
    read: boolean;
    created: string;
}

export interface PresenceBucket {
    sales_count: number;
    sales_total: string;
    cash_share: number | null;
    staff_hours: number;
    per_staff_hour: string | null;
}

export interface WatchPerson {
    user: string | null;
    name: string;
    sales_count: number;
    sales_total: string;
    cash_total: string;
    away_total: string;
    present_total: string;
    hours: number;
    shifts: number;
    cash_variance: string;
    unknown_scans: number;
    per_hour: string | null;
    cash_share: number | null;
}

export interface WatchReport {
    from: string;
    to: string;
    owner_present: PresenceBucket;
    owner_away: PresenceBucket;
    people: WatchPerson[];
    days: { date: string; sales_total: string; away_total: string; owner_hours: number }[];
    on_shift: Shift[];
    unknown_scans: { barcode: string; user: string | null; context: string; created: string }[];
    alerts: GuardAlert[];
}

export interface CommissionPlan {
    employee: string;
    user: string;
    name: string | null;
    /** Commission is paid into the employee's user payout account. */
    has_payout_account: boolean;
    rate_percent: string;
    monthly_target: string;
    is_active: boolean;
}

export interface CommissionStatement {
    employee: string;
    name: string | null;
    has_payout_account: boolean;
    payout_status: 'AWAITING_PAYMENT' | 'FUNDED' | 'PAID' | null;
    period: string;
    sales_count: number;
    sales_total: string;
    monthly_target: string;
    rate_percent: string;
    amount: string;
    paid: boolean;
    paid_at: string | null;
    reference: string | null;
}

const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post('/shopguard/', { action, ...data });

export default {
    // staff
    getMyShift: () => call('GetMyShift'),
    clockIn: (data: { latitude?: number; longitude?: number; opening_float?: string }) => call('ClockIn', data),
    clockOut: (data: { counted_cash?: string; latitude?: number; longitude?: number; note?: string }) => call('ClockOut', data),
    logUnknownScan: (barcode: string, context = 'POS') => call('LogUnknownScan', { barcode, context }),
    getMyCommission: () => call('GetMyCommission'),
    // owner
    getSettings: () => call('GetGuardSettings'),
    saveSettings: (data: Partial<GuardSettings>) => call('SaveGuardSettings', data),
    getWatchReport: (from?: string, to?: string) => call('GetWatchReport', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    getShifts: (from?: string, to?: string) => call('GetShifts', { ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    getAlerts: () => call('GetAlerts'),
    markAlertsRead: () => call('MarkAlertsRead'),
    getCommissionPlans: () => call('GetCommissionPlans'),
    saveCommissionPlan: (data: { employee: string; rate_percent?: string; monthly_target?: string; is_active?: boolean }) => call('SaveCommissionPlan', data),
    getCommissionStatements: (period: string) => call('GetCommissionStatements', { period }),
    /** One mobile-money prompt for the month's commission; WaziPOS then pays each employee's payout account. */
    payCommissions: (period: string, phone: string, employees?: string[]) => call('PayCommissions', { period, phone, ...(employees?.length ? { employees } : {}) }),
    refreshCommissionPayment: (reference: string) => call('RefreshCommissionPayment', { reference }),
};
