import { ApiResponse } from "apisauce";
import client from "./client";

// ==========================================
// DATA CONTRACT INTERFACES (INPUT/OUTPUT)
// ==========================================

export interface VendorLocationFilterRequest {
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    categories?: string[];
    searchQuery?: string;
    [key: string]: any; // Fallback placeholder safety parameters
}

export interface VendorLocationResponse {
    id: string;
    name: string;
    category: string;
    latitude: number;
    longitude: number;
    distanceKm: number;
    address: string;
    rating: number;
    reviewCount: number;
    [key: string]: any;
}

export interface RetailInventoryItemRequest {
    supplierId: string;
    items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
    }>;
    totalAmount: number;
    [key: string]: any;
}

export interface RetailInventoryItemResponse {
    success: boolean;
    receiptId: string;
    timestamp: string;
    message?: string;
}

// ==========================================
// TYPE-SAFE ENDPOINT ACTIONS
// ==========================================

/**
 * Fetches commercial market nodes and distribution hubs matching spatial filters.
 */
const vendorLocationsAction = (
    data: VendorLocationFilterRequest
): Promise<ApiResponse<VendorLocationResponse[]>> => {
    return client.post<VendorLocationResponse[]>("/entitylocations/locations/filters", data);
};

/**
 * Registers stock intake records directly into the central retail ledger repository.
 */
const createRetailInventoryItem = (
    data: RetailInventoryItemRequest
): Promise<ApiResponse<RetailInventoryItemResponse>> => {
    return client.post<RetailInventoryItemResponse>("/retailers/receipts/admin", data);
};

// Export using structured service instance block parameters
export const vendorsService = {
    createRetailInventoryItem,
    vendorLocationsAction,
};

export default vendorsService;
