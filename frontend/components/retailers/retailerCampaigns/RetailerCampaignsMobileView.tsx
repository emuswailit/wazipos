// components/retailers/retailerCampaigns/RetailerCampaignsMobileView.tsx
//
// Phones + narrow web: campaign cards (shared list-screen kit).

import { AdminListView } from '@/components/common/listScreen';
import React from 'react';

import { campaignsListProps, type RetailerCampaignsViewProps } from './RetailerCampaignsWebView';

export default function RetailerCampaignsMobileView(props: RetailerCampaignsViewProps) {
    return <AdminListView {...campaignsListProps(props, 'mobile')} />;
}
