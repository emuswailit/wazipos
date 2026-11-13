// components/admin/clusters/AdminClustersWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { clustersConfig } from './clustersConfig';
import type { AdminClustersSharedProps } from './AdminClustersList';

function AdminClustersWebView(props: AdminClustersSharedProps) {
    return <AdminListView {...props} variant="web" config={clustersConfig} />;
}

export default AdminClustersWebView;
