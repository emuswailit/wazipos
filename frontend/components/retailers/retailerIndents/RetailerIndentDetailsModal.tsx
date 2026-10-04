// components/retailers/retailerIndents/RetailerIndentDetailsModal.tsx
//
// Details view for a retailer indent.
//
// Shows indent parameters, line items, and budget progress. The user
// can edit individual items (when the indent is open and server-backed)
// or submit the whole indent as orders.
//
// Draft handling
//   Drafts (remote_id starts with `local-`) are indent rows that have
//   never been confirmed by the server. Two consequences:
//     1. A "Draft" chip is shown in the header.
//     2. Parameter edits and item edits are hidden, because the local
//        `local-*` ids cannot be sent to the API. The user must submit
//        the indent (which routes through the offline queue and creates
//        the server-backed indent) before editing further.
//
// Offline submission
//   `closeIndent` on the context enqueues an `INDENT_CLOSE` op when the
//   network call fails. The drainer later creates the remote indent (if
//   it was a draft), flushes any pending item ops, and closes the
//   indent. The modal currently shows the raw server failure because
//   `CloseIndentResult` does not yet distinguish "queued for retry"
//   from "permanently rejected". A `queued?: boolean` flag on that
//   result would let the modal show a softer "will sync when online"
//   banner instead.

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type { RetailerIndent } from '@/databases/types';

interface Props {
    visible: boolean;
    indent: RetailerIndent | null;
    onClose: () => void;
    onOpenEditItem?: (itemId: string) => void;
    onUpdateIndent?: () => void;
}

interface Banner {
    kind: 'error' | 'success';
    title: string;
    detail?: string;
}

/**
 * How long the success banner stays up before the modal closes.
 * Long enough to read `response_message`, short enough not to
 * feel like a hang.
 */
const SUCCESS_BANNER_MS = 1200;

/* =========================================================
 * Helpers
 * ======================================================= */

const isDraftIndent = (i: RetailerIndent | null): boolean =>
    !!i &&
    typeof i.remote_id === 'string' &&
    i.remote_id.startsWith('local-');

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerIndentDetailsModal({
    visible,
    indent,
    onClose,
    onOpenEditItem,
    onUpdateIndent,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const { closeIndent, pendingIndentOpCount } =
        useRetailerIndentsSync();

    const [closing, setClosing] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [banner, setBanner] = useState<Banner | null>(null);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const items = useMemo(
        () => indent?.retailer_indent_items ?? [],
        [indent],
    );

    const isOpen =
        String(indent?.is_open ?? '').toLowerCase() === 'true';
    const isDraft = isDraftIndent(indent);

    const budget = Number(indent?.budget_amount ?? 0) || 0;
    const totalCost = Number(indent?.total_cost ?? 0) || 0;
    const budgetPct =
        budget > 0
            ? Math.min(100, (totalCost / budget) * 100)
            : 0;

    /* ---------------- Reset on open ---------------- */
    useEffect(() => {
        if (!visible) return;
        setClosing(false);
        setConfirmSubmit(false);
        setBanner(null);
    }, [visible, indent?.remote_id]);

    if (!indent) return null;

    const busy = closing;

    /* =========================================================
     * SUBMIT ORDERS
     * ======================================================= */

    const handleSubmitPress = () => {
        if (busy) return;
        setBanner(null);
        setConfirmSubmit(true);
    };

    const cancelSubmit = () => {
        setConfirmSubmit(false);
    };

    const performSubmit = async () => {
        setConfirmSubmit(false);
        setBanner(null);
        setClosing(true);

        try {
            const result = await closeIndent({
                indentId: indent.remote_id,
            });

            const errorsText =
                result.errors && result.errors.length > 0
                    ? result.errors.join('\n')
                    : undefined;

            if (!result.ok) {
                setBanner({
                    kind: 'error',
                    title:
                        result.message ??
                        'Indent was not closed.',
                    detail: errorsText,
                });
                return;
            }

            setBanner({
                kind: 'success',
                title:
                    result.message ??
                    'Retailer indent closed successfully',
                detail: errorsText,
            });

            setTimeout(() => {
                onClose();
            }, SUCCESS_BANNER_MS);
        } catch (e: any) {
            setBanner({
                kind: 'error',
                title:
                    e?.response?.data?.response_message ??
                    e?.response?.data?.message ??
                    e?.message ??
                    'Could not submit the indent.',
                detail: Array.isArray(
                    e?.response?.data?.errors,
                )
                    ? e.response.data.errors.join('\n')
                    : undefined,
            });
        } finally {
            setClosing(false);
        }
    };

    /* =========================================================
     * Render
     * ======================================================= */

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={
                busy
                    ? undefined
                    : confirmSubmit
                        ? cancelSubmit
                        : onClose
            }
        >
            <View className="flex-1 bg-black/40 items-center justify-center p-3">
                <View
                    className="rounded-2xl w-full max-w-2xl max-h-[92%] overflow-hidden"
                    style={{ backgroundColor: theme.panel }}
                >
                    {/* ============ Header ============ */}
                    <View
                        className="px-5 pt-4 pb-3 border-b"
                        style={{ borderBottomColor: borderColor }}
                    >
                        <View className="flex-row items-start justify-between">
                            <View className="flex-1 min-w-0">
                                <View className="flex-row items-center flex-wrap gap-2">
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.lg,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {indent.entity_title ||
                                            'Unknown retailer'}
                                    </Text>
                                    {isDraft ? (
                                        <View
                                            className="px-2 py-0.5 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    'rgba(245,158,11,0.15)',
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-widest"
                                                style={{
                                                    color: '#f59e0b',
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 9,
                                                }}
                                            >
                                                Draft
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {isOpen ? 'Open' : 'Closed'} ·{' '}
                                    {items.length}{' '}
                                    {items.length === 1
                                        ? 'item'
                                        : 'items'}
                                </Text>
                            </View>
                            <Pressable
                                onPress={
                                    busy ? undefined : onClose
                                }
                                disabled={busy}
                                hitSlop={12}
                                className="w-8 h-8 items-center justify-center rounded-full"
                                style={{
                                    backgroundColor:
                                        theme.background,
                                    opacity: busy ? 0.4 : 1,
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

                        {/* Params row */}
                        <View className="flex-row items-center flex-wrap gap-3 mt-3">
                            <Param
                                label="Lead time"
                                value={`${indent.lead_time ?? 0}d`}
                            />
                            <Param
                                label="Order days"
                                value={`${indent.order_days ?? 0}d`}
                            />
                            <Param
                                label="Pricing %"
                                value={`${indent.pricing_percentage ?? '0.00'}%`}
                            />
                            <Param
                                label="Avg lead"
                                value={`${indent.average_lead_time_days ?? '0.00'}d`}
                            />
                            <Param
                                label="Budget"
                                value={
                                    budget > 0
                                        ? budget.toLocaleString()
                                        : 'Not set'
                                }
                            />
                            <Param
                                label="Enforced"
                                value={
                                    String(
                                        indent.budget_enforced,
                                    ).toLowerCase() === 'true'
                                        ? 'Yes'
                                        : 'No'
                                }
                            />
                        </View>

                        {/* Pending-ops note */}
                        {pendingIndentOpCount > 0 && isDraft ? (
                            <View
                                className="mt-3 flex-row items-center px-2.5 py-1.5 rounded-lg"
                                style={{
                                    backgroundColor:
                                        'rgba(245,158,11,0.12)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(245,158,11,0.35)',
                                }}
                            >
                                <View
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor:
                                            '#f59e0b',
                                        marginRight: 6,
                                    }}
                                />
                                <Text
                                    style={{
                                        color: '#b45309',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {pendingIndentOpCount} change
                                    {pendingIndentOpCount === 1
                                        ? ''
                                        : 's'}{' '}
                                    will be submitted to the
                                    server on close.
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* ============ Body ============ */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* -------- Result banner -------- */}
                        {banner ? (
                            <View
                                className="rounded-xl px-3 py-3 mb-3"
                                style={{
                                    backgroundColor:
                                        banner.kind === 'error'
                                            ? 'rgba(239,68,68,0.12)'
                                            : 'rgba(16,185,129,0.12)',
                                    borderWidth: 1,
                                    borderColor:
                                        banner.kind === 'error'
                                            ? 'rgba(239,68,68,0.35)'
                                            : 'rgba(16,185,129,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color:
                                            banner.kind === 'error'
                                                ? '#b91c1c'
                                                : '#047857',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    {banner.kind === 'error'
                                        ? '❌ '
                                        : '✅ '}
                                    {banner.title}
                                </Text>
                                {banner.detail ? (
                                    <Text
                                        className="mt-1"
                                        style={{
                                            color:
                                                banner.kind ===
                                                    'error'
                                                    ? '#b91c1c'
                                                    : '#047857',
                                            fontFamily:
                                                theme.font.regular,
                                            fontSize:
                                                theme.fontSize.xs,
                                            opacity: 0.9,
                                        }}
                                    >
                                        {banner.detail}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {/* -------- Confirm-submit strip -------- */}
                        {confirmSubmit ? (
                            <View
                                className="rounded-xl px-3 py-3 mb-3"
                                style={{
                                    backgroundColor:
                                        'rgba(220,38,38,0.08)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(220,38,38,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#b91c1c',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Submit this indent as orders?
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: '#b91c1c',
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                        opacity: 0.9,
                                    }}
                                >
                                    {isDraft
                                        ? 'The indent will be created on the server, all pending items submitted, and the indent closed. This may take a moment if you are offline.'
                                        : 'Every item will be committed to its wholesaler and the indent will close. You cannot edit it afterward.'}
                                </Text>
                                <View className="flex-row gap-2 mt-3">
                                    <Pressable
                                        onPress={cancelSubmit}
                                        disabled={busy}
                                        className="px-3 py-1.5 rounded-lg border"
                                        style={{
                                            borderColor:
                                                'rgba(220,38,38,0.35)',
                                            opacity: busy
                                                ? 0.5
                                                : 1,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: '#b91c1c',
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 11,
                                            }}
                                        >
                                            Cancel
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={performSubmit}
                                        disabled={busy}
                                        className="px-3 py-1.5 rounded-lg"
                                        style={{
                                            backgroundColor:
                                                '#DC2626',
                                            opacity: busy
                                                ? 0.5
                                                : 1,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-wide text-white"
                                            style={{
                                                fontFamily:
                                                    theme.font
                                                        .bold,
                                                fontSize: 11,
                                            }}
                                        >
                                            Yes, submit
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : null}

                        <Text
                            className="uppercase tracking-widest mb-3"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Indent items ({items.length})
                        </Text>

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
                                    No items on this indent.
                                </Text>
                            </View>
                        ) : (
                            items.map((item, idx) => (
                                <ItemRow
                                    key={item.id ?? String(idx)}
                                    item={item}
                                    borderColor={borderColor}
                                    subBg={subBg}
                                    theme={theme}
                                    onEdit={
                                        // Editing a draft item is not
                                        // possible — the local-* id
                                        // cannot be sent to the API.
                                        isOpen &&
                                            !busy &&
                                            !isDraft &&
                                            onOpenEditItem
                                            ? () =>
                                                onOpenEditItem(
                                                    item.id,
                                                )
                                            : undefined
                                    }
                                />
                            ))
                        )}

                        {/* Budget progress */}
                        {budget > 0 ? (
                            <View className="mt-4">
                                <View className="flex-row items-center justify-between mb-1">
                                    <Text
                                        className="uppercase tracking-widest"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 9,
                                        }}
                                    >
                                        Budget used
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.xs,
                                        }}
                                    >
                                        KES{' '}
                                        {totalCost.toLocaleString()}{' '}
                                        / {budget.toLocaleString()}
                                    </Text>
                                </View>
                                <View
                                    className="rounded-full overflow-hidden"
                                    style={{
                                        height: 6,
                                        backgroundColor: subBg,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: `${budgetPct}%`,
                                            height: '100%',
                                            backgroundColor:
                                                budgetPct >= 100
                                                    ? '#DC2626'
                                                    : theme.primary,
                                        }}
                                    />
                                </View>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: 10,
                                        textAlign: 'right',
                                    }}
                                >
                                    {budgetPct.toFixed(0)}%
                                </Text>
                            </View>
                        ) : null}
                    </ScrollView>

                    {/* ============ Footer ============ */}
                    <View
                        className="px-5 py-3 border-t"
                        style={{ borderTopColor: borderColor }}
                    >
                        <View className="flex-row items-center justify-end gap-2 flex-wrap">
                            <Pressable
                                onPress={onClose}
                                disabled={busy}
                                className="px-4 py-2 rounded-lg border"
                                style={{
                                    borderColor,
                                    opacity: busy ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 13,
                                    }}
                                >
                                    Dismiss
                                </Text>
                            </Pressable>

                            {isOpen ? (
                                <Pressable
                                    onPress={handleSubmitPress}
                                    disabled={
                                        busy || confirmSubmit
                                    }
                                    className="px-4 py-2 rounded-lg border flex-row items-center gap-2"
                                    style={{
                                        borderColor: '#DC2626',
                                        opacity:
                                            busy || confirmSubmit
                                                ? 0.5
                                                : 1,
                                        minHeight: 40,
                                    }}
                                >
                                    {closing ? (
                                        <>
                                            <ActivityIndicator
                                                size="small"
                                                color="#DC2626"
                                            />
                                            <Text
                                                className="uppercase tracking-wide"
                                                style={{
                                                    color: '#DC2626',
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 13,
                                                }}
                                            >
                                                Submitting…
                                            </Text>
                                        </>
                                    ) : (
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: '#DC2626',
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            Submit Orders
                                        </Text>
                                    )}
                                </Pressable>
                            ) : null}

                            {/* Editing parameters is only meaningful
                                for server-backed indents. On drafts we
                                hide it — the local-* id cannot reach
                                the API. */}
                            {isOpen &&
                                !isDraft &&
                                onUpdateIndent ? (
                                <Pressable
                                    onPress={onUpdateIndent}
                                    disabled={busy}
                                    className="px-4 py-2 rounded-lg"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                        opacity: busy ? 0.5 : 1,
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-wide text-white"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        Update Indent
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                </View>

                {/* ============ Blocking overlay ============ */}
                {busy ? (
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                        }}
                    >
                        <View
                            className="rounded-2xl px-6 py-5 items-center"
                            style={{
                                backgroundColor: theme.panel,
                                minWidth: 220,
                            }}
                        >
                            <ActivityIndicator
                                size="large"
                                color={theme.primary}
                            />
                            <Text
                                className="mt-3"
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                    textAlign: 'center',
                                }}
                            >
                                Submitting indent…
                            </Text>
                            <Text
                                className="mt-1"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: theme.fontSize.xs,
                                    textAlign: 'center',
                                }}
                            >
                                {isDraft
                                    ? 'Creating indent and orders'
                                    : 'Creating orders with wholesalers'}
                            </Text>
                        </View>
                    </View>
                ) : null}
            </View>
        </Modal>
    );
}

/* =========================================================
 * Sub-components
 * ======================================================= */

function Param({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const { theme } = useAuth();
    return (
        <View>
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function ItemRow({
    item,
    borderColor,
    subBg,
    theme,
    onEdit,
}: {
    item: any;
    borderColor: string;
    subBg: string;
    theme: any;
    onEdit?: () => void;
}) {
    const thumb =
        item.images?.[0]?.thumbnail ||
        item.images?.[0]?.image ||
        null;
    const price =
        item.final_unit_price ?? item.cost_per_unit ?? '—';
    const sourceLabel =
        item.source_label || item.source || '';
    const isDraftItem =
        typeof item.id === 'string' &&
        item.id.startsWith('local-');

    return (
        <View
            className="rounded-xl border p-3 mb-2 flex-row items-center"
            style={{ borderColor }}
        >
            {thumb ? (
                <Image
                    source={{ uri: thumb }}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        marginRight: 12,
                    }}
                />
            ) : (
                <View
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        marginRight: 12,
                        backgroundColor: subBg,
                    }}
                />
            )}

            <View className="flex-1 min-w-0">
                <View className="flex-row items-center flex-wrap gap-2">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.sm,
                        }}
                        numberOfLines={2}
                    >
                        {item.wholesale_receipt_title ||
                            item.product_title ||
                            'Untitled product'}
                    </Text>
                    {isDraftItem ? (
                        <View
                            className="px-1.5 py-0.5 rounded-full"
                            style={{
                                backgroundColor:
                                    'rgba(245,158,11,0.15)',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: '#f59e0b',
                                    fontFamily: theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                Pending
                            </Text>
                        </View>
                    ) : null}
                </View>
                <View className="flex-row items-center flex-wrap gap-2 mt-1">
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                        }}
                    >
                        QTY {item.required_quantity ?? 0}
                    </Text>
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                        }}
                    >
                        KES {price}
                    </Text>
                    {sourceLabel ? (
                        <Text
                            className="uppercase tracking-wide"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 10,
                                opacity: 0.7,
                            }}
                        >
                            {sourceLabel}
                        </Text>
                    ) : null}
                </View>
            </View>

            {onEdit ? (
                <Pressable
                    onPress={onEdit}
                    className="px-3 py-1.5 rounded-lg border ml-2"
                    style={{ borderColor }}
                >
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        Edit
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}