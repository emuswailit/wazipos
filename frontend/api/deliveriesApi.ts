// api/deliveriesApi.ts
//
// Deliveries — POST /logistics/deliveries (backend logistics/views.py
// deliveriesAPIView, logic in logistics/utils/deliveries.py).
//
// Buyer:  GetRetailerOrderDeliveryOptions -> ChooseRetailerOrderDelivery (before paying)
// Seller: DispatchRetailerOrder, AssignShipmentLeg, setup (partners, persons, rates)
// Delivery persons / couriers: GetMyDeliveries, UpdateShipmentLeg, ConfirmShipmentCollected

import { ApiResponse } from 'apisauce';

import client from './client';

export type DeliveryMode = 'FOOT' | 'BICYCLE' | 'MOTORBIKE' | 'CAR' | 'VAN' | 'TRUCK' | 'COURIER';
export type LegKind = 'LOCAL' | 'HANDOVER' | 'TRANSIT' | 'LAST_MILE';
export type LegStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'HANDED_OVER' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type ShipmentStatus = 'QUOTED' | 'CONFIRMED' | 'IN_TRANSIT' | 'AWAITING_PICKUP' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface DeliveryOptionLeg {
    kind: LegKind;
    label: string;
    mode: DeliveryMode;
    mode_label: string;
    provider: string | null;
    provider_title: string | null;
    from_title: string | null;
    to_title: string | null;
    distance_km: string;
    cost: string;
}

export interface DeliveryOption {
    key: string;
    method: 'LOCAL' | 'COURIER';
    total: string;
    legs: DeliveryOptionLeg[];
}

export interface DeliveryOptionsResult {
    options: DeliveryOption[];
    chargeable_weight_kg: string;
    /** "PICKUP", "LOCAL", "COURIER" or null when not chosen yet. */
    chosen_method: string | null;
    shipping_amount: string;
}

export interface ShipmentLeg {
    id: string;
    sequence: number;
    kind: LegKind;
    mode: DeliveryMode;
    status: LegStatus;
    provider: string | null;
    provider_title: string | null;
    agent: string | null;
    agent_name: string | null;
    agent_phone: string | null;
    waybill_number: string | null;
    origin_collection_point_title: string | null;
    destination_collection_point_title: string | null;
    distance_km: string;
    cost: string;
    payout_amount: string;
    is_payable: boolean;
    is_settled: boolean;
    assigned_at: string | null;
    picked_up_at: string | null;
    completed_at: string | null;
}

export interface Shipment {
    id: string;
    entity: string;
    retailer_order: string | null;
    method: 'PICKUP' | 'LOCAL' | 'COURIER';
    status: ShipmentStatus;
    recipient_name: string | null;
    recipient_phone: string | null;
    destination_collection_point_title: string | null;
    chargeable_weight_kg: string;
    distance_km: string;
    total_cost: string;
    tracking_number: string | null;
    /** Only the buyer receives it (they give it to whoever delivers). */
    delivery_code: string | null;
    confirmed_at: string | null;
    delivered_at: string | null;
    legs: ShipmentLeg[];
}

export interface DeliveryPartner {
    id: string;
    partner: string;
    partner_title: string;
    partner_type: string;
    kind: 'DELIVERY_COMPANY' | 'COURIER';
    is_active: boolean;
}

export interface DeliveryAgent {
    id: string;
    entity: string;
    entity_title: string;
    user: string;
    name: string;
    mode: DeliveryMode;
    max_weight_kg: string | null;
    vehicle_registration: string | null;
    phone: string | null;
    is_active: boolean;
}

export interface DeliveryRate {
    id: string;
    mode: DeliveryMode;
    base_fee: string;
    rate_per_km: string;
    rate_per_kg: string;
    min_fee: string;
    max_distance_km: string | null;
    max_weight_kg: string | null;
    is_active: boolean;
}

/** A courier's office / collection point. */
export interface Office {
    id: string;
    title: string;
    code: string | null;
    point_type: 'POST_OFFICE' | 'COURIER_DEPOT' | 'RETAILER_HUB' | 'MTAANI_AGENT' | 'OTHER';
    county: string;
    county_title: string | null;
    physical_address: string | null;
    landmark: string | null;
    phone_number: string | null;
    is_active: boolean;
    latitude: number | null;
    longitude: number | null;
}

/** A finished leg owed to its deliverer (platform payouts). */
export interface PayableLeg extends ShipmentLeg {
    payee: string | null;
    payee_account: { type: string; name: string; number: string; business_number: string | null; bank: string | null; code: string | null } | null;
    order_reference: string | null;
    settled_at: string | null;
    pay_out_reference_number: string | null;
}

/** Which order a shipment belongs to. */
export type OrderLink = { retailer_order: string } | { customer_order: string };

/** A delivery person's open leg (GetMyDeliveries). */
export interface MyDeliveryLeg extends ShipmentLeg {
    shipment: string;
}

const ENDPOINT = '/logistics/deliveries';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export const MODE_LABELS: Record<DeliveryMode, string> = {
    FOOT: 'On foot',
    BICYCLE: 'Bicycle',
    MOTORBIKE: 'Motorbike',
    CAR: 'Car',
    VAN: 'Van / pickup',
    TRUCK: 'Truck',
    COURIER: 'Courier',
};

/** Pull the server's error text out of a response. */
export function apiError(res: any, fallback: string): string {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.problem || fallback;
}

export const isOk = (res: any) => !!res?.ok && String(res?.data?.response_code) === '0';

export default {
    // buyer
    getRetailerOrderDeliveryOptions: (retailer_order: string) => call('GetRetailerOrderDeliveryOptions', { retailer_order }),
    chooseRetailerOrderDelivery: (retailer_order: string, option: string) => call('ChooseRetailerOrderDelivery', { retailer_order, option }),
    /** Shopper at checkout: options from the shop to their location. */
    getCustomerDeliveryOptions: (data: { entity: string; destination_latitude: number; destination_longitude: number; order_items: { retailer_receipt: string; purchased_quantity: number }[] }) =>
        call('GetCustomerDeliveryOptions', data),
    // both sides
    getShipment: (link: OrderLink) => call('GetShipment', link),
    // seller
    dispatchOrder: (link: OrderLink, agent: string) => call('DispatchOrder', { ...link, agent }),
    assignShipmentLeg: (leg: string, agent: string) => call('AssignShipmentLeg', { leg, agent }),
    getDeliveryPartners: () => call('GetDeliveryPartners'),
    saveDeliveryPartner: (details: Record<string, any>) => call('SaveDeliveryPartner', { details }),
    /** Own delivery persons, or (with partner) a partner company's. */
    getDeliveryAgents: (partner?: string) => call('GetDeliveryAgents', partner ? { partner } : {}),
    saveDeliveryAgent: (details: Record<string, any>) => call('SaveDeliveryAgent', { details }),
    getDeliveryRates: () => call('GetDeliveryRates'),
    saveDeliveryRate: (details: Record<string, any>) => call('SaveDeliveryRate', { details }),
    // delivery persons / couriers
    getMyDeliveries: () => call('GetMyDeliveries'),
    updateShipmentLeg: (leg: string, status: LegStatus, extra: { delivery_code?: string; waybill_number?: string } = {}) =>
        call('UpdateShipmentLeg', { leg, status, ...extra }),
    confirmShipmentCollected: (shipment: string, delivery_code: string) => call('ConfirmShipmentCollected', { shipment, delivery_code }),
    // couriers: their offices
    getMyOffices: () => call('GetMyOffices'),
    saveOffice: (details: Record<string, any>) => call('SaveOffice', { details }),
    // platform admins: delivery payouts
    getDeliveryPayouts: (settled = false) => call('GetDeliveryPayouts', { settled }),
    markDeliveryPayoutPaid: (legs: string[], reference: string) => call('MarkDeliveryPayoutPaid', { legs, reference }),
};
