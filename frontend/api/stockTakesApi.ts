// api/stockTakesApi.ts
//
// Stock taking as a WaziPOS service (backend stocktakes/). An agent books it for a
// business — one-off or repeating — with an agreed fee, days, and stocktakers
// (their onboarders) at a daily rate. Stocktakers count blind on those days. The
// vendor pays the fee by mobile money (like a subscription; the agent earns their
// commission), sees counted vs book stock, and approves which lines change stock.
// Admins pay stocktakers for the days they worked.
//   /stocktakes/agent · /stocktakes/stocktaker · /stocktakes/vendor · /stocktakes/admin

import type { ApiResponse } from 'apisauce';

import client from './client';

export type StockTakeStatus = 'SCHEDULED' | 'COUNTING' | 'SUBMITTED' | 'APPLIED' | 'CANCELLED';
export type StockTakeKind = 'ONE_OFF' | 'RECURRING';
export type CountKind = 'PRODUCT' | 'SUPPLY' | 'DRINK';
export type Decision = 'PENDING' | 'APPLIED' | 'KEPT';

export interface Stocktaker {
    id: string;
    onboarder: string;
    name: string;
    phone: string | null;
    days_worked: number;
    daily_rate: string;
    amount_due: string;
    payout_status: 'PENDING' | 'PAID';
    paid_at: string | null;
    payout_reference: string;
    payout_account: { type: string; name: string; number: string; verified: boolean } | null;
}

export interface CountLine {
    id: string;
    kind: CountKind;
    item: string;
    title: string;
    unit: string;
    counted_quantity: string;
    note: string;
    counted_by: string;
    created: string | null;
    /** Not shown to stocktakers (blind count). */
    book_quantity?: string;
    variance?: string;
    unit_cost?: string;
    variance_value?: string;
    decision?: Decision;
    decided_at?: string | null;
}

/** Goods on site that aren't on the business's books (e.g. an employee's own stock). */
export interface FoundItem {
    id: string;
    title: string;
    barcode: string;
    batch_number: string;
    quantity: string;
    price_seen: string | null;
    value_seen: string | null;
    where_found: string;
    note: string;
    photo: string | null;
    recorded_by: string | null;
    created: string;
}

export interface StockTakeReport {
    lines: CountLine[];
    uncounted: { kind: CountKind; item: string; title: string; unit: string; book_quantity: string }[];
    found?: FoundItem[];
    summary: {
        found?: number;
        found_value?: string;
        counted: number;
        matched: number;
        short: number;
        over: number;
        uncounted: number;
        value_short: string;
        value_over: string;
        net_value: string;
        pending: number;
    };
}

export interface StockTake {
    id: string;
    entity: string;
    entity_title: string;
    entity_type: string;
    agent: string;
    agent_name: string;
    kind: StockTakeKind;
    every_days: number | null;
    series: string | null;
    starts_on: string;
    ends_on: string;
    /** Not sent to stocktakers. */
    fee?: string;
    persons: number;
    daily_rate: string;
    status: StockTakeStatus;
    is_paid?: boolean;
    paid_at?: string | null;
    notes: string;
    counted_items: number;
    /** Stocktakers can count today. */
    access_open: boolean;
    submitted_at: string | null;
    reviewed_at: string | null;
    stocktakers: Stocktaker[];
    created: string | null;
    report?: StockTakeReport;
}

export interface StockTakeBooking {
    entity?: string;
    kind?: StockTakeKind;
    every_days?: number;
    starts_on: string;
    ends_on: string;
    fee: string;
    persons: number;
    daily_rate: string;
    stocktakers: string[];
    notes?: string;
}

export interface CountItem {
    kind: CountKind;
    item: string;
    title: string;
    unit: string;
    counted: boolean;
}

export interface StocktakerDue extends Stocktaker {
    stock_take: string;
    entity_title: string;
    starts_on: string;
    ends_on: string;
}

const post = (path: string) => (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(path, { action, ...data });
const agent = post('/stocktakes/agent');
const stocktaker = post('/stocktakes/stocktaker');
const vendor = post('/stocktakes/vendor');
const admin = post('/stocktakes/admin');

export const STATUS_META: Record<StockTakeStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'primary' | 'neutral' }> = {
    SCHEDULED: { label: 'Scheduled', tone: 'info' },
    COUNTING: { label: 'Counting', tone: 'warning' },
    SUBMITTED: { label: 'Awaiting review', tone: 'violet' },
    APPLIED: { label: 'Reviewed', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const agentStockTakesApi = {
    list: (entity?: string) => agent('AgentGetStockTakes', entity ? { entity } : {}),
    create: (booking: StockTakeBooking) => agent('AgentCreateStockTake', booking as any),
    update: (stock_take: string, booking: Partial<StockTakeBooking>) => agent('AgentUpdateStockTake', { stock_take, ...booking }),
    cancel: (stock_take: string) => agent('AgentCancelStockTake', { stock_take }),
    submit: (stock_take: string) => agent('AgentSubmitStockTake', { stock_take }),
    report: (stock_take: string) => agent('AgentGetStockTakeReport', { stock_take }),
    setDaysWorked: (assignment: string, days_worked: number) => agent('AgentSetDaysWorked', { assignment, days_worked }),
    removeCount: (count: string) => agent('AgentRemoveCount', { count }),
    requestPayment: (stock_take: string, phone?: string) => agent('AgentRequestStockTakePayment', { stock_take, ...(phone ? { phone } : {}) }),
};

export const stocktakerApi = {
    jobs: () => stocktaker('StocktakerGetJobs'),
    items: (stock_take: string, q?: string) => stocktaker('StocktakerGetItems', { stock_take, ...(q ? { q } : {}) }),
    count: (stock_take: string, kind: CountKind, item: string, counted: string, note?: string) =>
        stocktaker('StocktakerRecordCount', { stock_take, kind, item, counted, ...(note ? { note } : {}) }),
    myCounts: (stock_take: string) => stocktaker('StocktakerGetMyCounts', { stock_take }),
    /** Something on site that isn't on the books: no matching item, no shop label, or another batch. */
    found: (stock_take: string, details: { title: string; quantity: string; barcode?: string; batch_number?: string; price_seen?: string; where_found?: string; note?: string }) =>
        stocktaker('StocktakerRecordFoundItem', { stock_take, ...details }),
    myFound: (stock_take: string) => stocktaker('StocktakerGetMyFoundItems', { stock_take }),
};

export const vendorStockTakesApi = {
    list: () => vendor('VendorGetStockTakes'),
    report: (stock_take: string) => vendor('VendorGetStockTakeReport', { stock_take }),
    pay: (stock_take: string, phone: string) => vendor('VendorPayStockTake', { stock_take, phone }),
    decideAll: (stock_take: string, decision: 'APPLY' | 'KEEP') => vendor('VendorDecide', { stock_take, all: decision }),
    decideLines: (stock_take: string, lines: { count: string; decision: 'APPLY' | 'KEEP' }[]) => vendor('VendorDecide', { stock_take, lines }),
};

export const adminStockTakesApi = {
    list: (status?: StockTakeStatus) => admin('AdminGetStockTakes', status ? { status } : {}),
    dues: (status?: 'PENDING' | 'PAID') => admin('AdminGetStocktakerDues', status ? { status } : {}),
    markPaid: (assignments: string[], reference?: string) => admin('AdminMarkStocktakerDuesPaid', { assignments, ...(reference ? { reference } : {}) }),
};
