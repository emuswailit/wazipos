// components/retailers/retailerInventory/InventoryDetailsModal.tsx
//
// Read-only details surface for a single inventory receipt.
//
// Layout mirrors OutOfStockDetailsModal: hero product card, summary
// grid, pricing block, footer actions.

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import { resolveImageUrl } from '@/lib/images';
import React, { useCallback } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import {
    expiryLabel,
    formatDate,
    formatKES,
    isExpired,
    StatusPill,
} from './RetailerInventoryWebView';

/* =========================================================
 * Props
 * ======================================================= */

interface InventoryDetailsModalProps {
    item: any | null;
    onClose: () => void;
    onEdit?: (item: any) => void;
}

/* =========================================================
 * Component
 * ======================================================= */

export function InventoryDetailsModal({
    item,
    onClose,
    onEdit,
}: InventoryDetailsModalProps) {
    const { theme } = useAuth();

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';
    const dividerColor = theme.isDarkMode
        ? '#334155'
        : '#f1f5f9';
    const subBg = theme.isDarkMode ? '#0f172a' : '#f8fafc';

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!item) return null;

    const exp = isExpired(item);
    const url = resolveImageUrl(
        item.thumbnail_url ||
        item.image_url ||
        item.images?.[0]
    );

    const qty = Number(item.current_unit_quantity ?? 0);
    const received = Number(
        item.received_unit_quantity ?? 0
    );
    const bp = parseFloat(item.unit_selling_price || '0');
    const fp = parseFloat(
        item.final_unit_selling_price || '0'
    );
    const stockValue = qty * (Number.isFinite(fp) ? fp : 0);
    const hasDiscount = fp < bp;

    const statusTone: 'active' | 'expired' | 'warning' = exp
        ? 'expired'
        : item.expiry_status === 'EXPIRING' ||
            item.expiry_status === 'EXPIRING_SOON'
            ? 'warning'
            : 'active';

    return (
        <Modal
            visible={!!item}
            animationType="fade"
            transparent
            onRequestClose={handleClose}
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
                        <View className="flex-1 min-w-0 mr-3">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {item.title ||
                                    item.product_title ||
                                    'Unnamed'}
                            </Text>
                            <Text
                                className="mt-0.5 uppercase tracking-widest text-[11px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.mono,
                                }}
                                numberOfLines={1}
                            >
                                {item.bar_code || '—'}
                            </Text>
                        </View>
                        <Pressable
                            onPress={handleClose}
                            hitSlop={10}
                            className="p-1.5"
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* Hero card */}
                        <View
                            className="flex-row rounded-xl p-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <View
                                className="w-[72px] h-[72px] rounded-xl mr-3 items-center justify-center overflow-hidden shrink-0"
                                style={{
                                    backgroundColor: theme.panel,
                                }}
                            >
                                <ImageWithFallback
                                    uri={url}
                                    width={72}
                                    height={72}
                                    fallback="📦"
                                    fallbackSize={28}
                                    borderRadius={12}
                                />
                            </View>

                            <View className="flex-1 min-w-0">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: 15,
                                    }}
                                    numberOfLines={2}
                                >
                                    {item.title ||
                                        item.product_title ||
                                        'Unnamed'}
                                </Text>
                                <Text
                                    className="mt-0.5 text-[12px]"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                    }}
                                    numberOfLines={1}
                                >
                                    {item.manufacturer_title ||
                                        'Unknown manufacturer'}
                                </Text>

                                <View className="flex-row flex-wrap gap-1.5 mt-2">
                                    <MiniBadge
                                        label={`Qty ${qty}`}
                                    />
                                    <MiniBadge
                                        label={
                                            item.unit_of_receipt ||
                                            'Unit'
                                        }
                                    />
                                    <MiniBadge
                                        label={expiryLabel(item)}
                                    />
                                    {item.batch ? (
                                        <MiniBadge
                                            label={`Batch ${item.batch}`}
                                        />
                                    ) : null}
                                </View>
                            </View>
                        </View>

                        {/* Summary grid */}
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Barcode"
                                value={item.bar_code || '—'}
                            />
                            <SummaryCell
                                label="Batch"
                                value={item.batch || '—'}
                            />
                            <SummaryCell
                                label="Units / Pack"
                                value={String(
                                    item.units_per_pack ?? 1
                                )}
                            />
                            <SummaryCell
                                label="Received"
                                value={String(received)}
                            />
                            <SummaryCell
                                label="Current"
                                value={String(qty)}
                            />
                            <SummaryCell
                                label="Status"
                                value={
                                    <StatusPill
                                        label={expiryLabel(item)}
                                        tone={statusTone}
                                        size="sm"
                                    />
                                }
                            />
                            <SummaryCell
                                label="Manufacture"
                                value={formatDate(
                                    item.manufacture_date
                                )}
                            />
                            <SummaryCell
                                label="Expiry"
                                value={formatDate(
                                    item.expiry_date
                                )}
                            />
                            <SummaryCell
                                label="Days to Expiry"
                                value={
                                    item.days_to_expiry ===
                                        null ||
                                        item.days_to_expiry ===
                                        undefined
                                        ? '—'
                                        : String(item.days_to_expiry)
                                }
                            />
                        </View>

                        {/* Supplier */}
                        <View
                            className="rounded-xl p-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Received From"
                                value={
                                    item.received_from_title ||
                                    '—'
                                }
                            />
                            <View className="mt-2.5">
                                <SummaryCell
                                    label="Origin Country"
                                    value={
                                        item.origin_country_title ||
                                        '—'
                                    }
                                />
                            </View>
                        </View>

                        {/* Pricing block */}
                        <View
                            className="rounded-xl p-3 border"
                            style={{
                                backgroundColor: subBg,
                                borderColor: dividerColor,
                            }}
                        >
                            <PriceRow
                                theme={theme}
                                label="Unit buying price"
                                value={
                                    item.unit_buying_price
                                        ? `KES ${formatKES(
                                            item.unit_buying_price
                                        )}`
                                        : '—'
                                }
                            />
                            <PriceRow
                                theme={theme}
                                label="Unit selling price"
                                value={`KES ${formatKES(bp)}`}
                            />
                            {hasDiscount ? (
                                <PriceRow
                                    theme={theme}
                                    label="Final selling price"
                                    value={`KES ${formatKES(fp)}`}
                                    tone="positive"
                                />
                            ) : null}

                            <View
                                className="flex-row justify-between pt-2 mt-1 border-t"
                                style={{
                                    borderTopColor: dividerColor,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    Stock value
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.mono,
                                        fontSize:
                                            theme.fontSize.base,
                                    }}
                                >
                                    KES {formatKES(stockValue)}
                                </Text>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={handleClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                        >
                            <Text
                                className="uppercase tracking-wide text-[12px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Close
                            </Text>
                        </Pressable>

                        {onEdit ? (
                            <Pressable
                                onPress={() => {
                                    onEdit(item);
                                    handleClose();
                                }}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{
                                    borderColor: theme.primary,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Edit inventory item"
                            >
                                <Text
                                    className="uppercase tracking-wide text-[12px]"
                                    style={{
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                    }}
                                >
                                    Edit Item
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Sub-components
 * ======================================================= */

function SummaryCell({
    label,
    value,
    flexBasis = '30%',
}: {
    label: string;
    value: React.ReactNode;
    flexBasis?: string;
}) {
    const { theme } = useAuth();
    return (
        <View style={{ flexGrow: 1, flexBasis }}>
            <Text
                className="uppercase tracking-wide text-[10px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
            {typeof value === 'string' ? (
                <Text
                    className="mt-0.5 text-sm"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                    }}
                    numberOfLines={1}
                >
                    {value}
                </Text>
            ) : (
                <View className="mt-0.5">{value}</View>
            )}
        </View>
    );
}

function PriceRow({
    theme,
    label,
    value,
    tone = 'neutral',
}: {
    theme: ThemeShape;
    label: string;
    value: string;
    tone?: 'neutral' | 'positive' | 'negative';
}) {
    const color =
        tone === 'positive'
            ? '#10b981'
            : tone === 'negative'
                ? '#f43f5e'
                : theme.text;
    return (
        <View className="flex-row justify-between py-0.5">
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color,
                    fontFamily: theme.font.mono,
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
                    : '#f1f5f9',
                borderColor: theme.isDarkMode
                    ? '#334155'
                    : '#e2e8f0',
            }}
        >
            <Text
                className="uppercase tracking-wide text-[10px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}