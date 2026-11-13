// components/retailers/retailerPrescriptions/RetailerPrescriptionsMobileView.tsx
//
// Phones + narrow web: prescription cards (shared list-screen kit).

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { prescriptionsListProps, type RetailerPrescriptionsViewProps } from './RetailerPrescriptionsWebView';

export function RetailerPrescriptionsMobileView(props: RetailerPrescriptionsViewProps) {
    return <AdminListView {...prescriptionsListProps(props, 'mobile')} />;
}

