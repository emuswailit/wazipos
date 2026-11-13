// components/admin/designations/AdminDesignationsWebView.tsx
//
// Wide screens: table card with pagination (see components/admin/kit).

import { AdminListView } from '@/components/admin/kit';

import { designationsConfig } from './designationsConfig';
import type { AdminDesignationsSharedProps } from './AdminDesignationsList';

function AdminDesignationsWebView(props: AdminDesignationsSharedProps) {
    return <AdminListView {...props} variant="web" config={designationsConfig} />;
}

export default AdminDesignationsWebView;
