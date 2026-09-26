// app/(admin)/formulations/index.tsx
//
// Admin formulations route.
//
// Thin wrapper. `FormulationItem` is re-exported from the shared
// types module so sibling code can import the record shape from
// one stable path.

import AdminFormulationsList from "@/components/admin/formulations/AdminFormulationsList";

export type { FormulationItem } from "@/components/admin/formulations/types";

export default function AdminFormulationsRoute() {
    return <AdminFormulationsList />;
}