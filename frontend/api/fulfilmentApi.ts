// api/fulfilmentApi.ts
//
// Preparing paid orders — POST /logistics/fulfilment (backend logistics/views.py
// fulfilmentAPIView, logic in logistics/utils/fulfilment.py).
//
//   PAID -> PREPARING -> PACKED -> READY -> COLLECTED (pickup) | dispatch (delivery)
//
// Seller: GetFulfilmentQueue, StartPreparing, MarkPacked, MarkReady, ConfirmCollection
// Both:   GetFulfilment (the buyer also gets the pickup code once READY)

import { ApiResponse } from 'apisauce';

import client from './client';
import type { OrderLink } from './deliveriesApi';

export type FulfilmentStage = 'PENDING' | 'PREPARING' | 'PACKED' | 'READY' | 'COLLECTED';
export type FulfilmentKind = 'retailer' | 'customer';

export interface Fulfilment {
    id: string;
    stage: FulfilmentStage;
    prepared_by_name: string | null;
    preparing_at: string | null;
    packed_by_name: string | null;
    packed_at: string | null;
    package_count: number;
    package_weight_kg: string | null;
    ready_at: string | null;
    collector_name: string | null;
    collector_phone: string | null;
    collector_id_number: string | null;
    code_verified: boolean;
    handed_over_by_name: string | null;
    collected_at: string | null;
    notes: string | null;
    /** Buyer only, while the order waits at the counter. */
    pickup_code?: string | null;
}

export interface FulfilmentQueueRow {
    kind: FulfilmentKind;
    order_id: string;
    reference: string;
    buyer: string;
    buyer_phone: string | null;
    items: number;
    total: string;
    order_status: string;
    fulfilment_method: 'PICKUP' | 'DELIVERY';
    shipment_status: string | null;
    stage: FulfilmentStage;
    created: string | null;
    fulfilment: Fulfilment | null;
}

export const STAGE_LABELS: Record<FulfilmentStage, string> = {
    PENDING: 'Waiting',
    PREPARING: 'Preparing',
    PACKED: 'Packed',
    READY: 'Ready',
    COLLECTED: 'Collected',
};

const ENDPOINT = '/logistics/fulfilment';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export const linkOf = (kind: FulfilmentKind, orderId: string): OrderLink =>
    kind === 'customer' ? { customer_order: orderId } : { retailer_order: orderId };

export default {
    getQueue: (kind: FulfilmentKind, scope: 'open' | 'done' = 'open') => call('GetFulfilmentQueue', { kind, scope }),
    get: (link: OrderLink) => call('GetFulfilment', link),
    startPreparing: (link: OrderLink, preparer?: string | null, notes?: string) => call('StartPreparing', { ...link, preparer, notes }),
    markPacked: (link: OrderLink, data: { packer?: string | null; package_count?: number; package_weight_kg?: string }) => call('MarkPacked', { ...link, ...data }),
    markReady: (link: OrderLink) => call('MarkReady', link),
    /** Seller: SMS / push the buyer's pickup code again (same code; once a minute). */
    resendPickupCode: (link: OrderLink) => call('ResendPickupCode', link),
    confirmCollection: (
        link: OrderLink,
        data: { collector_name: string; collector_phone?: string; collector_id_number?: string; pickup_code?: string },
    ) => call('ConfirmCollection', { ...link, ...data }),
};
