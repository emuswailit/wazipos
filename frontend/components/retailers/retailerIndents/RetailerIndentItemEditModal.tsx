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

import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminSheet, FormErrorBanner, FormPanel, FormRow, FormSection, SheetButton, useListTokens } from '@/components/common/listScreen';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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
    const { theme } = useListTokens();
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

    const title = item.wholesale_receipt_title || (item as any).product_title || 'Untitled product';
    const qtyNum = numFromInput(quantity);

    return (
        <AdminSheet
            visible={visible}
            onClose={busy ? () => { } : confirmDelete ? cancelDelete : onClose}
            dismissible={!busy}
            title="Edit item"
            subtitle={title}
            icon="cube-outline"
            width={600}
            footer={
                confirmDelete ? (
                    <>
                        <SheetButton label="Keep item" variant="secondary" onPress={cancelDelete} disabled={busy} grow />
                        <SheetButton label="Yes, remove" variant="danger" icon="trash-outline" onPress={performDelete} loading={deleting} loadingLabel="Removing…" grow />
                    </>
                ) : (
                    <>
                        <SheetButton label="Remove" variant="ghost" icon="trash-outline" onPress={handleDeletePress} disabled={busy} />
                        <View style={{ flex: 1 }} />
                        <SheetButton label="Cancel" variant="secondary" onPress={onClose} disabled={busy} />
                        <SheetButton label="Save" icon="checkmark" onPress={handleSave} loading={saving} disabled={busy} />
                    </>
                )
            }
        >
            {banner ? <FormErrorBanner message={banner.detail ? `${banner.title}\n${banner.detail}` : banner.title} /> : null}

            {confirmDelete ? (
                <FormPanel tint="#f43f5e">
                    <Text style={{ color: '#be123c', fontFamily: theme.font.bold, fontSize: 14 }}>Remove this item from the indent?</Text>
                    <Text style={{ color: '#be123c', fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 4 }}>
                        It will no longer be ordered when the indent is submitted. You can add it again from the marketplace or stock-outs.
                    </Text>
                </FormPanel>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <InfoTile label="Source" value={sourceLabel} />
                <InfoTile label="Wholesaler" value={item.wholesaler_title || '—'} />
                <InfoTile label="Cost / unit" value={costUnit === '—' ? '—' : `KES ${costUnit}`} />
                <InfoTile label="Final / unit" value={finalUnit === '—' ? '—' : `KES ${finalUnit}`} />
            </View>

            <FormSection title="Order">
                <CustomTextField
                    label="Required quantity"
                    required
                    value={quantity}
                    onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 10"
                    error={quantity !== '' && qtyNum <= 0 ? 'Must be greater than zero.' : undefined}
                    editable={!busy}
                />
            </FormSection>

            <FormSection title="Pricing" hint="Used for the shelf price when this stock is received.">
                <FormRow>
                    <CustomTextField
                        label="Markup %"
                        value={markup}
                        onChangeText={(t) => setMarkup(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="30.00"
                        editable={!busy}
                    />
                    <CustomTextField
                        label="Recommended retail price (KES)"
                        value={retailPrice}
                        onChangeText={(t) => setRetailPrice(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="Optional"
                        editable={!busy}
                    />
                </FormRow>
            </FormSection>
        </AdminSheet>
    );
}

function InfoTile({ label, value }: { label: string; value: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ flexGrow: 1, flexBasis: 120, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: chipBg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}
