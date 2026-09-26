// api/productsApi.ts
//
// Product endpoints.
//
// Two transports:
//   - productsAction   → JSON via clientWithCache  (list / get / update)
//   - createProduct    → multipart via multipartClient  (create with images)

import clientWithCache from './clientWithCache';
import multipartClient from './multipartClient';

/* =========================================================
 * Types
 * ======================================================= */

export interface ProductDetails {
    title: string;
    description: string;
    preparation: string;
    units_per_pack: number;
    pack_tag: string;
    manufacturer: string;
    category: string;
    is_vatable: string;
    allowed_entities: string[];
    bar_code: string;
    images: string[];
}

export type ProductsRequest =
    | { action: 'GetAllProducts' }
    | { action: 'GetProduct'; id: string }
    | {
        action: 'UpdateProduct';
        id: string;
        product_details: ProductDetails;
    };

/* =========================================================
 * Transport functions
 * ======================================================= */

/**
 * JSON endpoint. Handles list, get, and update actions via
 * the `action` discriminator inside the payload.
 */
const productsAction = (data: ProductsRequest | any) => {
    return clientWithCache.post('/products/', data);
};

/**
 * Multipart endpoint. Accepts a `FormData` built by the caller.
 * Do NOT set Content-Type manually — multipartClient must let
 * the runtime set the boundary.
 */
const createProduct = (data: FormData) => {
    return multipartClient.post(
        '/products/products/create',
        data
    );
};

/* =========================================================
 * Default export
 * ======================================================= */

const productsApi = {
    productsAction,
    createProduct,
};

export default productsApi;