// api/manufacturersApi.ts
//
// The manufacturer <-> distributor trade (backend manufacturers/api.py, services/).
// Products are the source: a manufacturer keeps its product master, makes batches,
// and sells them to distributors, as distributors sell to wholesalers.
//   /manufacturers/staff — a manufacturer's staff: products, batches (stock),
//                          discounts, incoming orders, payments, fulfilment, collection
//   /manufacturers/buy   — a distributor's staff: find manufacturers, browse, order
//                          remotely, pay by mobile money, receive into stock

import type { ApiResponse } from 'apisauce';

import client from './client';

export type OrderStatus = 'SUBMITTED' | 'PAID' | 'PREPARING' | 'PACKED' | 'READY' | 'COLLECTED' | 'DISPATCHED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';
export type StockScope = 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNLISTED' | 'EXPIRING';
export type ProductScope = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'NO_WEIGHT';

export interface QuantityDeal {
    id: string;
    title: string;
    limit_quantity: number;
    awarded_quantity: number;
    end: string;
}

/** A product in the manufacturer's master (products.Products, manufacturer = us). */
export interface ManufacturerProduct {
    id: string;
    title: string;
    packaging: string;
    bar_code: string | null;
    category: string | null;
    category_title: string | null;
    sub_category: string | null;
    sub_category_title: string | null;
    description: string | null;
    units_per_pack: number | null;
    is_vatable: boolean;
    is_pom: boolean;
    preparation: string | null;
    preparation_title: string | null;
    weight_kg: string;
    pack_weight_kg: string | null;
    length_cm: string | null;
    width_cm: string | null;
    height_cm: string | null;
    weight_captured: boolean;
    allowed_entities: string[];
    active: boolean;
    batches: number;
    units_in_stock: number;
    /** Businesses stocking it now, down the chain. */
    reach: { distributors: number; wholesalers: number; retailers: number };
    created: string | null;
}

/** A production batch (stock) as the screens use it. */
export interface ManufacturerLot {
    id: string;
    manufacturer: string;
    product: string;
    title: string;
    packaging?: string;
    bar_code: string | null;
    units_per_pack: number | null;
    is_drug?: boolean;
    batch: string | null;
    manufacture_date?: string | null;
    expiry_date: string | null;
    unit_of_issue: string;
    packs_per_unit: number;
    current_quantity: number;
    unit_price: string;
    final_unit_price: string;
    discount_unit_price: string;
    minimum_order_quantity: number;
    quantity_discount: QuantityDeal | null;
    /** Staff only. */
    produced_quantity?: number;
    unit_cost?: string;
    is_listed?: boolean;
    description?: string;
    created?: string | null;
}

export interface Discount {
    id: string;
    kind: 'PRICE' | 'QUANTITY';
    lot: string;
    batch_id: string;
    batch: string;
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
    batch_id: string;
    product: string;
    title: string;
    batch: string | null;
    expiry_date: string | null;
    unit_of_issue: string;
    packs_per_unit: number;
    purchased_quantity: number;
    free_quantity: number;
    total_quantity: number;
    item_price: string;
    item_final_price: string;
    item_discount_total: string;
    item_total: string;
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

/** A distributor's order on a manufacturer. */
export interface DistributorOrder {
    id: string;
    reference_number: string;
    status: OrderStatus;
    order_origin: 'DISTRIBUTOR' | 'STAFF';
    order_terms: string;
    delivery_method: 'SELF' | 'COURIER';
    manufacturer: string;
    manufacturer_title: string;
    distributor: string | null;
    distributor_title: string;
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
    delivered_at?: string | null;
    received_at: string | null;
    items: OrderItem[];
    payments: OrderPayment[];
    shipment: {
        id: string;
        method: 'LOCAL' | 'COURIER' | 'PICKUP';
        status: string;
        total_cost: string;
        tracking_number: string | null;
        collection_point: string | null;
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
        pickup_code: string | null;
    } | null;
}

export interface ManufacturerSummary {
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
const staff = post('/manufacturers/staff');
const buy = post('/manufacturers/buy');

/** The screens send `lot` for a batch; the backend calls it batch_id. */
const withBatch = ({ lot, ...rest }: Record<string, any>) => ({ ...rest, ...(lot ? { batch_id: lot } : {}) });

/** A manufacturer's staff. */
export const manufacturerStaffApi = {
    // products: the source
    productLookups: () => staff('GetProductLookups'),
    products: (scope: ProductScope = 'ALL', q?: string) => staff('GetMyProducts', { scope, ...(q ? { q } : {}) }),
    saveProduct: (p: Record<string, any>) => staff('SaveProduct', p),
    searchPreparations: (q: string) => staff('SearchPreparations', { q }),
    /** Our own products, for a new batch. */
    searchProducts: async (q: string) => {
        const res: any = await staff('GetMyProducts', { q, scope: 'ACTIVE' });
        if (res?.data?.products) res.data.products = res.data.products.map((p: ManufacturerProduct) => ({ id: p.id, title: p.title, bar_code: p.bar_code }));
        return res;
    },
    // batches (stock)
    stock: async (scope: StockScope = 'ALL', q?: string) => {
        const res: any = await staff('GetBatches', { scope, ...(q ? { q } : {}) });
        if (res?.data && res.data.batches && !res.data.stock) res.data.stock = res.data.batches;
        return res;
    },
    saveLot: (lot: Record<string, any>) => staff('SaveBatch', withBatch(lot)),
    discounts: (kind: 'PRICE' | 'QUANTITY') => staff('GetDiscounts', { kind }),
    savePriceDiscount: (d: Record<string, any>) => staff('SavePriceDiscount', withBatch(d)),
    saveQuantityDiscount: (d: Record<string, any>) => staff('SaveQuantityDiscount', withBatch(d)),
    // orders
    orders: (scope: 'OPEN' | 'DONE' | 'ALL' = 'OPEN', q?: string) => staff('GetOrders', { scope, ...(q ? { q } : {}) }),
    order: (order: string) => staff('GetOrder', { order }),
    searchDistributors: (q: string) => staff('SearchDistributors', { q }),
    createOrder: (body: { distributor: string; items: { batch_id: string; quantity: number; discount?: string }[]; order_terms?: 'CASH' | 'CREDIT'; notes?: string; draft_id?: string }) => staff('CreateStaffOrder', body),
    reject: (order: string, reason: string) => staff('RejectOrder', { order, reason }),
    recordPayment: (order: string, payment_method: string, description?: string) => staff('RecordPayment', { order, payment_method, ...(description ? { description } : {}) }),
    requestPayment: (order: string, phone: string) => staff('RequestPayment', { order, phone }),
    fulfil: (order: string, stage: 'PREPARING' | 'PACKED' | 'READY', extra: { package_count?: number; package_weight_kg?: string } = {}) => staff('Fulfil', { order, stage, ...extra }),
    confirmCollection: (order: string, code: string, collector_name?: string, collector_phone?: string) => staff('ConfirmCollection', { order, code, collector_name, collector_phone }),
    refreshPayment: (reference: string) => staff('RefreshPayment', { reference }),
};

/** A distributor's staff buying from manufacturers. */
export const distributorBuyApi = {
    discover: (params: { mode?: 'ADJACENT' | 'ALL'; latitude?: number; longitude?: number; radius_km?: number; search?: string; product?: string } = {}) => buy('DiscoverManufacturers', params),
    catalogue: (manufacturer: string, q?: string) => buy('GetCatalogue', { manufacturer, ...(q ? { q } : {}) }),
    deliveryOptions: (manufacturer: string, items: { batch_id: string; quantity: number }[], collection_point?: string) =>
        buy('GetDeliveryOptions', { manufacturer, items, ...(collection_point ? { collection_point } : {}) }),
    placeOrder: (body: { manufacturer: string; items: { batch_id: string; quantity: number }[]; delivery_method: 'SELF' | 'COURIER'; delivery_option?: string; notes?: string; draft_id: string }) => buy('PlaceOrder', body),
    orders: (scope: 'OPEN' | 'DONE' | 'ALL' = 'OPEN', q?: string) => buy('GetMyOrders', { scope, ...(q ? { q } : {}) }),
    order: (order: string) => buy('GetOrder', { order }),
    cancel: (order: string) => buy('CancelOrder', { order }),
    pay: (order: string, phone: string) => buy('PayOrder', { order, phone }),
    refreshPayment: (reference: string) => buy('RefreshPayment', { reference }),
    receive: (order: string, lines: { item: string; unit_selling_price: string }[]) => buy('ReceiveOrder', { order, lines }),
};
