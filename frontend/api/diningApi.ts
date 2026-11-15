// api/diningApi.ts
//
// Restaurants dining service — POST /restaurants/dining
// (backend restaurants/services/dining.py). A restaurant is an entity of type
// "Restaurant".
// Customers: browse, menu, delivery options, place / pay / follow orders,
//   delivery, pickup, or dine in (table booking with optional pre-order).
// Restaurant staff: menu items, tables, the orders board, cash at the counter.
// Delivery persons are assigned with deliveriesApi.dispatchOrder({ food_order }, agent).

import { ApiResponse } from 'apisauce';

import { appendToFormData, type PickedImage } from '@/components/common/imagePicker';

import client from './client';
import multipartClient from './multipartClient';

export type ServiceType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';
export type FoodOrderStatus = 'RECEIVED' | 'PROCESSING' | 'READY' | 'DISPATCHED' | 'ASSIGNED' | 'DELIVERED' | 'SERVED' | 'COMPLETED' | 'CANCELLED' | string;

export interface Restaurant {
    id: string;
    title: string;
    town: string | null;
    road: string | null;
    building: string | null;
    phone: string | null;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_km: number | null;
    menu_items: number;
    delivers: boolean;
}

export interface MenuItem {
    id: string;
    title: string;
    description: string | null;
    price: string;
    is_available: boolean;
    category: string | null;
    preparation_minutes: number | null;
    image_url: string | null;
}

export interface RestaurantTable {
    id: string;
    title: string;
    seats: number;
    description: string | null;
    is_available: boolean;
}

export interface RestaurantMenu {
    restaurant: { id: string; title: string; town: string | null; road: string | null; building: string | null };
    items: MenuItem[];
    tables: RestaurantTable[];
}

export interface FoodOrder {
    id: string;
    reference: string;
    restaurant: string;
    restaurant_title: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    service_type: ServiceType;
    status: FoodOrderStatus;
    is_paid: boolean;
    items: { title: string; quantity: number; unit_price: string; line_total: string }[];
    items_cost: string;
    shipping_cost: string;
    total: string;
    amount_due: string;
    party_size: number | null;
    reservation_at: string | null;
    table: string | null;
    notes: string | null;
    has_delivery: boolean;
    shipment_status: string | null;
    last_payment: { reference: string; status: string; description: string } | null;
    created: string | null;
    ready_at: string | null;
}

export interface PlaceFoodOrderInput {
    entity: string;
    service_type: ServiceType;
    items: { menu_item: string; quantity: number }[];
    notes?: string;
    customer_name?: string;
    customer_phone?: string;
    // DINE_IN
    reservation_at?: string;
    party_size?: number;
    // DELIVERY
    delivery_option?: string;
    destination_latitude?: number;
    destination_longitude?: number;
    order_channel?: string;
}

const ENDPOINT = '/restaurants/dining';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

export const isOk = (res: any) => !!res?.ok && String(res?.data?.response_code) === '0';
export const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.data?.detail || res?.problem || fallback;
};

export const SERVICE_META: Record<ServiceType, { label: string; icon: string; hint: string }> = {
    DELIVERY: { label: 'Delivery', icon: 'bicycle-outline', hint: 'Brought to you' },
    PICKUP: { label: 'Pickup', icon: 'bag-handle-outline', hint: 'Collect when ready' },
    DINE_IN: { label: 'Dine in', icon: 'restaurant-outline', hint: 'Book a table, order ahead' },
};

export const STATUS_META: Record<string, { label: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'primary' | 'neutral' }> = {
    RECEIVED: { label: 'New', tone: 'info' },
    PROCESSING: { label: 'Preparing', tone: 'violet' },
    READY: { label: 'Ready', tone: 'primary' },
    DISPATCHED: { label: 'On the way', tone: 'primary' },
    ASSIGNED: { label: 'On the way', tone: 'primary' },
    DELIVERED: { label: 'Delivered', tone: 'success' },
    SERVED: { label: 'Served', tone: 'success' },
    COMPLETED: { label: 'Completed', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export default {
    // customers
    getRestaurants: (params: { q?: string; latitude?: number; longitude?: number } = {}) => call('GetRestaurants', params),
    getMenu: (entity: string) => call('GetRestaurantMenu', { entity }),
    getDeliveryOptions: (data: { entity: string; destination_latitude: number; destination_longitude: number; items: { menu_item: string; quantity: number }[] }) =>
        call('GetFoodDeliveryOptions', data),
    placeOrder: (input: PlaceFoodOrderInput) => call('PlaceFoodOrder', input),
    pay: (food_order: string, mobile_money_phone: string) => call('PayFoodOrder', { food_order, mobile_money_phone }),
    refreshPayment: (reference: string) => call('RefreshFoodPayment', { reference }),
    myOrders: () => call('GetMyFoodOrders'),
    cancelMyOrder: (food_order: string) => call('CancelMyFoodOrder', { food_order }),
    // restaurant staff
    myMenu: () => call('GetMyMenu'),
    saveMenuItem: (details: Record<string, any>, image?: PickedImage | null) => {
        if (!image) return call('SaveMenuItem', details);
        const form = new FormData();
        form.append('action', 'SaveMenuItem');
        for (const [k, v] of Object.entries(details)) if (v !== undefined && v !== null) form.append(k, String(v));
        appendToFormData(form, 'image', image);
        return multipartClient.post(ENDPOINT, form);
    },
    saveTable: (details: Record<string, any>) => call('SaveTable', details),
    restaurantOrders: (scope: 'open' | 'done' = 'open') => call('GetRestaurantOrders', { scope }),
    updateStatus: (food_order: string, status: string, table?: string | null) => call('UpdateFoodOrderStatus', { food_order, status, table }),
    recordPayment: (food_order: string, payment_method?: string) => call('RecordFoodPayment', { food_order, payment_method }),
};
