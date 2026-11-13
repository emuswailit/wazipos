// components/admin/cadres/AdminCadresWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { cadresConfig } from './cadresConfig';
import type { AdminCadresSharedProps } from './AdminCadresList';

function AdminCadresWebView(props: AdminCadresSharedProps) {
    return <AdminListView {...props} variant="web" config={cadresConfig} />;
}

export default AdminCadresWebView;
