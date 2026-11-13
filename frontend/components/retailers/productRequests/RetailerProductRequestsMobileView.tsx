// components/retailers/productRequests/RetailerProductRequestsMobileView.tsx
//
// Phones + narrow web: product request cards (shared list-screen kit). Status
// filters, stats and sync live in the options sheet.

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { productRequestsListProps } from './RetailerProductRequestsWebView';
import type { RetailerProductRequestsSharedProps } from './types';

export function RetailerProductRequestsMobileView(props: RetailerProductRequestsSharedProps) {
    return <AdminListView {...productRequestsListProps(props, 'mobile')} />;
}

