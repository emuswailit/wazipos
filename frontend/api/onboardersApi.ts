// api/onboardersApi.ts
//
// Onboarders — an agent's helpers who enter a new business's first stock:
// retailer / wholesaler receipts, or a restaurant's / hotel's supplies (food,
// cleaning, utilities, packaging) and bar drinks. POST /authentication/onboarders/me (backend authentication/onboarders.py).
// Create-only: they can add receipts to a business only while attached to it,
// between the dates their agent set (and until the stock take is done). There
// is no update or delete.

import type { ApiResponse } from 'apisauce';

import client from './client';

export type ReceiptKind = 'RETAILER' | 'WHOLESALER' | 'RESTAURANT';
export type SupplyCategory = 'FOOD' | 'CLEANING' | 'UTILITY' | 'PACKAGING' | 'OTHER';

export interface OnboarderAssignment {
    entity: string;
    entity_title: string;
    entity_type: string;
    town: string | null;
    receipt_kind: ReceiptKind | null;
    access_from: string | null;
    access_to: string | null;
    /** Stock can be entered today. */
    access_open: boolean;
    stock_take_status: 'NOT_NEEDED' | 'PLANNED' | 'IN_PROGRESS' | 'DONE';
    agent_name: string;
    agent_phone: string | null;
}

export interface OnboarderReceipt {
    id: string;
    product: string;
    product_title: string;
    received_unit_quantity: number;
    unit_of_receipt: string;
    unit_buying_price: string;
    /** null for restaurant supplies. */
    unit_selling_price: string | null;
    batch: string | null;
    expiry_date: string | null;
    /** Restaurants / hotels: a supply category, or BAR for drinks. */
    category?: SupplyCategory | 'BAR';
    target?: 'SUPPLY' | 'DRINK';
    created: string | null;
}

export interface ReceiptInput {
    draft_id: string;
    product: string;
    received_unit_quantity: number;
    unit_of_receipt: string;
    unit_buying_price: string;
    unit_selling_price: string;
    batch?: string;
    bar_code?: string;
    manufacture_date?: string;
    expiry_date?: string;
}

/** Restaurants / hotels: a supply line (food, cleaning, utilities, packaging…). */
export interface SupplyInput {
    target: 'SUPPLY';
    draft_id: string;
    product?: string;
    title?: string;
    category: SupplyCategory;
    unit: string;
    quantity: number;
    unit_cost: string;
    supplier_name?: string;
    batch?: string;
    expiry_date?: string;
}

/** Restaurants / hotels: a NEW bar drink with its opening bottles. */
export interface DrinkInput {
    target: 'DRINK';
    draft_id: string;
    product?: string;
    title?: string;
    volume_ml: number;
    bottle_price: string;
    bottle_cost: string;
    sells_tots: boolean;
    tot_ml?: number;
    tot_price?: string;
    bottles: number;
}

const ENDPOINT = '/authentication/onboarders/me';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export default {
    getAssignments: () => call('OnboarderGetAssignments'),
    searchProducts: (entity: string, q: string) => call('OnboarderSearchProducts', { entity, q }),
    createReceipt: (entity: string, receipt_details: ReceiptInput | SupplyInput | DrinkInput) => call('OnboarderCreateReceipt', { entity, receipt_details }),
    getMyReceipts: (entity: string) => call('OnboarderGetMyReceipts', { entity }),
};
