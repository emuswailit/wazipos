// components/admin/departments/AdminDepartmentsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { departmentsConfig } from './departmentsConfig';
import type { AdminDepartmentsSharedProps } from './AdminDepartmentsList';

function AdminDepartmentsMobileView(props: AdminDepartmentsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={departmentsConfig} />;
}

export default AdminDepartmentsMobileView;
