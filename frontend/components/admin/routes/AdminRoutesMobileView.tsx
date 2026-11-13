// components/admin/routes/AdminRoutesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { routesConfig } from './routesConfig';
import type { AdminRoutesSharedProps } from './types';

function AdminRoutesMobileView(props: AdminRoutesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={routesConfig} />;
}

export default AdminRoutesMobileView;
