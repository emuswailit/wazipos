// components/retailers/productRequests/statusPrimitives.tsx
//
// Shared status / urgency primitives for the retailer request views.
//
// Single source of truth for:
//   - The canonical status list (STATUS_OPTIONS) with tints + labels
//   - The filter-strip shape (STATUS_FILTERS) for callers that only
//     need value/label pairs
//   - Tint lookups for status, urgency, and offer status
//   - Retailer-voice label translation for offer statuses
//   - Pill / badge components used by the list views and modals
//   - Status count aggregation for the filter strip
//
// Consumers:
//   - RetailerProductRequestsList.tsx   (shell — counts, options)
//   - RetailerProductRequestsWebView.tsx (table + filter strip)
//   - RetailerProductRequestsMobileView.tsx (cards + filter strip)
//   - OfferReviewModal.tsx              (offer status badges)
//   - ViewRequestDetailsModal.tsx       (request + offer badges)

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

/* =========================================================
 * Canonical request status list
 *
 * Order matters — the filter strip renders left to right in this
 * order. `ALL` is a synthetic filter; the rest map 1:1 to server
 * statuses.
 * ======================================================= */

export interface RequestStatusOption {
    value: string;
    label: string;
    bg: string;
    fg: string;
    dot: string;
}

export const STATUS_OPTIONS: RequestStatusOption[] = [
    {
        value: 'ALL',
        label: 'All',
        bg: 'rgba(99,102,241,0.15)',
        fg: '#6366f1',
        dot: '#6366f1',
    },
    {
        value: 'DRAFT',
        label: 'Draft',
        bg: 'rgba(148,163,184,0.15)',
        fg: '#94a3b8',
        dot: '#94a3b8',
    },
    {
        value: 'PUBLISHED',
        label: 'Published',
        bg: 'rgba(16,185,129,0.15)',
        fg: '#10b981',
        dot: '#10b981',
    },
    {
        value: 'ACKNOWLEDGED',
        label: 'With offers',
        bg: 'rgba(99,102,241,0.15)',
        fg: '#6366f1',
        dot: '#6366f1',
    },
    {
        value: 'PARTIALLY_FULFILLED',
        label: 'Partial',
        bg: 'rgba(251,191,36,0.15)',
        fg: '#f59e0b',
        dot: '#f59e0b',
    },
    {
        value: 'FULFILLED',
        label: 'Fulfilled',
        bg: 'rgba(59,130,246,0.15)',
        fg: '#3b82f6',
        dot: '#3b82f6',
    },
    {
        value: 'CANCELLED',
        label: 'Cancelled',
        bg: 'rgba(239,68,68,0.15)',
        fg: '#ef4444',
        dot: '#ef4444',
    },
    {
        value: 'EXPIRED',
        label: 'Expired',
        bg: 'rgba(148,163,184,0.15)',
        fg: '#94a3b8',
        dot: '#94a3b8',
    },
];

/**
 * Convenience — value/label pairs only. Retained for callers that
 * just need a shape to map over.
 */
export const STATUS_FILTERS = STATUS_OPTIONS.map((s) => ({
    value: s.value,
    label: s.label,
}));

/* =========================================================
 * Tint lookups
 * ======================================================= */

export interface Tint {
    bg: string;
    fg: string;
}

/**
 * Tint for a request-level status code.
 * Falls back to the neutral grey used by DRAFT / EXPIRED.
 */
export function statusTint(status?: string | null): Tint {
    const key = String(status ?? '').trim().toUpperCase();
    const found = STATUS_OPTIONS.find((s) => s.value === key);
    if (found) return { bg: found.bg, fg: found.fg };
    return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
}

/**
 * Tint for a request-line or request-level urgency.
 * Accepts `high` | `critical` | `medium` | `low`; unknown → low.
 */
export function urgencyTint(urgency?: string | null): Tint {
    switch ((urgency ?? '').trim().toLowerCase()) {
        case 'high':
        case 'critical':
            return { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' };
        case 'medium':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'low':
        default:
            return { bg: 'rgba(14,165,233,0.15)', fg: '#0ea5e9' };
    }
}

/**
 * Tint for an individual offer's status code.
 *   OFFERED     → amber  (needs a decision)
 *   ACCEPTED    → green  (settled)
 *   DECLINED    → grey   (settled, no negative connotation)
 *   CANCELLED   → grey   (withdrawn by wholesaler)
 *   WITHDRAWN   → grey
 *   EXPIRED     → grey
 */
export function offerStatusTint(status?: string | null): Tint {
    const key = String(status ?? '').trim().toUpperCase();
    switch (key) {
        case 'OFFERED':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'ACCEPTED':
        case 'CONFIRMED':
            return { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' };
        case 'DECLINED':
        case 'REJECTED':
        case 'CANCELLED':
        case 'WITHDRAWN':
        case 'EXPIRED':
        default:
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
    }
}

/* =========================================================
 * Label translation
 *
 * The API's `status_display` on an offer is authored from the
 * wholesaler's perspective — "Awaiting retailer". When the
 * retailer views the same offer, that phrasing reads as if they
 * are the ones waiting. This translates the status code to a
 * neutral, retailer-facing label.
 * ======================================================= */

export function offerStatusLabel(
    status?: string | null,
    fallbackDisplay?: string | null
): string {
    const key = String(status ?? '').trim().toUpperCase();
    switch (key) {
        case 'OFFERED':
            return 'Awaiting decision';
        case 'ACCEPTED':
        case 'CONFIRMED':
            return 'Accepted';
        case 'DECLINED':
        case 'REJECTED':
            return 'Declined';
        case 'CANCELLED':
            return 'Cancelled by wholesaler';
        case 'WITHDRAWN':
            return 'Withdrawn by wholesaler';
        case 'EXPIRED':
            return 'Expired';
        default:
            return (
                (fallbackDisplay ?? '').trim() ||
                key ||
                'Unknown'
            );
    }
}

/* =========================================================
 * Pill / badge components
 * ======================================================= */

/**
 * Filter-strip pill used by the list header. Renders a dot, a
 * label, and a count. Active state uses the option's tint.
 */
export function StatusFilterPill({
    option,
    active,
    count,
    onPress,
}: {
    option: RequestStatusOption;
    active: boolean;
    count: number;
    onPress: () => void;
}) {
    const { theme } = useAuth();
    const bg = active ? option.bg : 'transparent';
    const fg = active ? option.fg : theme.textDark;

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center px-2.5 py-1 mr-2 rounded-full border"
            style={{
                backgroundColor: bg,
                borderColor: active
                    ? option.fg + '55'
                    : theme.textDark + '33',
            }}
        >
            <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{
                    backgroundColor: active
                        ? option.fg
                        : option.dot,
                }}
            />
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: fg,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
                numberOfLines={1}
            >
                {option.label}
            </Text>
            <Text
                style={{
                    color: fg,
                    opacity: 0.7,
                    marginLeft: 6,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {count}
            </Text>
        </Pressable>
    );
}

/**
 * Badge used inside table rows and mobile cards to show a single
 * request's status. Renders the server's `status_display` when
 * present, otherwise the raw status code.
 */
export function RequestStatusBadge({
    status,
    display,
}: {
    status?: string | null;
    display?: string | null;
}) {
    const { theme } = useAuth();
    const tint = statusTint(status);
    return (
        <View
            className="px-2 py-0.5 rounded-md self-start"
            style={{ backgroundColor: tint.bg }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: tint.fg,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
                numberOfLines={1}
            >
                {display || status || '—'}
            </Text>
        </View>
    );
}

/**
 * Badge for urgency. Same visual treatment as RequestStatusBadge
 * but keyed off the urgency scale.
 */
export function UrgencyBadge({
    urgency,
    display,
}: {
    urgency?: string | null;
    display?: string | null;
}) {
    const { theme } = useAuth();
    const tint = urgencyTint(urgency);
    return (
        <View
            className="px-2 py-0.5 rounded-md self-start"
            style={{ backgroundColor: tint.bg }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: tint.fg,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
                numberOfLines={1}
            >
                {display || urgency || '—'}
            </Text>
        </View>
    );
}

/**
 * Badge for an offer's status. Uses the retailer-voice label
 * returned by `offerStatusLabel`, so "Awaiting retailer" on the
 * wire renders as "Awaiting decision" in the retailer's UI.
 */
export function OfferStatusBadge({
    status,
    display,
}: {
    status?: string | null;
    display?: string | null;
}) {
    const { theme } = useAuth();
    const tint = offerStatusTint(status);
    const label = offerStatusLabel(status, display);
    return (
        <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: tint.bg }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: tint.fg,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

/* =========================================================
 * Count aggregation
 * ======================================================= */

/**
 * Compute per-status counts from a request array. Feed the
 * result into `StatusFilterPill` as `count`.
 *
 * Always includes an `ALL` key whose value is the total. Status
 * codes with zero occurrences are still reported as 0 for the
 * callers that want them.
 */
export function computeStatusCounts(
    requests: { status?: string | null }[]
): Record<string, number> {
    const counts: Record<string, number> = {
        ALL: requests.length,
    };
    for (const r of requests) {
        const key = String(r.status ?? '')
            .trim()
            .toUpperCase();
        if (!key) continue;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}