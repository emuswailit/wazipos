// components/retailers/retailerIndents/RetailerIndentItemEditModal.tsx
//
// Edit an individual line item on a retailer indent:
//   - markup %
//   - recommended retail price
//   - required quantity
//   - remove the item
//
// Save behaviour
//   - Delegates to `updateIndentItem` on the sync context. The context
//     resolves the server-side ids, fires `UpdateRetailerIndentItem`
//     with
//
//         {
//             action:    'UpdateRetailerIndentItem',
//             indent_id: '<retailer indent id>',
//             item_id:   '<retailer indent item id>',
//             params: {
//                 required_quantity:        <number>,
//                 recommended_retail_price: '<decimal>' | 0,
//                 markup_percentage_used:   '<decimal>' | 0,
//             },
//         }
//
//     and, on success, patches the local mirror (in-memory state +
//     local DB) before returning. On rejection the local state is
//     left untouched and the error lands in the inline banner.
//
//   - Items with no server identity yet (`remote_id == null`) are
//     written to the local mirror only. The context detects this and
//     skips the HTTP call.
//
// IDENTITY RULES
//   - The modal passes the freshest identifier it has for the item
//     (`remote_id` when present, else `draft_id`) and lets the
//     context resolve which kind of write to perform.
//   - No direct calls to `db` or `retailersApi` from this component.
//
// Delete behaviour
//   - Calls `removeOfferFromIndent` on the context. Same identity
//     rule: `remote_id` when present, else `draft_id`. On network
//     failure the context enqueues the removal for background retry
//     (via the pending-ops queue), but the modal still reports the
//     failure because the response carries `ok: false`.

import React, { useEffect, useState } from 'react';
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
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type { RetailerIndentItem } from '@/databases/types';

/* =========================================================
 * Types
 * ======================================================= */

interface Banner {
    kind: 'error' | 'success' | 'info';
    title: string;
    detail?: string;
}

interface Props {
    visible: boolean;
    indentId: string | null;
    item: RetailerIndentItem | null;
    onClose: () => void;
    onSaved?: () => void;
}

/* =========================================================
 * Helpers
 * ======================================================= */

function toNumString(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return s === '0.00' || s === '0' ? '' : s;
}

function numFromInput(raw: string): number {
    const n = Number(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/* =========================================================
 * Component
 * ======================================================= */

export function RetailerIndentItemEditModal({
    visible,
    indentId,
    item,
    onClose,
    onSaved,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const {
        removeOfferFromIndent,
        updateIndentItem,
    } = useRetailerIndentsSync();

    const [markup, setMarkup] = useState('');
    const [retailPrice, setRetailPrice] = useState('');
    const [quantity, setQuantity] = useState('');

    const [deleting, setDeleting] = useState(false);
    const [saving, setSaving] = useState(false);

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [banner, setBanner] = useState<Banner | null>(null);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const placeholderColor = isDarkMode ? '#64748b' : '#94a3b8';

    useEffect(() => {
        if (!visible || !item) return;

        setMarkup(
            toNumString((item as any).markup_percentage_used) ||
            '30.00',
        );
        setRetailPrice(
            toNumString((item as any).recommended_retail_price),
        );
        setQuantity(String(item.required_quantity ?? 0));

        setDeleting(false);
        setSaving(false);
        setConfirmDelete(false);
        setBanner(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item?.id, item?.remote_id, item?.draft_id]);

    if (!item || !indentId) return null;

    const busy = deleting || saving;

    /* The freshest identifier the modal has for the item. The context
     * accepts either a server UUID or a client draft id and resolves
     * accordingly. */
    const targetItemId = item.remote_id ?? item.draft_id ?? null;

    /* =========================================================
     * DELETE — two-step confirm, no native dialog.
     * ======================================================= */

    const handleDeletePress = () => {
        if (busy) return;
        setBanner(null);
        setConfirmDelete(true);
    };

    const cancelDelete = () => {
        setConfirmDelete(false);
    };

    const performDelete = async () => {
        setConfirmDelete(false);
        setBanner(null);
        setDeleting(true);

        try {
            if (!targetItemId) {
                setBanner({
                    kind: 'error',
                    title: 'Cannot remove',
                    detail:
                        'Item has neither a remote id nor a draft id.',
                });
                return;
            }

            const result = await removeOfferFromIndent({
                indentId,
                itemId: targetItemId,
            });

            if (!result.ok) {
                const errorsText =
                    result.errors && result.errors.length > 0
                        ? result.errors.join('\n')
                        : undefined;

                setBanner({
                    kind: 'error',
                    title:
                        result.message ?? 'Item not removed.',
                    detail: errorsText,
                });
                return;
            }

            onSaved?.();
            onClose();
        } catch (e: any) {
            setBanner({
                kind: 'error',
                title:
                    e?.response?.data?.response_message ??
                    e?.response?.data?.message ??
                    e?.message ??
                    'Could not remove the item.',
            });
        } finally {
            setDeleting(false);
        }
    };

    /* =========================================================
     * SAVE — delegate entirely to the context.
     * ======================================================= */

    const handleSave = async () => {
        if (busy) return;

        setBanner(null);

        const qty = numFromInput(quantity);
        if (qty <= 0) {
            setBanner({
                kind: 'error',
                title: 'Invalid quantity',
                detail:
                    'Required quantity must be greater than zero.',
            });
            return;
        }

        if (!targetItemId) {
            setBanner({
                kind: 'error',
                title: 'Cannot save',
                detail:
                    'Item has neither a remote id nor a draft id.',
            });
            return;
        }

        setSaving(true);
        try {
            const result = await updateIndentItem({
                indentId,
                itemId: targetItemId,
                required_quantity: qty,
                recommended_retail_price:
                    retailPrice.trim() || null,
                markup_percentage_used:
                    markup.trim() || null,
            });

            if (!result.ok) {
                setBanner({
                    kind: 'error',
                    title: result.message ?? 'Save rejected.',
                    detail:
                        result.errors &&
                            result.errors.length > 1
                            ? result.errors.slice(1).join('\n')
                            : undefined,
                });
                return;
            }

            onSaved?.();
            onClose();
        } catch (e: any) {
            setBanner({
                kind: 'error',
                title:
                    e?.response?.data?.response_message ??
                    e?.response?.data?.message ??
                    e?.message ??
                    'Unexpected error while saving.',
            });
        } finally {
            setSaving(false);
        }
    };

    const sourceLabel =
        (item as any).source_label || item.source || 'UNKNOWN';
    const finalUnit = String(
        (item as any).final_unit_price ?? '—',
    );
    const costUnit = String(
        (item as any).cost_per_unit ?? '—',
    );

    /* ── Render ───────────────────────────────────────────── */

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={
                busy
                    ? undefined
                    : confirmDelete
                        ? cancelDelete
                        : onClose
            }
        >
            <View className="flex-1 bg-black/40 items-center justify-center p-3">
                <View
                    className="rounded-2xl w-full max-w-xl overflow-hidden"
                    style={{ backgroundColor: theme.panel }}
                >
                    {/* Header */}
                    <View
                        className="px-5 pt-4 pb-3 border-b"
                        style={{ borderBottomColor: borderColor }}
                    >
                        <View className="flex-row items-start justify-between">
                            <View className="flex-1 min-w-0 pr-3">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                >
                                    Edit Item
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                    numberOfLines={1}
                                >
                                    {item.wholesale_receipt_title ||
                                        (item as any)
                                            .product_title ||
                                        'Untitled product'}
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
                    </View>

                    {/* Body */}
                    <ScrollView
                        contentContainerStyle={{ padding: 20 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Inline banner */}
                        {banner ? (
                            <View
                                className="rounded-xl px-3 py-2.5 mb-4"
                                style={{
                                    backgroundColor:
                                        banner.kind === 'error'
                                            ? 'rgba(239,68,68,0.12)'
                                            : banner.kind ===
                                                'success'
                                                ? 'rgba(16,185,129,0.12)'
                                                : 'rgba(59,130,246,0.12)',
                                    borderWidth: 1,
                                    borderColor:
                                        banner.kind === 'error'
                                            ? 'rgba(239,68,68,0.35)'
                                            : banner.kind ===
                                                'success'
                                                ? 'rgba(16,185,129,0.35)'
                                                : 'rgba(59,130,246,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color:
                                            banner.kind === 'error'
                                                ? '#b91c1c'
                                                : banner.kind ===
                                                    'success'
                                                    ? '#047857'
                                                    : '#1d4ed8',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
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
                                                    : banner.kind ===
                                                        'success'
                                                        ? '#047857'
                                                        : '#1d4ed8',
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

                        {/* Delete confirmation strip */}
                        {confirmDelete ? (
                            <View
                                className="rounded-xl px-3 py-3 mb-4"
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
                                    Remove this item?
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
                                    The item will be removed from
                                    the indent. This cannot be
                                    undone.
                                </Text>
                                <View className="flex-row gap-2 mt-3">
                                    <Pressable
                                        onPress={cancelDelete}
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
                                        onPress={performDelete}
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
                                            Yes, remove
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : null}

                        <View
                            className="rounded-xl px-4 py-3 flex-row items-center justify-between"
                            style={{ backgroundColor: subBg }}
                        >
                            <MetaCell
                                label="Source"
                                value={sourceLabel}
                                theme={theme}
                            />
                            <MetaCell
                                label="Final unit"
                                value={finalUnit}
                                theme={theme}
                                align="center"
                            />
                            <MetaCell
                                label="Cost / unit"
                                value={costUnit}
                                theme={theme}
                                align="right"
                            />
                        </View>

                        <FieldLabel theme={theme}>
                            MARKUP PERCENTAGE USED (%)
                        </FieldLabel>
                        <TextInput
                            value={markup}
                            onChangeText={setMarkup}
                            editable={!busy}
                            keyboardType="numeric"
                            inputMode="decimal"
                            placeholder="30.00"
                            placeholderTextColor={placeholderColor}
                            className="h-11 rounded-lg border px-3"
                            style={{
                                borderColor,
                                backgroundColor:
                                    theme.background,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                opacity: busy ? 0.6 : 1,
                            }}
                        />

                        <FieldLabel theme={theme}>
                            RECOMMENDED RETAIL PRICE
                        </FieldLabel>
                        <TextInput
                            value={retailPrice}
                            onChangeText={setRetailPrice}
                            editable={!busy}
                            keyboardType="numeric"
                            inputMode="decimal"
                            placeholder="e.g. 150.00"
                            placeholderTextColor={placeholderColor}
                            className="h-11 rounded-lg border px-3"
                            style={{
                                borderColor,
                                backgroundColor:
                                    theme.background,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                opacity: busy ? 0.6 : 1,
                            }}
                        />

                        <FieldLabel theme={theme}>
                            REQUIRED QUANTITY
                        </FieldLabel>
                        <TextInput
                            value={quantity}
                            onChangeText={(t) =>
                                setQuantity(
                                    t.replace(/[^0-9]/g, ''),
                                )
                            }
                            editable={!busy}
                            keyboardType="numeric"
                            inputMode="numeric"
                            placeholder="0"
                            placeholderTextColor={placeholderColor}
                            className="h-11 rounded-lg border px-3"
                            style={{
                                borderColor,
                                backgroundColor:
                                    theme.background,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                opacity: busy ? 0.6 : 1,
                            }}
                        />
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="px-5 py-3 border-t"
                        style={{ borderTopColor: borderColor }}
                    >
                        <View className="flex-row items-center justify-between">
                            <Pressable
                                onPress={handleDeletePress}
                                disabled={busy || confirmDelete}
                                className="px-4 py-2 rounded-lg border flex-row items-center gap-2"
                                style={{
                                    borderColor: '#DC2626',
                                    opacity:
                                        busy || confirmDelete
                                            ? 0.5
                                            : 1,
                                    minHeight: 40,
                                }}
                            >
                                {deleting ? (
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
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            Deleting…
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
                                        Delete
                                    </Text>
                                )}
                            </Pressable>

                            <View className="flex-row items-center gap-2">
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
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>

                                <Pressable
                                    onPress={handleSave}
                                    disabled={busy}
                                    className="px-5 py-2 rounded-lg flex-row items-center gap-2"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                        opacity: busy ? 0.5 : 1,
                                        minHeight: 40,
                                    }}
                                >
                                    {saving ? (
                                        <>
                                            <ActivityIndicator
                                                size="small"
                                                color="#FFFFFF"
                                            />
                                            <Text
                                                className="uppercase tracking-wide text-white"
                                                style={{
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 13,
                                                }}
                                            >
                                                Saving…
                                            </Text>
                                        </>
                                    ) : (
                                        <Text
                                            className="uppercase tracking-wide text-white"
                                            style={{
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            Save
                                        </Text>
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Blocking overlay */}
                {busy ? (
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.35)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                        }}
                    >
                        <View
                            className="rounded-2xl px-6 py-5 items-center"
                            style={{
                                backgroundColor: theme.panel,
                                minWidth: 200,
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
                                }}
                            >
                                {deleting
                                    ? 'Removing item…'
                                    : 'Saving changes…'}
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

function FieldLabel({
    children,
    theme,
}: {
    children: React.ReactNode;
    theme: any;
}) {
    return (
        <Text
            className="uppercase tracking-widest mt-5 mb-1.5"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
            }}
        >
            {children}
        </Text>
    );
}

function MetaCell({
    label,
    value,
    theme,
    align = 'left',
}: {
    label: string;
    value: string;
    theme: any;
    align?: 'left' | 'center' | 'right';
}) {
    return (
        <View style={{ alignItems: align }}>
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
                    fontSize: 13,
                }}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}