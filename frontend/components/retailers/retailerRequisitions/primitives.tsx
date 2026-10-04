// components/retailers/retailerRequisitions/primitives.ts
//
// Shared UI atoms, formatters, and view-layer contracts used by the
// requisitions views (Web, Mobile) and the details modal.
//
// Domain types (RetailerOrder, RetailerOrderItem) live in
// @/databases/types — import them directly from there.

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import type { RetailerOrder } from '@/databases/types';

/* =========================================================
 * View-layer contracts
 * ======================================================= */

export type SyncStatus = 'idle' | 'live' | 'offline' | 'error';

export interface RequisitionsCounts {
    total: number;
    visible: number;
    unpaid: number;
    submitted: number;
}

export interface RetailerRequisitionsViewProps {
    orders: RetailerOrder[];
    counts: RequisitionsCounts;

    query: string;
    onQueryChange: (q: string) => void;

    onlyUnpaid: boolean;
    onToggleOnlyUnpaid: () => void;

    refreshing: boolean;
    onRefresh: () => void;

    isLiveConnected: boolean;
    syncStatus: SyncStatus;
    lastSyncedTime: string;

    onView: (order: RetailerOrder) => void;
}

export interface RequisitionsDetailsModalProps {
    order: RetailerOrder | null;
    visible: boolean;
    onClose: () => void;
    onRefreshParentLedger: () => void;
}

/* =========================================================
 * Formatting
 * ======================================================= */

export const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

export const isPaid = (order: RetailerOrder): boolean =>
    toBool(order.is_paid);

export const formatKES = (
    raw: string | number | null | undefined
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

export const formatDate = (
    raw: string | null | undefined
): string => {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
};

export const orderRef = (order: RetailerOrder): string =>
    order.reference_number ||
    order.document_number_display ||
    order.document_number ||
    'N/A';

export const orderItemCount = (order: RetailerOrder): number =>
    order.order_items?.length ?? 0;

/* =========================================================
 * Status tint map
 * ======================================================= */

export interface StatusTint {
    bg: string;
    fg: string;
}

export const STATUS_TINTS: Record<string, StatusTint> = {
    DRAFT: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
    SUBMITTED: { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
    PROCESSED: { bg: 'rgba(13,148,136,0.15)', fg: '#0d9488' },
    PACKED: { bg: 'rgba(124,58,237,0.15)', fg: '#7c3aed' },
    DISPATCHED: { bg: 'rgba(3,105,161,0.15)', fg: '#0369a1' },
    DELIVERED: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    RECEIVED: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    APPROVED: { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' },
    CANCELLED: { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e' },
};

export function statusTint(status: string): StatusTint {
    const key = (status || '').toUpperCase();
    return (
        STATUS_TINTS[key] ?? {
            bg: 'rgba(148,163,184,0.15)',
            fg: '#94a3b8',
        }
    );
}

/* =========================================================
 * Pills
 * ======================================================= */

export function StatusPill({
    status,
    size = 'md',
}: {
    status: string;
    size?: 'sm' | 'md';
}) {
    const { theme } = useAuth();
    const tint = statusTint(status);
    return (
        <View
            className= "self-start rounded-full"
    style = {{
        backgroundColor: tint.bg,
            paddingHorizontal: size === 'sm' ? 6 : 8,
                paddingVertical: size === 'sm' ? 1 : 2,
            }
}
        >
    <Text
                className="uppercase tracking-wide"
style = {{
    color: tint.fg,
        fontFamily: theme.font.bold,
            fontSize: size === 'sm' ? 9 : 10,
                }}
numberOfLines = { 1}
    >
    { status || 'UNKNOWN'}
</Text>
    </View>
    );
}

export function PaymentPill({
    paid,
    compact = false,
}: {
    paid: boolean;
    compact?: boolean;
}) {
    const { theme } = useAuth();
    const tint = paid
        ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' }
        : { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e' };

    return (
        <View
            className= "self-start rounded-full"
    style = {{
        backgroundColor: tint.bg,
            paddingHorizontal: compact ? 6 : 8,
                paddingVertical: compact ? 1 : 2,
            }
}
        >
    <Text
                className="uppercase tracking-widest"
style = {{
    color: tint.fg,
        fontFamily: theme.font.bold,
            fontSize: compact ? 9 : 10,
                }}
numberOfLines = { 1}
    >
    { paid? 'Paid': 'Unpaid' }
    </Text>
    </View>
    );
}

/* =========================================================
 * Summary + filter badges
 * ======================================================= */

export function SummaryBadge({
    label,
    tone = 'neutral',
}: {
    label: string;
    tone?: 'neutral' | 'primary' | 'danger';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'primary'
            ? `${theme.primary}20`
            : tone === 'danger'
                ? 'rgba(244,63,94,0.12)'
                : isDarkMode
                    ? 'rgba(148,163,184,0.15)'
                    : 'rgba(148,163,184,0.22)';
    const fg =
        tone === 'primary'
            ? theme.primary
            : tone === 'danger'
                ? '#f43f5e'
                : theme.textDark;
    return (
        <View
            className= "px-2 py-0.5 rounded-md"
    style = {{ backgroundColor: bg }
}
        >
    <Text
                className="uppercase tracking-widest"
style = {{
    color: fg,
        fontFamily: theme.font.bold,
            fontSize: 9,
                }}
            >
    { label }
    </Text>
    </View>
    );
}

export function FilterPill({
    label,
    active,
    count,
    tint,
    onPress,
}: {
    label: string;
    active: boolean;
    count?: number;
    tint: { fg: string; dot: string; bg: string };
    onPress: () => void;
}) {
    const { theme } = useAuth();
    const fg = active ? tint.fg : theme.textDark;

    return (
        <Pressable
            onPress= { onPress }
    className = "flex-row items-center px-2.5 py-1 mr-2 rounded-full border"
    style = {{
        backgroundColor: active ? tint.bg : 'transparent',
            borderColor: active
                ? tint.fg + '55'
                : theme.textDark + '33',
            }
}
        >
    <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
style = {{
    backgroundColor: active ? tint.fg : tint.dot,
                }}
            />
    < Text
className = "uppercase tracking-wide"
style = {{
    color: fg,
        fontFamily: theme.font.bold,
            fontSize: 10,
                }}
numberOfLines = { 1}
    >
    { label }
    </Text>
{
    count && count > 0 ? (
        <Text
                    style= {{
        color: fg,
            opacity: 0.7,
                marginLeft: 6,
                    fontFamily: theme.font.bold,
                        fontSize: 9,
                    }
}
                >
    { count }
    </Text>
            ) : null}
</Pressable>
    );
}