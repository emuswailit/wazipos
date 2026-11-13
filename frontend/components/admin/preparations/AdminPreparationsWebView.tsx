// components/admin/preparations/AdminPreparationsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { preparationsConfig } from './preparationsConfig';
import type { AdminPreparationsSharedProps } from './types';

function AdminPreparationsWebView(props: AdminPreparationsSharedProps) {
    return <AdminListView {...props} variant="web" config={preparationsConfig} />;
}

export default AdminPreparationsWebView;
