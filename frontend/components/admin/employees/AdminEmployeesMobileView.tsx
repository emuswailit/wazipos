// components/admin/employees/AdminEmployeesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { employeesConfig } from './employeesConfig';
import type { AdminEmployeesSharedProps } from './AdminEmployeesList';

function AdminEmployeesMobileView(props: AdminEmployeesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={employeesConfig} />;
}

export default AdminEmployeesMobileView;
