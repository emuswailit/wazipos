// app/(admin)/routes/index.tsx
//
// Admin administration routes route.

import AdminRoutesList from "@/components/admin/routes/AdminRoutesList";

export type { DrugRouteItem } from "@/components/admin/routes/types";

export default function AdminRoutesRoute() {
    return <AdminRoutesList />;
}