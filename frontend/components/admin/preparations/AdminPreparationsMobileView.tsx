// components/admin/preparations/AdminPreparationsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { preparationsConfig } from './preparationsConfig';
import type { AdminPreparationsSharedProps } from './types';

function AdminPreparationsMobileView(props: AdminPreparationsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={preparationsConfig} />;
}

export default AdminPreparationsMobileView;
