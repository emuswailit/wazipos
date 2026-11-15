// api/qrMenuApi.ts
//
// Walk-in ordering — food and drinks on one order pad
// (backend/restaurants/services/qr_menu.py).
//
//   Guests (no sign-in) scan the restaurant's QR code, which opens /menu/<restaurant>:
//     POST /restaurants/menu   GetMenu, PlaceOrder, GetOrder, PayOrder, RefreshPayment
//   Staff serve walk-ins at the counter with the same pad:
//     POST /restaurants/dining GetWalkInMenu, PlaceWalkInOrder, GetWalkInOrder,
//                              PayWalkInOrder, RefreshWalkInPayment (the restaurant POS)
//   Staff make the QR codes:
//     POST /authentication/users GenerateQRCode {purpose: RESTAURANT_MENU, table?, format: base64}

import type { ApiResponse } from 'apisauce';

import client from './client';
import clientOpen from './clientOpen';
import type { FoodOrder, MenuItem, RestaurantTable } from './diningApi';

export type WalkInService = 'DINE_IN' | 'PICKUP';
export type DrinkUnit = 'BOTTLE' | 'TOT';

export interface MenuDrink {
    id: string;
    title: string;
    category: string | null;
    volume_ml: number;
    sells_tots: boolean;
    tot_ml: number | null;
    bottle_price: string;
    tot_price: string;
    bottle_available: boolean;
    tot_available: boolean;
}

export interface WalkInMenu {
    restaurant: { id: string; title: string; town?: string | null; road?: string | null; building?: string | null; phone?: string | null };
    table: { id: string; title: string } | null;
    items: MenuItem[];
    drinks: MenuDrink[];
    services: { value: WalkInService; label: string }[];
    /** Staff only. */
    tables?: RestaurantTable[];
}

export interface WalkInTab {
    id: string;
    reference: string;
    status: string;
    total: string;
    paid: string;
    due: string;
    is_paid: boolean;
    customer_phone?: string | null;
    items: { id: string; title: string; unit: DrinkUnit; quantity: number; unit_price: string; line_total: string }[];
    last_payment: { reference: string; status: string; description: string } | null;
}

export interface WalkInOrder {
    /** Follows and pays the order without an account. */
    token: string;
    restaurant: { id: string; title: string };
    table: string | null;
    food_order: FoodOrder | null;
    tab: WalkInTab | null;
    total: string;
    due: string;
    /** Staff POS: the payment just taken / being followed. */
    payment?: WalkInPayment;
}

/** A counter payment for the whole bill (food and drinks). */
export interface WalkInPayment {
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    reference: string | null;
    description?: string;
}

export interface WalkInOrderInput {
    table?: string | null;
    service: WalkInService;
    customer_name: string;
    customer_phone: string;
    notes?: string;
    items: { menu_item: string; quantity: number }[];
    drinks: { drink: string; unit: DrinkUnit; quantity: number }[];
    /** Makes a retry safe: the same token is never placed twice. */
    token: string;
}

export interface GuestPayment {
    bill: 'FOOD' | 'DRINKS';
    reference: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    description: string;
}

export interface MenuQrCode {
    /** data:image/png;base64,… */
    image: string;
    url: string;
    label: string;
}

const guest = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => clientOpen.post('/restaurants/menu', { action, ...data });
const staff = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post('/restaurants/dining', { action, ...data });

export const newOrderToken = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;

const qrMenuApi = {
    // guests
    menu: (entity: string, table?: string | null) => guest('GetMenu', { entity, table: table || undefined }),
    place: (entity: string, input: WalkInOrderInput) => guest('PlaceOrder', { entity, ...input }),
    order: (token: string) => guest('GetOrder', { token }),
    pay: (token: string, bill: 'FOOD' | 'DRINKS', mobile_money_phone: string) => guest('PayOrder', { token, bill, mobile_money_phone }),
    refreshPayment: (token: string, reference: string) => guest('RefreshPayment', { token, reference }),
    // staff
    staffMenu: () => staff('GetWalkInMenu'),
    staffPlace: (input: WalkInOrderInput) => staff('PlaceWalkInOrder', input),
    staffOrder: (token: string) => staff('GetWalkInOrder', { token }),
    /** Take payment at the counter: a method (cash, card…) recorded now, or one M-Pesa prompt for the whole bill. */
    staffPay: (token: string, how: { payment_method?: string | null; mobile_money_phone?: string }) => staff('PayWalkInOrder', { token, ...how }),
    staffRefreshPayment: (token: string, reference: string) => staff('RefreshWalkInPayment', { token, reference }),
    /** The restaurant's menu QR code (optionally for one table). */
    qrCode: (table?: string | null, base_url?: string) =>
        client.post('/authentication/users', { action: 'GenerateQRCode', purpose: 'RESTAURANT_MENU', format: 'base64', table: table || undefined, base_url }),
};

export default qrMenuApi;
