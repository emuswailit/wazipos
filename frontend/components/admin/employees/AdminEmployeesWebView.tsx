// components/admin/employees/AdminEmployeesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { employeesConfig } from './employeesConfig';
import type { AdminEmployeesSharedProps } from './AdminEmployeesList';

function AdminEmployeesWebView(props: AdminEmployeesSharedProps) {
    return <AdminListView {...props} variant="web" config={employeesConfig} />;
}

export default AdminEmployeesWebView;
