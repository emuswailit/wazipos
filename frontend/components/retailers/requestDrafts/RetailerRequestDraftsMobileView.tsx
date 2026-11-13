// components/retailers/requestDrafts/RetailerRequestDraftsMobileView.tsx
//
// Phones + narrow web: the request basket as cards with a sticky "Send request" bar.

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { useDraftsListProps, type RetailerRequestDraftsViewProps } from './RetailerRequestDraftsWebView';

export function RetailerRequestDraftsMobileView(props: RetailerRequestDraftsViewProps) {
    return <AdminListView {...useDraftsListProps(props, 'mobile')} />;
}

