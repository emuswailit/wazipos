// components/admin/departments/AdminDepartmentsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { departmentsConfig } from './departmentsConfig';
import type { AdminDepartmentsSharedProps } from './AdminDepartmentsList';

function AdminDepartmentsWebView(props: AdminDepartmentsSharedProps) {
    return <AdminListView {...props} variant="web" config={departmentsConfig} />;
}

export default AdminDepartmentsWebView;
