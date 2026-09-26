// components/retailers/productRequests/OfferReviewModal.tsx
//
// Review and respond to wholesaler offers on a product request.
//
// - One accept per line, structurally. Accepting A on a line
//   auto-declines its siblings at submit time.
// - Lines are grouped in order; lines with no actionable offers
//   are shown as informational only and don't block submit.
// - DRAFT requests show a publish state instead of the offer
//   review — publishing is what puts the request on the wire.
// - Submit is disabled until every actionable line has a
//   decision (accept or full decline) and at least one decision
//   exists.
//
// Payload:
//   {
//     request_id,
//     confirmations: [{ offer_id, response_note? }],
//     declinations:  [{ offer_id, reason? }],
//     note?,
//   }
//
// Export shape: named export `OfferReviewModal`, matching the
// folder convention used by CreateRequestModal and the two
// view files. A default export is also provided for callers
// that import it the other way.

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
    }) => Promise<boolean> | boolean;
    onPublishDraft?: () => Promise<void> | void;
    isLoading?: boolean;
}

interface LineDecision {
    acceptedOfferId: string | null;
    explicitDeclineIds: Set<string>;
    responseNote: string;
}

/* =========================================================
 * Helpers
 * ======================================================= */

function isActionableOffer(o: ProductRequestOffer): boolean {
    return (
        String(o.status ?? '').trim().toUpperCase() === 'OFFERED'
    );
}

function isDraftStatus(status?: string | null): boolean {
    return (
        String(status ?? '').trim().toUpperCase() === 'DRAFT'
    );
}

function formatMoney(v: string | number | null | undefined): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `KES ${n.toFixed(2)}`;
}

function offerTotal(o: ProductRequestOffer): number {
    const price = Number(o.offered_unit_price ?? 0);
    const qty = Number(o.offered_quantity ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) {
        return 0;
    }
    return price * qty;
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

/* =========================================================
 * Component
 * ======================================================= */

export const OfferReviewModal: React.FC<Props> = ({
    visible,
    request,
    onClose,
    onConfirm,
    onPublishDraft,
    isLoading = false,
}) => {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const [decisions, setDecisions] = useState<
        Map<string, LineDecision>
    >(new Map());
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ---- Reset when the modal opens for a new request ---- */
    useEffect(() => {
        if (!visible || !request) return;
        setDecisions(new Map());
        setNote('');
        setError(null);
        setSubmitting(false);
        setPublishing(false);
    }, [visible, request?.id]);

    useEffect(() => {
        console.log("request...", request)
    }, [request])

    /* ---- Group lines with their actionable offers ---- */
    const linesWithOffers = useMemo(() => {
        const items = request?.items ?? [];
        return items.map((it) => ({
            item: it,
            actionable: (it.offers ?? []).filter(
                isActionableOffer
            ),
        }));
    }, [request]);

    const actionableLineCount = useMemo(
        () =>
            linesWithOffers.filter(
                (l) => l.actionable.length > 0
            ).length,
        [linesWithOffers]
    );

    const totalOffers = useMemo(
        () =>
            linesWithOffers.reduce(
                (s, l) => s + l.actionable.length,
                0
            ),
        [linesWithOffers]
    );

    const isDraft = isDraftStatus(request?.status);

    /* ---------------------------------------------------------
     * Decision accessors
     * ------------------------------------------------------- */
    const getDecision = useCallback(
        (lineId: string): LineDecision =>
            decisions.get(lineId) ?? {
                acceptedOfferId: null,
                explicitDeclineIds: new Set(),
                responseNote: '',
            },
        [decisions]
    );

    const acceptOffer = useCallback(
        (lineId: string, offerId: string) => {
            setDecisions((prev) => {
                const next = new Map(prev);
                const current = getDecision(lineId);
                next.set(lineId, {
                    ...current,
                    acceptedOfferId: offerId,
                    explicitDeclineIds: new Set(),
                });
                return next;
            });
            setError(null);
        },
        [getDecision]
    );

    const declineOffer = useCallback(
        (lineId: string, offerId: string) => {
            setDecisions((prev) => {
                const next = new Map(prev);
                const current = getDecision(lineId);
                const newDeclines = new Set(
                    current.explicitDeclineIds
                );
                newDeclines.add(offerId);
                next.set(lineId, {
                    ...current,
                    acceptedOfferId:
                        current.acceptedOfferId === offerId
                            ? null
                            : current.acceptedOfferId,
                    explicitDeclineIds: newDeclines,
                });
                return next;
            });
            setError(null);
        },
        [getDecision]
    );

    const undoDecline = useCallback(
        (lineId: string, offerId: string) => {
            setDecisions((prev) => {
                const next = new Map(prev);
                const current = getDecision(lineId);
                const newDeclines = new Set(
                    current.explicitDeclineIds
                );
                newDeclines.delete(offerId);
                next.set(lineId, {
                    ...current,
                    explicitDeclineIds: newDeclines,
                });
                return next;
            });
        },
        [getDecision]
    );

    /* ---------------------------------------------------------
     * Validity
     * ------------------------------------------------------- */
    const undecidedLineIds = useMemo(() => {
        const ids: string[] = [];
        for (const { item, actionable } of linesWithOffers) {
            if (actionable.length === 0) continue;
            const d = decisions.get(item.id);
            const hasAccept = !!d?.acceptedOfferId;
            const declinedCount = actionable.filter((o) =>
                d?.explicitDeclineIds.has(o.id)
            ).length;
            if (
                !hasAccept &&
                declinedCount < actionable.length
            ) {
                ids.push(item.id);
            }
        }
        return ids;
    }, [linesWithOffers, decisions]);

    const confirmCount = useMemo(() => {
        let n = 0;
        for (const d of decisions.values()) {
            if (d.acceptedOfferId) n += 1;
        }
        return n;
    }, [decisions]);

    const declineCount = useMemo(() => {
        let n = 0;
        for (const { item, actionable } of linesWithOffers) {
            const d = decisions.get(item.id);
            if (!d) continue;
            if (d.acceptedOfferId) {
                n += actionable.length - 1;
            } else {
                n += d.explicitDeclineIds.size;
            }
        }
        return n;
    }, [decisions, linesWithOffers]);

    const decisionCount = confirmCount + declineCount;

    const canSubmit =
        !submitting &&
        !isLoading &&
        !publishing &&
        undecidedLineIds.length === 0 &&
        decisionCount > 0;

    const canPublish =
        isDraft &&
        !publishing &&
        !isLoading &&
        !!onPublishDraft;

    /* ---------------------------------------------------------
     * Submit
     * ------------------------------------------------------- */
    const handleSubmit = useCallback(async () => {
        if (!request || !canSubmit) return;

        const confirmations: Array<{
            offer_id: string;
            response_note?: string;
        }> = [];
        const declinations: Array<{
            offer_id: string;
            reason?: string;
        }> = [];

        for (const { item, actionable } of linesWithOffers) {
            if (actionable.length === 0) continue;
            const d = decisions.get(item.id);
            if (!d) continue;

            if (d.acceptedOfferId) {
                confirmations.push({
                    offer_id: d.acceptedOfferId,
                    response_note:
                        d.responseNote?.trim() || undefined,
                });
                for (const o of actionable) {
                    if (o.id === d.acceptedOfferId) continue;
                    declinations.push({ offer_id: o.id });
                }
            } else {
                for (const id of d.explicitDeclineIds) {
                    declinations.push({
                        offer_id: id,
                        reason:
                            d.responseNote?.trim() || undefined,
                    });
                }
            }
        }

        setSubmitting(true);
        setError(null);

        try {
            const ok = await onConfirm({
                request_id: request.id,
                confirmations,
                declinations,
                note: note.trim() || undefined,
            });

            if (!ok) {
                setError('Server rejected the response.');
                return;
            }

            onClose();
        } catch (e: any) {
            setError(
                e?.message ??
                'Could not submit the response.'
            );
        } finally {
            setSubmitting(false);
        }
    }, [
        request,
        canSubmit,
        linesWithOffers,
        decisions,
        note,
        onConfirm,
        onClose,
    ]);

    /* ---------------------------------------------------------
     * Publish (draft only)
     * ------------------------------------------------------- */
    const handlePublish = useCallback(async () => {
        if (!canPublish || !onPublishDraft) return;
        setPublishing(true);
        setError(null);
        try {
            await onPublishDraft();
            onClose();
        } catch (e: any) {
            setError(
                e?.message ?? 'Could not publish the request.'
            );
        } finally {
            setPublishing(false);
        }
    }, [canPublish, onPublishDraft, onClose]);

    if (!request) return null;

    const busy = submitting || publishing || isLoading;

    /* =========================================================
     * Render
     * ======================================================= */
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={busy ? () => { } : onClose}
        >
            <View className="flex-1 bg-black/40 items-center justify-center p-3">
                <View
                    className="rounded-2xl w-full max-w-2xl max-h-[92%] overflow-hidden"
                    style={{ backgroundColor: theme.panel }}
                >
                    {/* ---------- header ---------- */}
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
                                    {isDraft
                                        ? 'Review Draft'
                                        : 'Review Offers'}
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
                                >
                                    {isDraft
                                        ? `${request.total_line_count} line${request.total_line_count ===
                                            1
                                            ? ''
                                            : 's'
                                        } · not yet published`
                                        : `${actionableLineCount} line${actionableLineCount === 1
                                            ? ''
                                            : 's'
                                        } with offers · ${totalOffers} offer${totalOffers === 1
                                            ? ''
                                            : 's'
                                        }`}
                                </Text>
                            </View>
                            <Pressable
                                onPress={
                                    busy ? undefined : onClose
                                }
                                hitSlop={12}
                                disabled={busy}
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
                    </View>

                    {/* ---------- body ---------- */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 16 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {linesWithOffers.length === 0 ? (
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
                            linesWithOffers.map(
                                ({ item, actionable }, idx) => (
                                    <LineCard
                                        key={item.id}
                                        item={item}
                                        index={idx}
                                        actionableOffers={
                                            actionable
                                        }
                                        decision={getDecision(
                                            item.id
                                        )}
                                        onAccept={(offerId) =>
                                            acceptOffer(
                                                item.id,
                                                offerId
                                            )
                                        }
                                        onDecline={(offerId) =>
                                            declineOffer(
                                                item.id,
                                                offerId
                                            )
                                        }
                                        onUndoDecline={(offerId) =>
                                            undoDecline(
                                                item.id,
                                                offerId
                                            )
                                        }
                                    />
                                )
                            )
                        )}

                        {!isDraft ? (
                            <View className="mt-5">
                                <Text
                                    className="mb-1.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.semibold,
                                        fontSize:
                                            theme.fontSize.xs,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    OVERALL NOTE (OPTIONAL)
                                </Text>
                                <TextInput
                                    value={note}
                                    onChangeText={setNote}
                                    placeholder="Message to wholesalers"
                                    placeholderTextColor={
                                        theme.textDark
                                    }
                                    multiline
                                    numberOfLines={3}
                                    textAlignVertical="top"
                                    className="px-3 py-2 rounded-lg min-h-[72px]"
                                    style={{
                                        backgroundColor:
                                            theme.background,
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                />
                            </View>
                        ) : null}

                        {error ? (
                            <View
                                className="rounded-lg px-3 py-2 mt-4"
                                style={{
                                    backgroundColor:
                                        'rgba(239,68,68,0.12)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(239,68,68,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#b91c1c',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {error}
                                </Text>
                            </View>
                        ) : null}
                    </ScrollView>

                    {/* ---------- footer ---------- */}
                    <View
                        className="px-5 py-3 border-t"
                        style={{
                            borderTopColor:
                                theme.textDark + '22',
                        }}
                    >
                        <View className="flex-row items-center">
                            <Text
                                className="flex-1"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize:
                                        theme.fontSize.xs,
                                }}
                            >
                                {isDraft
                                    ? 'Not yet published'
                                    : `${confirmCount} to confirm · ${declineCount} to decline${undecidedLineIds.length >
                                        0
                                        ? ` · ${undecidedLineIds.length} undecided`
                                        : ''
                                    }`}
                            </Text>

                            <Pressable
                                onPress={onClose}
                                disabled={busy}
                                className="px-4 py-2 rounded-lg mr-2"
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.semibold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>

                            {isDraft ? (
                                <Pressable
                                    onPress={handlePublish}
                                    disabled={!canPublish}
                                    className="px-5 py-2 rounded-lg flex-row items-center"
                                    style={{
                                        backgroundColor:
                                            canPublish
                                                ? theme.primary
                                                : theme.primary +
                                                '66',
                                    }}
                                >
                                    {publishing ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#FFFFFF"
                                        />
                                    ) : (
                                        <Text
                                            style={{
                                                color: '#FFFFFF',
                                                fontFamily:
                                                    theme.font
                                                        .semibold,
                                                fontSize:
                                                    theme.fontSize
                                                        .sm,
                                            }}
                                        >
                                            Publish Request
                                        </Text>
                                    )}
                                </Pressable>
                            ) : (
                                <Pressable
                                    onPress={handleSubmit}
                                    disabled={!canSubmit}
                                    className="px-5 py-2 rounded-lg flex-row items-center"
                                    style={{
                                        backgroundColor:
                                            canSubmit
                                                ? theme.primary
                                                : theme.primary +
                                                '66',
                                    }}
                                >
                                    {submitting ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#FFFFFF"
                                        />
                                    ) : (
                                        <Text
                                            style={{
                                                color: '#FFFFFF',
                                                fontFamily:
                                                    theme.font
                                                        .semibold,
                                                fontSize:
                                                    theme.fontSize
                                                        .sm,
                                            }}
                                        >
                                            Submit
                                        </Text>
                                    )}
                                </Pressable>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default OfferReviewModal;

/* =========================================================
 * Line card
 * ======================================================= */

const LineCard: React.FC<{
    item: ProductRequestItem;
    index: number;
    actionableOffers: ProductRequestOffer[];
    decision: LineDecision;
    onAccept: (offerId: string) => void;
    onDecline: (offerId: string) => void;
    onUndoDecline: (offerId: string) => void;
}> = ({
    item,
    index,
    actionableOffers,
    decision,
    onAccept,
    onDecline,
    onUndoDecline,
}) => {
        const { theme, isDarkMode } = useAuth();
        const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

        const hasOffers = actionableOffers.length > 0;
        const acceptedId = decision.acceptedOfferId;
        const declinedIds = decision.explicitDeclineIds;

        const lineDecided = hasOffers
            ? !!acceptedId ||
            actionableOffers.every((o) =>
                declinedIds.has(o.id)
            )
            : true;

        return (
            <View
                className="mb-3 rounded-xl border overflow-hidden"
                style={{
                    borderColor: lineDecided
                        ? 'rgba(16,185,129,0.4)'
                        : borderColor,
                    borderWidth: lineDecided ? 1.5 : 1,
                }}
            >
                {/* header */}
                <View
                    className="p-3"
                    style={{ backgroundColor: theme.panel }}
                >
                    <View className="flex-row items-center">
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
                        {hasOffers ? (
                            <View
                                className="px-2 py-0.5 rounded-md ml-2"
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
                                        fontSize: 9,
                                    }}
                                >
                                    {actionableOffers.length}{' '}
                                    {actionableOffers.length === 1
                                        ? 'offer'
                                        : 'offers'}
                                </Text>
                            </View>
                        ) : (
                            <View
                                className="px-2 py-0.5 rounded-md ml-2"
                                style={{
                                    backgroundColor:
                                        'rgba(148,163,184,0.15)',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#94a3b8',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                    }}
                                >
                                    Awaiting
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text
                        className="mt-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        {item.requested_quantity} requested
                    </Text>
                </View>

                {/* offers or awaiting note */}
                <View
                    className="p-3 border-t"
                    style={{
                        borderTopColor: theme.textDark + '22',
                        backgroundColor: theme.background,
                    }}
                >
                    {!hasOffers ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: 11,
                                opacity: 0.8,
                            }}
                        >
                            No active offers on this line.
                        </Text>
                    ) : (
                        actionableOffers.map((o) => {
                            const accepted = acceptedId === o.id;
                            const declined = declinedIds.has(o.id);
                            const autoDeclined =
                                !!acceptedId && !accepted;

                            return (
                                <OfferCard
                                    key={o.id}
                                    offer={o}
                                    accepted={accepted}
                                    declined={declined}
                                    autoDeclined={autoDeclined}
                                    onAccept={() => onAccept(o.id)}
                                    onDecline={() => onDecline(o.id)}
                                    onUndoDecline={() =>
                                        onUndoDecline(o.id)
                                    }
                                />
                            );
                        })
                    )}
                </View>
            </View>
        );
    };

/* =========================================================
 * Offer card
 * ======================================================= */

const OfferCard: React.FC<{
    offer: ProductRequestOffer;
    accepted: boolean;
    declined: boolean;
    autoDeclined: boolean;
    onAccept: () => void;
    onDecline: () => void;
    onUndoDecline: () => void;
}> = ({
    offer,
    accepted,
    declined,
    autoDeclined,
    onAccept,
    onDecline,
    onUndoDecline,
}) => {
        const { theme, isDarkMode } = useAuth();
        const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

        const unitPrice = Number(offer.offered_unit_price ?? 0);
        const total = offerTotal(offer);

        const cardBorder = accepted
            ? '#16A34A'
            : declined
                ? 'rgba(239,68,68,0.4)'
                : borderColor;

        const cardBg = accepted
            ? 'rgba(22,163,74,0.06)'
            : declined
                ? 'rgba(148,163,184,0.06)'
                : 'transparent';

        return (
            <View
                className="rounded-lg border px-3 py-2 mb-2"
                style={{
                    borderColor: cardBorder,
                    borderWidth: accepted ? 1.5 : 1,
                    backgroundColor: cardBg,
                    opacity: autoDeclined ? 0.5 : 1,
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
                        style={{
                            backgroundColor:
                                'rgba(251,191,36,0.15)',
                        }}
                    >
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            {offer.status_display || offer.status}
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
                    {unitPrice > 0 ? (
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

                {/* actions */}
                <View className="flex-row items-center gap-2 mt-2">
                    {autoDeclined ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 10,
                                fontStyle: 'italic',
                            }}
                        >
                            Will be declined automatically
                        </Text>
                    ) : accepted ? (
                        <>
                            <View
                                className="px-2 py-1 rounded-md"
                                style={{
                                    backgroundColor:
                                        'rgba(22,163,74,0.15)',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#16A34A',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Accepted
                                </Text>
                            </View>
                            <Pressable
                                onPress={onDecline}
                                className="px-2.5 py-1 rounded-md border"
                                style={{ borderColor }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Undo
                                </Text>
                            </Pressable>
                        </>
                    ) : declined ? (
                        <>
                            <View
                                className="px-2 py-1 rounded-md"
                                style={{
                                    backgroundColor:
                                        'rgba(239,68,68,0.12)',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#DC2626',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Declined
                                </Text>
                            </View>
                            <Pressable
                                onPress={onUndoDecline}
                                className="px-2.5 py-1 rounded-md border"
                                style={{ borderColor }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Undo
                                </Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Pressable
                                onPress={onAccept}
                                className="px-3 py-1.5 rounded-lg flex-1 items-center"
                                style={{
                                    backgroundColor: '#16A34A',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#FFFFFF',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 11,
                                    }}
                                >
                                    Accept
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={onDecline}
                                className="px-3 py-1.5 rounded-lg flex-1 items-center border"
                                style={{
                                    borderColor:
                                        'rgba(220,38,38,0.5)',
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: '#DC2626',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 11,
                                    }}
                                >
                                    Decline
                                </Text>
                            </Pressable>
                        </>
                    )}
                </View>
            </View>
        );
    };