// components/admin/drugClasses/AdminDrugClassesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugClassesConfig } from './drugClassesConfig';
import type { AdminDrugClassesSharedProps } from './types';

function AdminDrugClassesMobileView(props: AdminDrugClassesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={drugClassesConfig} />;
}

export default AdminDrugClassesMobileView;
