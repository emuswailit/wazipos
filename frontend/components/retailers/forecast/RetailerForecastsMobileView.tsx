// components/retailers/forecast/RetailerForecastsMobileView.tsx
//
// Phones + narrow web: forecast cards (shared list-screen kit). Filters, the
// demand threshold, stats and sync live in the options sheet.

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { useForecastsListProps, type RetailerForecastsViewProps } from './RetailerForecastsWebView';

export function RetailerForecastsMobileView(props: RetailerForecastsViewProps) {
    return <AdminListView {...useForecastsListProps(props, 'mobile')} />;
}

