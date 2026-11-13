// app/(admin)/adminPrescriptions/index.tsx
//
// Admin: all user prescriptions — digitize them; only the owner requests quotations.

import AdminUserPrescriptionsList from '@/components/admin/userPrescriptions/AdminUserPrescriptionsList';

export default function AdminUserPrescriptionsRoute() {
    return <AdminUserPrescriptionsList />;
}
