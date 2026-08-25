import { ProductCatalogItem, RetailerOption } from './types';

export const defaultMockProducts: ProductCatalogItem[] = [
    { id: 'p1', title: 'Premium Cotton Tee XL', barcode: '123456789', item_price: 1500.00, available: '500' },
    { id: 'p2', title: 'Classic Denim Jacket M', barcode: '987654321', item_price: 4500.00, available: '120' },
    { id: 'p3', title: 'Organic Crew Socks Pack', barcode: '555666777', item_price: 600.00, available: '1000' },
];

export const defaultMockRetailers: RetailerOption[] = [
    { key: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', title: 'Lael Fashion Boutique' },
    { key: 'f8e7d6c5-b4a3-2109-8765-43210abcdef1', title: 'Lael Department Supply' },
    { key: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e', title: 'Lael Wholesale Corner' },
];
