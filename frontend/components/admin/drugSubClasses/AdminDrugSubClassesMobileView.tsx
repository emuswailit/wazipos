// components/admin/drugSubClasses/AdminDrugSubClassesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugSubClassesConfig } from './drugSubClassesConfig';
import type { AdminDrugSubClassesSharedProps } from './types';

function AdminDrugSubClassesMobileView(props: AdminDrugSubClassesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={drugSubClassesConfig} />;
}

export default AdminDrugSubClassesMobileView;
