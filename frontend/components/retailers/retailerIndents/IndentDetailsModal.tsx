// app/(retailers)/retailerIndents/IndentDetailsModal.tsx

import { useAuth } from '@/context/AuthContext';
import {
    IndentItemParamsResponse,
    useRetailerIndentsSync,
} from '@/context/RetailerIndentsSyncContext';
import {
    RetailerIndent,
    RetailerIndentItem,
} from '@/databases/types';
import { notifyError, notifySuccess } from '@/utils/notify';
import React, { useCallback, useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import {
    RetailerIndentItemEditModal,
    RetailerIndentItemUpdatePayload,
} from './RetailerIndentItemEditModal';

const API_BASE_URL = 'https://api.wazipos.co.ke';
const IMAGE_BASE_URL = API_BASE_URL;

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

const formatKES = (
    raw: string | number | null | undefined
): string => {
    if (raw === null || raw === undefined) return '—';
    const n = Number(raw);
    if (isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

const resolveImage = (raw: any): string | null => {
    if (!raw) return null;
    const p =
        typeof raw === 'string'
            ? raw
            : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    const clean = p.replace(/^\/+/, '');
    return `${IMAGE_BASE_URL}/${clean}`;
};

const deriveUnitPrice = (
    it: RetailerIndentItem
): number | null => {
    if (it.final_unit_price != null) {
        const n = Number(it.final_unit_price);
        if (!isNaN(n)) return n;
    }
    if (it.final_supplier_unit_selling_price != null) {
        const n = Number(it.final_supplier_unit_selling_price);
        if (!isNaN(n)) return n;
    }
    if (
        it.item_gross_total_amount != null &&
        it.total_quantity > 0
    ) {
        const gross = Number(it.item_gross_total_amount);
        if (!isNaN(gross)) return gross / it.total_quantity;
    }
    return null;
};

/* ------------------------------------------------------------------ */
/* Delete endpoint                                                     */
/* ------------------------------------------------------------------ */
async function deleteIndentItem(itemId: string): Promise<void> {
    const res = await fetch(
        `${API_BASE_URL}/api/v1/retailers/indent-items/${itemId}/`,
        { method: 'DELETE' }
    );
    if (!res.ok) {
        let detail = `Delete failed (${res.status})`;
        try {
            const body = await res.json();
            detail = body?.detail || body?.message || detail;
        } catch {
            /* ignore */
        }
        throw new Error(detail);
    }
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
interface IndentDetailsModalProps {
    indent: RetailerIndent | null;
    onClose: () => void;
    onEdit: (indent: RetailerIndent) => void;
    onRefresh?: (indentId: string) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function IndentDetailsModal({
    indent,
    onClose,
    onEdit,
    onRefresh,
}: IndentDetailsModalProps) {
    const { theme } = useAuth();
    const { applyServerIndentItem } = useRetailerIndentsSync();

    const [editingItem, setEditingItem] =
        useState<RetailerIndentItem | null>(null);
    const [savingItem, setSavingItem] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleOpenItem = useCallback(
        (item: RetailerIndentItem) => {
            setErrorMsg(null);
            setEditingItem(item);
        },
        []
    );

    const handleCloseItem = useCallback(() => {
        if (savingItem) return;
        setEditingItem(null);
        setErrorMsg(null);
    }, [savingItem]);

    const handleSaveItem = useCallback(
        async (
            _payload: RetailerIndentItemUpdatePayload,
            item: RetailerIndentItem,
            serverResponse?: IndentItemParamsResponse
        ) => {
            setEditingItem(null);
            setErrorMsg(null);

            if (
                serverResponse?.item_id &&
                serverResponse?.indent_id &&
                serverResponse?.params
            ) {
                try {
                    await applyServerIndentItem(serverResponse);
                } catch (e: any) {
                    notifyError(
                        'Local Save Failed',
                        e?.message ||
                        'The server accepted the change but the local cache could not be updated.'
                    );
                }
                return;
            }

            if (item.retailer_indent) {
                await onRefresh?.(item.retailer_indent);
            }
        },
        [applyServerIndentItem, onRefresh]
    );

    const handleDeleteItem = useCallback(
        async (item: RetailerIndentItem) => {
            setSavingItem(true);
            setErrorMsg(null);
            try {
                await deleteIndentItem(item.id);
                setEditingItem(null);
                notifySuccess(
                    'Item Deleted',
                    'The item was removed from the indent.'
                );
                if (item.retailer_indent) {
                    await onRefresh?.(item.retailer_indent);
                }
            } catch (e: any) {
                const msg = e?.message || 'Failed to delete item.';
                setErrorMsg(msg);
                notifyError('Delete Failed', msg);
            } finally {
                setSavingItem(false);
            }
        },
        [onRefresh]
    );

    if (!indent) return null;

    const isOpen = toBool(indent.is_open);

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';
    const dividerColor = theme.isDarkMode
        ? '#334155'
        : '#f1f5f9';
    const subBg = theme.isDarkMode ? '#0f172a' : '#f8fafc';

    const itemCount =
        indent.retailer_indent_items?.length ?? 0;

    return (
        <>
            <Modal
                visible={!!indent}
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
                            style={{
                                borderBottomColor: dividerColor,
                            }}
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
                                    {indent.entity_title || '—'}
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    {isOpen ? 'Open' : 'Closed'} ·{' '}
                                    {itemCount} item
                                    {itemCount === 1 ? '' : 's'}
                                </Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                className="p-1.5"
                                accessibilityRole="button"
                                accessibilityLabel="Close"
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
                        <ScrollView
                            contentContainerStyle={{
                                padding: 16,
                            }}
                        >
                            {/* Summary */}
                            <View
                                className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                                style={{
                                    backgroundColor: subBg,
                                }}
                            >
                                <SummaryCell
                                    label="Lead Time"
                                    value={`${indent.lead_time ?? 0}d`}
                                />
                                <SummaryCell
                                    label="Order Days"
                                    value={`${indent.order_days ?? 0}d`}
                                />
                                <SummaryCell
                                    label="Pricing %"
                                    value={`${indent.pricing_percentage}%`}
                                />
                                <SummaryCell
                                    label="Avg Lead"
                                    value={`${indent.average_lead_time_days}d`}
                                />
                                <SummaryCell
                                    label="Budget"
                                    value={
                                        indent.budget_amount
                                            ? formatKES(
                                                indent.budget_amount
                                            )
                                            : '—'
                                    }
                                />
                                <SummaryCell
                                    label="Enforced"
                                    value={
                                        toBool(
                                            indent.budget_enforced
                                        )
                                            ? 'Yes'
                                            : 'No'
                                    }
                                />
                            </View>

                            {/* Error banner */}
                            {errorMsg ? (
                                <View
                                    className="rounded-xl px-3 py-2 mb-3"
                                    style={{
                                        backgroundColor:
                                            'rgba(244,63,94,0.12)',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: '#f43f5e',
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        {errorMsg}
                                    </Text>
                                </View>
                            ) : null}

                            {/* Items heading */}
                            <Text
                                className="uppercase tracking-widest mb-2"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Indent Items ({itemCount})
                            </Text>

                            {itemCount === 0 ? (
                                <View className="p-6 items-center">
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        No items on this indent.
                                    </Text>
                                </View>
                            ) : (
                                indent.retailer_indent_items.map(
                                    (it) => {
                                        const thumb =
                                            resolveImage(
                                                it.images?.[0]
                                            );
                                        const unitPrice =
                                            deriveUnitPrice(it);
                                        return (
                                            <View
                                                key={it.id}
                                                className="flex-row items-center rounded-xl border p-2.5 mb-2"
                                                style={{
                                                    backgroundColor:
                                                        theme.panel,
                                                    borderColor,
                                                }}
                                            >
                                                {/* Thumbnail */}
                                                <View
                                                    className="w-[52px] h-[52px] rounded-[10px] mr-3 items-center justify-center overflow-hidden"
                                                    style={{
                                                        backgroundColor:
                                                            subBg,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {thumb ? (
                                                        <Image
                                                            source={{
                                                                uri: thumb,
                                                            }}
                                                            style={{
                                                                width: 52,
                                                                height: 52,
                                                            }}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <Text
                                                            style={{
                                                                fontSize: 20,
                                                                opacity: 0.4,
                                                            }}
                                                        >
                                                            📦
                                                        </Text>
                                                    )}
                                                </View>

                                                {/* Details */}
                                                <View className="flex-1 min-w-0">
                                                    <Text
                                                        style={{
                                                            color: theme.text,
                                                            fontFamily:
                                                                theme
                                                                    .font
                                                                    .bold,
                                                            fontSize: 14,
                                                        }}
                                                        numberOfLines={2}
                                                    >
                                                        {it.wholesale_receipt_title ||
                                                            '—'}
                                                    </Text>
                                                    <Text
                                                        className="mt-0.5"
                                                        style={{
                                                            color: theme.textDark,
                                                            fontFamily:
                                                                theme
                                                                    .font
                                                                    .medium,
                                                            fontSize: 11,
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        {it.wholesaler_title ||
                                                            '—'}
                                                    </Text>

                                                    <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                                                        <MiniBadge
                                                            label={`Qty ${it.required_quantity}`}
                                                        />
                                                        {unitPrice !=
                                                            null ? (
                                                            <MiniBadge
                                                                label={`KES ${formatKES(
                                                                    unitPrice
                                                                )}`}
                                                            />
                                                        ) : (
                                                            <MiniBadge label="No price" />
                                                        )}
                                                        <MiniBadge
                                                            label={
                                                                it.source ||
                                                                'PREDICTION'
                                                            }
                                                        />
                                                    </View>
                                                </View>

                                                {/* Per-item Edit button */}
                                                <Pressable
                                                    onPress={() =>
                                                        handleOpenItem(
                                                            it
                                                        )
                                                    }
                                                    className="px-3 py-1.5 rounded-lg border ml-3"
                                                    style={{
                                                        borderColor:
                                                            theme.primary,
                                                        flexShrink: 0,
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Edit item ${it.wholesale_receipt_title}`}
                                                >
                                                    <Text
                                                        className="uppercase tracking-wide"
                                                        style={{
                                                            color: theme.primary,
                                                            fontFamily:
                                                                theme
                                                                    .font
                                                                    .bold,
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        Edit
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        );
                                    }
                                )
                            )}
                        </ScrollView>

                        {/* Footer */}
                        <View
                            className="flex-row justify-end gap-2 p-4 border-t"
                            style={{
                                borderTopColor: dividerColor,
                            }}
                        >
                            <Pressable
                                onPress={onClose}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{ borderColor }}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Close
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => onEdit(indent)}
                                className="px-4 py-2.5 rounded-xl"
                                style={{
                                    backgroundColor: theme.primary,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Update indent parameters"
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Update Indent
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Item edit modal — owns the PATCH */}
            <RetailerIndentItemEditModal
                visible={!!editingItem}
                item={editingItem}
                loading={savingItem}
                onClose={handleCloseItem}
                onSave={handleSaveItem}
                onDelete={handleDeleteItem}
            />
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function SummaryCell({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 90 }}>
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function MiniBadge({ label }: { label: string }) {
    const { theme } = useAuth();
    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{
                backgroundColor: theme.isDarkMode
                    ? '#0f172a'
                    : '#f8fafc',
                borderColor: theme.isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </View>
    );
}