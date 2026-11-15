// api/diningApi.ts
//
// Restaurants dining service — POST /restaurants/dining
// (backend restaurants/services/dining.py). A restaurant is an entity of type
// "Restaurant" — or "Hotel": hotels get everything here plus rooms and stays
// (api/hotelApi.ts), which restaurants never get.
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
    /** "Restaurant" or "Hotel" — a hotel is a restaurant with rooms (api/hotelApi.ts). */
    entity_type?: string;
    is_hotel?: boolean;
    /** Hotels: rooms on offer, and the cheapest night. */
    rooms?: number;
    rooms_from?: string | null;
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
    /** Custom dishes cooked on this order (with the customer's instructions). */
    custom_recipes?: { id: string; title: string; servings: number; instructions: string }[];
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
    /** The customer's priced custom dishes to add to this order. */
    custom_recipes?: string[];
    destination_latitude?: number;
    destination_longitude?: number;
    order_channel?: string;
}

/** What a restaurant can cook with for custom recipes (indicative price per unit). */
export interface Ingredient {
    id: string;
    name: string;
    category: string | null;
    unit_label: string;
    price: string;
    is_available: boolean;
}

export type RecipeStatus = 'REQUESTED' | 'QUOTED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface CustomRecipe {
    id: string;
    restaurant: string;
    restaurant_title: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    title: string;
    instructions: string;
    servings: number;
    service_type: ServiceType;
    party_size: number | null;
    reservation_at: string | null;
    has_destination: boolean;
    ingredients: { name: string; quantity: string | null; portions: number; unit_price: string; from_list: boolean }[];
    estimate: string;
    status: RecipeStatus;
    quoted_price: string | null;
    ready_in_minutes: number | null;
    restaurant_note: string | null;
    food_order: string | null;
    created: string | null;
}

export interface CustomRecipeInput {
    entity: string;
    title: string;
    instructions: string;
    servings: number;
    service_type: ServiceType;
    ingredients: { ingredient?: string; name?: string; quantity?: string; portions: number }[];
    customer_name?: string;
    customer_phone?: string;
    reservation_at?: string;
    party_size?: number;
    destination_latitude?: number;
    destination_longitude?: number;
}

export const RECIPE_STATUS_META: Record<RecipeStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral' | 'primary' }> = {
    REQUESTED: { label: 'Waiting for the kitchen', tone: 'info' },
    QUOTED: { label: 'Priced — accept to order', tone: 'warning' },
    ACCEPTED: { label: 'Ordered', tone: 'success' },
    DECLINED: { label: 'Declined', tone: 'danger' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/* ---------------- bar (drinks: bottles & tots) ---------------- */

export type SaleUnit = 'BOTTLE' | 'TOT';

export interface Drink {
    id: string;
    title: string;
    product: string | null;
    category: string | null;
    bar_code: string | null;
    volume_ml: number;
    sells_tots: boolean;
    tot_ml: number | null;
    tots_per_bottle: number;
    bottle_price: string;
    tot_price: string;
    bottle_cost: string;
    /** Bottles on hand; decimals = an open bottle. */
    stock_bottles: string;
    full_bottles: number;
    open_bottle_tots: number | null;
    reorder_level: string;
    is_low: boolean;
    is_available: boolean;
    updated: string | null;
}

export interface BarTabItem {
    id: string;
    drink: string | null;
    title: string;
    unit: SaleUnit;
    quantity: number;
    unit_price: string;
    line_total: string;
    is_void: boolean;
    created: string | null;
}

export interface BarTab {
    id: string;
    reference: string;
    status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    customer_name: string | null;
    customer_phone: string | null;
    table: string | null;
    notes: string | null;
    total: string;
    paid: string;
    due: string;
    is_paid: boolean;
    items: BarTabItem[];
    last_payment: { reference: string; status: string; description: string } | null;
    created: string | null;
    draft_id: string;
}

export type BarLine = { drink: string; unit: SaleUnit; quantity: number };

/* ---------------- supplies (food stock, cleaning, utilities) ---------------- */

export type SupplyCategory = 'FOOD' | 'CLEANING' | 'UTILITY' | 'PACKAGING' | 'OTHER';

export const SUPPLY_CATEGORIES: Record<SupplyCategory, { label: string; icon: string; color: string }> = {
    FOOD: { label: 'Food & ingredients', icon: 'nutrition-outline', color: '#10b981' },
    CLEANING: { label: 'Cleaning', icon: 'sparkles-outline', color: '#0ea5e9' },
    UTILITY: { label: 'Utilities (gas, charcoal…)', icon: 'flame-outline', color: '#f97316' },
    PACKAGING: { label: 'Packaging & takeaway', icon: 'cube-outline', color: '#8b5cf6' },
    OTHER: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#64748b' },
};

export interface Supply {
    id: string;
    title: string;
    product: string | null;
    category: SupplyCategory;
    category_label: string;
    unit: string;
    quantity: string;
    unit_cost: string;
    value: string;
    reorder_level: string;
    is_low: boolean;
    supplier_name: string | null;
    batch: string | null;
    expiry_date: string | null;
    bar_code: string | null;
    updated: string | null;
    /** Issued in parts (a 50 kg bag used by the kg) — utils/parts.ts */
    parts?: import('@/utils/parts').PartsInfo | null;
}

export interface SupplyMovement {
    id: string;
    kind: 'RECEIVE' | 'ISSUE' | 'WASTE' | 'ADJUST';
    quantity: string;
    balance: string;
    reason: string | null;
    created: string | null;
}

export interface CatalogueProduct {
    id: string;
    title: string;
    bar_code: string | null;
    packaging: string | null;
    units_per_pack: number | null;
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
    getDeliveryOptions: (data: { entity: string; destination_latitude: number; destination_longitude: number; items: { menu_item: string; quantity: number }[]; custom_recipes?: string[] }) =>
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

    // custom recipes — customers
    getIngredients: (entity: string) => call('GetRestaurantIngredients', { entity }),
    requestRecipe: (input: CustomRecipeInput) => call('RequestCustomRecipe', input),
    myRecipes: () => call('GetMyCustomRecipes'),
    cancelRecipe: (recipe: string) => call('CancelCustomRecipe', { recipe }),
    recipeDeliveryOptions: (recipe: string) => call('GetRecipeDeliveryOptions', { recipe }),
    acceptQuote: (recipe: string, delivery_option?: string) => call('AcceptRecipeQuote', { recipe, delivery_option }),
    // custom recipes — restaurant staff
    myIngredients: () => call('GetMyIngredients'),
    saveIngredient: (details: Record<string, any>) => call('SaveIngredient', details),
    // bar — drinks & tabs
    drinks: () => call('GetDrinks'),
    barTabs: (scope: 'open' | 'done' = 'open') => call('GetBarTabs', { scope }),
    refreshBarPayment: (reference: string) => call('RefreshBarPayment', { reference }),
    // supplies
    searchCatalogue: (q: string) => call('SearchCatalogue', { q }),
    supplies: () => call('GetSupplies'),
    supplyMovements: (stock: string) => call('GetSupplyMovements', { stock }),
    /** Any dining write by action name (used by the offline outbox). */
    write: (action: string, data: Record<string, any>) => call(action, data),
    /** Copy the starter catalogue (~50 common Kenyan ingredients) into your list. */
    importStarterIngredients: () => call('ImportStarterIngredients'),
    recipeRequests: (scope: 'open' | 'done' = 'open') => call('GetRecipeRequests', { scope }),
    quoteRecipe: (recipe: string, price: string, ready_in_minutes?: string, note?: string) => call('QuoteCustomRecipe', { recipe, price, ready_in_minutes, note }),
    declineRecipe: (recipe: string, note?: string) => call('DeclineCustomRecipe', { recipe, note }),
};
