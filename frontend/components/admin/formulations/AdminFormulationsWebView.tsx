// components/admin/formulations/AdminFormulationsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { formulationsConfig } from './formulationsConfig';
import type { AdminFormulationsSharedProps } from './types';

function AdminFormulationsWebView(props: AdminFormulationsSharedProps) {
    return <AdminListView {...props} variant="web" config={formulationsConfig} />;
}

export default AdminFormulationsWebView;
