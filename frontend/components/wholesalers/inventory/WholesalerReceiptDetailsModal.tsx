// components/wholesalers/inventory/WholesalerReceiptDetailsModal.tsx

import { useAuth } from '@/context/AuthContext';
import { WholesalerReceipt } from '@/databases/types';
import React, { useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Props
 * ======================================================= */
interface Props {
    receipt: WholesalerReceipt | null;
    onClose: () => void;
}

/* =========================================================
 * Modal
 * ======================================================= */
export function WholesalerReceiptDetailsModal({
    receipt,
    onClose,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [showAllBatches, setShowAllBatches] = useState(false);

    if (!receipt) return null;

    const batches = receipt.batches ?? [];
    const visibleBatches = showAllBatches
        ? batches
        : batches.slice(0, 5);

    const hasBatches = batches.length > 0;
    const hasPlacements =
        (receipt.placements?.length ?? 0) > 0;
    const hasPriceTiers =
        (receipt.price_tiers?.length ?? 0) > 0;

    const marginPct =
        receipt.final_unit_selling_price > 0 &&
            receipt.unit_buying_price != null
            ? ((receipt.final_unit_selling_price -
                receipt.unit_buying_price) /
                receipt.final_unit_selling_price) *
            100
            : null;

    return (
        <Modal
            visible={!!receipt}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{ backgroundColor: theme.panel, borderColor }}
                >
                    {/* ---------------- Header ---------------- */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-row items-center flex-1 min-w-0">
                            <View
                                className="rounded-lg overflow-hidden mr-3"
                                style={{
                                    width: 44,
                                    height: 44,
                                    backgroundColor: isDarkMode
                                        ? '#1e293b'
                                        : '#e2e8f0',
                                }}
                            >
                                {receipt.thumbnail_url ? (
                                    <Image
                                        source={{
                                            uri: receipt.thumbnail_url,
                                        }}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                        }}
                                        resizeMode="cover"
                                    />
                                ) : null}
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                    numberOfLines={1}
                                >
                                    {receipt.title || '—'}
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                    numberOfLines={1}
                                >
                                    {receipt.bar_code
                                        ? `Barcode ${receipt.bar_code} · `
                                        : ''}
                                    Received {receipt.created || '—'}
                                </Text>
                            </View>
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
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* ---------------- Body ---------------- */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* Summary */}
                        <SectionTitle label="Summary" />
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="In stock"
                                value={`${receipt.current_unit_quantity} ${receipt.unit_of_receipt ||
                                    'units'
                                    }`}
                            />
                            <SummaryCell
                                label="Selling"
                                value={`KES ${formatKES(
                                    receipt.final_unit_selling_price
                                )}`}
                            />
                            <SummaryCell
                                label="Buying"
                                value={`KES ${formatKES(
                                    receipt.unit_buying_price
                                )}`}
                            />
                            {marginPct != null ? (
                                <SummaryCell
                                    label="Margin"
                                    value={`${marginPct.toFixed(1)}%`}
                                />
                            ) : null}
                            {receipt.batch ? (
                                <SummaryCell
                                    label="Batch"
                                    value={String(receipt.batch)}
                                />
                            ) : null}
                        </View>

                        {/* Flags */}
                        {(receipt.in_placement ||
                            receipt.is_expired ||
                            receipt.is_near_expiry) && (
                                <>
                                    <SectionTitle label="Status" />
                                    <View className="flex-row flex-wrap gap-1.5 mb-4">
                                        {receipt.in_placement ? (
                                            <MiniBadge
                                                label="In placement"
                                                tone="success"
                                            />
                                        ) : null}
                                        {receipt.is_expired ? (
                                            <MiniBadge
                                                label="Expired"
                                                tone="warning"
                                            />
                                        ) : null}
                                        {receipt.is_near_expiry ? (
                                            <MiniBadge
                                                label="Near expiry"
                                                tone="warning"
                                            />
                                        ) : null}
                                    </View>
                                </>
                            )}

                        {/* ---------------- Batches ---------------- */}
                        {hasBatches ? (
                            <>
                                <View className="flex-row items-center justify-between mb-2">
                                    <SectionTitle
                                        label={`Batches (${batches.length})`}
                                        inline
                                    />
                                    {batches.length > 5 ? (
                                        <Pressable
                                            onPress={() =>
                                                setShowAllBatches(
                                                    (v) => !v
                                                )
                                            }
                                        >
                                            <Text
                                                className="uppercase tracking-wide"
                                                style={{
                                                    color: theme.primary,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                {showAllBatches
                                                    ? 'Collapse'
                                                    : `Show all (${batches.length})`}
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </View>

                                {/* Header row */}
                                <View
                                    className="flex-row rounded-xl border px-3 py-2 mb-1"
                                    style={{
                                        backgroundColor: subBg,
                                        borderColor,
                                    }}
                                >
                                    <Text
                                        style={styles.headerCell(
                                            theme
                                        )}
                                        flex={1.4}
                                    >
                                        Batch
                                    </Text>
                                    <Text
                                        style={styles.headerCell(
                                            theme
                                        )}
                                        flex={1}
                                    >
                                        Qty
                                    </Text>
                                    <Text
                                        style={styles.headerCell(
                                            theme
                                        )}
                                        flex={1.2}
                                    >
                                        Expiry
                                    </Text>
                                    <Text
                                        style={styles.headerCell(
                                            theme
                                        )}
                                        flex={1}
                                    >
                                        Status
                                    </Text>
                                </View>

                                {visibleBatches.map((b, idx) => (
                                    <BatchRow
                                        key={
                                            b.batch ??
                                            `${receipt.id}-${idx}`
                                        }
                                        batch={b}
                                    />
                                ))}
                            </>
                        ) : null}

                        {/* ---------------- Placements ---------------- */}
                        <SectionTitle
                            label={`Placements (${receipt.placements?.length ?? 0
                                })`}
                        />
                        {hasPlacements ? (
                            receipt.placements!
                                .slice(0, 5)
                                .map((p, idx) => (
                                    <View
                                        key={
                                            p.placement_id ??
                                            `${receipt.id}-pl-${idx}`
                                        }
                                        className="rounded-xl border p-3 mb-2"
                                        style={{
                                            backgroundColor: subBg,
                                            borderColor,
                                        }}
                                    >
                                        <View className="flex-row justify-between items-center mb-1.5">
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 13,
                                                    flex: 1,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {p.placement_title ||
                                                    'Placement'}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {p.quantity} u
                                            </Text>
                                        </View>
                                        <View className="flex-row flex-wrap gap-1.5 mt-1">
                                            {p.status ? (
                                                <MiniBadge
                                                    label={p.status}
                                                />
                                            ) : null}
                                            {p.created ? (
                                                <MiniBadge
                                                    label={`Since ${formatDate(
                                                        p.created
                                                    )}`}
                                                />
                                            ) : null}
                                        </View>
                                    </View>
                                ))
                        ) : (
                            <EmptyBlock message="No active placements for this receipt." />
                        )}

                        {/* ---------------- Price tiers ---------------- */}
                        <SectionTitle
                            label={`Price tiers (${receipt.price_tiers?.length ?? 0
                                })`}
                        />
                        {hasPriceTiers ? (
                            receipt.price_tiers!
                                .slice(0, 5)
                                .map((t, idx) => (
                                    <View
                                        key={
                                            t.tier_id ??
                                            `${receipt.id}-t-${idx}`
                                        }
                                        className="rounded-xl border p-3 mb-2 flex-row items-center justify-between"
                                        style={{
                                            backgroundColor: subBg,
                                            borderColor,
                                        }}
                                    >
                                        <View className="flex-1">
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 13,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {t.label ||
                                                    `Tier ${idx + 1}`}
                                            </Text>
                                            {t.min_quantity !=
                                                null ? (
                                                <Text
                                                    className="mt-0.5"
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font
                                                                .medium,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    Min{' '}
                                                    {
                                                        t.min_quantity
                                                    }{' '}
                                                    units
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 14,
                                            }}
                                        >
                                            KES{' '}
                                            {formatKES(
                                                t.unit_price
                                            )}
                                        </Text>
                                    </View>
                                ))
                        ) : (
                            <EmptyBlock message="No tiered pricing configured." />
                        )}

                        {/* ---------------- Notes ---------------- */}
                        {receipt.notes ? (
                            <>
                                <SectionTitle label="Notes" />
                                <View
                                    className="rounded-xl p-3 mb-4"
                                    style={{ backgroundColor: subBg }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {receipt.notes}
                                    </Text>
                                </View>
                            </>
                        ) : null}
                    </ScrollView>

                    {/* ---------------- Footer ---------------- */}
                    <View
                        className="flex-row justify-end p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
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
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Batch row
 * ======================================================= */
function BatchRow({ batch }: { batch: any }) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const expired = batch.is_expired;
    const nearExpiry = batch.is_near_expiry;
    const statusLabel = expired
        ? 'Expired'
        : nearExpiry
            ? 'Near expiry'
            : 'OK';
    const statusColor = expired
        ? '#ef4444'
        : nearExpiry
            ? '#f59e0b'
            : '#10b981';

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2 mb-1 items-center"
            style={{ borderColor }}
        >
            <Text
                style={{
                    flex: 1.4,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    fontSize: 11,
                }}
                numberOfLines={1}
            >
                {batch.batch || '—'}
            </Text>
            <Text
                style={{
                    flex: 1,
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 11,
                }}
            >
                {batch.quantity ?? 0}
            </Text>
            <Text
                style={{
                    flex: 1.2,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: 11,
                }}
                numberOfLines={1}
            >
                {batch.expiry_date
                    ? formatDate(batch.expiry_date)
                    : '—'}
            </Text>
            <Text
                style={{
                    flex: 1,
                    color: statusColor,
                    fontFamily: theme.font.bold,
                    fontSize: 11,
                }}
            >
                {statusLabel}
            </Text>
        </View>
    );
}

/* =========================================================
 * Small pieces
 * ======================================================= */
function SectionTitle({
    label,
    inline,
}: {
    label: string;
    inline?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <Text
            className="uppercase tracking-widest mb-2"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
                marginTop: inline ? 0 : 8,
            }}
        >
            {label}
        </Text>
    );
}

function SummaryCell({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 100 }}>
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
                numberOfLines={1}
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
                    : '#f8fafc';
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

function EmptyBlock({ message }: { message: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="rounded-xl p-4 items-center mb-3"
            style={{
                backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
            }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {message}
            </Text>
        </View>
    );
}

/* =========================================================
 * Helpers
 * ======================================================= */
function formatKES(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '0';
    return Number(value).toLocaleString('en-KE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

/* =========================================================
 * Inline styles
 * ======================================================= */
const styles = {
    headerCell: (theme: any) => ({
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
    }),
};