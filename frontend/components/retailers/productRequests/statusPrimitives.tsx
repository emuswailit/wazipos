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

/* =========================================================
 * Canonical request status list
 *
 * Order matters — the filter strip renders left to right in this
 * order. `ALL` is a synthetic filter; the rest map 1:1 to server
 * statuses.
 * ======================================================= */

interface RequestStatusOption {
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
 * Count aggregation
 * ======================================================= */

/**
 * Compute per-status counts from a request array. Used for
 * the status filter counts.
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
