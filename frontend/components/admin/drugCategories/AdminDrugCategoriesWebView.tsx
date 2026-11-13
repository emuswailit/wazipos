// components/admin/drugCategories/AdminDrugCategoriesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugCategoriesConfig } from './drugCategoriesConfig';
import type { AdminDrugCategoriesSharedProps } from './AdminDrugCategoriesList';

function AdminDrugCategoriesWebView(props: AdminDrugCategoriesSharedProps) {
    return <AdminListView {...props} variant="web" config={drugCategoriesConfig} />;
}

export default AdminDrugCategoriesWebView;
