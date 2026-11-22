// api/deliveryProvidersAdminApi.ts
//
// WaziPOS admin: the platform's delivery companies and long-haul couriers, managed
// centrally (backend logistics/utils/platform_providers.py, /logistics/delivery-providers).
// Admin whitelists them and adds their riders / drivers and vehicles; sellers then
// search the available ones near them at dispatch.

import { ApiResponse } from 'apisauce';

import type { DeliveryMode } from './deliveriesApi';
import client from './client';

export type ProviderKind = 'DELIVERY_COMPANY' | 'COURIER';
export type ProviderStatus = 'PENDING' | 'WHITELISTED' | 'SUSPENDED';

export interface AdminDeliveryProvider {
    id: string;
    title: string;
    entity_type: string;
    kind: ProviderKind;
    status: ProviderStatus;
    service_radius_km: string;
    notes: string;
    status_changed_at: string | null;
    phone: string | null;
    town: string | null;
    has_location: boolean;
    agents: number;
    agents_on_duty: number;
    /** Riders / drivers whose location was seen in the last 30 minutes. */
    agents_live: number;
    vehicles: number;
    offices: number;
}

export interface ProviderAgent {
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
    last_seen_at: string | null;
}

const ENDPOINT = '/logistics/delivery-providers';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export default {
    getProviders: (filters: { kind?: ProviderKind; status?: ProviderStatus; search?: string } = {}) => call('GetDeliveryProviders', filters),
    setProvider: (provider: string, details: { status?: ProviderStatus; service_radius_km?: string; notes?: string }) => call('SetDeliveryProvider', { provider, ...details }),
    getAgents: (provider: string) => call('GetProviderAgents', { provider }),
    saveAgent: (provider: string, details: Record<string, any>) => call('SaveProviderAgent', { provider, ...details }),
    searchUsers: (q: string) => call('SearchUsers', { q }),
    getFleet: (provider: string) => call('GetProviderFleet', { provider }),
    saveVehicle: (provider: string, details: Record<string, any>) => call('SaveProviderVehicle', { provider, ...details }),
};
