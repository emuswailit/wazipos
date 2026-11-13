// components/retailers/stockAdjustments/StockAdjustmentsMobileView.tsx
//
// Phones + narrow web: stock adjustment cards (shared list-screen kit).

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { stockAdjustmentsListProps, type StockAdjustmentsViewProps } from './StockAdjustmentsWebView';

export function StockAdjustmentsMobileView(props: StockAdjustmentsViewProps) {
    return <AdminListView {...stockAdjustmentsListProps(props, 'mobile')} />;
}

