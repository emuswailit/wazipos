// app/(admin)/preparations/index.tsx
//
// Admin preparations route.

import AdminPreparationsList from "@/components/admin/preparations/AdminPreparationsList";

export type { PreparationItem } from "@/components/admin/preparations/types";

export default function AdminPreparationsRoute() {
    return <AdminPreparationsList />;
}