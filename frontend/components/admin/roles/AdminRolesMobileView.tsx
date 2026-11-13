// components/admin/roles/AdminRolesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { rolesConfig } from './rolesConfig';
import type { AdminRolesSharedProps } from './AdminRolesList';

function AdminRolesMobileView(props: AdminRolesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={rolesConfig} />;
}

export default AdminRolesMobileView;
