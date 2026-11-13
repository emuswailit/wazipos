// components/admin/formulations/AdminFormulationsMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { formulationsConfig } from './formulationsConfig';
import type { AdminFormulationsSharedProps } from './types';

function AdminFormulationsMobileView(props: AdminFormulationsSharedProps) {
    return <AdminListView {...props} variant="mobile" config={formulationsConfig} />;
}

export default AdminFormulationsMobileView;
