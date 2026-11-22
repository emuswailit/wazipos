// api/courierApi.ts
//
// The dashboard for couriers' and delivery companies' own staff (backend
// logistics/utils/courier_console.py, /logistics/courier): today's numbers, parcels
// through our offices, our riders / drivers and who is on duty.

import { ApiResponse } from 'apisauce';

import type { DeliveryMode } from './deliveriesApi';
import client from './client';

export type ParcelStage = 'INCOMING' | 'IN_TRANSIT' | 'AWAITING' | 'DONE';
export type RiderState = 'ON_DUTY' | 'OFF_DUTY' | 'BUSY' | 'INACTIVE';

export interface CourierDashboard {
    provider: { id: string; title: string; kind: 'COURIER' | 'DELIVERY_COMPANY'; status: 'PENDING' | 'WHITELISTED' | 'SUSPENDED'; service_radius_km: string | null };
    riders: { total: number; on_duty: number; busy: number; live: number };
    fleet: { total: number; available: number; on_trip: number; maintenance: number; papers_due: number; open_trips: number };
    jobs: { open: number; done_30_days: number };
    /** Couriers only. */
    parcels: Record<ParcelStage, number> | null;
    offices: number;
    offices_without_location: number;
    money: { earned_30_days: string; owed: string; paid_30_days: string };
}

export interface Parcel {
    stage: ParcelStage;
    leg: string;
    transit_leg: string | null;
    shipment: string;
    reference: string;
    seller: string | null;
    buyer: string | null;
    from_office: string | null;
    from_office_id: string | null;
    to_office: string | null;
    to_office_id: string | null;
    weight_kg: string;
    cargo_value: string;
    waybill_number: string | null;
    pays_us: string | null;
    brought_by: string | null;
    brought_by_phone: string | null;
    handover_status: string | null;
    since: string | null;
}

export interface Rider {
    id: string;
    user: string;
    name: string;
    phone: string | null;
    mode: DeliveryMode;
    mode_label: string;
    max_weight_kg: string | null;
    vehicle_registration: string | null;
    is_active: boolean;
    is_available: boolean;
    /** Location shared in the last 30 minutes. */
    live: boolean;
    last_seen_at: string | null;
    state: RiderState;
    current_job: { leg: string; kind: string; status: string; seller: string | null } | null;
}

const ENDPOINT = '/logistics/courier';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export default {
    getDashboard: () => call('GetCourierDashboard'),
    getParcels: (stage: ParcelStage, office?: string) => call('GetParcels', { stage, ...(office ? { office } : {}) }),
    receiveParcel: (leg: string, waybill_number?: string) => call('ReceiveParcel', { leg, ...(waybill_number ? { waybill_number } : {}) }),
    arriveParcel: (leg: string) => call('ArriveParcel', { leg }),
    collectParcel: (shipment: string, delivery_code: string) => call('CollectParcel', { shipment, delivery_code }),
    getRiders: () => call('GetRiders'),
    setRiderAvailability: (agent: string, available: boolean) => call('SetRiderAvailability', { agent, available }),
};
