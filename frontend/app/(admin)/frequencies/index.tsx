// app/(admin)/frequencies/index.tsx
//
// Admin frequencies route.
//
// Thin wrapper. `FrequencyItem` is re-exported from the shared
// types module so sibling code can import the record shape from
// one stable path.

import AdminFrequenciesList from "@/components/admin/frequencies/AdminFrequenciesList";

export type { FrequencyItem } from "@/components/admin/frequencies/types";

export default function AdminFrequenciesRoute() {
    return <AdminFrequenciesList />;
}