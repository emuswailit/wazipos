// components/admin/drugSubClasses/AdminDrugSubClassesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugSubClassesConfig } from './drugSubClassesConfig';
import type { AdminDrugSubClassesSharedProps } from './types';

function AdminDrugSubClassesWebView(props: AdminDrugSubClassesSharedProps) {
    return <AdminListView {...props} variant="web" config={drugSubClassesConfig} />;
}

export default AdminDrugSubClassesWebView;
