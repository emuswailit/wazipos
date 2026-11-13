// components/admin/entities/AdminEntitiesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { entitiesConfig } from './entitiesConfig';
import type { AdminEntitiesSharedProps } from './AdminEntitiesList';

function AdminEntitiesMobileView(props: AdminEntitiesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={entitiesConfig} />;
}

export default AdminEntitiesMobileView;
