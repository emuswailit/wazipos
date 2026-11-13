// components/retailers/reports/productMovement/ProductMovementMobileView.tsx

import { DateField } from '@/components/common/DateField';
import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import type {
    DailySummaryRow,
    MovementRow,
    ReceiptBreakdownRow,
} from './ProductMovementReport';
import {
    readOption,
    type PickerOption,
    type ProductMovementViewProps,
    type ProductOptionLike,
} from './ProductMovementWebView';
import {
    buildProductMovementHtml,
    buildProductMovementSheets,
} from './productMovementExport';

/* =========================================================
 * Formatters
 * ======================================================= */

const FALLBACK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function num(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-KE');
}

function signedNum(n: number): string {
    if (n === 0) return '0';
    const abs = Math.abs(n).toLocaleString('en-KE');
    return n > 0 ? `+${abs}` : `−${abs}`;
}

function alpha(hex: string, a: number): string {
    if (!hex) return `rgba(0,0,0,${a})`;
    const clean = hex.replace('#', '');
    const full =
        clean.length === 3
            ? clean
                .split('')
                .map((c) => c + c)
                .join('')
            : clean;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

function fmtDatetime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}

const TYPE_TINT: Record<string, string> = {
    RECEIPT: '#10b981',
    SALE: '#0ea5e9',
    ADJUSTMENT: '#64748b',
    CORRECTION: '#94a3b8',
    EXPIRY_WRITE_OFF: '#dc2626',
    DAMAGE_WRITE_OFF: '#ea580c',
    WHOLESALER_RETURN: '#f59e0b',
    CUSTOMER_RETURN: '#8b5cf6',
};

function typeLabel(type: string): string {
    return type
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* =========================================================
 * Component
 * ======================================================= */

export function ProductMovementMobileView(
    props: ProductMovementViewProps,
) {
    const {
        productId,
        productTitle,
        onClearProduct,
        productOptions,
        pickerLoading,
        onSelectProduct,
        report,
        loading,
        error,
        from,
        onFromChange,
        to,
        onToChange,
        activeTypes,
        onToggleType,
        onClearTypes,
        onResetPeriod,
        typeOptions,
        onRefresh,
    } = props;

    const { theme, isDarkMode } = useAuth();
    const subBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const [filtersOpen, setFiltersOpen] = useState(false);

    const selected = useMemo<PickerOption | null>(() => {
        const match = (productOptions as any[]).find((p) => {
            const id = p?.remote_id ?? p?.product_id ?? p?.id;
            return id != null && String(id) === String(productId);
        });
        return match ? readOption(match) : null;
    }, [productOptions, productId]);

    /* ---- Picker mode ---- */
    if (!productId) {
        return (
            <View
                className="flex-1 w-full"
                style={{ backgroundColor: theme.background }}
            >
                <View
                    className="p-4 border-b"
                    style={{
                        backgroundColor: theme.panel,
                        borderBottomColor: theme.border,
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.lg,
                            letterSpacing: -0.2,
                        }}
                    >
                        Product Movement
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                        <View
                            className="px-2 py-0.5 rounded-md"
                            style={{
                                backgroundColor: `${theme.primary}15`,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                Pick a product
                            </Text>
                        </View>
                        <View
                            className="px-2 py-0.5 rounded-md"
                            style={{
                                backgroundColor:
                                    'rgba(148,163,184,0.15)',
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 9,
                                }}
                            >
                                {productOptions.length}{' '}
                                {productOptions.length === 1
                                    ? 'Item'
                                    : 'Items'}
                            </Text>
                        </View>
                    </View>
                </View>

                <MobilePicker
                    options={productOptions}
                    loading={pickerLoading}
                    onSelect={onSelectProduct}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    subBg={subBg}
                />
            </View>
        );
    }

    /* ---- Report mode ---- */
    const periodLabel = report
        ? `${fmtDate(report.period.from)} → ${fmtDate(report.period.to)}`
        : '—';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* Header */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: theme.border,
                }}
            >
                <View
                    className="flex-row items-start mb-3"
                    style={{ gap: 12 }}
                >
                    <View
                        className="w-[56px] h-[56px] rounded-xl overflow-hidden border"
                        style={{ borderColor: theme.border }}
                    >
                        <Image
                            source={{
                                uri:
                                    selected?.imageUrl ||
                                    FALLBACK_IMAGE,
                            }}
                            style={{ width: '100%', height: '100%' }}
                        />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.lg,
                                letterSpacing: -0.2,
                            }}
                            numberOfLines={2}
                        >
                            {productTitle ??
                                selected?.title ??
                                report?.product.title ??
                                'Product Movement'}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                            {report ? (
                                <Badge
                                    label={`${report.period.days}d`}
                                    color={theme.primary}
                                    bg={`${theme.primary}15`}
                                    theme={theme}
                                />
                            ) : null}
                            {selected?.category ||
                                report?.product.category ? (
                                <Badge
                                    label={
                                        selected?.category ||
                                        report!.product.category || ""
                                    }
                                    color={theme.textDark}
                                    bg="rgba(148,163,184,0.15)"
                                    theme={theme}
                                />
                            ) : null}
                            {selected?.isPom ? (
                                <Badge
                                    label="POM"
                                    color="#dc2626"
                                    bg="rgba(220,38,38,0.12)"
                                    theme={theme}
                                />
                            ) : null}
                        </View>
                        <Text
                            className="mt-1"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.xs,
                            }}
                            numberOfLines={1}
                        >
                            {periodLabel}
                        </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <Pressable
                            onPress={onClearProduct}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Change product"
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                                borderColor: theme.primary,
                                backgroundColor: `${theme.primary}15`,
                            }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Change
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onRefresh}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-full"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: loading ? 0.6 : 1,
                            }}
                        >
                            {loading ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            ) : (
                                <Text
                                    className="uppercase tracking-widest text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Refresh
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                {/* Filter + export row */}
                <View
                    className="flex-row items-center"
                    style={{ gap: 8 }}
                >
                    <Pressable
                        onPress={() => setFiltersOpen((v) => !v)}
                        className="flex-row items-center px-3 py-1.5 rounded-full border"
                        style={{
                            borderColor: filtersOpen
                                ? theme.primary
                                : theme.border,
                            backgroundColor: filtersOpen
                                ? `${theme.primary}15`
                                : 'transparent',
                            gap: 6,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: filtersOpen
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            {activeTypes.length === 0
                                ? 'All types'
                                : `${activeTypes.length} type${activeTypes.length === 1
                                    ? ''
                                    : 's'
                                }`}
                        </Text>
                        <Text
                            style={{
                                color: filtersOpen
                                    ? theme.primary
                                    : theme.textDark,
                                fontSize: 9,
                            }}
                        >
                            {filtersOpen ? '▲' : '▼'}
                        </Text>
                    </Pressable>

                    <View style={{ flex: 1 }} />

                    <ExportButtons
                        enabled={!!report}
                        variant="inline"
                        height={30}
                        getExcel={() => ({
                            filename: `product_movement_${report!.product.title.slice(0, 40)}_${report!.period.from}_to_${report!.period.to}.xlsx`,
                            sheets: buildProductMovementSheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `product_movement_${report!.product.title.slice(0, 40)}_${report!.period.from}_to_${report!.period.to}.pdf`,
                            html: buildProductMovementHtml(report!),
                        })}
                    />
                </View>

                {filtersOpen ? (
                    <View className="mt-3">
                        <View className="flex-row" style={{ gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <DateField
                                    label="From"
                                    value={from}
                                    onChangeText={onFromChange}
                                    placeholder="YYYY-MM-DD"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <DateField
                                    label="To"
                                    value={to}
                                    onChangeText={onToChange}
                                    placeholder="YYYY-MM-DD"
                                />
                            </View>
                        </View>

                        <Pressable
                            onPress={onResetPeriod}
                            className="px-3 py-1.5 rounded-full border items-center justify-center self-start mt-2"
                            style={{ borderColor: theme.border }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Reset period
                            </Text>
                        </Pressable>

                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                marginTop: 12,
                                marginBottom: 6,
                            }}
                        >
                            Movement types
                        </Text>
                        <View
                            className="flex-row flex-wrap"
                            style={{ gap: 6 }}
                        >
                            <TypeChip
                                label="All types"
                                active={activeTypes.length === 0}
                                theme={theme}
                                onPress={onClearTypes}
                            />
                            {typeOptions.map((opt) => (
                                <TypeChip
                                    key={opt.value}
                                    label={opt.label}
                                    tint={opt.tint}
                                    active={activeTypes.includes(
                                        opt.value,
                                    )}
                                    theme={theme}
                                    onPress={() =>
                                        onToggleType(opt.value)
                                    }
                                />
                            ))}
                        </View>
                    </View>
                ) : null}
            </View>

            {/* Body */}
            {loading && !report ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color={theme.primary} />
                </View>
            ) : error ? (
                <View className="flex-1 items-center justify-center p-6">
                    <Text
                        style={{
                            color: '#f43f5e',
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.base,
                        }}
                    >
                        Could not load ledger
                    </Text>
                    <Text
                        className="mt-1 text-center"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {error}
                    </Text>
                    <Pressable
                        onPress={onRefresh}
                        className="mt-4 px-5 py-2.5 rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            Retry
                        </Text>
                    </Pressable>
                </View>
            ) : report ? (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        padding: 16,
                        paddingBottom: 40,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={false}
                            onRefresh={onRefresh}
                            tintColor={theme.primary}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                >
                    {report.product.receipt_count === 0 ? (
                        <View
                            className="rounded-2xl border p-8 items-center"
                            style={{
                                backgroundColor: theme.panel,
                                borderColor: theme.border,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                No receipts for this product
                            </Text>
                            <Text
                                className="mt-1 text-center"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                This entity has never stocked this
                                product, so there is no movement to
                                trace.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {selected ? (
                                <MobileProductSpec
                                    product={selected}
                                    theme={theme}
                                />
                            ) : null}

                            <View
                                className="rounded-2xl border p-4 mb-3"
                                style={{
                                    backgroundColor: alpha(
                                        theme.primary,
                                        0.08,
                                    ),
                                    borderColor: alpha(
                                        theme.primary,
                                        0.35,
                                    ),
                                }}
                            >
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Closing balance
                                </Text>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 34,
                                        letterSpacing: -1,
                                    }}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                >
                                    {num(report.kpi.closing_balance)}
                                </Text>
                                <View
                                    className="flex-row items-center mt-2"
                                    style={{ gap: 14 }}
                                >
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.medium,
                                            fontSize: theme.fontSize.xs,
                                        }}
                                    >
                                        Open{' '}
                                        {num(
                                            report.kpi.opening_balance,
                                        )}
                                    </Text>
                                    <Text
                                        style={{
                                            color:
                                                report.kpi.net_change >= 0
                                                    ? '#10b981'
                                                    : '#f43f5e',
                                            fontFamily: theme.font.bold,
                                            fontSize: theme.fontSize.xs,
                                        }}
                                    >
                                        {signedNum(
                                            report.kpi.net_change,
                                        )}{' '}
                                        net
                                    </Text>
                                </View>
                            </View>

                            <View
                                className="flex-row flex-wrap mb-3"
                                style={{ gap: 8 }}
                            >
                                <MobileKpi
                                    label="Total in"
                                    value={`+${num(
                                        report.kpi.total_in,
                                    )}`}
                                    subtitle={`${num(
                                        report.kpi.receipts_count,
                                    )} receipts`}
                                    tint="#10b981"
                                    theme={theme}
                                />
                                <MobileKpi
                                    label="Total out"
                                    value={`−${num(
                                        report.kpi.total_out,
                                    )}`}
                                    subtitle={`${num(
                                        report.kpi.sales_count,
                                    )} sales`}
                                    tint="#f43f5e"
                                    theme={theme}
                                />
                                <MobileKpi
                                    label="Adjustments"
                                    value={num(
                                        report.kpi.adjustments_count,
                                    )}
                                    theme={theme}
                                />
                                <MobileKpi
                                    label="Movements"
                                    value={num(
                                        report.kpi.movement_count,
                                    )}
                                    theme={theme}
                                />
                            </View>

                            {report.daily_summary.length > 0 ? (
                                <SectionCard
                                    title="Daily movement"
                                    theme={theme}
                                >
                                    <MobileDailyChart
                                        rows={report.daily_summary}
                                        theme={theme}
                                    />
                                </SectionCard>
                            ) : null}

                            <SectionCard
                                title={`Ledger (${report.movements.length})`}
                                theme={theme}
                            >
                                {report.movements.length === 0 ? (
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.regular,
                                            fontSize: theme.fontSize.sm,
                                            paddingVertical: 8,
                                        }}
                                    >
                                        No movements in this period.
                                    </Text>
                                ) : (
                                    <MovementCards
                                        movements={report.movements}
                                        openingBalance={
                                            report.kpi.opening_balance
                                        }
                                        theme={theme}
                                        subBg={subBg}
                                    />
                                )}
                            </SectionCard>

                            {report.receipt_breakdown.length > 0 ? (
                                <SectionCard
                                    title={`Batches (${report.receipt_breakdown.length})`}
                                    theme={theme}
                                >
                                    {report.receipt_breakdown.map(
                                        (r: ReceiptBreakdownRow) => (
                                            <BatchCard
                                                key={r.receipt_id}
                                                row={r}
                                                theme={theme}
                                                subBg={subBg}
                                            />
                                        ),
                                    )}
                                </SectionCard>
                            ) : null}
                        </>
                    )}
                </ScrollView>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Mobile product spec
 * ======================================================= */

function MobileProductSpec({
    product,
    theme,
}: {
    product: PickerOption;
    theme: ThemeShape;
}) {
    const rows: Array<{
        label: string;
        value: string;
        mono?: boolean;
    }> = [
            { label: 'Manufacturer', value: product.manufacturer || '—' },
            { label: 'Formula', value: product.formula || '—' },
            { label: 'Category', value: product.category || '—' },
            {
                label: 'Pack units',
                value:
                    product.unitsPerPack != null
                        ? `${product.unitsPerPack} Qty`
                        : '—',
            },
            { label: 'Barcode', value: product.barcode || '—', mono: true },
            { label: 'Added', value: fmtDate(product.created) },
            {
                label: 'Status',
                value: product.isActive ? 'Active' : 'Inactive',
            },
        ];

    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <Text
                className="uppercase tracking-widest mb-3"
                style={{
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.xs,
                }}
            >
                Product details
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                {rows.map((r) => (
                    <View
                        key={r.label}
                        style={{ minWidth: '47%', flex: 1 }}
                    >
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                        >
                            {r.label}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={{
                                color: theme.text,
                                fontFamily: r.mono
                                    ? theme.font.mono
                                    : theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                marginTop: 2,
                            }}
                        >
                            {r.value}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

/* =========================================================
 * Picker
 * ======================================================= */

function MobilePicker({
    options,
    loading,
    onSelect,
    theme,
    isDarkMode,
    subBg,
}: {
    options: ProductOptionLike[];
    loading: boolean;
    onSelect: (opt: ProductOptionLike) => void;
    theme: ThemeShape;
    isDarkMode: boolean;
    subBg: string;
}) {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((raw) => {
            const o = readOption(raw);
            return [
                o.title,
                o.barcode,
                o.category,
                o.formula,
                o.manufacturer,
            ]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }, [options, query]);

    const visible = filtered.slice(0, 100);
    const total = options.length;

    if (loading && total === 0) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }

    return (
        <View className="flex-1 w-full">
            <View className="px-4 pt-4 pb-2">
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search brand catalog..."
                    placeholderTextColor={theme.textDark}
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="h-10 rounded-xl border px-3.5"
                    style={{
                        borderColor: theme.border,
                        backgroundColor: subBg,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                />
                <Text
                    className="mt-2"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.xs,
                    }}
                >
                    {query
                        ? `${visible.length} of ${filtered.length}`
                        : `${total} products`}
                    {filtered.length > visible.length
                        ? ' — keep typing'
                        : ''}
                </Text>
            </View>

            {visible.length === 0 ? (
                <View className="flex-1 items-center justify-center p-6">
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.base,
                        }}
                    >
                        {total === 0 ? 'No products yet' : 'No matches'}
                    </Text>
                    <Text
                        className="mt-1 text-center"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {total === 0
                            ? 'The product catalog is still syncing.'
                            : 'Try a different search.'}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 32,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {visible.map((raw, i) => {
                        const option = readOption(raw);
                        const rowKey = option.id || `opt-${i}`;
                        return (
                            <PickerCard
                                key={rowKey}
                                option={option}
                                onSelect={() => onSelect(raw)}
                                theme={theme}
                            />
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

function PickerCard({
    option,
    onSelect,
    theme,
}: {
    option: PickerOption;
    onSelect: () => void;
    theme: ThemeShape;
}) {
    return (
        <Pressable
            onPress={onSelect}
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <View className="flex-row items-center mb-3" style={{ gap: 12 }}>
                <View
                    className="w-16 h-16 rounded-xl overflow-hidden border"
                    style={{ borderColor: theme.border }}
                >
                    <Image
                        source={{ uri: option.imageUrl }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View className="flex-row items-start justify-between flex-wrap gap-1">
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                flex: 1,
                            }}
                            numberOfLines={2}
                        >
                            {option.title || '—'}
                        </Text>
                        {option.formula ? (
                            <View
                                className="px-2 py-0.5 rounded"
                                style={{
                                    backgroundColor:
                                        'rgba(59,130,246,0.12)',
                                    maxWidth: 100,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wider"
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                    }}
                                    numberOfLines={1}
                                >
                                    {option.formula}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {option.category ? (
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.semibold,
                                fontSize: theme.fontSize.xs,
                                marginTop: 2,
                            }}
                            numberOfLines={1}
                        >
                            {option.category}
                        </Text>
                    ) : null}
                </View>
            </View>

            <View style={{ gap: 4 }}>
                {option.manufacturer ? (
                    <SpecLine
                        label="Mfg"
                        value={option.manufacturer}
                        theme={theme}
                    />
                ) : null}
                <View className="flex-row" style={{ gap: 10 }}>
                    {option.unitsPerPack != null ? (
                        <SpecLine
                            label="Pack"
                            value={`${option.unitsPerPack} Qty`}
                            theme={theme}
                        />
                    ) : null}
                </View>
                {option.barcode ? (
                    <SpecLine
                        label="Barcode"
                        value={option.barcode}
                        theme={theme}
                        mono
                    />
                ) : null}
                {option.created ? (
                    <SpecLine
                        label="Added"
                        value={fmtDate(option.created)}
                        theme={theme}
                    />
                ) : null}
            </View>

            <View className="flex-row mt-3" style={{ gap: 8 }}>
                <Pressable
                    onPress={onSelect}
                    className="flex-1 py-2.5 rounded-xl items-center"
                    style={{ backgroundColor: theme.primary }}
                >
                    <Text
                        className="uppercase tracking-wide text-white"
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        Select
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

function SpecLine({
    label,
    value,
    theme,
    mono,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    mono?: boolean;
}) {
    return (
        <View className="flex-row items-center" style={{ gap: 4 }}>
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
                numberOfLines={1}
                style={{
                    color: theme.textDark,
                    fontFamily: mono
                        ? theme.font.mono
                        : theme.font.medium,
                    fontSize: theme.fontSize.xs,
                    flexShrink: 1,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * KPI + Section + chart
 * ======================================================= */

function MobileKpi({
    label,
    value,
    subtitle,
    tint,
    theme,
}: {
    label: string;
    value: string;
    subtitle?: string;
    tint?: string;
    theme: ThemeShape;
}) {
    return (
        <View
            className="rounded-2xl border p-4"
            style={{
                borderColor: theme.border,
                minWidth: '47%',
                flex: 1,
                backgroundColor: theme.panel,
            }}
        >
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
                className="mt-1"
                style={{
                    color: tint ?? theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.lg,
                }}
                numberOfLines={1}
            >
                {value}
            </Text>
            {subtitle ? (
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                        fontSize: 10,
                    }}
                    numberOfLines={1}
                >
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
}

function SectionCard({
    title,
    children,
    theme,
}: {
    title: string;
    children: React.ReactNode;
    theme: ThemeShape;
}) {
    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <Text
                className="uppercase tracking-widest mb-3"
                style={{
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.xs,
                }}
            >
                {title}
            </Text>
            {children}
        </View>
    );
}

function MobileDailyChart({
    rows,
    theme,
}: {
    rows: DailySummaryRow[];
    theme: ThemeShape;
}) {
    const maxAbs = Math.max(
        ...rows.map((r) => Math.max(r.in, r.out)),
        1,
    );
    const trimmed = rows.length > 30 ? rows.slice(-30) : rows;

    return (
        <View>
            <View
                className="flex-row items-end"
                style={{ gap: 2, height: 80 }}
            >
                {trimmed.map((r, i) => {
                    const inH = (r.in / maxAbs) * 70;
                    const outH = (r.out / maxAbs) * 70;
                    return (
                        <View
                            key={i}
                            style={{
                                flex: 1,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                height: '100%',
                                gap: 1,
                            }}
                        >
                            <View
                                style={{
                                    width: '100%',
                                    flexDirection: 'row',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                    gap: 1,
                                    height: 70,
                                }}
                            >
                                <View
                                    style={{
                                        flex: 1,
                                        height: Math.max(
                                            inH,
                                            r.in > 0 ? 2 : 0,
                                        ),
                                        backgroundColor: '#10b981',
                                        borderTopLeftRadius: 2,
                                        borderTopRightRadius: 2,
                                    }}
                                />
                                <View
                                    style={{
                                        flex: 1,
                                        height: Math.max(
                                            outH,
                                            r.out > 0 ? 2 : 0,
                                        ),
                                        backgroundColor: '#f43f5e',
                                        borderTopLeftRadius: 2,
                                        borderTopRightRadius: 2,
                                    }}
                                />
                            </View>
                        </View>
                    );
                })}
            </View>
            <View
                className="flex-row items-center mt-3"
                style={{ gap: 14 }}
            >
                <Legend color="#10b981" label="In" theme={theme} />
                <Legend color="#f43f5e" label="Out" theme={theme} />
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: 10,
                        opacity: 0.7,
                    }}
                >
                    {trimmed.length}{' '}
                    {trimmed.length === 1 ? 'day' : 'days'}
                </Text>
            </View>
        </View>
    );
}

function Legend({
    color,
    label,
    theme,
}: {
    color: string;
    label: string;
    theme: ThemeShape;
}) {
    return (
        <View className="flex-row items-center" style={{ gap: 6 }}>
            <View
                style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: color,
                }}
            />
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.xs,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

/* =========================================================
 * Movement cards
 * ======================================================= */

function MovementCards({
    movements,
    openingBalance,
    theme,
    subBg,
}: {
    movements: MovementRow[];
    openingBalance: number;
    theme: ThemeShape;
    subBg: string;
}) {
    return (
        <View>
            <View
                className="rounded-xl px-3 py-2 mb-3 flex-row items-center justify-between"
                style={{
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderStyle: 'dashed',
                }}
            >
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    Opening balance
                </Text>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                    }}
                >
                    {num(openingBalance)}
                </Text>
            </View>

            {movements.map((m, i) => (
                <MovementCard
                    key={i}
                    movement={m}
                    theme={theme}
                    subBg={subBg}
                />
            ))}
        </View>
    );
}

function MovementCard({
    movement,
    theme,
    subBg,
}: {
    movement: MovementRow;
    theme: ThemeShape;
    subBg: string;
}) {
    const tint = TYPE_TINT[movement.type] ?? theme.textDark;
    const isIn = movement.direction === 'IN';

    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
                borderLeftWidth: 3,
                borderLeftColor: tint,
            }}
        >
            <View className="flex-row items-start justify-between flex-wrap gap-2">
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                        className="px-2 py-0.5 rounded self-start"
                        style={{
                            backgroundColor: alpha(tint, 0.15),
                            maxWidth: 160,
                        }}
                    >
                        <Text
                            className="uppercase tracking-wider"
                            style={{
                                color: tint,
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                            }}
                            numberOfLines={1}
                        >
                            {typeLabel(movement.type)}
                        </Text>
                    </View>
                    <Text
                        className="mt-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.mono,
                            fontSize: 11,
                        }}
                    >
                        {fmtDatetime(movement.datetime)}
                    </Text>
                </View>

                <View className="items-end">
                    <Text
                        style={{
                            color: isIn ? '#10b981' : '#f43f5e',
                            fontFamily: theme.font.bold,
                            fontSize: 18,
                            letterSpacing: -0.4,
                        }}
                    >
                        {isIn
                            ? `+${num(movement.quantity)}`
                            : `−${num(movement.quantity)}`}
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.mono,
                            fontSize: 10,
                        }}
                    >
                        bal {num(movement.balance_after)}
                    </Text>
                </View>
            </View>

            {movement.reference ? (
                <Text
                    className="mt-2"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                    }}
                    numberOfLines={2}
                >
                    {movement.reference}
                </Text>
            ) : null}

            {movement.batch ? (
                <View
                    className="mt-3 pt-3 flex-row items-center"
                    style={{
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                    }}
                >
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        Batch
                    </Text>
                    <Text
                        className="ml-2"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.mono,
                            fontSize: 11,
                        }}
                        numberOfLines={1}
                    >
                        {movement.batch}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Batch card
 * ======================================================= */

function BatchCard({
    row,
    theme,
    subBg,
}: {
    row: ReceiptBreakdownRow;
    theme: ThemeShape;
    subBg: string;
}) {
    const isActive = row.is_active;
    return (
        <View
            className="rounded-2xl border p-4 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <View className="flex-row justify-between items-start flex-wrap gap-1">
                <Text
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                        flex: 1,
                    }}
                    numberOfLines={1}
                >
                    {row.batch || '(no batch)'}
                </Text>
                <View
                    className="px-2 py-0.5 rounded"
                    style={{
                        backgroundColor: isActive
                            ? 'rgba(16,185,129,0.12)'
                            : 'rgba(148,163,184,0.15)',
                    }}
                >
                    <Text
                        className="uppercase tracking-wider"
                        style={{
                            color: isActive
                                ? '#10b981'
                                : theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                        }}
                    >
                        {isActive ? 'Active' : 'Closed'}
                    </Text>
                </View>
            </View>

            <Text
                className="mt-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.mono,
                    fontSize: 11,
                }}
            >
                {row.expiry_date
                    ? `exp ${fmtDate(row.expiry_date)}`
                    : 'no expiry'}
            </Text>

            <View
                className="flex-row items-center justify-between mt-3 pt-3"
                style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                }}
            >
                <BatchStat
                    label="Received"
                    value={num(row.received)}
                    theme={theme}
                />
                <BatchStat
                    label="Sold"
                    value={num(row.sold)}
                    theme={theme}
                />
                <BatchStat
                    label="On hand"
                    value={num(row.current)}
                    color={theme.primary}
                    theme={theme}
                />
            </View>
        </View>
    );
}

function BatchStat({
    label,
    value,
    color,
    theme,
}: {
    label: string;
    value: string;
    color?: string;
    theme: ThemeShape;
}) {
    return (
        <View className="items-center">
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
                    color: color ?? theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.base,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

/* =========================================================
 * Badge + Type chip
 * ======================================================= */

function Badge({
    label,
    color,
    bg,
    theme,
}: {
    label: string;
    color: string;
    bg: string;
    theme: ThemeShape;
}) {
    return (
        <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: bg, maxWidth: 140 }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

function TypeChip({
    label,
    active,
    tint,
    theme,
    onPress,
}: {
    label: string;
    active: boolean;
    tint?: string;
    theme: ThemeShape;
    onPress: () => void;
}) {
    const color = tint ?? theme.primary;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="px-3 py-1.5 rounded-full border items-center justify-center"
            style={{
                borderColor: active ? color : theme.border,
                backgroundColor: active
                    ? alpha(color, 0.15)
                    : 'transparent',
            }}
        >
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: active ? color : theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}