// components/admin/drugClasses/AdminDrugClassesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { drugClassesConfig } from './drugClassesConfig';
import type { AdminDrugClassesSharedProps } from './types';

function AdminDrugClassesWebView(props: AdminDrugClassesSharedProps) {
    return <AdminListView {...props} variant="web" config={drugClassesConfig} />;
}

export default AdminDrugClassesWebView;
