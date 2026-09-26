// app/(admin)/generics/index.tsx
//
// Admin generics route.
//
// Thin wrapper. `GenericItem` is re-exported from the shared
// types module so sibling code can import the record shape from
// one stable path.

import AdminGenericsList from "@/components/admin/generics/AdminGenericsList";

export type { GenericItem } from "@/components/admin/generics/types";

export default function AdminGenericsRoute() {
    return <AdminGenericsList />;
}