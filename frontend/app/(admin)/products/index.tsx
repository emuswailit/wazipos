// app/(admin)/products/index.tsx
//
// Admin products route.

import AdminProductsList from "@/components/admin/products/AdminProductsList";

export type { ProductItem } from "@/components/admin/products/types";

export default function AdminProductsRoute() {
    return <AdminProductsList />;
}