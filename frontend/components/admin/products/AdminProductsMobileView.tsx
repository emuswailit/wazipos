// components/admin/products/AdminProductsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { productsConfig } from './productsConfig';
import type { AdminProductsSharedProps } from './types';

function AdminProductsMobileView(props: AdminProductsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={productsConfig} />;
}

export default AdminProductsMobileView;
