// components/admin/entities/AdminEntitiesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { entitiesConfig } from './entitiesConfig';
import type { AdminEntitiesSharedProps } from './AdminEntitiesList';

function AdminEntitiesWebView(props: AdminEntitiesSharedProps) {
    return <AdminListView {...props} variant="web" config={entitiesConfig} />;
}

export default AdminEntitiesWebView;
