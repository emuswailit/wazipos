// components/admin/drugCategories/AdminDrugCategoriesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugCategoriesConfig } from './drugCategoriesConfig';
import type { AdminDrugCategoriesSharedProps } from './AdminDrugCategoriesList';

function AdminDrugCategoriesMobileView(props: AdminDrugCategoriesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={drugCategoriesConfig} />;
}

export default AdminDrugCategoriesMobileView;
