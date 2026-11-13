// components/retailers/requestDrafts/RetailerRequestDraftsWebView.tsx
//
// The request basket: products you want wholesalers to quote on, submitted together.
// Wide screens: table + submit bar (shared list-screen kit). Also exports the view
// contract, urgency options and list wiring shared with the mobile view.

import {
    AdminListView,
    CellText,
    SheetButton,
    plural,
    textOr,
    type AdminBadge,
    type AdminListConfig,
    type AdminListViewProps,
} from '@/components/common/listScreen';
import type { RequestDraftItem } from '@/databases/types';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

type Urgency = 'low' | 'medium' | 'high';

interface UrgencyOption {
    value: Urgency;
    label: string;
    bg: string;
    fg: string;
    dot: string;
}

const URGENCY_OPTIONS: UrgencyOption[] = [
    { value: 'low', label: 'Low', bg: 'rgba(16,185,129,0.15)', fg: '#10b981', dot: '#10b981' },
    { value: 'medium', label: 'Medium', bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b', dot: '#f59e0b' },
    { value: 'high', label: 'High', bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', dot: '#ef4444' },
];

function urgencyTint(urgency?: string | null): UrgencyOption {
    const key = String(urgency ?? '').trim().toLowerCase();
    return URGENCY_OPTIONS.find((o) => o.value === key) ?? URGENCY_OPTIONS[1];
}

const URGENCY_TONE: Record<Urgency, AdminBadge['tone']> = { low: 'success', medium: 'warning', high: 'danger' };

function draftWholesalers(d: RequestDraftItem): string[] {
    if (d.wholesalers?.length) return d.wholesalers.map((w) => w.title).filter(Boolean);
    return (d.target_wholesaler_titles ?? []).filter(Boolean);
}

const wholesalerLine = (d: RequestDraftItem) => {
    const names = draftWholesalers(d);
    if (names.length === 0) return 'Any wholesaler';
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
};

const draftsConfig: AdminListConfig<RequestDraftItem> = {
    title: 'Request basket',
    noun: ['product', 'products'],
    icon: 'basket-outline',
    searchPlaceholder: 'Search products in the basket…',
    addLabel: 'Add product',
    emptyTitle: 'Your basket is empty',
    emptyMessage: 'Add products you need, then send one request to your wholesalers for quotes.',
    keyOf: (d, i) => `${d.product_id || 'draft'}-${i}`,
    titleOf: (d) => textOr(d.product_title, 'Unnamed product'),
    subtitleOf: (d) => [wholesalerLine(d), textOr(d.note, '')].filter(Boolean).join(' · '),
    avatarOf: (d) => ({ label: d.product_title, icon: 'cube-outline' }),
    badgesOf: (d) => {
        const u = urgencyTint(d.urgency);
        return [{ label: `${u.label} urgency`, tone: URGENCY_TONE[u.value] }];
    },
    metricOf: (d) => ({ value: Number(d.quantity ?? 0).toLocaleString(), label: 'requested' }),
    primaryColumn: { label: 'Product', flex: 2.8 },
    columns: [
        { key: 'wholesalers', label: 'Ask', flex: 2.2, render: (d) => wholesalerLine(d) },
        { key: 'urgency', label: 'Urgency', flex: 1, render: (d) => <CellText strong>{urgencyTint(d.urgency).label}</CellText> },
        {
            key: 'qty',
            label: 'Qty',
            flex: 0.8,
            align: 'right',
            render: (d) => (
                <CellText strong align="right">
                    {Number(d.quantity ?? 0).toLocaleString()}
                </CellText>
            ),
        },
        { key: 'note', label: 'Note', flex: 1.8, render: (d) => textOr(d.note) },
    ],
};

export interface RetailerRequestDraftsViewProps {
    drafts: RequestDraftItem[];
    draftCount: number;
    draftTotalQuantity: number;
    isSubmittingRequest: boolean;
    onAddNew: () => void;
    onEditItem: (item: RequestDraftItem) => void;
    onRemoveItem: (item: RequestDraftItem) => void;
    onClearAll: () => void;
    onContinue: () => void;
}

function SubmitBar({ p, compact }: { p: RetailerRequestDraftsViewProps; compact: boolean }) {
    const empty = p.draftCount === 0;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <SheetButton label="Clear all" variant="ghost" icon="trash-outline" onPress={p.onClearAll} disabled={empty || p.isSubmittingRequest} grow={compact} />
            <SheetButton
                label={empty ? 'Send request' : `Send request · ${plural(p.draftCount, ['product', 'products'])}`}
                icon="paper-plane-outline"
                onPress={p.onContinue}
                disabled={empty}
                loading={p.isSubmittingRequest}
                loadingLabel="Sending…"
                grow={compact}
            />
        </View>
    );
}

/** Basket view state (local search) + mapping onto the shared list view. */
export function useDraftsListProps(p: RetailerRequestDraftsViewProps, variant: 'mobile' | 'web'): AdminListViewProps<RequestDraftItem> {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return p.drafts;
        return p.drafts.filter((d) => [d.product_title, d.note, ...draftWholesalers(d)].some((v) => String(v ?? '').toLowerCase().includes(q)));
    }, [p.drafts, query]);

    return {
        variant,
        config: draftsConfig,
        query,
        setQuery,
        onRefresh: () => undefined,
        refreshing: false,
        items: filtered,
        allItems: filtered,
        onOpenCreate: p.onAddNew,
        onPressItem: p.onEditItem,
        onEditItem: p.onEditItem,
        rowActions: (d) => [{ icon: 'close-circle-outline', label: 'Remove from basket', tone: 'danger', onPress: () => p.onRemoveItem(d) }],
        stats: [
            { label: 'Products', value: p.draftCount.toLocaleString() },
            { label: 'Units', value: p.draftTotalQuantity.toLocaleString() },
        ],
        footer: <SubmitBar p={p} compact={variant === 'mobile'} />,
        hidePagination: true,
        page: 1,
        pageSize: 100,
        totalItems: filtered.length,
        totalPages: 1,
        pageStart: 0,
        pageEnd: filtered.length,
        onPrev: () => undefined,
        onNext: () => undefined,
        onPageSizeChange: () => undefined,
    };
}

export function RetailerRequestDraftsWebView(props: RetailerRequestDraftsViewProps) {
    return <AdminListView {...useDraftsListProps(props, 'web')} />;
}

