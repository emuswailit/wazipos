// components/admin/designations/AdminDesignationsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { designationsConfig } from './designationsConfig';
import type { AdminDesignationsSharedProps } from './AdminDesignationsList';

function AdminDesignationsMobileView(props: AdminDesignationsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={designationsConfig} />;
}

export default AdminDesignationsMobileView;
