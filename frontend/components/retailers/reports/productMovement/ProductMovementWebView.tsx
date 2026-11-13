// components/retailers/reports/productMovement/ProductMovementWebView.tsx

import type { ProductMovementType } from '@/api/retailersApi';
import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';

import type {
    DailySummaryRow,
    MovementRow,
    ProductMovementReportData,
    ReceiptBreakdownRow,
} from './ProductMovementReport';
import {
    buildProductMovementHtml,
    buildProductMovementSheets,
} from './productMovementExport';

/* =========================================================
 * Layout + platform
 * ======================================================= */

const TABLE_MAX_WIDTH = 1600;
const COMPACT_FILTER_BREAKPOINT = 768;
const FALLBACK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

const PICKER_COLS = {
    pic: '6%',
    name: '22%',
    formula: '22%',
    pack: '10%',
    manufacturer: '16%',
    barcode: '12%',
    created: '12%',
} as const;

const PICKER_HEADERS: {
    key: keyof typeof PICKER_COLS;
    label: string;
}[] = [
        { key: 'pic', label: 'Pic' },
        { key: 'name', label: 'Brand Name' },
        { key: 'formula', label: 'Scientific Strength Formula' },
        { key: 'pack', label: 'Pack Units' },
        { key: 'manufacturer', label: 'Manufacturer' },
        { key: 'barcode', label: 'Barcode' },
        { key: 'created', label: 'Created' },
    ];

/* =========================================================
 * Shape adapter (exported for mobile)
 * ======================================================= */

export interface ProductOptionLike {
    remote_id?: string;
    product_id?: string;
    id?: string | number;

    title?: string;
    product_title?: string;
    long_title?: string;
    product_name?: string;

    bar_code?: string;
    barcode?: string;

    category_title?: string;
    long_preparation_title?: string;
    preparation_title?: string;
    formulation_title?: string;
    manufacturer_title?: string;

    units_per_pack?: number | string;
    created?: string;

    images?: Array<string | { thumbnail?: string; image?: string }>;
    image_url?: string | null;
    thumbnail_url?: string | null;

    is_pom?: boolean;
    active?: boolean;
}

export interface PickerOption {
    id: string;
    title: string;
    barcode: string;
    category: string;
    formula: string;
    manufacturer: string;
    unitsPerPack: number | null;
    created: string;
    imageUrl: string;
    isPom: boolean;
    isActive: boolean;
}

function pickImageFrom(raw: any): string {
    const images = raw?.images;
    if (Array.isArray(images) && images.length > 0) {
        const first: any = images[0];
        if (typeof first === 'string') {
            if (first) return first;
        } else if (first) {
            const fromObj = first.thumbnail || first.image;
            if (fromObj) return fromObj;
        }
    }
    return raw?.image_url || raw?.thumbnail_url || FALLBACK_IMAGE;
}

export function readOption(raw: any): PickerOption {
    const unitsRaw = raw?.units_per_pack;
    let unitsPerPack: number | null = null;
    if (typeof unitsRaw === 'number' && Number.isFinite(unitsRaw)) {
        unitsPerPack = unitsRaw;
    } else if (
        typeof unitsRaw === 'string' &&
        unitsRaw.trim() !== ''
    ) {
        const n = Number(unitsRaw);
        if (Number.isFinite(n)) unitsPerPack = n;
    }

    return {
        id: String(
            raw?.remote_id ?? raw?.product_id ?? raw?.id ?? '',
        ),
        title:
            raw?.title ??
            raw?.product_title ??
            raw?.long_title ??
            raw?.product_name ??
            '',
        barcode: raw?.bar_code ?? raw?.barcode ?? '',
        category: raw?.category_title ?? '',
        formula:
            raw?.long_preparation_title ??
            raw?.preparation_title ??
            raw?.formulation_title ??
            '',
        manufacturer: raw?.manufacturer_title ?? '',
        unitsPerPack,
        created: raw?.created ?? '',
        imageUrl: pickImageFrom(raw),
        isPom: !!raw?.is_pom,
        isActive: raw?.active !== false,
    };
}

/* =========================================================
 * Props
 * ======================================================= */

export interface ProductMovementViewProps {
    productId: string | null;
    productTitle: string | null;
    onClearProduct: () => void;

    productOptions: ProductOptionLike[];
    pickerLoading: boolean;
    onSelectProduct: (opt: ProductOptionLike) => void;

    report: ProductMovementReportData | null;
    loading: boolean;
    error: string | null;

    from: string;
    onFromChange: (v: string) => void;
    to: string;
    onToChange: (v: string) => void;
    activeTypes: ProductMovementType[];
    onToggleType: (t: ProductMovementType) => void;
    onClearTypes: () => void;
    onResetPeriod: () => void;
    typeOptions: Array<{
        value: ProductMovementType;
        label: string;
        tint: string;
    }>;

    onRefresh: () => void;
}

/* =========================================================
 * Formatters — manual, Hermes-safe
 *
 * `toLocaleString('en-KE')` / `toLocaleDateString('en-GB', …)`
 * crash on Android Hermes with:
 *   `can't access property "length", returns is undefined`
 * when the requested locale data isn't loaded. Manual formatting
 * is byte-identical across web, iOS, and Android.
 * ======================================================= */

function groupThousands(raw: string): string {
    const dot = raw.indexOf('.');
    const intPart = dot === -1 ? raw : raw.slice(0, dot);
    const frac = dot === -1 ? '' : raw.slice(dot);

    let out = '';
    let count = 0;
    for (let i = intPart.length - 1; i >= 0; i--) {
        out = intPart[i] + out;
        count++;
        if (count === 3 && i > 0 && intPart[i - 1] !== '-') {
            out = ',' + out;
            count = 0;
        }
    }
    return out + frac;
}

function num(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0';
    return groupThousands(String(n));
}

function signedNum(n: number): string {
    if (n === 0) return '0';
    const abs = groupThousands(String(Math.abs(n)));
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

const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

function parseDateSafe(value: string | null | undefined): Date | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = raw.includes(' ')
        ? raw.replace(' ', 'T')
        : raw;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
}

function fmtDate(iso: string | null | undefined): string {
    const d = parseDateSafe(iso);
    if (!d) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

function fmtDatetime(iso: string): string {
    const d = parseDateSafe(iso);
    if (!d) return iso;
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month}, ${hh}:${mm}`;
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

function isNumericCell(v: unknown): boolean {
    if (typeof v === 'number') return true;
    if (typeof v !== 'string') return false;
    return /^[+\-−]?[\d,]+(\.\d+)?$/.test(v.trim());
}

/* =========================================================
 * Component
 * ======================================================= */

export function ProductMovementWebView(
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
    const { width } = useWindowDimensions();
    const isCompactFilter = width < COMPACT_FILTER_BREAKPOINT;
    const [filtersOpen, setFiltersOpen] = useState(false);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

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
                {isWeb ? <DateInputWebkitStyles /> : null}
                <View
                    className="px-5 pt-5 pb-4 border-b"
                    style={{
                        backgroundColor: theme.panel,
                        borderBottomColor: borderColor,
                    }}
                >
                    <View
                        className="w-full self-center"
                        style={{ maxWidth: TABLE_MAX_WIDTH }}
                    >
                        <View className="flex-row items-center justify-between mb-4 gap-4">
                            <View className="flex-1 min-w-0">
                                <Text
                                    className="tracking-tight"
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                >
                                    Product Movement
                                </Text>
                                <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
                                    <View
                                        className="px-2 py-0.5 rounded-md"
                                        style={{
                                            backgroundColor: `${theme.primary}20`,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-widest text-[9px]"
                                            style={{
                                                color: theme.primary,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                        >
                                            Pick a product
                                        </Text>
                                    </View>
                                    <View
                                        className="px-2 py-0.5 rounded-md"
                                        style={{
                                            backgroundColor:
                                                'rgba(148,163,184,0.22)',
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-widest text-[9px]"
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
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
                        </View>
                    </View>
                </View>

                <ProductPicker
                    options={productOptions}
                    loading={pickerLoading}
                    onSelect={onSelectProduct}
                    theme={theme}
                    isDarkMode={isDarkMode}
                />
            </View>
        );
    }

    /* ---- Report mode ---- */
    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {isWeb ? <DateInputWebkitStyles /> : null}

            {/* Header */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: theme.border,
                }}
            >
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
                >
                    <View className="flex-row items-start justify-between gap-4 flex-wrap">
                        <View
                            className="flex-1 flex-row items-start"
                            style={{ gap: 14, minWidth: 260 }}
                        >
                            <View
                                className="w-[64px] h-[64px] rounded-xl overflow-hidden border"
                                style={{ borderColor: theme.border }}
                            >
                                <Image
                                    source={{
                                        uri:
                                            selected?.imageUrl ||
                                            FALLBACK_IMAGE,
                                    }}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                    }}
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
                                    numberOfLines={1}
                                >
                                    {productTitle ??
                                        selected?.title ??
                                        report?.product.title ??
                                        'Product Movement'}
                                </Text>

                                <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                                    {report ? (
                                        <Badge
                                            label={`${report.period.days}d window`}
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
                                    {selected?.formula ? (
                                        <Badge
                                            label={selected.formula}
                                            color={theme.text}
                                            bg="rgba(59,130,246,0.12)"
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
                                    {selected && !selected.isActive ? (
                                        <Badge
                                            label="Inactive"
                                            color="#f43f5e"
                                            bg="rgba(244,63,94,0.12)"
                                            theme={theme}
                                        />
                                    ) : null}
                                </View>

                                <View
                                    className="flex-row items-center flex-wrap mt-1"
                                    style={{ gap: 12 }}
                                >
                                    {selected?.manufacturer ? (
                                        <MetaLine
                                            label="Mfg"
                                            value={selected.manufacturer}
                                            theme={theme}
                                        />
                                    ) : null}
                                    {selected?.unitsPerPack != null ? (
                                        <MetaLine
                                            label="Pack"
                                            value={`${selected.unitsPerPack} Qty`}
                                            theme={theme}
                                        />
                                    ) : null}
                                    {selected?.barcode ? (
                                        <MetaLine
                                            label="Bar"
                                            value={selected.barcode}
                                            theme={theme}
                                            mono
                                        />
                                    ) : null}
                                    {selected?.created ? (
                                        <MetaLine
                                            label="Added"
                                            value={fmtDate(
                                                selected.created,
                                            )}
                                            theme={theme}
                                        />
                                    ) : null}
                                    {report ? (
                                        <MetaLine
                                            label="Period"
                                            value={`${fmtDate(
                                                report.period.from,
                                            )} → ${fmtDate(
                                                report.period.to,
                                            )}`}
                                            theme={theme}
                                        />
                                    ) : null}
                                </View>
                            </View>
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
                                    ...webPointer,
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

                            <ExportButtons
                                enabled={!!report}
                                variant="primary"
                                height={30}
                                getExcel={() => ({
                                    filename: `product_movement_${report!.product.title.slice(0, 40)}_${report!.period.from}_to_${report!.period.to}.xlsx`,
                                    sheets:
                                        buildProductMovementSheets(report!),
                                })}
                                getPdf={() => ({
                                    filename: `product_movement_${report!.product.title.slice(0, 40)}_${report!.period.from}_to_${report!.period.to}.pdf`,
                                    html: buildProductMovementHtml(report!),
                                })}
                            />

                            <Pressable
                                onPress={onRefresh}
                                disabled={loading}
                                className="px-3 py-1.5 rounded-full"
                                style={{
                                    backgroundColor: theme.primary,
                                    opacity: loading ? 0.6 : 1,
                                    ...webPointer,
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
                </View>
            </View>

            {/* Filter bar */}
            <View
                className="p-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: theme.border,
                }}
            >
                <View
                    className="w-full self-center"
                    style={{ maxWidth: TABLE_MAX_WIDTH }}
                >
                    {isCompactFilter ? (
                        <CompactFilterBar
                            theme={theme}
                            from={from}
                            to={to}
                            activeCount={activeTypes.length}
                            onOpen={() => setFiltersOpen(true)}
                            onReset={onResetPeriod}
                        />
                    ) : (
                        <WideFilterBar
                            theme={theme}
                            isDarkMode={isDarkMode}
                            from={from}
                            onFromChange={onFromChange}
                            to={to}
                            onToChange={onToChange}
                            onResetPeriod={onResetPeriod}
                            activeTypes={activeTypes}
                            typeOptions={typeOptions}
                            onToggleType={onToggleType}
                            onClearTypes={onClearTypes}
                        />
                    )}
                </View>
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
                        className="mt-4 px-5 h-10 rounded-full items-center justify-center"
                        style={{
                            backgroundColor: theme.primary,
                            ...webPointer,
                        }}
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
                        alignItems: 'center',
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <View
                        className="w-full"
                        style={{ maxWidth: TABLE_MAX_WIDTH, gap: 20 }}
                    >
                        {selected ? (
                            <ProductDetailsCard
                                product={selected}
                                theme={theme}
                            />
                        ) : null}

                        <View
                            className="rounded-xl border px-5 py-4"
                            style={{
                                backgroundColor: alpha(
                                    theme.primary,
                                    0.08,
                                ),
                                borderColor: alpha(theme.primary, 0.35),
                            }}
                        >
                            <View className="flex-row items-center justify-between flex-wrap gap-3">
                                <View
                                    style={{ flex: 1, minWidth: 180 }}
                                >
                                    <Text
                                        className="uppercase tracking-widest"
                                        style={{
                                            color: theme.primary,
                                            fontFamily: theme.font.bold,
                                            fontSize: 9,
                                        }}
                                    >
                                        Closing balance
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontFamily: theme.font.bold,
                                            fontSize: 32,
                                            letterSpacing: -1,
                                            marginTop: 4,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {num(
                                            report.kpi.closing_balance,
                                        )}
                                    </Text>
                                </View>
                                <View
                                    className="flex-row items-center"
                                    style={{ gap: 14 }}
                                >
                                    <MiniStat
                                        label="Opening"
                                        value={num(
                                            report.kpi.opening_balance,
                                        )}
                                        theme={theme}
                                    />
                                    <MiniStat
                                        label="Net change"
                                        value={signedNum(
                                            report.kpi.net_change,
                                        )}
                                        color={
                                            report.kpi.net_change >= 0
                                                ? '#10b981'
                                                : '#f43f5e'
                                        }
                                        theme={theme}
                                    />
                                </View>
                            </View>
                        </View>

                        <View className="flex-row flex-wrap gap-3">
                            <KpiCard
                                label="Total in"
                                value={`+${num(report.kpi.total_in)}`}
                                subtitle={`${num(report.kpi.receipts_count)} receipts`}
                                theme={theme}
                                success={report.kpi.total_in > 0}
                            />
                            <KpiCard
                                label="Total out"
                                value={`−${num(report.kpi.total_out)}`}
                                subtitle={`${num(report.kpi.sales_count)} sales`}
                                theme={theme}
                                warning={report.kpi.total_out > 0}
                            />
                            <KpiCard
                                label="Adjustments"
                                value={num(report.kpi.adjustments_count)}
                                theme={theme}
                            />
                            <KpiCard
                                label="Movements"
                                value={num(report.kpi.movement_count)}
                                theme={theme}
                            />
                        </View>

                        {report.product.receipt_count === 0 ? (
                            <View
                                className="rounded-xl border p-8 items-center"
                                style={{
                                    borderColor: theme.border,
                                    backgroundColor: theme.panel,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: 15,
                                    }}
                                >
                                    No receipts for this product
                                </Text>
                                <Text
                                    className="mt-1 text-center"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.regular,
                                        fontSize: 13,
                                    }}
                                >
                                    This entity has never stocked this
                                    product, so there is no movement
                                    to trace.
                                </Text>
                            </View>
                        ) : (
                            <>
                                {report.daily_summary.length > 0 ? (
                                    <Section
                                        title="Daily movement"
                                        theme={theme}
                                    >
                                        <DailyMovementCharts
                                            rows={report.daily_summary}
                                            theme={theme}
                                        />
                                        <SimpleTable
                                            headers={[
                                                {
                                                    label: 'Date',
                                                    flex: 2,
                                                    align: 'left',
                                                },
                                                {
                                                    label: 'In',
                                                    flex: 1.2,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Out',
                                                    flex: 1.2,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Net',
                                                    flex: 1.2,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Closing',
                                                    flex: 1.4,
                                                    right: true,
                                                },
                                            ]}
                                            rows={report.daily_summary.map(
                                                (d: DailySummaryRow) => [
                                                    fmtDate(d.date),
                                                    d.in > 0
                                                        ? `+${num(d.in)}`
                                                        : '—',
                                                    d.out > 0
                                                        ? `−${num(d.out)}`
                                                        : '—',
                                                    signedNum(d.net),
                                                    num(d.balance),
                                                ],
                                            )}
                                            theme={theme}
                                        />
                                    </Section>
                                ) : null}

                                <Section
                                    title={`Ledger (${report.movements.length} movements)`}
                                    theme={theme}
                                >
                                    {report.movements.length === 0 ? (
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.regular,
                                                fontSize: 13,
                                                paddingVertical: 12,
                                            }}
                                        >
                                            No movements in this period.
                                        </Text>
                                    ) : (
                                        <MovementLedger
                                            movements={report.movements}
                                            openingBalance={
                                                report.kpi.opening_balance
                                            }
                                            theme={theme}
                                        />
                                    )}
                                </Section>

                                {report.receipt_breakdown.length > 0 ? (
                                    <Section title="Batches" theme={theme}>
                                        <SimpleTable
                                            headers={[
                                                {
                                                    label: 'Batch',
                                                    flex: 2.4,
                                                    align: 'left',
                                                },
                                                {
                                                    label: 'Expiry',
                                                    flex: 1.8,
                                                    align: 'left',
                                                },
                                                {
                                                    label: 'Received',
                                                    flex: 1.4,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Sold',
                                                    flex: 1.2,
                                                    right: true,
                                                },
                                                {
                                                    label: 'On hand',
                                                    flex: 1.4,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Status',
                                                    flex: 1.2,
                                                    align: 'left',
                                                },
                                            ]}
                                            rows={report.receipt_breakdown.map(
                                                (
                                                    r: ReceiptBreakdownRow,
                                                ) => [
                                                        r.batch || '(no batch)',
                                                        r.expiry_date
                                                            ? fmtDate(
                                                                r.expiry_date,
                                                            )
                                                            : '—',
                                                        num(r.received),
                                                        num(r.sold),
                                                        num(r.current),
                                                        r.is_active
                                                            ? 'Active'
                                                            : 'Closed',
                                                    ],
                                            )}
                                            theme={theme}
                                        />
                                    </Section>
                                ) : null}
                            </>
                        )}
                    </View>
                </ScrollView>
            ) : null}

            {/* Compact filter bottom sheet */}
            <FilterSheet
                visible={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                theme={theme}
                isDarkMode={isDarkMode}
                from={from}
                onFromChange={onFromChange}
                to={to}
                onToChange={onToChange}
                onResetPeriod={onResetPeriod}
                activeTypes={activeTypes}
                typeOptions={typeOptions}
                onToggleType={onToggleType}
                onClearTypes={onClearTypes}
            />
        </View>
    );
}

/* =========================================================
 * Webkit date input styling — injected once per mount
 * ======================================================= */

function DateInputWebkitStyles() {
    return (
        <style
            dangerouslySetInnerHTML={{
                __html: `
                    input[type="date"]::-webkit-calendar-picker-indicator {
                        opacity: 0.45;
                        cursor: pointer;
                        padding: 0;
                        margin-left: 2px;
                    }
                    input[type="date"]::-webkit-inner-spin-button,
                    input[type="date"]::-webkit-clear-button {
                        display: none;
                        -webkit-appearance: none;
                    }
                    input[type="date"]::-webkit-datetime-edit,
                    input[type="date"]::-webkit-datetime-edit-fields-wrapper {
                        padding: 0;
                    }
                `,
            }}
        />
    );
}

/* =========================================================
 * Web date input — NativeWind chrome, native input body
 * ======================================================= */

function WebDateInput({
    label,
    value,
    onChangeText,
    theme,
    isDarkMode,
}: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    theme: ThemeShape;
    isDarkMode: boolean;
}) {
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    return (
        <View className="w-[170px]">
            <Text
                className="uppercase tracking-widest text-[9px] mb-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>

            <View
                className="h-8 rounded-lg border px-2.5 flex-row items-center"
                style={{
                    borderColor,
                    backgroundColor: inputBg,
                }}
            >
                {React.createElement('input', {
                    type: 'date',
                    value: value || '',
                    onChange: (e: any) => onChangeText(e.target.value),
                    'aria-label': label,
                    style: {
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                        padding: 0,
                        margin: 0,
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                    } as any,
                })}
            </View>
        </View>
    );
}

/* =========================================================
 * Wide filter bar — two compact rows
 * ======================================================= */

function WideFilterBar({
    theme,
    isDarkMode,
    from,
    onFromChange,
    to,
    onToChange,
    onResetPeriod,
    activeTypes,
    typeOptions,
    onToggleType,
    onClearTypes,
}: {
    theme: ThemeShape;
    isDarkMode: boolean;
    from: string;
    onFromChange: (v: string) => void;
    to: string;
    onToChange: (v: string) => void;
    onResetPeriod: () => void;
    activeTypes: ProductMovementType[];
    typeOptions: Array<{
        value: ProductMovementType;
        label: string;
        tint: string;
    }>;
    onToggleType: (t: ProductMovementType) => void;
    onClearTypes: () => void;
}) {
    return (
        <View className="gap-2.5">
            <View className="flex-row items-end flex-wrap gap-2">
                <WebDateInput
                    label="From"
                    value={from}
                    onChangeText={onFromChange}
                    theme={theme}
                    isDarkMode={isDarkMode}
                />
                <WebDateInput
                    label="To"
                    value={to}
                    onChangeText={onToChange}
                    theme={theme}
                    isDarkMode={isDarkMode}
                />
            </View>

            <View className="flex-row items-center gap-1">
                <Text
                    className="uppercase tracking-widest text-[9px] mr-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                    }}
                >
                    Show
                </Text>

                <CompactChip
                    label="All types"
                    active={activeTypes.length === 0}
                    theme={theme}
                    onPress={onClearTypes}
                />
                {typeOptions.map((opt) => (
                    <CompactChip
                        key={opt.value}
                        label={opt.label}
                        tint={opt.tint}
                        active={activeTypes.includes(opt.value)}
                        theme={theme}
                        onPress={() => onToggleType(opt.value)}
                    />
                ))}

                <View className="flex-1 min-w-2" />

                <Pressable
                    onPress={onResetPeriod}
                    accessibilityRole="button"
                    className="rounded-full border px-2.5 py-[3px] items-center justify-center"
                    style={{
                        borderColor: theme.border,
                        ...webPointer,
                    }}
                >
                    <Text
                        className="uppercase tracking-widest text-[9px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Reset
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Compact filter bar — pill + period readout
 * ======================================================= */

function CompactFilterBar({
    theme,
    from,
    to,
    activeCount,
    onOpen,
    onReset,
}: {
    theme: ThemeShape;
    from: string;
    to: string;
    activeCount: number;
    onOpen: () => void;
    onReset: () => void;
}) {
    const hasActive = activeCount > 0;

    return (
        <View className="flex-row items-center gap-2.5">
            <Pressable
                onPress={onOpen}
                accessibilityRole="button"
                accessibilityLabel="Open filters"
                className="flex-row items-center rounded-full border px-3 py-1.5 gap-1.5"
                style={{
                    borderColor: hasActive ? theme.primary : theme.border,
                    backgroundColor: hasActive
                        ? `${theme.primary}15`
                        : 'transparent',
                    ...webPointer,
                }}
            >
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: hasActive
                            ? theme.primary
                            : theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    Filters
                </Text>
                {hasActive ? (
                    <View
                        className="min-w-[16px] h-4 rounded-full px-1 items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="text-[9px] text-white"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            {activeCount}
                        </Text>
                    </View>
                ) : null}
            </Pressable>

            <Text
                className="text-[10px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {from} → {to}
            </Text>

            <View className="flex-1" />

            <Pressable
                onPress={onReset}
                className="px-3 py-1.5 rounded-full border"
                style={{ borderColor: theme.border, ...webPointer }}
            >
                <Text
                    className="uppercase tracking-widest text-[10px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                    }}
                >
                    Reset
                </Text>
            </Pressable>
        </View>
    );
}

/* =========================================================
 * Filter bottom sheet
 * ======================================================= */

function FilterSheet({
    visible,
    onClose,
    theme,
    isDarkMode,
    from,
    onFromChange,
    to,
    onToChange,
    onResetPeriod,
    activeTypes,
    typeOptions,
    onToggleType,
    onClearTypes,
}: {
    visible: boolean;
    onClose: () => void;
    theme: ThemeShape;
    isDarkMode: boolean;
    from: string;
    onFromChange: (v: string) => void;
    to: string;
    onToChange: (v: string) => void;
    onResetPeriod: () => void;
    activeTypes: ProductMovementType[];
    typeOptions: Array<{
        value: ProductMovementType;
        label: string;
        tint: string;
    }>;
    onToggleType: (t: ProductMovementType) => void;
    onClearTypes: () => void;
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View
                className="flex-1 justify-end"
                style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
            >
                <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close filters"
                    className="absolute inset-0"
                />

                <View
                    className="rounded-t-[20px] border-t px-5 pt-2.5 pb-7"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                >
                    <View
                        className="self-center w-9 h-1 rounded-full mb-3.5"
                        style={{
                            backgroundColor: theme.textDark + '55',
                        }}
                    />

                    <View className="flex-row items-center justify-between mb-4">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            Filters
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            style={webPointer}
                        >
                            <Text
                                className="uppercase tracking-widest text-[10px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Close
                            </Text>
                        </Pressable>
                    </View>

                    <View className="flex-row gap-2.5">
                        <View className="flex-1">
                            <WebDateInput
                                label="From"
                                value={from}
                                onChangeText={onFromChange}
                                theme={theme}
                                isDarkMode={isDarkMode}
                            />
                        </View>
                        <View className="flex-1">
                            <WebDateInput
                                label="To"
                                value={to}
                                onChangeText={onToChange}
                                theme={theme}
                                isDarkMode={isDarkMode}
                            />
                        </View>
                    </View>

                    <Pressable
                        onPress={onResetPeriod}
                        className="px-3 py-1.5 rounded-full border items-center justify-center self-start mt-3"
                        style={{
                            borderColor: theme.border,
                            ...webPointer,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Reset period
                        </Text>
                    </Pressable>

                    <Text
                        className="uppercase tracking-widest text-[10px] mt-4 mb-2"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Movement types
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                        <CompactChip
                            label="All types"
                            active={activeTypes.length === 0}
                            theme={theme}
                            onPress={onClearTypes}
                        />
                        {typeOptions.map((opt) => (
                            <CompactChip
                                key={opt.value}
                                label={opt.label}
                                tint={opt.tint}
                                active={activeTypes.includes(opt.value)}
                                theme={theme}
                                onPress={() => onToggleType(opt.value)}
                            />
                        ))}
                    </View>

                    <Pressable
                        onPress={onClose}
                        className="mt-5 py-3 rounded-full items-center justify-center"
                        style={{
                            backgroundColor: theme.primary,
                            ...webPointer,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            Apply
                        </Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Product details
 * ======================================================= */

function ProductDetailsCard({
    product,
    theme,
}: {
    product: PickerOption;
    theme: ThemeShape;
}) {
    const fields: Array<{
        label: string;
        value: string;
        mono?: boolean;
    }> = [
            { label: 'Manufacturer', value: product.manufacturer || '—' },
            {
                label: 'Pack units',
                value:
                    product.unitsPerPack != null
                        ? `${product.unitsPerPack} Qty`
                        : '—',
            },
            { label: 'Barcode', value: product.barcode || '—', mono: true },
            { label: 'Formula', value: product.formula || '—' },
            { label: 'Category', value: product.category || '—' },
            { label: 'Added', value: fmtDate(product.created) },
            {
                label: 'Status',
                value: product.isActive ? 'Active' : 'Inactive',
            },
            { label: 'Product ID', value: product.id || '—', mono: true },
        ];

    return (
        <View
            className="rounded-xl border p-4"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <Text
                className="uppercase tracking-widest text-[10px] mb-3"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                Product details
            </Text>

            <View className="flex-row flex-wrap gap-3">
                {fields.map((f) => (
                    <View
                        key={f.label}
                        className="min-w-[160px] flex-1"
                    >
                        <Text
                            className="uppercase tracking-widest text-[9px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {f.label}
                        </Text>
                        <Text
                            numberOfLines={1}
                            className="mt-0.5"
                            style={{
                                color: theme.text,
                                fontFamily: f.mono
                                    ? theme.font.mono
                                    : theme.font.medium,
                                fontSize: theme.fontSize.sm,
                            }}
                        >
                            {f.value}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

/* =========================================================
 * Small primitives
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
            className="px-2 py-0.5 rounded-md max-w-[200px]"
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

function MetaLine({
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
        <View className="flex-row items-center gap-1">
            <Text
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: mono
                        ? theme.font.mono
                        : theme.font.medium,
                    fontSize: theme.fontSize.xs,
                }}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}

function MiniStat({
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
        <View>
            <Text
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
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
 * Product picker
 * ======================================================= */

function ProductPicker({
    options,
    loading,
    onSelect,
    theme,
    isDarkMode,
}: {
    options: ProductOptionLike[];
    loading: boolean;
    onSelect: (opt: ProductOptionLike) => void;
    theme: ThemeShape;
    isDarkMode: boolean;
}) {
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const rowHoverBg = isDarkMode
        ? 'rgba(148,163,184,0.06)'
        : 'rgba(15,23,42,0.02)';

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

    const visible = filtered.slice(0, 200);
    const total = options.length;
    const truncated = filtered.length > visible.length;
    const hasActiveFilter = query.trim() !== '';

    if (loading && total === 0) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={theme.primary} />
            </View>
        );
    }

    return (
        <View className="p-5 flex-1 w-full">
            <View
                className="w-full self-center flex-1"
                style={{ maxWidth: TABLE_MAX_WIDTH }}
            >
                <View className="flex-row items-center gap-3">
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search name, barcode, category, manufacturer…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="h-11 rounded-xl border px-3.5 max-w-[480px] flex-1 text-sm"
                        style={{
                            borderColor,
                            backgroundColor: inputBg,
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            ...(isWeb
                                ? ({ outlineStyle: 'none' } as any)
                                : {}),
                        }}
                    />
                    {hasActiveFilter && (
                        <Pressable
                            onPress={() => setQuery('')}
                            className="px-3 py-2 rounded-lg border"
                            style={{ borderColor, ...webPointer }}
                        >
                            <Text
                                className="uppercase tracking-widest text-[10px]"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    )}
                </View>

                <Text
                    className="mt-2 text-[11px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                    }}
                >
                    {query
                        ? `${visible.length} of ${filtered.length} matches`
                        : `${total} products`}
                    {truncated ? ' — keep typing to narrow' : ''}
                </Text>

                <View
                    className="flex-row rounded-t-xl border border-b-0 px-4 py-2.5 mt-3"
                    style={{
                        backgroundColor: headerBg,
                        borderColor,
                    }}
                >
                    {PICKER_HEADERS.map((h) => (
                        <Text
                            key={h.key}
                            className="uppercase tracking-wider text-[10px]"
                            style={{
                                width: PICKER_COLS[h.key],
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                            numberOfLines={1}
                        >
                            {h.label}
                        </Text>
                    ))}
                </View>

                <View
                    className="rounded-b-xl border border-t-0 overflow-hidden flex-1"
                    style={{
                        borderColor,
                        backgroundColor: theme.panel,
                    }}
                >
                    <FlatList
                        data={visible}
                        keyExtractor={(raw, idx) => {
                            const o = readOption(raw);
                            return o.id || `opt-${idx}`;
                        }}
                        renderItem={({ item: raw }) => (
                            <PickerRow
                                option={readOption(raw)}
                                hoverBg={rowHoverBg}
                                onPress={() => onSelect(raw)}
                                theme={theme}
                            />
                        )}
                        ListEmptyComponent={
                            <View
                                className="p-10 items-center"
                                style={{ backgroundColor: theme.panel }}
                            >
                                <Text
                                    className="text-sm"
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                    }}
                                >
                                    {total === 0
                                        ? 'No products yet'
                                        : 'No matches'}
                                </Text>
                                <Text
                                    className="mt-2 text-[11px] text-center"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                    }}
                                >
                                    {total === 0
                                        ? 'The product catalog is still syncing.'
                                        : 'Try a different search term.'}
                                </Text>
                            </View>
                        }
                        contentContainerStyle={{ paddingBottom: 4 }}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            </View>
        </View>
    );
}

function PickerRow({
    option,
    hoverBg,
    onPress,
    theme,
}: {
    option: PickerOption;
    hoverBg: string;
    onPress: () => void;
    theme: ThemeShape;
}) {
    const { isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const [hovered, setHovered] = useState(false);

    return (
        <Pressable
            onPress={onPress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${option.title || 'product'}`}
            className="flex-row items-center px-4 py-2 border-t"
            style={{
                borderTopColor: borderColor,
                backgroundColor: hovered ? hoverBg : 'transparent',
                ...webPointer,
            }}
        >
            <View className="pr-2" style={{ width: PICKER_COLS.pic }}>
                <View
                    className="w-8 h-8 rounded-lg overflow-hidden border"
                    style={{ borderColor }}
                >
                    <Image
                        source={{ uri: option.imageUrl }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </View>
            </View>

            <Text
                className="text-[12px] pr-2"
                style={{
                    width: PICKER_COLS.name,
                    color: theme.primary,
                    fontFamily: theme.font.bold,
                }}
                numberOfLines={1}
            >
                {option.title || '—'}
            </Text>

            <Text
                className="text-[11px] pr-2"
                style={{
                    width: PICKER_COLS.formula,
                    color: option.formula
                        ? theme.text
                        : theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {option.formula || '—'}
            </Text>

            <Text
                className="text-[11px] pr-2"
                style={{
                    width: PICKER_COLS.pack,
                    color: theme.text,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {option.unitsPerPack != null
                    ? `${option.unitsPerPack} Qty`
                    : '—'}
            </Text>

            <Text
                className="text-[11px] pr-2"
                style={{
                    width: PICKER_COLS.manufacturer,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {option.manufacturer || '—'}
            </Text>

            <Text
                className="text-[10px] pr-2"
                style={{
                    width: PICKER_COLS.barcode,
                    color: theme.textDark,
                    fontFamily: theme.font.mono ?? theme.font.medium,
                }}
                numberOfLines={1}
            >
                {option.barcode || '—'}
            </Text>

            <Text
                className="text-[11px]"
                style={{
                    width: PICKER_COLS.created,
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
                numberOfLines={1}
            >
                {option.created ? fmtDate(option.created) : '—'}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Movement ledger
 * ======================================================= */

function MovementLedger({
    movements,
    openingBalance,
    theme,
}: {
    movements: MovementRow[];
    openingBalance: number;
    theme: ThemeShape;
}) {
    return (
        <View>
            <View
                className="flex-row rounded-xl border px-3 py-2.5"
                style={{
                    backgroundColor: theme.panel,
                    borderColor: theme.border,
                }}
            >
                <LedgerHeader label="Date" flex={2} theme={theme} />
                <LedgerHeader label="Type" flex={2} theme={theme} />
                <LedgerHeader label="Reference" flex={3} theme={theme} />
                <LedgerHeader
                    label="In"
                    flex={1.2}
                    theme={theme}
                    align="right"
                />
                <LedgerHeader
                    label="Out"
                    flex={1.2}
                    theme={theme}
                    align="right"
                />
                <LedgerHeader
                    label="Balance"
                    flex={1.4}
                    theme={theme}
                    align="right"
                />
            </View>

            <View
                className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
                style={{
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    borderStyle: 'dashed',
                }}
            >
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        flex: 2,
                        paddingRight: 8,
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                    }}
                >
                    Opening
                </Text>
                <View style={{ flex: 2 }} />
                <View style={{ flex: 3 }} />
                <Text
                    className="text-right"
                    style={{
                        flex: 1.2,
                        paddingRight: 8,
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    —
                </Text>
                <Text
                    className="text-right"
                    style={{
                        flex: 1.2,
                        paddingRight: 8,
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    —
                </Text>
                <Text
                    className="text-right"
                    style={{
                        flex: 1.4,
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.sm,
                    }}
                >
                    {num(openingBalance)}
                </Text>
            </View>

            {movements.map((m, i) => {
                const tint = TYPE_TINT[m.type] ?? theme.textDark;
                const isIn = m.direction === 'IN';
                return (
                    <View
                        key={i}
                        className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
                        style={{
                            backgroundColor: theme.panel,
                            borderColor: theme.border,
                        }}
                    >
                        <Text
                            className="text-[11px]"
                            style={{
                                flex: 2,
                                paddingRight: 8,
                                color: theme.text,
                                fontFamily: theme.font.mono,
                            }}
                            numberOfLines={1}
                        >
                            {fmtDatetime(m.datetime)}
                        </Text>

                        <View style={{ flex: 2, paddingRight: 8 }}>
                            <View
                                className="px-2 py-0.5 rounded-md self-start max-w-[140px]"
                                style={{
                                    backgroundColor: alpha(tint, 0.15),
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wider text-[9px]"
                                    style={{
                                        color: tint,
                                        fontFamily: theme.font.bold,
                                    }}
                                    numberOfLines={1}
                                >
                                    {typeLabel(m.type)}
                                </Text>
                            </View>
                        </View>

                        <View style={{ flex: 3, paddingRight: 8 }}>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: theme.fontSize.sm,
                                }}
                                numberOfLines={1}
                            >
                                {m.reference || '—'}
                            </Text>
                            {m.batch ? (
                                <Text
                                    className="text-[10px] opacity-75"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.mono,
                                    }}
                                    numberOfLines={1}
                                >
                                    batch {m.batch}
                                </Text>
                            ) : null}
                        </View>

                        <Text
                            className="text-right"
                            style={{
                                flex: 1.2,
                                paddingRight: 8,
                                color: isIn ? '#10b981' : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                opacity: isIn ? 1 : 0.4,
                            }}
                            numberOfLines={1}
                        >
                            {isIn ? `+${num(m.quantity)}` : '—'}
                        </Text>

                        <Text
                            className="text-right"
                            style={{
                                flex: 1.2,
                                paddingRight: 8,
                                color: !isIn ? '#f43f5e' : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                opacity: !isIn ? 1 : 0.4,
                            }}
                            numberOfLines={1}
                        >
                            {!isIn ? `−${num(m.quantity)}` : '—'}
                        </Text>

                        <Text
                            className="text-right"
                            style={{
                                flex: 1.4,
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                            }}
                            numberOfLines={1}
                        >
                            {num(m.balance_after)}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

function LedgerHeader({
    label,
    flex,
    theme,
    align,
}: {
    label: string;
    flex: number;
    theme: ThemeShape;
    align?: 'left' | 'right';
}) {
    return (
        <Text
            className={`uppercase tracking-widest text-[10px] ${align === 'right' ? 'text-right' : 'text-left'
                }`}
            style={{
                flex,
                color: theme.textDark,
                fontFamily: theme.font.bold,
            }}
        >
            {label}
        </Text>
    );
}

/* =========================================================
 * Daily movement — line + bar pair
 *
 * Side by side above 768px; stacked below. The bar chart keeps
 * the in/out pairs at fixed 5px width. The line chart plots the
 * running closing balance across the same window.
 * ======================================================= */

function DailyMovementCharts({
    rows,
    theme,
}: {
    rows: DailySummaryRow[];
    theme: ThemeShape;
}) {
    const { width } = useWindowDimensions();
    const sideBySide = width >= 768;

    return (
        <View
            className="rounded-xl border px-4 py-3 mb-3"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
            }}
        >
            <View
                style={{
                    flexDirection: sideBySide ? 'row' : 'column',
                    gap: 16,
                }}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <ChartHeader
                        title="In / out per day"
                        theme={theme}
                    />
                    <InOutBars rows={rows} theme={theme} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                    <ChartHeader
                        title="Closing balance"
                        theme={theme}
                    />
                    <BalanceLine rows={rows} theme={theme} />
                </View>
            </View>
        </View>
    );
}

function ChartHeader({
    title,
    theme,
}: {
    title: string;
    theme: ThemeShape;
}) {
    return (
        <Text
            className="uppercase tracking-widest text-[9px] mb-2"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
            }}
        >
            {title}
        </Text>
    );
}

function ChartLegend({
    color,
    label,
    theme,
}: {
    color: string;
    label: string;
    theme: ThemeShape;
}) {
    return (
        <View className="flex-row items-center gap-1">
            <View
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: color }}
            />
            <Text
                className="text-[10px]"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function InOutBars({
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
        <View className="flex-row items-end h-[88px] gap-1.5">
            {trimmed.map((r, i) => {
                const inH = (r.in / maxAbs) * 72;
                const outH = (r.out / maxAbs) * 72;
                return (
                    <View
                        key={i}
                        className="flex-row items-end gap-px h-full"
                    >
                        <View
                            className="w-[5px] rounded-t-sm"
                            style={{
                                height: Math.max(
                                    inH,
                                    r.in > 0 ? 2 : 0,
                                ),
                                backgroundColor: '#10b981',
                            }}
                        />
                        <View
                            className="w-[5px] rounded-t-sm"
                            style={{
                                height: Math.max(
                                    outH,
                                    r.out > 0 ? 2 : 0,
                                ),
                                backgroundColor: '#f43f5e',
                            }}
                        />
                    </View>
                );
            })}

            <View className="flex-1" />

            <View className="flex-row items-center gap-2.5 pb-0.5">
                <ChartLegend
                    color="#10b981"
                    label="In"
                    theme={theme}
                />
                <ChartLegend
                    color="#f43f5e"
                    label="Out"
                    theme={theme}
                />
                <Text
                    className="text-[10px] opacity-70"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                    }}
                >
                    {trimmed.length}d
                    {rows.length > trimmed.length
                        ? ` / ${rows.length}`
                        : ''}
                </Text>
            </View>
        </View>
    );
}

function BalanceLine({
    rows,
    theme,
}: {
    rows: DailySummaryRow[];
    theme: ThemeShape;
}) {
    const trimmed = rows.length > 30 ? rows.slice(-30) : rows;
    const values = trimmed.map((r) => Number(r.balance) || 0);

    if (values.length === 0) {
        return (
            <View className="h-[88px] items-center justify-center">
                <Text
                    className="text-[11px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                    }}
                >
                    No balance data
                </Text>
            </View>
        );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const CHART_HEIGHT = 72;
    const POINT_GAP = 24;
    const BOTTOM_PAD = 4;

    const points = values.map((v, i) => ({
        x: i * POINT_GAP,
        y:
            CHART_HEIGHT -
            ((v - min) / range) * CHART_HEIGHT +
            BOTTOM_PAD,
    }));

    const chartWidth =
        Math.max(0, points.length - 1) * POINT_GAP + 8;

    return (
        <View>
            <View className="h-[88px] relative overflow-hidden">
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: BOTTOM_PAD,
                        height: 1,
                        backgroundColor: theme.border,
                    }}
                />

                <View
                    style={{
                        width: chartWidth,
                        height: 88,
                        position: 'relative',
                    }}
                >
                    {points.slice(0, -1).map((p, i) => {
                        const q = points[i + 1];
                        const dx = q.x - p.x;
                        const dy = q.y - p.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const angle =
                            (Math.atan2(dy, dx) * 180) / Math.PI;

                        return (
                            <View
                                key={`seg-${i}`}
                                style={{
                                    position: 'absolute',
                                    left: p.x + 4,
                                    top: p.y,
                                    width: len,
                                    height: 2,
                                    backgroundColor: theme.primary,
                                    transformOrigin:
                                        'left center' as any,
                                    transform: [
                                        { rotate: `${angle}deg` },
                                    ],
                                    borderRadius: 1,
                                }}
                            />
                        );
                    })}

                    {points.map((p, i) => (
                        <View
                            key={`dot-${i}`}
                            style={{
                                position: 'absolute',
                                left: p.x,
                                top: p.y - 3,
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: theme.background,
                                borderWidth: 1.5,
                                borderColor: theme.primary,
                            }}
                        />
                    ))}
                </View>
            </View>

            <View className="flex-row items-center mt-2">
                <Text
                    className="text-[9px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                    }}
                >
                    min {min}
                </Text>
                <View className="flex-1" />
                <Text
                    className="text-[9px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                    }}
                >
                    max {max}
                </Text>
                <View style={{ width: 10 }} />
                <ChartLegend
                    color={theme.primary}
                    label="Balance"
                    theme={theme}
                />
            </View>
        </View>
    );
}

/* =========================================================
 * Shared
 * ======================================================= */

function CompactChip({
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
            className="rounded-full border px-2 py-[3px] items-center justify-center"
            style={{
                borderColor: active ? color : theme.border,
                backgroundColor: active
                    ? alpha(color, 0.15)
                    : 'transparent',
                ...webPointer,
            }}
        >
            <Text
                className="uppercase tracking-widest text-[9px]"
                style={{
                    color: active ? color : theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

function KpiCard({
    label,
    value,
    subtitle,
    success,
    warning,
    theme,
}: {
    label: string;
    value: string;
    subtitle?: string;
    success?: boolean;
    warning?: boolean;
    theme: ThemeShape;
}) {
    const color = warning
        ? '#f43f5e'
        : success
            ? '#10b981'
            : theme.text;
    return (
        <View
            className="rounded-xl border px-4 py-3 min-w-[170px] flex-1"
            style={{
                borderColor: theme.border,
                backgroundColor: theme.panel,
            }}
        >
            <Text
                className="uppercase tracking-widest text-[9px] mb-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.lg,
                }}
            >
                {value}
            </Text>
            {subtitle ? (
                <Text
                    className="mt-0.5 text-[10px]"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                    }}
                >
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
}

function Section({
    title,
    children,
    theme,
}: {
    title: string;
    children: React.ReactNode;
    theme: ThemeShape;
}) {
    return (
        <View>
            <Text
                className="uppercase tracking-widest text-[10px] mb-2.5 ml-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                }}
            >
                {title}
            </Text>
            <View>{children}</View>
        </View>
    );
}

interface ColSpec {
    label: string;
    flex: number;
    right?: boolean;
    align?: 'left' | 'right';
}

function SimpleTable({
    headers,
    rows,
    theme,
}: {
    headers: ColSpec[];
    rows: (string | number)[][];
    theme: ThemeShape;
}) {
    if (!rows.length) {
        return (
            <Text
                className="text-[12px] p-2"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                }}
            >
                No data
            </Text>
        );
    }

    return (
        <View>
            <View
                className="flex-row rounded-xl border px-3 py-2.5"
                style={{
                    backgroundColor: theme.panel,
                    borderColor: theme.border,
                }}
            >
                {headers.map((h) => {
                    const align =
                        h.right || h.align === 'right'
                            ? 'right'
                            : 'left';
                    return (
                        <Text
                            key={h.label}
                            className={`uppercase tracking-widest text-[10px] ${align === 'right'
                                    ? 'text-right'
                                    : 'text-left'
                                }`}
                            style={{
                                flex: h.flex,
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {h.label}
                        </Text>
                    );
                })}
            </View>

            {rows.map((row, i) => (
                <View
                    key={i}
                    className="flex-row items-center rounded-xl border px-3 py-3 mt-2"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                >
                    {row.map((cell, j) => {
                        const col = headers[j];
                        const align =
                            col.right || col.align === 'right'
                                ? 'right'
                                : 'left';
                        const numeric = isNumericCell(cell);
                        return (
                            <Text
                                key={j}
                                numberOfLines={2}
                                className={
                                    align === 'right'
                                        ? 'text-right'
                                        : 'text-left'
                                }
                                style={{
                                    flex: col.flex,
                                    paddingRight: 8,
                                    color: theme.text,
                                    fontFamily: numeric
                                        ? theme.font.mono
                                        : theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {String(cell)}
                            </Text>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}