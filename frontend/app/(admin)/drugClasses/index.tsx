// app/(admin)/drugClasses/index.tsx
//
// Admin drug classes route.
//
// Thin wrapper. `DrugClassItem` is re-exported from the component
// module so sibling code can import the record shape from one
// stable path.

import AdminDrugClassesList from "@/components/admin/drugClasses/AdminDrugClassesList";




export default function AdminDrugClassesRoute() {
    return <AdminDrugClassesList />;
}