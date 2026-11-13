// components/admin/cadres/AdminCadresMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { cadresConfig } from './cadresConfig';
import type { AdminCadresSharedProps } from './AdminCadresList';

function AdminCadresMobileView(props: AdminCadresSharedProps) {
    return <AdminListView {...props} variant="mobile" config={cadresConfig} />;
}

export default AdminCadresMobileView;
