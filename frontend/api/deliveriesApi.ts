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
    /** Shopper checkout: walking delivery (under 5 km), rider, or long-haul courier (over 20 km). */
    group?: 'WALK' | 'RIDER' | 'VEHICLE' | 'COURIER';
    group_label?: string;
    /** Road km from the shop to the shopper. */
    distance_km?: string;
    /** What the price is based on: chargeable kg (actual or packaging volume) and the goods' value. */
    chargeable_weight_kg?: string;
    cargo_value?: string;
    /** Courier: days office to office (from its rate chart). */
    lead_time_days?: number;
    /** Long-haul: the courier, the office the buyer collects from, and other offices near them. */
    courier?: string;
    courier_title?: string;
    collection_point?: { id: string; title: string };
    collection_points?: { id: string; title: string; distance_km: string }[];
}

/** Who the seller can send on a leg: own delivery persons or a partner's riders. */
export interface AllocatableAgent {
    agent: string;
    name: string;
    phone: string | null;
    mode: DeliveryMode;
    mode_label: string;
    provider: string;
    provider_title: string;
    own: boolean;
    /** Platform riders / drivers: km from the pickup point, and whether that's where they are now (else their base). */
    km_away?: string | null;
    live_location?: boolean;
    /** What this leg pays them. */
    cost: string;
    ok: boolean;
    reason: string | null;
    /** Fleet: the vehicle this driver would take, and the trip loading on it. */
    vehicle?: string | null;
    vehicle_label?: string | null;
    vehicle_on_trip?: boolean;
    trip?: string | null;
}

export type VehicleKind = 'BICYCLE' | 'MOTORBIKE' | 'CAR' | 'VAN' | 'TRUCK';
export type VehicleStatus = 'AVAILABLE' | 'ON_TRIP' | 'MAINTENANCE' | 'RETIRED';

/** A vehicle in our own delivery fleet (logistics.FleetVehicle). */
export interface FleetVehicle {
    id: string;
    kind: VehicleKind;
    kind_label: string;
    registration: string;
    make_model: string;
    capacity_kg: string | null;
    status: VehicleStatus;
    default_driver: string | null;
    default_driver_name: string | null;
    insurance_expiry: string | null;
    inspection_expiry: string | null;
    papers: { label: string; expiry: string; state: 'OK' | 'DUE' | 'EXPIRED' }[];
    allocatable: boolean;
    odometer_km: string;
    running_cost: string;
    open_trip: string | null;
    notes: string;
}

export interface FleetSummary {
    vehicles: number;
    available: number;
    on_trip: number;
    maintenance: number;
    papers_due: number;
    open_trips: number;
}

export interface VehicleLogEntry {
    id: string;
    vehicle: string;
    kind: 'FUEL' | 'SERVICE' | 'REPAIR' | 'INSPECTION' | 'INSURANCE' | 'OTHER';
    kind_label: string;
    date: string;
    cost: string;
    odometer_km: string | null;
    litres: string | null;
    notes: string;
}

export interface DeliveryTrip {
    id: string;
    vehicle: string;
    registration: string;
    kind_label: string;
    driver: string;
    driver_name: string | null;
    status: 'PLANNED' | 'ON_ROUTE' | 'DONE' | 'CANCELLED';
    started_at: string | null;
    finished_at: string | null;
    start_odometer_km: string | null;
    end_odometer_km: string | null;
    distance_km: string | null;
    fuel_cost: string;
    stops: { leg: string; status: string; to: string; tracking_number: string | null; distance_km: string }[];
    created: string | null;
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

/** A delivery company or courier WaziPOS admin has whitelisted: any seller can use it. */
export interface PlatformProvider {
    id: string;
    title: string;
    kind: 'DELIVERY_COMPANY' | 'COURIER';
    service_radius_km: string;
    agents: number;
    agents_on_duty: number;
    offices: number;
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
    /** On duty: offered to sellers dispatching nearby. */
    is_available?: boolean;
}

export interface DeliveryRate {
    id: string;
    mode: DeliveryMode;
    base_fee: string;
    rate_per_km: string;
    rate_per_kg: string;
    min_fee: string;
    /** Percent of the goods' value added (insurance / handling). */
    value_percent?: string;
    max_distance_km: string | null;
    max_weight_kg: string | null;
    is_active: boolean;
}

/** A courier's published rate chart (logistics.CourierRateCard). */
export interface RateCardLine {
    id: string;
    origin_office: string | null;
    origin_office_title: string | null;
    origin_county: string | null;
    origin_county_title: string | null;
    destination_office: string | null;
    destination_office_title: string | null;
    destination_county: string | null;
    destination_county_title: string | null;
    min_kg: string;
    max_kg: string | null;
    price: string;
    extra_per_kg: string;
    lead_time_days: number | null;
}

export interface RateCard {
    id: string;
    title: string;
    is_active: boolean;
    effective_from: string | null;
    value_percent: string;
    notes: string;
    lines: RateCardLine[];
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
export type OrderLink = { retailer_order: string } | { customer_order: string } | { food_order: string } | { wholesaler_order: string } | { distributor_purchase_order: string };

/** One payout from a buyer's order payment (payments.OrderPayouts). */
export interface OrderPayout {
    id: string;
    payee_kind: 'VENDOR' | 'DELIVERY_PERSON' | 'COURIER';
    payee_kind_label: string;
    payee: string | null;
    order_kind: string;
    order_reference: string;
    seller: string | null;
    gross_amount: string;
    commission_amount: string;
    amount: string;
    status: 'DUE' | 'PROCESSING' | 'PAID' | 'FAILED' | 'NO_ACCOUNT' | 'SELLER_PAYS';
    status_label: string;
    note: string;
    account: string | null;
    reference_number: string | null;
    psp_reference: string | null;
    due_at: string | null;
    paid_at: string | null;
}

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

const PROBLEM_TEXT: Record<string, string> = {
    NETWORK_ERROR: 'No connection to the server.',
    TIMEOUT_ERROR: 'The server took too long to answer.',
    CONNECTION_ERROR: 'The server could not be reached.',
    SERVER_ERROR: 'The server hit an error.',
};

/**
 * Pull the server's error text out of a response. Handles our own
 * {errors, response_message}, plain DRF bodies ({detail}, a list, or
 * {field: [msgs]}), and finally the HTTP status — never a bare "CLIENT_ERROR".
 */
export function apiError(res: any, fallback: string): string {
    const data = res?.data;
    const errs = data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    if (typeof errs === 'string' && errs) return errs;
    if (data?.response_message) return String(data.response_message);
    if (data?.detail) return String(data.detail);
    if (Array.isArray(data) && data.length) return data.map(String).join(' ');
    if (data && typeof data === 'object') {
        const msgs = Object.values(data).flat().filter((v) => typeof v === 'string') as string[];
        if (msgs.length) return msgs.join(' ');
    }
    const status = Number(res?.status);
    if (status === 401) return 'Your session has expired. Sign in again.';
    if (status === 403) return "You don't have access to this.";
    if (status === 404) return 'This feature is not on the server yet.';
    if (status === 429) return 'Too many requests. Wait a moment and try again.';
    const problem = PROBLEM_TEXT[res?.problem];
    if (problem) return status ? `${problem} (${status})` : problem;
    return status ? `${fallback} (${status})` : fallback;
}

export const isOk = (res: any) => !!res?.ok && String(res?.data?.response_code) === '0';

export default {
    /**
     * Can DELIVERY be used? Only when the businesses' locations are set.
     * { entity }: a shop; { retailer_order }: wholesaler + retailer; {}: own business.
     */
    getDeliveryAvailability: (data: { entity?: string; retailer_order?: string } = {}) => call('GetDeliveryAvailability', data),
    /** Wholesaler staff building a retailer order: options from us to the retailer. */
    getStaffRetailerOrderDeliveryOptions: (retailer: string, order_items: { wholesaler_receipt: string; purchased_quantity: number }[]) =>
        call('GetStaffRetailerOrderDeliveryOptions', { retailer, order_items }),
    // buyer
    /** collection_point: re-price the courier options for the office the buyer picked. */
    getRetailerOrderDeliveryOptions: (retailer_order: string, collection_point?: string) =>
        call('GetRetailerOrderDeliveryOptions', { retailer_order, ...(collection_point ? { collection_point } : {}) }),
    chooseRetailerOrderDelivery: (retailer_order: string, option: string) => call('ChooseRetailerOrderDelivery', { retailer_order, option }),
    /** Shopper at checkout: options from the shop to their location. */
    getCustomerDeliveryOptions: (data: { entity: string; destination_latitude: number; destination_longitude: number; order_items: { retailer_receipt: string; purchased_quantity: number }[]; collection_point?: string }) =>
        call('GetCustomerDeliveryOptions', data),
    // both sides
    getShipment: (link: OrderLink) => call('GetShipment', link),
    // seller
    /** Allocate the in-town leg: a person, their fleet vehicle, and (courier) the dispatch office to drop at. */
    dispatchOrder: (link: OrderLink, agent: string, extra: { vehicle?: string; dispatch_office?: string } = {}) =>
        call('DispatchOrder', { ...link, agent, ...(extra.vehicle ? { vehicle: extra.vehicle } : {}), ...(extra.dispatch_office ? { dispatch_office: extra.dispatch_office } : {}) }),
    assignShipmentLeg: (leg: string, agent: string, vehicle?: string) => call('AssignShipmentLeg', { leg, agent, ...(vehicle ? { vehicle } : {}) }),
    // own delivery fleet
    getFleet: () => call('GetFleet'),
    saveVehicle: (details: Record<string, any>) => call('SaveVehicle', details),
    getVehicleLogs: (vehicle: string) => call('GetVehicleLogs', { vehicle }),
    addVehicleLog: (details: Record<string, any>) => call('AddVehicleLog', details),
    getTrips: (scope: 'OPEN' | 'ALL' = 'OPEN') => call('GetTrips', { scope }),
    startTrip: (trip: string, odometer_km?: string) => call('StartTrip', { trip, ...(odometer_km ? { odometer_km } : {}) }),
    finishTrip: (trip: string, odometer_km?: string, fuel_cost?: string) => call('FinishTrip', { trip, ...(odometer_km ? { odometer_km } : {}), ...(fuel_cost ? { fuel_cost } : {}) }),
    cancelTrip: (trip: string) => call('CancelTrip', { trip }),
    /** Seller: own delivery persons and partners' riders for this leg, with pay and why someone can't. */
    getAllocatableAgents: (leg: string) => call('GetAllocatableAgents', { leg }),
    /** The delivery companies and couriers WaziPOS admin has whitelisted (read-only). */
    getPlatformProviders: () => call('GetPlatformProviders'),
    /** Own delivery persons, or (with partner) a whitelisted company's. */
    getDeliveryAgents: (partner?: string) => call('GetDeliveryAgents', partner ? { partner } : {}),
    saveDeliveryAgent: (details: Record<string, any>) => call('SaveDeliveryAgent', { details }),
    getDeliveryRates: () => call('GetDeliveryRates'),
    saveDeliveryRate: (details: Record<string, any>) => call('SaveDeliveryRate', { details }),
    // delivery persons / couriers
    getMyDeliveries: () => call('GetMyDeliveries'),
    /** What buyers' payments owe onward (goods to vendors, legs to riders / couriers). scope ALL: admin, everyone's. */
    getOrderPayouts: (filters: { scope?: 'ALL'; status?: string; payee_kind?: string } = {}) => call('GetOrderPayouts', filters),
    retryOrderPayout: (payout: string) => call('RetryOrderPayout', { payout }),
    /** Rider / driver: on or off duty, and where they are now (sellers search nearby). */
    setMyAvailability: (data: { available?: boolean; latitude?: number; longitude?: number }) => call('SetMyAvailability', data),
    updateShipmentLeg: (leg: string, status: LegStatus, extra: { delivery_code?: string; waybill_number?: string } = {}) =>
        call('UpdateShipmentLeg', { leg, status, ...extra }),
    confirmShipmentCollected: (shipment: string, delivery_code: string) => call('ConfirmShipmentCollected', { shipment, delivery_code }),
    // couriers: their offices
    getMyOffices: () => call('GetMyOffices'),
    // couriers: published rate charts
    getRateCards: () => call('GetRateCards'),
    saveRateCard: (details: Record<string, any>) => call('SaveRateCard', details),
    saveRateCardLine: (details: Record<string, any>) => call('SaveRateCardLine', details),
    deleteRateCardLine: (line: string) => call('DeleteRateCardLine', { line }),
    saveOffice: (details: Record<string, any>) => call('SaveOffice', { details }),
    // platform admins: delivery payouts
    getDeliveryPayouts: (settled = false) => call('GetDeliveryPayouts', { settled }),
    markDeliveryPayoutPaid: (legs: string[], reference: string) => call('MarkDeliveryPayoutPaid', { legs, reference }),
};
