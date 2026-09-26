// app/(admin)/body-systems/index.tsx
//
// Admin body systems route.
//
// Thin wrapper. `BodySystemItem` is re-exported here so sibling
// components can import the record shape from one stable path.

import AdminBodySystemsList from "../../../components/admin/drugCategories/AdminDrugCategoriesList";

export type { BodySystemItem } from "../../../components/admin/drugCategories/AdminDrugCategoriesList";

export default function AdminBodySystemsRoute() {
    return <AdminBodySystemsList />;
}