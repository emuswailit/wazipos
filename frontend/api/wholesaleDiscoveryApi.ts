// api/wholesaleDiscoveryApi.ts
//
// Wholesale marketplace discovery: which wholesalers a retailer can buy from.
//
//   POST /wholesalers/discovery          DiscoverWholesalers
//   POST /authentication/counties        GetCounties (sub-counties nested)
//   POST /authentication/sub-counties    GetSubCounties
//
// The backend decides which wholesaler types the logged-in retailer sees:
//   PharmaceuticalRetailer -> Pharmaceutical + General wholesalers
//   GeneralRetailer        -> General wholesalers

import client from './client';

export type DiscoveryMode = 'adjacent' | 'kenya';

export interface DiscoverWholesalersParams {
    mode: DiscoveryMode;
    latitude?: number;
    longitude?: number;
    /** Adjacent mode only (default 30 km on the server). */
    radius_km?: number;
    county?: string;
    sub_county?: string;
    /** Wholesaler name, town or code. */
    search?: string;
    /** Product title or barcode: only wholesalers stocking a match. */
    product?: string;
    page?: number;
    page_size?: number;
}

export interface WholesalerProductMatch {
    product: string;
    title: string;
    unit_price: string;
    unit?: string | null;
}

export interface DiscoveredWholesaler {
    id: string;
    title: string;
    entity_type: 'PharmaceuticalWholesaler' | 'GeneralWholesaler' | string;
    entity_code?: string | null;
    town: string;
    county: { id: string; title: string } | null;
    sub_county: { id: string; title: string } | null;
    phone: string;
    is_verified: boolean;
    image: string | null;
    distance_km: number | null;
    products_in_stock: number;
    product_match_count: number;
    product_matches: WholesalerProductMatch[];
}

export interface DiscoverWholesalersResponse {
    response_code: number;
    response_message: string;
    errors?: string[];
    mode: DiscoveryMode;
    radius_km: number | null;
    page: number;
    page_size: number;
    count: number;
    has_more: boolean;
    allowed_types: string[];
    /** Adjacent mode, page 1: allowed wholesalers with no saved map location (never shown under "Near me"). */
    unlocated_count?: number | null;
    /** Adjacent mode, page 1, nothing in range: distance to the nearest located wholesaler. */
    nearest_km?: number | null;
    results: DiscoveredWholesaler[];
}

export interface PlaceOption {
    id: string;
    title: string;
}

export interface CountyOption extends PlaceOption {
    subCounties: PlaceOption[];
}

const rowsOf = (data: any): any[] => {
    const rows = data?.results ?? data;
    return Array.isArray(rows) ? rows : [];
};

const toPlace = (row: any): PlaceOption | null => {
    const id = row?.id ?? row?.value;
    const title = row?.title ?? row?.name ?? row?.label;
    return id != null && title ? { id: String(id), title: String(title) } : null;
};

export async function discoverWholesalers(params: DiscoverWholesalersParams) {
    return client.post<DiscoverWholesalersResponse>('/wholesalers/discovery', { action: 'DiscoverWholesalers', ...params });
}

/** All counties, each with its sub-counties when the server nests them. Sorted by name. */
export async function getCounties(): Promise<CountyOption[]> {
    const res: any = await client.post('/authentication/counties', { action: 'GetCounties' });
    if (!res.ok) throw new Error(res.data?.response_message || "Couldn't load counties");
    return rowsOf(res.data)
        .map((row) => {
            const county = toPlace(row);
            if (!county) return null;
            const nested = rowsOf(row?.sub_counties ?? row?.subcounties).map(toPlace).filter(Boolean) as PlaceOption[];
            return { ...county, subCounties: nested.sort((a, b) => a.title.localeCompare(b.title)) };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.title.localeCompare(b.title)) as CountyOption[];
}

/** Sub-counties of one county (used when a county didn't come with them nested). */
export async function getSubCounties(countyId: string): Promise<PlaceOption[]> {
    const res: any = await client.post('/authentication/sub-counties', { action: 'GetSubCounties', county: countyId });
    if (!res.ok) throw new Error(res.data?.response_message || "Couldn't load sub-counties");
    return (rowsOf(res.data).map(toPlace).filter(Boolean) as PlaceOption[]).sort((a, b) => a.title.localeCompare(b.title));
}
