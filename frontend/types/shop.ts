// types/shops.ts

export type Coords = { latitude: number; longitude: number };

export type RetailSortKey = "distance" | "rating" | "name";

// --- Raw Backend Types ---

export interface GeoJSONPoint {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
}

export interface CategoryResponse {
    id: string;
    title: string;
}

export interface OwnerDetailsResponse {
    name: string;
    phone: string;
    email: string;
}

export interface ImageResponse {
    id: string;
    url: string;
}

export interface EntityLocationResponse {
    id: string;
    entity_title: string;
    entity_type: string;
    registration: string | null;
    phone: string | null;
    email: string | null;
    town: string | null;

    country: string | null;
    country_title: string;

    county: string | null;
    county_title: string;

    constituency: string | null;
    constituency_title: string;

    road: string | null;
    building: string | null;
    description: string | null;

    point: GeoJSONPoint | null;
    farness: number;
    is_pharmacy: boolean;

    categories_array: CategoryResponse[];
    rating: number;
    images: ImageResponse[];
    owner_details: OwnerDetailsResponse | null;
}

// --- Normalized Frontend Types ---

export interface RetailShop {
    id: string;
    name: string;
    entityType: string;
    isPharmacy: boolean;
    categories: string[];
    primaryCategory: string;
    distanceKm: number;
    rating: number;
    image?: string;
    phone?: string;
    latitude: number;
    longitude: number;
}