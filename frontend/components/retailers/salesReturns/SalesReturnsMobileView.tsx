// components/retailers/salesReturns/SalesReturnsMobileView.tsx
//
// Phones + narrow web: sales return cards (shared list-screen kit).

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { salesReturnsListProps, type SalesReturnsViewProps } from './SalesReturnsWebView';

export function SalesReturnsMobileView(props: SalesReturnsViewProps) {
    return <AdminListView {...salesReturnsListProps(props, 'mobile')} />;
}

