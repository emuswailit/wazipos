// components/admin/products/AdminProductsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { productsConfig } from './productsConfig';
import type { AdminProductsSharedProps } from './types';

function AdminProductsWebView(props: AdminProductsSharedProps) {
    return <AdminListView {...props} variant="web" config={productsConfig} />;
}

export default AdminProductsWebView;
