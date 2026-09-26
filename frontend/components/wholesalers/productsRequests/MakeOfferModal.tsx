// components/wholesalers/productsRequests/MakeOfferModal.tsx
//
// Universal modal for responding to a PUBLISHED product request.
//
// - Each accepted line uses WholesaleInventoryPicker to attach a
//   wholesaler receipt. The picker is scoped to the request line's
//   `product_id` — only receipts for the same product are shown.
// - Offered quantity is editable per line; defaults to the
//   retailer's requested quantity.
// - Line total = offered_quantity × receipt.final_unit_selling_price.
// - Submit is blocked until every line has a decision AND every
//   accepted line has a receipt + positive quantity. The footer
//   surfaces exactly what's missing so the button's disabled state
//   is never a mystery.
// - Undecided lines are highlighted in the body.

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

import { WholesaleInventoryPicker } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type {
    ProductRequestSummary,
    WholesalerReceipt,
} from '@/databases/types';

/* =========================================================
 * Types
 * ======================================================= */

export interface RespondAcceptedLine {
    item_id: string;
    receipt_id: string;
    offered_quantity: number;
}

export interface RespondPayload {
    action: 'Respond';
    request_id: string;
    note: string;
    accepted_lines: RespondAcceptedLine[];
    rejected_lines: { item_id: string }[];
}

type Decision = 'accepted' | 'rejected' | null;

interface LineDraft {
    item_id: string;
    product_id: string;
    product_title: string;
    requested_quantity: number;
    offered_quantity_input: string;
    decision: Decision;
    selected_receipt: WholesalerReceipt | null;
}

export interface MakeOfferModalProps {
    visible: boolean;
    request: ProductRequestSummary | null;
    isSubmitting?: boolean;
    onSubmit: (payload: RespondPayload) => Promise<void> | void;
    onClose: () => void;
}

/* =========================================================
 * Helpers
 * ======================================================= */

function receiptId(r: WholesalerReceipt): string {
    return String(
        (r as any).remote_id ?? (r as any).id ?? ''
    );
}

function receiptUnitPrice(
    r: WholesalerReceipt | null
): number {
    if (!r) return 0;
    return Number(
        r.final_unit_selling_price ??
        r.unit_selling_price ??
        0
    );
}

function parseQty(input: string): number {
    const n = Number(String(input).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function lineTotal(d: LineDraft): number {
    if (d.decision !== 'accepted') return 0;
    if (!d.selected_receipt) return 0;
    return (
        parseQty(d.offered_quantity_input) *
        receiptUnitPrice(d.selected_receipt)
    );
}

function formatMoney(n: number): string {
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/* =========================================================
 * Component
 * ======================================================= */

const MakeOfferModal: React.FC<MakeOfferModalProps> = ({
    visible,
    request,
    isSubmitting = false,
    onSubmit,
    onClose,
}) => {
    const { theme } = useAuth();
    const [drafts, setDrafts] = useState<LineDraft[]>([]);
    const [note, setNote] = useState('');

    /* ---- Merge wire data into drafts on every request update ---- */
    useEffect(() => {
        if (!visible || !request) return;

        setDrafts((prev) => {
            const prevById = new Map(
                prev.map((d) => [d.item_id, d])
            );

            return (request.items ?? [])
                .filter((it) => !!it.id)
                .map((it) => {
                    const id = it.id as string;
                    const existing = prevById.get(id);
                    const requestedQty =
                        Number(it.requested_quantity) || 0;
                    const productId = String(
                        it.product_id ?? ''
                    );
                    const title =
                        it.product_title ??
                        existing?.product_title ??
                        'Untitled product';

                    if (existing) {
                        // Wire-derived fields always track the
                        // server. If the product_id changed, the
                        // previously-selected receipt may belong
                        // to a different product — clear it.
                        const productChanged =
                            existing.product_id !== '' &&
                            productId !== '' &&
                            existing.product_id !== productId;

                        return {
                            ...existing,
                            product_id: productId,
                            product_title: title,
                            requested_quantity: requestedQty,
                            selected_receipt: productChanged
                                ? null
                                : existing.selected_receipt,
                        };
                    }

                    return {
                        item_id: id,
                        product_id: productId,
                        product_title: title,
                        requested_quantity: requestedQty,
                        offered_quantity_input: String(
                            requestedQty
                        ),
                        decision: null,
                        selected_receipt: null,
                    };
                });
        });
    }, [visible, request]);

    /* ---- Reset note when the modal opens fresh ---- */
    useEffect(() => {
        if (visible) setNote('');
    }, [visible, request?.remote_id]);

    /* ---- Mutations ---- */
    const setDecision = useCallback(
        (itemId: string, decision: Decision) => {
            setDrafts((prev) =>
                prev.map((d) =>
                    d.item_id === itemId
                        ? {
                            ...d,
                            decision,
                            selected_receipt:
                                decision === 'rejected'
                                    ? null
                                    : d.selected_receipt,
                        }
                        : d
                )
            );
        },
        []
    );

    const setReceipt = useCallback(
        (
            itemId: string,
            receipt: WholesalerReceipt | null
        ) => {
            setDrafts((prev) =>
                prev.map((d) =>
                    d.item_id === itemId
                        ? { ...d, selected_receipt: receipt }
                        : d
                )
            );
        },
        []
    );

    const setOfferedQty = useCallback(
        (itemId: string, raw: string) => {
            const cleaned = raw.replace(/[^0-9]/g, '');
            setDrafts((prev) =>
                prev.map((d) =>
                    d.item_id === itemId
                        ? {
                            ...d,
                            offered_quantity_input: cleaned,
                        }
                        : d
                )
            );
        },
        []
    );

    /* ---------------------------------------------------------
     * Validation + diagnostics
     * ------------------------------------------------------- */
    const isValid = useMemo(() => {
        if (drafts.length === 0) return false;
        return drafts.every((d) => {
            if (d.decision === 'rejected') return true;
            if (d.decision === 'accepted') {
                return (
                    !!d.selected_receipt &&
                    parseQty(d.offered_quantity_input) > 0
                );
            }
            return false;
        });
    }, [drafts]);

    const acceptedCount = useMemo(
        () =>
            drafts.filter(
                (d) => d.decision === 'accepted'
            ).length,
        [drafts]
    );

    const rejectedCount = useMemo(
        () =>
            drafts.filter(
                (d) => d.decision === 'rejected'
            ).length,
        [drafts]
    );

    const undecidedCount = useMemo(
        () =>
            drafts.filter((d) => d.decision === null)
                .length,
        [drafts]
    );

    /**
     * Accepted lines that are missing a receipt or a positive
     * quantity. These block submit even when every line has a
     * decision.
     */
    const incompleteAcceptedCount = useMemo(
        () =>
            drafts.filter(
                (d) =>
                    d.decision === 'accepted' &&
                    (!d.selected_receipt ||
                        parseQty(
                            d.offered_quantity_input
                        ) <= 0)
            ).length,
        [drafts]
    );

    /**
     * Human-readable reason the submit button is disabled.
     * Null when the form is submittable.
     */
    const blockerMessage = useMemo<string | null>(() => {
        if (drafts.length === 0) {
            return 'No line items to respond to.';
        }
        if (undecidedCount > 0) {
            return `${undecidedCount} line${undecidedCount === 1 ? '' : 's'
                } still need a decision.`;
        }
        if (incompleteAcceptedCount > 0) {
            return `${incompleteAcceptedCount} accepted line${incompleteAcceptedCount === 1 ? '' : 's'
                } need a receipt and a quantity above zero.`;
        }
        return null;
    }, [
        drafts.length,
        undecidedCount,
        incompleteAcceptedCount,
    ]);

    /* ---- Aggregates ---- */
    const grandTotal = useMemo(
        () =>
            drafts.reduce((sum, d) => sum + lineTotal(d), 0),
        [drafts]
    );

    const totalOfferedQty = useMemo(
        () =>
            drafts
                .filter((d) => d.decision === 'accepted')
                .reduce(
                    (sum, d) =>
                        sum + parseQty(d.offered_quantity_input),
                    0
                ),
        [drafts]
    );

    /* ---- Submit ---- */
    const handleSubmit = async () => {
        if (!request || !isValid) return;
        const requestId =
            request.remote_id ?? request.draft_id ?? null;
        if (!requestId) return;

        await onSubmit({
            action: 'Respond',
            request_id: requestId,
            note: note.trim(),
            accepted_lines: drafts
                .filter(
                    (d) =>
                        d.decision === 'accepted' &&
                        d.selected_receipt &&
                        parseQty(d.offered_quantity_input) > 0
                )
                .map((d) => ({
                    item_id: d.item_id,
                    receipt_id: receiptId(
                        d.selected_receipt as WholesalerReceipt
                    ),
                    offered_quantity: parseQty(
                        d.offered_quantity_input
                    ),
                })),
            rejected_lines: drafts
                .filter((d) => d.decision === 'rejected')
                .map((d) => ({ item_id: d.item_id })),
        });
    };

    if (!request) return null;

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
                        <View className="flex-row items-center">
                            <View className="flex-1">
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
                                        fontFamily: theme.font.bold,
                                        fontSize:
                                            theme.fontSize.lg,
                                    }}
                                    numberOfLines={1}
                                >
                                    Make an Offer
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
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.lg,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* ============ body ============ */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 16 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {drafts.length === 0 ? (
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
                                    No line items to respond to.
                                </Text>
                            </View>
                        ) : (
                            drafts.map((d, i) => (
                                <LineEditor
                                    key={d.item_id}
                                    draft={d}
                                    index={i}
                                    onSetDecision={setDecision}
                                    onSetReceipt={setReceipt}
                                    onSetOfferedQty={
                                        setOfferedQty
                                    }
                                />
                            ))
                        )}

                        {/* note */}
                        <View className="mt-5">
                            <Text
                                className="mb-1.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.semibold,
                                    fontSize: theme.fontSize.xs,
                                    letterSpacing: 0.5,
                                }}
                            >
                                NOTE (OPTIONAL)
                            </Text>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="Anything the retailer should know…"
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
                                    fontSize: theme.fontSize.sm,
                                }}
                            />
                        </View>
                    </ScrollView>

                    {/* ============ footer ============ */}
                    <View
                        className="px-5 py-3 border-t"
                        style={{
                            borderTopColor:
                                theme.textDark + '22',
                        }}
                    >
                        {/* totals row */}
                        <View className="flex-row items-center mb-2">
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
                                    OFFERED
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
                                    {totalOfferedQty} unit
                                    {totalOfferedQty === 1
                                        ? ''
                                        : 's'}
                                </Text>
                            </View>

                            <View
                                style={{
                                    alignItems: 'flex-end',
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    TOTAL VALUE
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.lg,
                                    }}
                                >
                                    KES {formatMoney(grandTotal)}
                                </Text>
                            </View>
                        </View>

                        {/* counts row — includes undecided when non-zero */}
                        <View className="flex-row items-center mb-2">
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
                                {acceptedCount} accepted ·{' '}
                                {rejectedCount} rejected
                                {undecidedCount > 0
                                    ? ` · ${undecidedCount} undecided`
                                    : ''}{' '}
                                · {drafts.length} total
                            </Text>
                        </View>

                        {/* blocker banner */}
                        {blockerMessage ? (
                            <View
                                className="rounded-lg px-3 py-2 mb-2"
                                style={{
                                    backgroundColor:
                                        'rgba(245,158,11,0.12)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(245,158,11,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#b45309',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {blockerMessage}
                                </Text>
                            </View>
                        ) : null}

                        {/* actions row */}
                        <View className="flex-row items-center">
                            <View className="flex-1" />

                            <Pressable
                                onPress={onClose}
                                disabled={isSubmitting}
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
                                    Cancel
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={handleSubmit}
                                disabled={
                                    !isValid || isSubmitting
                                }
                                className="px-4 py-2 rounded-lg flex-row items-center"
                                style={{
                                    backgroundColor:
                                        isValid &&
                                            !isSubmitting
                                            ? theme.primary
                                            : theme.primary +
                                            '66',
                                }}
                            >
                                {isSubmitting ? (
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
                                        Submit Response
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default MakeOfferModal;

/* =========================================================
 * Line editor
 * ======================================================= */

const LineEditor: React.FC<{
    draft: LineDraft;
    index: number;
    onSetDecision: (itemId: string, d: Decision) => void;
    onSetReceipt: (
        itemId: string,
        receipt: WholesalerReceipt | null
    ) => void;
    onSetOfferedQty: (itemId: string, raw: string) => void;
}> = ({
    draft,
    index,
    onSetDecision,
    onSetReceipt,
    onSetOfferedQty,
}) => {
        const { theme } = useAuth();

        const unitPrice = receiptUnitPrice(
            draft.selected_receipt
        );
        const total = lineTotal(draft);
        const qty = parseQty(draft.offered_quantity_input);
        const overRequested =
            qty > draft.requested_quantity &&
            draft.requested_quantity > 0;

        const isAccepted = draft.decision === 'accepted';
        const isRejected = draft.decision === 'rejected';
        const isUndecided = draft.decision === null;

        const stepQty = (delta: number) => {
            const next = Math.max(0, qty + delta);
            onSetOfferedQty(draft.item_id, String(next));
        };

        return (
            <View
                className="mb-3 rounded-xl border overflow-hidden"
                style={{
                    borderColor: isUndecided
                        ? 'rgba(239,68,68,0.4)'
                        : theme.textDark + '22',
                    borderWidth: isUndecided ? 1.5 : 1,
                }}
            >
                {/* -------- header + decision -------- */}
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
                            numberOfLines={1}
                        >
                            {draft.product_title}
                        </Text>

                        {isUndecided ? (
                            <View
                                className="px-2 py-0.5 rounded-md mr-2"
                                style={{
                                    backgroundColor:
                                        'rgba(239,68,68,0.15)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#ef4444',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    UNDECIDED
                                </Text>
                            </View>
                        ) : null}

                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily:
                                    theme.font.regular,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {draft.requested_quantity} requested
                        </Text>
                    </View>

                    <View className="flex-row mt-3">
                        <Pressable
                            onPress={() =>
                                onSetDecision(
                                    draft.item_id,
                                    'accepted'
                                )
                            }
                            className="flex-1 mr-2 py-2 rounded-lg border items-center"
                            style={{
                                backgroundColor: isAccepted
                                    ? '#16A34A'
                                    : theme.panel,
                                borderColor: isAccepted
                                    ? '#16A34A'
                                    : theme.textDark + '33',
                            }}
                        >
                            <Text
                                style={{
                                    color: isAccepted
                                        ? '#FFFFFF'
                                        : theme.text,
                                    fontFamily:
                                        theme.font.semibold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Accept
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() =>
                                onSetDecision(
                                    draft.item_id,
                                    'rejected'
                                )
                            }
                            className="flex-1 ml-2 py-2 rounded-lg border items-center"
                            style={{
                                backgroundColor: isRejected
                                    ? '#DC2626'
                                    : theme.panel,
                                borderColor: isRejected
                                    ? '#DC2626'
                                    : theme.textDark + '33',
                            }}
                        >
                            <Text
                                style={{
                                    color: isRejected
                                        ? '#FFFFFF'
                                        : theme.text,
                                    fontFamily:
                                        theme.font.semibold,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                Reject
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* -------- accepted details -------- */}
                {isAccepted && (
                    <View
                        className="p-3 border-t gap-3"
                        style={{
                            borderTopColor:
                                theme.textDark + '22',
                            backgroundColor: theme.background,
                        }}
                    >
                        {/* quantity stepper */}
                        <View>
                            <Text
                                className="mb-1.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize: 10,
                                    letterSpacing: 0.5,
                                }}
                            >
                                OFFERED QUANTITY
                            </Text>

                            <View className="flex-row items-center">
                                <View
                                    className="flex-row items-center rounded-lg border overflow-hidden"
                                    style={{
                                        borderColor:
                                            overRequested
                                                ? '#f59e0b'
                                                : theme.textDark +
                                                '33',
                                    }}
                                >
                                    <Pressable
                                        onPress={() =>
                                            stepQty(-1)
                                        }
                                        disabled={qty <= 0}
                                        className="px-3 py-2 items-center justify-center"
                                        style={{
                                            opacity:
                                                qty <= 0
                                                    ? 0.4
                                                    : 1,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 16,
                                                lineHeight: 18,
                                            }}
                                        >
                                            −
                                        </Text>
                                    </Pressable>

                                    <TextInput
                                        value={
                                            draft.offered_quantity_input
                                        }
                                        onChangeText={(t) =>
                                            onSetOfferedQty(
                                                draft.item_id,
                                                t
                                            )
                                        }
                                        keyboardType="numeric"
                                        inputMode="numeric"
                                        placeholder="0"
                                        placeholderTextColor={
                                            theme.textDark
                                        }
                                        className="px-2 py-1.5"
                                        style={{
                                            width: 72,
                                            textAlign: 'center',
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize
                                                    .base,
                                            backgroundColor:
                                                theme.panel,
                                        }}
                                    />

                                    <Pressable
                                        onPress={() => stepQty(1)}
                                        className="px-3 py-2 items-center justify-center"
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 16,
                                                lineHeight: 18,
                                            }}
                                        >
                                            +
                                        </Text>
                                    </Pressable>
                                </View>

                                <Text
                                    className="ml-3"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    of {draft.requested_quantity}{' '}
                                    requested
                                </Text>
                            </View>

                            {overRequested && (
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: '#f59e0b',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    Above the requested quantity.
                                </Text>
                            )}
                        </View>

                        {/* receipt picker — scoped by product_id */}
                        <WholesaleInventoryPicker
                            value={draft.selected_receipt}
                            onSelect={(r) =>
                                onSetReceipt(draft.item_id, r)
                            }
                            onClear={() =>
                                onSetReceipt(
                                    draft.item_id,
                                    null
                                )
                            }
                            productId={draft.product_id}
                            placeholder="Search matching inventory…"
                            label="Wholesaler receipt"
                            required
                            inStockOnly
                        />

                        {/* line total */}
                        {draft.selected_receipt && (
                            <View
                                className="rounded-lg px-3 py-2"
                                style={{
                                    backgroundColor:
                                        theme.panel,
                                    borderWidth: 1,
                                    borderColor:
                                        theme.textDark + '22',
                                }}
                            >
                                <View className="flex-row items-center justify-between">
                                    <View>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 9,
                                                letterSpacing: 0.5,
                                            }}
                                        >
                                            UNIT PRICE
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font
                                                        .semibold,
                                                fontSize:
                                                    theme.fontSize
                                                        .sm,
                                                marginTop: 2,
                                            }}
                                        >
                                            KES{' '}
                                            {formatMoney(
                                                unitPrice
                                            )}
                                        </Text>
                                    </View>

                                    <View
                                        style={{
                                            alignItems: 'flex-end',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 9,
                                                letterSpacing: 0.5,
                                            }}
                                        >
                                            LINE TOTAL
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.primary,
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize:
                                                    theme.fontSize
                                                        .base,
                                                marginTop: 2,
                                            }}
                                        >
                                            KES{' '}
                                            {formatMoney(total)}
                                        </Text>
                                    </View>
                                </View>

                                <Text
                                    className="mt-1"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: 10,
                                    }}
                                >
                                    {qty} × KES{' '}
                                    {formatMoney(unitPrice)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };