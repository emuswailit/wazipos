// components/retailers/productRequests/ViewRequestDetailsModal.tsx
//
// Read-only viewer for a product request.
//
// Mounted for statuses that don't require action:
//   PUBLISHED, FULFILLED, CANCELLED, EXPIRED.
//
// The retailer's actionable statuses (DRAFT, ACKNOWLEDGED,
// PARTIALLY_FULFILLED) are routed to OfferReviewModal instead.
//
// Renders every line and every offer that ever existed on the
// request — history only, no buttons, no decisions.
//
// Export shape: named export `ViewRequestDetailsModal`, matching
// the folder convention. A default export is also provided.

import React, { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import type {
    ProductRequest,
    ProductRequestItem,
    ProductRequestOffer,
} from '@/databases/types';

/* =========================================================
 * Types
 * ======================================================= */

interface Props {
    visible: boolean;
    request: ProductRequest | null;
    onClose: () => void;
}

/* =========================================================
 * Status → color tint maps
 * ======================================================= */

function requestStatusTint(status?: string) {
    const key = String(status ?? '').trim().toUpperCase();
    switch (key) {
        case 'DRAFT':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        case 'PUBLISHED':
            return { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' };
        case 'ACKNOWLEDGED':
            return { bg: 'rgba(99,102,241,0.15)', fg: '#6366f1' };
        case 'PARTIALLY_FULFILLED':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'FULFILLED':
            return { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' };
        case 'CANCELLED':
            return { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' };
        case 'EXPIRED':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        default:
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
    }
}

function urgencyTint(urgency?: string) {
    switch ((urgency ?? '').toLowerCase()) {
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

function offerStatusTint(status?: string) {
    const key = String(status ?? '').trim().toUpperCase();
    switch (key) {
        case 'OFFERED':
            return { bg: 'rgba(251,191,36,0.15)', fg: '#f59e0b' };
        case 'ACCEPTED':
        case 'CONFIRMED':
            return { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' };
        case 'DECLINED':
        case 'REJECTED':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        case 'CANCELLED':
        case 'WITHDRAWN':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        case 'EXPIRED':
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
        default:
            return { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' };
    }
}

/**
 * Map an offer's status code to a retailer-voice label.
 *
 * The API's `status_display` field is authored from the
 * wholesaler's perspective ("Awaiting retailer"). Read-only
 * view for the retailer needs a neutral label — no "you" or
 * "awaiting", just the state.
 */
function offerStatusLabel(
    status: string | undefined | null,
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
            return fallbackDisplay?.trim() || key || 'Unknown';
    }
}

/* =========================================================
 * Formatting
 * ======================================================= */

function formatMoney(v: string | number | null | undefined): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `KES ${n.toFixed(2)}`;
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

function offerTotal(o: ProductRequestOffer): number {
    const price = Number(o.offered_unit_price ?? 0);
    const qty = Number(o.offered_quantity ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) {
        return 0;
    }
    return price * qty;
}

/* =========================================================
 * Component
 * ======================================================= */

export const ViewRequestDetailsModal: React.FC<Props> = ({
    visible,
    request,
    onClose,
}) => {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const items = useMemo(
        () => request?.items ?? [],
        [request]
    );

    const totalRequested = useMemo(
        () =>
            items.reduce(
                (s, it) =>
                    s + (Number(it.requested_quantity) || 0),
                0
            ),
        [items]
    );

    const totalOffered = useMemo(
        () =>
            items.reduce((s, it) => {
                const offers = it.offers ?? [];
                return (
                    s +
                    offers.reduce(
                        (so, o) =>
                            so +
                            (Number(o.offered_quantity) || 0),
                        0
                    )
                );
            }, 0),
        [items]
    );

    const totalAccepted = useMemo(
        () =>
            items.reduce((s, it) => {
                const offers = it.offers ?? [];
                return (
                    s +
                    offers
                        .filter((o) => {
                            const k = String(o.status ?? '')
                                .trim()
                                .toUpperCase();
                            return (
                                k === 'ACCEPTED' ||
                                k === 'CONFIRMED'
                            );
                        })
                        .reduce(
                            (so, o) =>
                                so +
                                (Number(o.offered_quantity) ||
                                    0),
                            0
                        )
                );
            }, 0),
        [items]
    );

    const offerCount = useMemo(
        () =>
            items.reduce(
                (s, it) => s + (it.offers?.length ?? 0),
                0
            ),
        [items]
    );

    if (!request) return null;

    const status = requestStatusTint(request.status);
    const urgency = urgencyTint(request.urgency);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/40 items-center justify-center p-3">
                <View
                    className="rounded-2xl w-full max-w-2xl max-h-[92%] overflow-hidden"
                    style={{ backgroundColor: theme.panel }}
                >
                    {/* ============ header ============ */}
                    <View
                        className="px-5 pt-4 pb-3 border-b"
                        style={{
                            borderBottomColor:
                                theme.textDark + '22',
                        }}
                    >
                        <View className="flex-row items-start">
                            <View className="flex-1 min-w-0">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.semibold,
                                        fontSize:
                                            theme.fontSize.xs,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    {request.request_number || '—'}
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.lg,
                                    }}
                                >
                                    Request Details
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                    numberOfLines={1}
                                >
                                    {request.entity_title ||
                                        'Unknown retailer'}
                                </Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                hitSlop={12}
                                className="w-8 h-8 items-center justify-center rounded-full"
                                style={{
                                    backgroundColor:
                                        theme.background,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize:
                                            theme.fontSize.lg,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* meta chips */}
                        <View className="flex-row items-center flex-wrap gap-1.5 mt-3">
                            <View
                                className="px-2 py-0.5 rounded-md"
                                style={{
                                    backgroundColor: status.bg,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: status.fg,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {request.status_display ||
                                        request.status}
                                </Text>
                            </View>

                            <View
                                className="px-2 py-0.5 rounded-md"
                                style={{
                                    backgroundColor: urgency.bg,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: urgency.fg,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {(
                                        request.urgency_display ||
                                        request.urgency ||
                                        ''
                                    ).toUpperCase()}
                                </Text>
                            </View>

                            <View
                                className="px-2 py-0.5 rounded-md border"
                                style={{
                                    borderColor,
                                    backgroundColor:
                                        isDarkMode
                                            ? '#0f172a'
                                            : '#f1f5f9',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {items.length}{' '}
                                    {items.length === 1
                                        ? 'line'
                                        : 'lines'}
                                </Text>
                            </View>

                            {offerCount > 0 ? (
                                <View
                                    className="px-2 py-0.5 rounded-md"
                                    style={{
                                        backgroundColor:
                                            'rgba(99,102,241,0.15)',
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: '#6366f1',
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 10,
                                        }}
                                    >
                                        {offerCount}{' '}
                                        {offerCount === 1
                                            ? 'offer'
                                            : 'offers'}
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        {/* request note */}
                        {request.note?.trim() ? (
                            <View
                                className="rounded-lg px-3 py-2 mt-3"
                                style={{ backgroundColor: subBg }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                    }}
                                >
                                    Retailer note
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 12,
                                    }}
                                >
                                    {request.note}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* ============ body ============ */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {items.length === 0 ? (
                            <View className="items-center py-8">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    No line items on this request.
                                </Text>
                            </View>
                        ) : (
                            items.map((it, i) => (
                                <LineCard
                                    key={it.id ?? String(i)}
                                    item={it}
                                    index={i}
                                />
                            ))
                        )}
                    </ScrollView>

                    {/* ============ footer ============ */}
                    <View
                        className="px-5 py-3 border-t"
                        style={{
                            borderTopColor:
                                theme.textDark + '22',
                        }}
                    >
                        <View className="flex-row items-center">
                            <View className="flex-1">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    REQUESTED · OFFERED · ACCEPTED
                                </Text>
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.semibold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    {totalRequested} ·{' '}
                                    {totalOffered} ·{' '}
                                    {totalAccepted} units
                                </Text>
                            </View>

                            <Pressable
                                onPress={onClose}
                                className="px-5 py-2 rounded-lg"
                                style={{
                                    backgroundColor:
                                        theme.primary,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default ViewRequestDetailsModal;

/* =========================================================
 * Line card
 * ======================================================= */

const LineCard: React.FC<{
    item: ProductRequestItem;
    index: number;
}> = ({ item, index }) => {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const urgency = urgencyTint(item.urgency);
    const lineStatus = requestStatusTint(item.status);
    const offers = item.offers ?? [];

    return (
        <View
            className="mb-3 rounded-xl border overflow-hidden"
            style={{ borderColor }}
        >
            {/* header */}
            <View
                className="p-3"
                style={{ backgroundColor: theme.panel }}
            >
                <View className="flex-row items-start">
                    <Text
                        className="mr-2"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        #{index + 1}
                    </Text>
                    <Text
                        className="flex-1"
                        style={{
                            color: theme.text,
                            fontFamily:
                                theme.font.semibold,
                            fontSize: theme.fontSize.sm,
                        }}
                        numberOfLines={2}
                    >
                        {item.product_title ||
                            'Untitled product'}
                    </Text>
                </View>

                <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
                    {item.urgency_display || item.urgency ? (
                        <View
                            className="px-2 py-0.5 rounded-md"
                            style={{
                                backgroundColor: urgency.bg,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: urgency.fg,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                {(
                                    item.urgency_display ||
                                    item.urgency ||
                                    ''
                                ).toUpperCase()}
                            </Text>
                        </View>
                    ) : null}

                    {item.status_display || item.status ? (
                        <View
                            className="px-2 py-0.5 rounded-md"
                            style={{
                                backgroundColor: lineStatus.bg,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: lineStatus.fg,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                {item.status_display ||
                                    item.status}
                            </Text>
                        </View>
                    ) : null}

                    <View
                        className="px-2 py-0.5 rounded-md border"
                        style={{
                            borderColor,
                            backgroundColor: isDarkMode
                                ? '#0f172a'
                                : '#f1f5f9',
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            {item.requested_quantity ?? 0}{' '}
                            requested
                        </Text>
                    </View>

                    {item.product_bar_code ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily:
                                    theme.font.medium,
                                fontSize: 10,
                            }}
                        >
                            {item.product_bar_code}
                        </Text>
                    ) : null}
                </View>

                {item.note?.trim() ? (
                    <View
                        className="rounded-lg px-2.5 py-1.5 mt-2"
                        style={{ backgroundColor: subBg }}
                    >
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily:
                                    theme.font.medium,
                                fontSize: 11,
                            }}
                        >
                            {item.note}
                        </Text>
                    </View>
                ) : null}
            </View>

            {/* offers */}
            <View
                className="p-3 border-t"
                style={{
                    borderTopColor: theme.textDark + '22',
                    backgroundColor: theme.background,
                }}
            >
                <Text
                    className="uppercase tracking-widest mb-2"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                        letterSpacing: 0.5,
                    }}
                >
                    {offers.length === 0
                        ? 'No offers'
                        : `${offers.length} offer${offers.length === 1 ? '' : 's'
                        }`}
                </Text>

                {offers.length === 0 ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            opacity: 0.7,
                        }}
                    >
                        No offers were made on this line.
                    </Text>
                ) : (
                    offers.map((o) => (
                        <OfferRow key={o.id} offer={o} />
                    ))
                )}
            </View>
        </View>
    );
};

/* =========================================================
 * Offer row — read-only
 * ======================================================= */

const OfferRow: React.FC<{ offer: ProductRequestOffer }> = ({
    offer,
}) => {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const status = offerStatusTint(offer.status);
    const label = offerStatusLabel(
        offer.status,
        offer.status_display
    );

    const unitPrice = offer.offered_unit_price
        ? Number(offer.offered_unit_price)
        : 0;
    const total = offerTotal(offer);

    return (
        <View
            className="rounded-lg border px-3 py-2 mb-2"
            style={{
                borderColor,
                backgroundColor: isDarkMode
                    ? '#0f172a'
                    : '#f8fafc',
            }}
        >
            <View className="flex-row items-center">
                <Text
                    className="flex-1"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.semibold,
                        fontSize: theme.fontSize.sm,
                    }}
                    numberOfLines={1}
                >
                    {offer.wholesaler_title || 'Wholesaler'}
                </Text>
                <View
                    className="px-2 py-0.5 rounded-md ml-2"
                    style={{ backgroundColor: status.bg }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: status.fg,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        {label}
                    </Text>
                </View>
            </View>

            <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mt-1.5">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    {offer.offered_quantity} unit
                    {offer.offered_quantity === 1 ? '' : 's'}
                </Text>

                {offer.offered_unit_price ? (
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        {formatMoney(unitPrice)} / unit
                    </Text>
                ) : null}

                {total > 0 ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        Total {formatMoney(total)}
                    </Text>
                ) : null}

                {offer.batch ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        Batch {offer.batch}
                    </Text>
                ) : null}

                {offer.expiry_date ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        Exp {formatDate(offer.expiry_date)}
                    </Text>
                ) : null}
            </View>

            {offer.response_note?.trim() ? (
                <Text
                    className="mt-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {offer.response_note}
                </Text>
            ) : null}

            {offer.retailer_response_note?.trim() ? (
                <Text
                    className="mt-1"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    You: {offer.retailer_response_note}
                </Text>
            ) : null}

            <Text
                className="mt-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                    fontSize: 10,
                    opacity: 0.7,
                }}
            >
                Offered {formatDate(offer.created)}
                {offer.retailer_confirmed_at
                    ? ` · Confirmed ${formatDate(
                        offer.retailer_confirmed_at
                    )}`
                    : ''}
            </Text>
        </View>
    );
};