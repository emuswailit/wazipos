// app/(admin)/drugSubClasses/index.tsx
//
// Admin drug sub classes route.
//
// Thin wrapper. `DrugSubClassItem` is re-exported from the shared
// types module so sibling code can import the record shape from
// one stable path.

import AdminDrugSubClassesList from "@/components/admin/drugSubClasses/AdminDrugSubClassesList";

export type { DrugSubClassItem } from "@/components/admin/drugSubClasses/types";

export default function AdminDrugSubClassesRoute() {
    return <AdminDrugSubClassesList />;
}