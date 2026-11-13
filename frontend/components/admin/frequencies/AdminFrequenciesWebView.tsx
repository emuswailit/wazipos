// components/admin/frequencies/AdminFrequenciesWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { frequenciesConfig } from './frequenciesConfig';
import type { AdminFrequenciesSharedProps } from './types';

function AdminFrequenciesWebView(props: AdminFrequenciesSharedProps) {
    return <AdminListView {...props} variant="web" config={frequenciesConfig} />;
}

export default AdminFrequenciesWebView;
