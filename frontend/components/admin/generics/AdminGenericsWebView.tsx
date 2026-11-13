// components/admin/generics/AdminGenericsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { genericsConfig } from './genericsConfig';
import type { AdminGenericsSharedProps } from './types';

function AdminGenericsWebView(props: AdminGenericsSharedProps) {
    return <AdminListView {...props} variant="web" config={genericsConfig} />;
}

export default AdminGenericsWebView;
