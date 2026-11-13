// components/admin/roles/AdminRolesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { rolesConfig } from './rolesConfig';
import type { AdminRolesSharedProps } from './AdminRolesList';

function AdminRolesWebView(props: AdminRolesSharedProps) {
    return <AdminListView {...props} variant="web" config={rolesConfig} />;
}

export default AdminRolesWebView;
