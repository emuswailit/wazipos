// api/distributorsApi.ts
//
// The distributor <-> wholesaler trade (backend distributors/api.py, services/):
// distributors sell to wholesalers as wholesalers sell to retailers.
//   /distributors/staff — a distributor's staff: stock, discounts, incoming orders,
//                         payments (any method recorded, or a mobile money prompt),
//                         fulfilment, pickup collection
//   /distributors/buy   — a wholesaler's staff: find distributors, browse, order
//                         remotely, pay by mobile money, receive into stock

import type { ApiResponse } from 'apisauce';

import client from './client';

export type OrderStatus = 'SUBMITTED' | 'PAID' | 'PREPARING' | 'PACKED' | 'READY' | 'COLLECTED' | 'DISPATCHED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';
export type StockScope = 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNLISTED';

export interface QuantityDeal {
    id: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    end: string;
}

export interface DistributorLot {
    id: string;
    distributor: string;
    product: string;
    title: string;
    bar_code: string | null;
    unit_of_receipt: string;
    units_per_pack: number | null;
    current_unit_quantity: number;
    unit_selling_price: string;
    final_unit_selling_price: string;
    discount_unit_selling_price: string;
    batch: string | null;
    expiry_date: string | null;
    quantity_discount: QuantityDeal | null;
    /** Staff only. */
    received_unit_quantity?: number;
    unit_buying_price?: string;
    manufacture_date?: string | null;
    is_listed?: boolean;
    description?: string;
    created?: string | null;
}

export interface Discount {
    id: string;
    kind: 'PRICE' | 'QUANTITY';
    lot: string;
    title: string;
    product_title: string;
    start: string;
    end: string;
    is_active: boolean;
    running: boolean;
    percent?: string;
    normal_price?: string;
    offer_price?: string;
    limit_quantity?: number;
    awarded_quantity?: number;
}

export interface OrderItem {
    id: string;
    lot: string | null;
    product: string | null;
    title: string;
    batch: string | null;
    expiry_date: string | null;
    unit_of_issue: string;
    purchased_quantity: number;
    free_quantity: number;
    total_quantity: number;
    item_price: string;
    item_final_price: string;
    item_price_discount_total: string;
    item_final_price_total: string;
    is_received: boolean;
}

export interface OrderPayment {
    id: string;
    reference_number: string | null;
    amount: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    description: string;
    method: string;
    is_settled: boolean;
    created: string | null;
}

export interface WholesalerOrder {
    id: string;
    reference_number: string;
    status: OrderStatus;
    order_origin: 'WHOLESALER' | 'STAFF';
    order_terms: string;
    delivery_method: 'SELF' | 'COURIER';
    distributor: string;
    distributor_title: string;
    wholesaler: string | null;
    wholesaler_title: string;
    gross_price_total: string;
    discount_total: string;
    final_price_total: string;
    shipping_amount: string;
    amount_due: string;
    is_paid: boolean;
    notes: string;
    rejected_reason: string;
    created: string | null;
    paid_at: string | null;
    collected_at: string | null;
    received_at: string | null;
    items: OrderItem[];
    payments: OrderPayment[];
    /** Delivery orders: the planned / running shipment (logistics). */
    shipment: {
        id: string;
        method: 'LOCAL' | 'COURIER' | 'PICKUP';
        status: string;
        total_cost: string;
        tracking_number: string | null;
        collection_point: string | null;
        /** Buyer only: give it to the last deliverer. */
        delivery_code: string | null;
        delivered_at: string | null;
        legs: { id: string; kind: string; mode: string; status: string; provider_title: string | null; agent_name: string | null; to_title: string | null; distance_km: string; cost: string | null }[];
    } | null;
    fulfilment: {
        stage: 'PENDING' | 'PREPARING' | 'PACKED' | 'READY' | 'COLLECTED';
        package_count: number;
        package_weight_kg: string | null;
        ready_at: string | null;
        collected_at: string | null;
        collector_name: string | null;
        /** Buyer only: show it to collect. */
        pickup_code: string | null;
    } | null;
}

export interface DistributorSummary {
    id: string;
    title: string;
    entity_type: string;
    town: string | null;
    road: string | null;
    phone: string | null;
    distance_km: number | null;
    products_in_stock: number;
    matches: string[];
}

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'primary' | 'neutral' }> = {
    SUBMITTED: { label: 'Awaiting payment', tone: 'warning' },
    PAID: { label: 'Paid', tone: 'primary' },
    PREPARING: { label: 'Preparing', tone: 'info' },
    PACKED: { label: 'Packed', tone: 'info' },
    READY: { label: 'Ready', tone: 'violet' },
    COLLECTED: { label: 'Collected', tone: 'success' },
    DISPATCHED: { label: 'On the way', tone: 'violet' },
    RECEIVED: { label: 'Received', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const post = (path: string) => (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(path, { action, ...data });
const staff = post('/distributors/staff');
const buy = post('/distributors/buy');

/** A distributor's staff. */
export const distributorStaffApi = {
    stock: (scope: StockScope = 'ALL', q?: string) => staff('GetStock', { scope, ...(q ? { q } : {}) }),
    saveLot: (lot: Record<string, any>) => staff('SaveStockLot', lot),
    searchProducts: (q: string) => staff('SearchProducts', { q }),
    discounts: (kind: 'PRICE' | 'QUANTITY') => staff('GetDiscounts', { kind }),
    savePriceDiscount: (d: Record<string, any>) => staff('SavePriceDiscount', d),
    saveQuantityDiscount: (d: Record<string, any>) => staff('SaveQuantityDiscount', d),
    orders: (scope: 'OPEN' | 'DONE' | 'ALL' = 'OPEN', q?: string) => staff('GetOrders', { scope, ...(q ? { q } : {}) }),
    order: (order: string) => staff('GetOrder', { order }),
    searchWholesalers: (q: string) => staff('SearchWholesalers', { q }),
    createOrder: (body: { wholesaler: string; items: { lot: string; quantity: number; discount?: string }[]; order_terms?: 'CASH' | 'CREDIT'; notes?: string; draft_id?: string }) => staff('CreateStaffOrder', body),
    reject: (order: string, reason: string) => staff('RejectOrder', { order, reason }),
    recordPayment: (order: string, payment_method: string, description?: string) => staff('RecordPayment', { order, payment_method, ...(description ? { description } : {}) }),
    requestPayment: (order: string, phone: string) => staff('RequestPayment', { order, phone }),
    fulfil: (order: string, stage: 'PREPARING' | 'PACKED' | 'READY', extra: { package_count?: number; package_weight_kg?: string } = {}) => staff('Fulfil', { order, stage, ...extra }),
    confirmCollection: (order: string, code: string, collector_name?: string, collector_phone?: string) => staff('ConfirmCollection', { order, code, collector_name, collector_phone }),
    refreshPayment: (reference: string) => staff('RefreshPayment', { reference }),
};

/** A wholesaler's staff buying from distributors. */
export const wholesalerBuyApi = {
    discover: (params: { mode?: 'ADJACENT' | 'ALL'; latitude?: number; longitude?: number; radius_km?: number; search?: string; product?: string } = {}) => buy('DiscoverDistributors', params),
    catalogue: (distributor: string, q?: string) => buy('GetCatalogue', { distributor, ...(q ? { q } : {}) }),
    /** Walking / rider / courier options for this cart, priced; collection_point re-prices courier options for that office. */
    deliveryOptions: (distributor: string, items: { lot: string; quantity: number }[], collection_point?: string) =>
        buy('GetDeliveryOptions', { distributor, items, ...(collection_point ? { collection_point } : {}) }),
    placeOrder: (body: { distributor: string; items: { lot: string; quantity: number }[]; delivery_method: 'SELF' | 'COURIER'; delivery_option?: string; notes?: string; draft_id: string }) => buy('PlaceOrder', body),
    orders: (scope: 'OPEN' | 'DONE' | 'ALL' = 'OPEN', q?: string) => buy('GetMyOrders', { scope, ...(q ? { q } : {}) }),
    order: (order: string) => buy('GetOrder', { order }),
    cancel: (order: string) => buy('CancelOrder', { order }),
    pay: (order: string, phone: string) => buy('PayOrder', { order, phone }),
    refreshPayment: (reference: string) => buy('RefreshPayment', { reference }),
    receive: (order: string, lines: { item: string; unit_selling_price: string }[]) => buy('ReceiveOrder', { order, lines }),
};
