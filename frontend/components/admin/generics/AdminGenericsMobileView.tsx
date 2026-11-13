// components/admin/generics/AdminGenericsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { genericsConfig } from './genericsConfig';
import type { AdminGenericsSharedProps } from './types';

function AdminGenericsMobileView(props: AdminGenericsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={genericsConfig} />;
}

export default AdminGenericsMobileView;
