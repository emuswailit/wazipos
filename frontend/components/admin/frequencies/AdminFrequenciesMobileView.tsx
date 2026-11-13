// components/admin/frequencies/AdminFrequenciesMobileView.tsx
//
// Phones + narrow web: card list (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { frequenciesConfig } from './frequenciesConfig';
import type { AdminFrequenciesSharedProps } from './types';

function AdminFrequenciesMobileView(props: AdminFrequenciesSharedProps) {
    return <AdminListView {...props} variant="mobile" config={frequenciesConfig} />;
}

export default AdminFrequenciesMobileView;
