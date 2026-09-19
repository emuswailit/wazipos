// components/retailers/productRequests/OfferReviewModal.tsx

import { useAuth } from '@/context/AuthContext';
import {
    ProductRequest,
    ProductRequestItem,
    ProductRequestOffer,
} from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

interface Props {
    visible: boolean;
    request: ProductRequest | null;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: (payload: {
        request_id: string;
        confirmations: Array<{
            offer_id: string;
            response_note?: string;
        }>;
        declinations: Array<{
            offer_id: string;
            reason?: string;
        }>;
        note?: string;
    }) => Promise<boolean | void>;

    /**
     * Called when the request is still a local DRAFT and the user
     * taps Submit. Sends the basket to the server, which creates the
     * request in PUBLISHED.
     *
     * The parent (RetailerProductRequestsList) supplies this from
     * `useRetailerProductRequestsSync().submitDrafts`.
     */
    onPublishDraft?: () => Promise<{
        requestIds: string[];
        draftCount: number;
    }>;
}

type Decision = 'confirm' | 'decline' | null;

interface LineState {
    decisions: Record<string, Decision>;
    notes: Record<string, string>;
}

interface WholesalerChip {
    id: string;
    title: string;
}

/* =========================================================
 * Main modal
 * ======================================================= */

export function OfferReviewModal({
    visible,
    request,
    isLoading,
    onClose,
    onConfirm,
    onPublishDraft,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [state, setState] = useState<Record<string, LineState>>(
        {}
    );
    const [overallNote, setOverallNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!request) return;
        const next: Record<string, LineState> = {};
        for (const line of request.items) {
            next[line.id] = { decisions: {}, notes: {} };
        }
        setState(next);
        setOverallNote('');
        setIsSubmitting(false);
    }, [request]);

    const setDecision = useCallback(
        (
            lineId: string,
            offerId: string,
            decision: Decision
        ) => {
            setState((prev) => ({
                ...prev,
                [lineId]: {
                    ...prev[lineId],
                    decisions: {
                        ...prev[lineId]?.decisions,
                        [offerId]: decision,
                    },
                },
            }));
        },
        []
    );

    const setNote = useCallback(
        (lineId: string, offerId: string, note: string) => {
            setState((prev) => ({
                ...prev,
                [lineId]: {
                    ...prev[lineId],
                    notes: {
                        ...prev[lineId]?.notes,
                        [offerId]: note,
                    },
                },
            }));
        },
        []
    );

    const summary = useMemo(() => {
        if (!request)
            return {
                confirmations: 0,
                declinations: 0,
                totalValue: 0,
            };
        let confirmations = 0;
        let declinations = 0;
        let totalValue = 0;
        for (const line of request.items) {
            const ls = state[line.id];
            if (!ls) continue;
            for (const offer of line.offers) {
                const d = ls.decisions[offer.id];
                if (d === 'confirm') {
                    confirmations += 1;
                    const price = Number(
                        offer.offered_unit_price || 0
                    );
                    totalValue +=
                        price * offer.offered_quantity;
                } else if (d === 'decline') {
                    declinations += 1;
                }
            }
        }
        return { confirmations, declinations, totalValue };
    }, [request, state]);

    /** True when the request is still a local, unsent draft. */
    const isDraft =
        request?.status === 'DRAFT' ||
        (request as any)?.is_pending === true;

    const handleConfirmOffers = useCallback(async () => {
        if (!request || isSubmitting) return;
        const confirmations: Array<{
            offer_id: string;
            response_note?: string;
        }> = [];
        const declinations: Array<{
            offer_id: string;
            reason?: string;
        }> = [];

        for (const line of request.items) {
            const ls = state[line.id];
            if (!ls) continue;
            for (const offer of line.offers) {
                const d = ls.decisions[offer.id];
                if (d === 'confirm') {
                    confirmations.push({
                        offer_id: offer.id,
                        response_note:
                            ls.notes[offer.id] || undefined,
                    });
                } else if (d === 'decline') {
                    declinations.push({
                        offer_id: offer.id,
                        reason: ls.notes[offer.id] || undefined,
                    });
                }
            }
        }

        if (!confirmations.length && !declinations.length)
            return;

        setIsSubmitting(true);
        try {
            await onConfirm({
                request_id: request.id,
                confirmations,
                declinations,
                note: overallNote || undefined,
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [
        request,
        state,
        overallNote,
        onConfirm,
        isSubmitting,
    ]);

    const handlePublishDraft = useCallback(async () => {
        if (!onPublishDraft || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onPublishDraft();
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    }, [onPublishDraft, isSubmitting, onClose]);

    if (!visible) return null;

    const canSubmit = isDraft
        ? !!onPublishDraft && !isSubmitting
        : (summary.confirmations > 0 ||
            summary.declinations > 0) &&
        !isSubmitting;

    const primaryLabel = isSubmitting
        ? isDraft
            ? 'Submitting...'
            : 'Submitting...'
        : isDraft
            ? 'Submit draft'
            : 'Submit';

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {request?.request_number ??
                                    'Request details'}
                            </Text>
                            {request ? (
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {request.total_line_count} lines
                                    ·{' '}
                                    {request.fulfilled_line_count}{' '}
                                    fulfilled ·{' '}
                                    {request.status_display}
                                </Text>
                            ) : null}
                        </View>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            className="p-1.5"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize:
                                        theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    {isLoading || !request ? (
                        <View className="p-10 items-center">
                            <ActivityIndicator
                                size="large"
                                color={theme.primary}
                            />
                            <Text
                                className="mt-3"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            >
                                Loading request...
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            contentContainerStyle={{
                                padding: 16,
                            }}
                        >
                            {request.items.map((line) => (
                                <LineBlock
                                    key={line.id}
                                    line={line}
                                    lineState={state[line.id]}
                                    onSetDecision={setDecision}
                                    onSetNote={setNote}
                                />
                            ))}

                            <Text
                                className="uppercase tracking-widest mb-2 mt-3"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Overall note (optional)
                            </Text>
                            <TextInput
                                value={overallNote}
                                onChangeText={setOverallNote}
                                placeholder="Message to wholesalers"
                                placeholderTextColor="#94a3b8"
                                multiline
                                numberOfLines={2}
                                className="rounded-xl border px-3 py-2 min-h-[60px]"
                                style={{
                                    borderColor,
                                    backgroundColor: subBg,
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            />
                        </ScrollView>
                    )}

                    {/* Footer */}
                    <View
                        className="flex-row items-center justify-between gap-2 p-4 border-t flex-wrap"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <View className="flex-1 min-w-[200px]">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.xs,
                                }}
                            >
                                {isDraft
                                    ? 'Ready to send to wholesalers'
                                    : `${summary.confirmations} to confirm · ${summary.declinations} to decline${summary.totalValue > 0
                                        ? ` · KES ${summary.totalValue.toLocaleString(
                                            undefined,
                                            {
                                                maximumFractionDigits: 2,
                                            }
                                        )}`
                                        : ''
                                    }`}
                            </Text>
                        </View>

                        <View className="flex-row gap-2">
                            <Pressable
                                onPress={onClose}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{ borderColor }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={
                                    isDraft
                                        ? handlePublishDraft
                                        : handleConfirmOffers
                                }
                                disabled={!canSubmit}
                                className="px-4 py-2.5 rounded-xl"
                                style={{
                                    backgroundColor:
                                        theme.primary,
                                    opacity: canSubmit
                                        ? 1
                                        : 0.5,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    {primaryLabel}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Helpers
 * ======================================================= */

function resolveWholesalers(
    line: ProductRequestItem
): WholesalerChip[] {
    const anyLine = line as any;

    const objects = anyLine.wholesalers;
    if (Array.isArray(objects) && objects.length > 0) {
        const seen = new Set<string>();
        const out: WholesalerChip[] = [];
        for (const w of objects) {
            if (!w || typeof w.id !== 'string') continue;
            const id = String(w.id);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                id,
                title: String(w.title ?? '') || id,
            });
        }
        return out;
    }

    const ids = anyLine.target_wholesaler_ids;
    const titles = anyLine.wholesaler_titles;

    if (Array.isArray(ids) && ids.length > 0) {
        const seen = new Set<string>();
        const out: WholesalerChip[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id = String(ids[i]);
            if (seen.has(id)) continue;
            seen.add(id);
            const title = String(
                (Array.isArray(titles) ? titles[i] : '') || id
            );
            out.push({ id, title });
        }
        return out;
    }

    if (Array.isArray(titles) && titles.length > 0) {
        const seen = new Set<string>();
        const out: WholesalerChip[] = [];
        for (const t of titles) {
            const title = String(t ?? '');
            if (!title) continue;
            if (seen.has(title)) continue;
            seen.add(title);
            out.push({ id: title, title });
        }
        return out;
    }

    return [];
}

/* =========================================================
 * Line block
 * ======================================================= */

function LineBlock({
    line,
    lineState,
    onSetDecision,
    onSetNote,
}: {
    line: ProductRequestItem;
    lineState: LineState | undefined;
    onSetDecision: (
        lineId: string,
        offerId: string,
        decision: Decision
    ) => void;
    onSetNote: (
        lineId: string,
        offerId: string,
        note: string
    ) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const hasOffers = line.offers.length > 0;
    const wholesalers = resolveWholesalers(line);

    return (
        <View
            className="rounded-2xl border p-3.5 mb-4"
            style={{ backgroundColor: subBg, borderColor }}
        >
            <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 min-w-0">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                        }}
                        numberOfLines={2}
                    >
                        {line.product_title}
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 12,
                        }}
                    >
                        Requested: {line.requested_quantity} ·{' '}
                        {line.urgency_display}
                        {line.confirmed_quantity > 0
                            ? ` · Confirmed: ${line.confirmed_quantity}`
                            : ''}
                    </Text>

                    {wholesalers.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1 mt-2 items-center">
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 9,
                                    marginRight: 4,
                                }}
                            >
                                Sent to
                            </Text>
                            {wholesalers.map((w) => (
                                <View
                                    key={w.id}
                                    className="px-2 py-0.5 rounded-md border"
                                    style={{
                                        borderColor:
                                            theme.primary + '40',
                                        backgroundColor:
                                            theme.primary + '12',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontFamily:
                                                theme.font.semibold,
                                            fontSize: 10,
                                        }}
                                    >
                                        {w.title}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
                {line.status === 'FULFILLED' ? (
                    <View
                        className="px-2 py-0.5 rounded-full"
                        style={{
                            backgroundColor:
                                'rgba(16,185,129,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Fulfilled
                        </Text>
                    </View>
                ) : null}
            </View>

            {!hasOffers ? (
                <View
                    className="rounded-xl px-3 py-3 items-center"
                    style={{
                        backgroundColor: isDarkMode
                            ? '#1e293b'
                            : '#e2e8f0',
                    }}
                >
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        No offers received yet
                    </Text>
                </View>
            ) : (
                line.offers.map((offer) => (
                    <OfferBlock
                        key={offer.id}
                        offer={offer}
                        decision={
                            lineState?.decisions[offer.id] ??
                            null
                        }
                        note={lineState?.notes[offer.id] ?? ''}
                        onSetDecision={(d) =>
                            onSetDecision(
                                line.id,
                                offer.id,
                                d
                            )
                        }
                        onSetNote={(n) =>
                            onSetNote(line.id, offer.id, n)
                        }
                    />
                ))
            )}
        </View>
    );
}

/* =========================================================
 * Offer block
 * ======================================================= */

function OfferBlock({
    offer,
    decision,
    note,
    onSetDecision,
    onSetNote,
}: {
    offer: ProductRequestOffer;
    decision: Decision;
    note: string;
    onSetDecision: (d: Decision) => void;
    onSetNote: (n: string) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const isConfirmed = decision === 'confirm';
    const isDeclined = decision === 'decline';
    const isPending = decision === null;
    const isWithdrawn = offer.status === 'WITHDRAWN';
    const isFulfilled = offer.status === 'FULFILLED';
    const isAlreadyDecided =
        isFulfilled ||
        offer.status === 'DECLINED_BY_RETAILER';

    const cardBorder = isConfirmed
        ? theme.primary
        : isDeclined
            ? '#ef4444'
            : borderColor;

    const cardBg = isDarkMode ? '#0f172a' : '#f8fafc';

    return (
        <View
            className="rounded-xl border p-3 mb-2"
            style={{
                backgroundColor: cardBg,
                borderColor: cardBorder,
                borderWidth:
                    isConfirmed || isDeclined ? 1.5 : 1,
                opacity:
                    isWithdrawn || isAlreadyDecided ? 0.6 : 1,
            }}
        >
            <View className="flex-row items-center justify-between mb-2">
                <View className="flex-1 min-w-0">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                        numberOfLines={1}
                    >
                        {offer.wholesaler_title ||
                            'Unknown wholesaler'}
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                        numberOfLines={1}
                    >
                        {offer.wholesaler_receipt_title || ''}
                    </Text>
                </View>

                {isFulfilled ? (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{
                            backgroundColor:
                                'rgba(16,185,129,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Fulfilled
                        </Text>
                    </View>
                ) : isWithdrawn ? (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{
                            backgroundColor:
                                'rgba(239,68,68,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#ef4444',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            Withdrawn
                        </Text>
                    </View>
                ) : offer.status ===
                    'DECLINED_BY_RETAILER' ? (
                    <View
                        className="px-1.5 py-0.5 rounded"
                        style={{
                            backgroundColor:
                                'rgba(148,163,184,0.15)',
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
                            Declined
                        </Text>
                    </View>
                ) : null}
            </View>

            <View className="flex-row flex-wrap gap-1.5 mb-2">
                <MiniBadge
                    label={`${offer.offered_quantity} units`}
                    tone="default"
                />
                {offer.offered_unit_price ? (
                    <MiniBadge
                        label={`KES ${Number(
                            offer.offered_unit_price
                        ).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                        })}`}
                        tone="success"
                    />
                ) : null}
                {offer.batch ? (
                    <MiniBadge label={`Batch ${offer.batch}`} />
                ) : null}
                {offer.expiry_date ? (
                    <MiniBadge
                        label={`Exp ${offer.expiry_date}`}
                    />
                ) : null}
                {offer.is_placement ? (
                    <MiniBadge
                        label="Consignment"
                        tone="warning"
                    />
                ) : null}
            </View>

            {offer.response_note ? (
                <Text
                    className="text-[11px] mt-1 mb-2"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                    }}
                >
                    {offer.response_note}
                </Text>
            ) : null}

            {!isAlreadyDecided && !isWithdrawn ? (
                <>
                    <View className="flex-row gap-2 mt-2">
                        <Pressable
                            onPress={() =>
                                onSetDecision(
                                    isConfirmed
                                        ? null
                                        : 'confirm'
                                )
                            }
                            className="flex-1 py-2 rounded-lg items-center"
                            style={{
                                backgroundColor: isConfirmed
                                    ? theme.primary
                                    : 'transparent',
                                borderWidth: 1,
                                borderColor: theme.primary,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-[11px]"
                                style={{
                                    color: isConfirmed
                                        ? '#ffffff'
                                        : theme.primary,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                {isConfirmed
                                    ? 'Confirmed'
                                    : 'Confirm'}
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() =>
                                onSetDecision(
                                    isDeclined
                                        ? null
                                        : 'decline'
                                )
                            }
                            className="flex-1 py-2 rounded-lg items-center"
                            style={{
                                backgroundColor: isDeclined
                                    ? '#ef4444'
                                    : 'transparent',
                                borderWidth: 1,
                                borderColor: '#ef4444',
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-[11px]"
                                style={{
                                    color: isDeclined
                                        ? '#ffffff'
                                        : '#ef4444',
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                {isDeclined
                                    ? 'Declined'
                                    : 'Decline'}
                            </Text>
                        </Pressable>
                    </View>

                    {!isPending ? (
                        <TextInput
                            value={note}
                            onChangeText={onSetNote}
                            placeholder={
                                isConfirmed
                                    ? 'Confirm note (optional)'
                                    : 'Reason for declining (optional)'
                            }
                            placeholderTextColor="#94a3b8"
                            className="h-9 rounded-lg border px-3 mt-2"
                            style={{
                                borderColor,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.xs,
                            }}
                        />
                    ) : null}
                </>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Mini badge
 * ======================================================= */

function MiniBadge({
    label,
    tone = 'default',
}: {
    label: string;
    tone?: 'default' | 'success' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();

    const bg =
        tone === 'success'
            ? 'rgba(16,185,129,0.15)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.15)'
                : isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9';

    const border =
        tone === 'success'
            ? 'rgba(16,185,129,0.3)'
            : tone === 'warning'
                ? 'rgba(251,191,36,0.3)'
                : isDarkMode
                    ? '#334155'
                    : '#e2e8f0';

    const color =
        tone === 'success'
            ? '#10b981'
            : tone === 'warning'
                ? '#f59e0b'
                : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}