// components/admin/clusters/AdminClustersMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { clustersConfig } from './clustersConfig';
import type { AdminClustersSharedProps } from './AdminClustersList';

function AdminClustersMobileView(props: AdminClustersSharedProps) {
    return <AdminListView {...props} variant="mobile" config={clustersConfig} />;
}

export default AdminClustersMobileView;
