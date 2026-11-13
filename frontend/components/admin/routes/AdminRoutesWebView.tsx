// components/admin/routes/AdminRoutesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { routesConfig } from './routesConfig';
import type { AdminRoutesSharedProps } from './types';

function AdminRoutesWebView(props: AdminRoutesSharedProps) {
    return <AdminListView {...props} variant="web" config={routesConfig} />;
}

export default AdminRoutesWebView;
