// components/retailers/retailerIndents/RetailerIndentsMobileView.tsx
//
// Phones + narrow web: indent cards (shared list-screen kit). Filters, stats and
// sync live in the options sheet.

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { indentsListProps, type RetailerIndentsViewProps } from './RetailerIndentsWebView';

export function RetailerIndentsMobileView(props: RetailerIndentsViewProps) {
    return <AdminListView {...indentsListProps(props, 'mobile')} />;
}

