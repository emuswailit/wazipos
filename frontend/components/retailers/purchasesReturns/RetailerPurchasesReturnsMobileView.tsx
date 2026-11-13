// components/retailers/purchasesReturns/RetailerPurchasesReturnsMobileView.tsx
//
// Phones + narrow web: purchases return cards (shared list-screen kit).

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { purchasesReturnsListProps, type RetailerPurchasesReturnsViewProps } from './RetailerPurchasesReturnsWebView';

export function RetailerPurchasesReturnsMobileView(props: RetailerPurchasesReturnsViewProps) {
    return <AdminListView {...purchasesReturnsListProps(props, 'mobile')} />;
}

