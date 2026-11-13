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
import { Text, View } from 'react-native';

import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminBadgePill, AdminSheet, FormErrorBanner, FormPanel, SheetButton, useListTokens, useSheetIsWide } from '@/components/common/listScreen';
import type {
    ProductRequest,
    ProductRequestItem,
    ProductRequestOffer,
} from '@/databases/types';

import { requestStatusBadge } from './productRequestsConfig';
import { EmptyNote, LineHeader, OfferSummary, formatKES } from './ViewRequestDetailsModal';

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

export const OfferReviewModal: React.FC<Props> = ({
    visible,
    request,
    onClose,
    onConfirm,
    onPublishDraft,
    isLoading = false,
}) => {

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

    const wide = useSheetIsWide();
    const { theme, chipBg } = useListTokens();

    if (!request) return null;

    const busy = submitting || publishing || isLoading;
    const status = requestStatusBadge(request);
    const decided = actionableLineCount - undecidedLineIds.length;
    const acceptedTotal = linesWithOffers.reduce((sum, { item, actionable }) => {
        const id = decisions.get(item.id)?.acceptedOfferId;
        const o = id ? actionable.find((x) => x.id === id) : null;
        return sum + (o ? offerTotal(o) : 0);
    }, 0);

    const footerStatus = isDraft
        ? 'Not sent yet: wholesalers see it once published.'
        : actionableLineCount === 0
            ? 'No offers waiting for a decision.'
            : `${decided}/${actionableLineCount} line${actionableLineCount === 1 ? '' : 's'} decided${confirmCount ? ` · ${confirmCount} accepted (${formatKES(acceptedTotal)})` : ''}`;

    return (
        <AdminSheet
            visible={visible}
            onClose={busy ? () => { } : onClose}
            dismissible={!busy}
            title={isDraft ? 'Publish request' : 'Review offers'}
            subtitle={[request.request_number, status.label].filter(Boolean).join(' · ')}
            icon={isDraft ? 'paper-plane-outline' : 'pricetags-outline'}
            width={760}
            footer={
                <>
                    {wide ? (
                        <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                            {footerStatus}
                        </Text>
                    ) : null}
                    <SheetButton label="Close" variant="ghost" onPress={onClose} disabled={busy} grow={!wide} />
                    {isDraft ? (
                        <SheetButton label="Publish" icon="paper-plane-outline" onPress={handlePublish} disabled={!canPublish} loading={publishing} loadingLabel="Publishing…" grow={!wide} />
                    ) : (
                        <SheetButton
                            label={decisionCount > 0 ? `Submit ${decisionCount} decision${decisionCount === 1 ? '' : 's'}` : 'Submit'}
                            icon="checkmark-done"
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            loading={submitting}
                            loadingLabel="Submitting…"
                            grow={!wide}
                        />
                    )}
                </>
            }
        >
            {error ? <FormErrorBanner message={error} /> : null}

            {isDraft ? (
                <FormPanel tint="#6366f1">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>This request is a draft</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 4 }}>
                        Publishing sends it to the selected wholesalers (or all of them), who can then make offers.
                    </Text>
                </FormPanel>
            ) : actionableLineCount > 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginHorizontal: 4 }}>
                    Accept one offer per product; the others on that line are declined automatically. You can also decline every offer on a line.
                </Text>
            ) : null}

            {!wide && !isDraft ? (
                <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: chipBg }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{footerStatus}</Text>
                </View>
            ) : null}

            <View style={{ gap: 10 }}>
                {linesWithOffers.length === 0 ? (
                    <EmptyNote text="No products on this request." />
                ) : (
                    linesWithOffers.map(({ item, actionable }) => (
                        <LineReview
                            key={item.id}
                            item={item}
                            actionable={actionable}
                            decision={decisions.get(item.id)}
                            undecided={undecidedLineIds.includes(item.id)}
                            disabled={busy || isDraft}
                            onAccept={(id) => acceptOffer(item.id, id)}
                            onDecline={(id) => declineOffer(item.id, id)}
                            onUndoDecline={(id) => undoDecline(item.id, id)}
                        />
                    ))
                )}
            </View>

            {!isDraft && actionableLineCount > 0 ? (
                <CustomTextField
                    label="Note to wholesalers"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Optional, e.g. delivery instructions"
                    multiline
                    numberOfLines={3}
                    editable={!busy}
                />
            ) : null}
        </AdminSheet>
    );
};

/* ------------------------------------------------------------------ */

function LineReview({
    item,
    actionable,
    decision,
    undecided,
    disabled,
    onAccept,
    onDecline,
    onUndoDecline,
}: {
    item: ProductRequestItem;
    actionable: ProductRequestOffer[];
    decision?: LineDecision;
    undecided: boolean;
    disabled: boolean;
    onAccept: (offerId: string) => void;
    onDecline: (offerId: string) => void;
    onUndoDecline: (offerId: string) => void;
}) {
    const { theme, chipBg, divider } = useListTokens();
    const actionableIds = new Set(actionable.map((o) => o.id));
    const others = (item.offers ?? []).filter((o) => !actionableIds.has(o.id));
    const accepted = decision?.acceptedOfferId ?? null;

    return (
        <View style={{ borderRadius: 18, padding: 14, gap: 10, backgroundColor: chipBg, borderWidth: 1.5, borderColor: undecided && accepted === null && (decision?.explicitDeclineIds.size ?? 0) > 0 ? '#f59e0b' : 'transparent' }}>
            <LineHeader line={item} />

            {actionable.length === 0 && others.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>No offers yet.</Text>
            ) : null}

            {actionable.map((o) => {
                const isAccepted = accepted === o.id;
                const isDeclined = !isAccepted && (decision?.explicitDeclineIds.has(o.id) || (accepted !== null && accepted !== o.id));
                const autoDeclined = isDeclined && accepted !== null && !decision?.explicitDeclineIds.has(o.id);
                return (
                    <View
                        key={o.id}
                        style={{
                            borderRadius: 14,
                            padding: 12,
                            gap: 10,
                            borderWidth: 1.5,
                            borderColor: isAccepted ? '#10b981' : 'transparent',
                            backgroundColor: isAccepted ? 'rgba(16,185,129,0.08)' : theme.panel,
                            opacity: isDeclined ? 0.6 : 1,
                        }}
                    >
                        <OfferSummary
                            offer={o}
                            right={
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(offerTotal(o))}</Text>
                            }
                        />
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            {isAccepted ? (
                                <>
                                    <AdminBadgePill badge={{ label: 'Accepting', tone: 'success', icon: 'checkmark-circle' }} />
                                    <View style={{ flex: 1 }} />
                                    <SheetButton label="Decline instead" variant="ghost" onPress={() => onDecline(o.id)} disabled={disabled} />
                                </>
                            ) : isDeclined ? (
                                <>
                                    <AdminBadgePill badge={{ label: autoDeclined ? 'Declined (another accepted)' : 'Declining', tone: 'danger' }} />
                                    <View style={{ flex: 1 }} />
                                    {autoDeclined ? (
                                        <SheetButton label="Accept this one" variant="secondary" onPress={() => onAccept(o.id)} disabled={disabled} />
                                    ) : (
                                        <SheetButton label="Undo" variant="ghost" onPress={() => onUndoDecline(o.id)} disabled={disabled} />
                                    )}
                                </>
                            ) : (
                                <>
                                    <SheetButton label="Decline" variant="ghost" icon="close" onPress={() => onDecline(o.id)} disabled={disabled} grow />
                                    <SheetButton label="Accept" icon="checkmark" onPress={() => onAccept(o.id)} disabled={disabled} grow />
                                </>
                            )}
                        </View>
                    </View>
                );
            })}

            {others.length > 0 ? (
                <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: divider }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>Earlier offers</Text>
                    {others.map((o) => (
                        <OfferSummary key={o.id} offer={o} />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

