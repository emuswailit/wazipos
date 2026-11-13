// components/retailers/reports/lowStock/LowStockReportMobileView.tsx

import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import type {
    LowStockOffer,
    LowStockProductRow,
    LowStockUrgency,
    LowStockWholesalerGroup,
} from './LowStockReport';
import type { LowStockViewProps } from './LowStockReportWebView';
import { buildLowStockHtml, buildLowStockSheets } from './lowStockExport';

/* =========================================================
 * Formatting + metadata
 * ======================================================= */

function money(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function num(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-KE');
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

const URGENCY_COLORS: Record<LowStockUrgency, string> = {
    OUT: '#dc2626',
    CRITICAL: '#ea580c',
    WARNING: '#f59e0b',
    SOON: '#0ea5e9',
};

const URGENCY_LABELS: Record<LowStockUrgency, string> = {
    OUT: 'Out',
    CRITICAL: 'Critical',
    WARNING: 'Warning',
    SOON: 'Low',
};

const COVER_DAY_OPTIONS = [14, 30, 45, 90];

/* =========================================================
 * Component
 * ======================================================= */

export function LowStockReportMobileView({
    report,
    loading,
    error,
    coverDays,
    onCoverDaysChange,
    onlyDanger,
    onOnlyDangerToggle,
    search,
    onSearchChange,
    onRefresh,
}: LowStockViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [filtersOpen, setFiltersOpen] = useState(false);
    const [tab, setTab] = useState<'products' | 'orders'>('products');
    const [detailProduct, setDetailProduct] =
        useState<LowStockProductRow | null>(null);

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="px-4 pt-3 pb-2 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-center justify-between">
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 20,
                            }}
                            numberOfLines={1}
                        >
                            Low stock
                        </Text>
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: 12,
                            }}
                            numberOfLines={1}
                        >
                            {report?.entity.title ?? '—'} · as of{' '}
                            {report?.period.as_of ?? '—'}
                        </Text>
                    </View>

                    <Pressable
                        onPress={onRefresh}
                        accessibilityRole="button"
                        className="px-3.5 h-[36px] rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            style={{
                                color: '#fff',
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                            }}
                        >
                            {loading ? '...' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>

                {/* Filter toggle + exports */}
                <View className="flex-row items-center mt-2" style={{ gap: 8 }}>
                    <Pressable
                        onPress={() => setFiltersOpen((v) => !v)}
                        accessibilityRole="button"
                        className="flex-row items-center px-3 min-h-[30px] rounded-full border"
                        style={{
                            borderColor: filtersOpen
                                ? theme.primary
                                : theme.textDark + '33',
                            backgroundColor: filtersOpen
                                ? `${theme.primary}15`
                                : 'transparent',
                            gap: 6,
                        }}
                    >
                        <Text
                            style={{
                                color: filtersOpen
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 0.6,
                                textTransform: 'uppercase',
                            }}
                        >
                            {onlyDanger ? 'Danger only' : `${coverDays}d cover`}
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
                            filename: `low_stock_${report!.period.as_of}.xlsx`,
                            sheets: buildLowStockSheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `low_stock_${report!.period.as_of}.pdf`,
                            html: buildLowStockHtml(report!),
                        })}
                    />
                </View>

                {/* Filter panel */}
                {filtersOpen ? (
                    <View className="mt-3">
                        <TextInput
                            value={search}
                            onChangeText={onSearchChange}
                            placeholder="Search product or category…"
                            placeholderTextColor="#94a3b8"
                            autoCorrect={false}
                            autoCapitalize="none"
                            className="rounded-lg border px-3 mb-2"
                            style={{
                                borderColor,
                                backgroundColor: theme.background,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: 13,
                                height: 38,
                            }}
                        />

                        <Pressable
                            onPress={onOnlyDangerToggle}
                            className="px-3 min-h-[32px] rounded-full border items-center justify-center self-start mb-2"
                            style={{
                                borderColor: onlyDanger
                                    ? theme.primary
                                    : theme.textDark + '33',
                                backgroundColor: onlyDanger
                                    ? `${theme.primary}15`
                                    : 'transparent',
                            }}
                        >
                            <Text
                                style={{
                                    color: onlyDanger
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                }}
                            >
                                Danger only
                            </Text>
                        </Pressable>

                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                letterSpacing: 0.6,
                                textTransform: 'uppercase',
                                marginBottom: 6,
                            }}
                        >
                            Cover target
                        </Text>
                        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                            {COVER_DAY_OPTIONS.map((d) => {
                                const active = coverDays === d;
                                return (
                                    <Pressable
                                        key={d}
                                        onPress={() => onCoverDaysChange(d)}
                                        className="px-3 min-h-[30px] rounded-full border items-center justify-center"
                                        style={{
                                            borderColor: active
                                                ? theme.primary
                                                : theme.textDark + '33',
                                            backgroundColor: active
                                                ? `${theme.primary}15`
                                                : 'transparent',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: active
                                                    ? theme.primary
                                                    : theme.textDark,
                                                fontFamily: theme.font.bold,
                                                fontSize: 10,
                                                letterSpacing: 0.6,
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            {d}d
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                ) : null}

                {/* Tabs */}
                <View className="flex-row mt-2" style={{ gap: 6 }}>
                    <TabButton
                        label="Products"
                        active={tab === 'products'}
                        theme={theme}
                        onPress={() => setTab('products')}
                    />
                    <TabButton
                        label={`Orders (${report?.wholesaler_groups.length ?? 0
                            })`}
                        active={tab === 'orders'}
                        theme={theme}
                        onPress={() => setTab('orders')}
                    />
                </View>
            </View>

            {/* ============ Body ============ */}
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
                            fontSize: 15,
                        }}
                    >
                        Could not load report
                    </Text>
                    <Text
                        className="mt-1 text-center"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </Text>
                    <Pressable
                        onPress={onRefresh}
                        className="mt-4 px-5 min-h-[42px] rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            style={{
                                color: '#fff',
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
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
                        gap: 16,
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
                    {/* ---- Hero ---- */}
                    <View
                        className="rounded-3xl px-5 py-5"
                        style={{
                            backgroundColor: alpha('#ea580c', 0.10),
                            borderWidth: 1,
                            borderColor: alpha('#ea580c', 0.35),
                        }}
                    >
                        <Text
                            style={{
                                color: '#ea580c',
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                            }}
                        >
                            Products to reorder
                        </Text>
                        <Text
                            className="mt-1"
                            style={{
                                color: '#ea580c',
                                fontFamily: theme.font.bold,
                                fontSize: 34,
                                letterSpacing: -1,
                            }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {num(report.kpi.reorder_count)}
                        </Text>
                        <Text
                            className="mt-2"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 12,
                            }}
                        >
                            Est. cost{' '}
                            {money(report.kpi.estimated_total_cost)} ·{' '}
                            {num(report.kpi.estimated_total_units)} units
                        </Text>

                        {parseFloat(
                            report.kpi.estimated_savings_on_orders,
                        ) > 0 ? (
                            <View
                                className="rounded-2xl px-3 py-2 mt-3 flex-row items-center justify-between"
                                style={{
                                    backgroundColor: '#10b98120',
                                    gap: 10,
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                        letterSpacing: 0.8,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Savings available
                                </Text>
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily: theme.font.bold,
                                        fontSize: 16,
                                        letterSpacing: -0.3,
                                    }}
                                >
                                    {money(
                                        report.kpi.estimated_savings_on_orders,
                                    )}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* ---- Urgency chips ---- */}
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        {report.urgency_rollup.map((u) => (
                            <View
                                key={u.key}
                                className="rounded-xl px-3 py-2.5"
                                style={{
                                    backgroundColor: alpha(
                                        URGENCY_COLORS[u.key],
                                        0.10,
                                    ),
                                    borderWidth: 1,
                                    borderColor: alpha(
                                        URGENCY_COLORS[u.key],
                                        0.35,
                                    ),
                                    minWidth: '47%',
                                    flex: 1,
                                }}
                            >
                                <Text
                                    style={{
                                        color: URGENCY_COLORS[u.key],
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                        letterSpacing: 0.6,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {u.label}
                                </Text>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: URGENCY_COLORS[u.key],
                                        fontFamily: theme.font.bold,
                                        fontSize: 20,
                                    }}
                                >
                                    {num(u.count)}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* ---- Tab content ---- */}
                    {tab === 'products' ? (
                        <Card
                            title={`Products (${report.products.length})`}
                            theme={theme}
                            borderColor={borderColor}
                        >
                            {report.products.length === 0 ? (
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.regular,
                                        fontSize: 13,
                                        paddingVertical: 8,
                                    }}
                                >
                                    Nothing needs reordering. Good.
                                </Text>
                            ) : (
                                report.products.map(
                                    (p: LowStockProductRow) => (
                                        <ProductCard
                                            key={p.product_id}
                                            product={p}
                                            theme={theme}
                                            subBg={subBg}
                                            onPress={() =>
                                                setDetailProduct(p)
                                            }
                                        />
                                    ),
                                )
                            )}
                        </Card>
                    ) : (
                        <>
                            {report.wholesaler_groups.length === 0 ? (
                                <Card
                                    title="Suggested orders"
                                    theme={theme}
                                    borderColor={borderColor}
                                >
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.regular,
                                            fontSize: 13,
                                            paddingVertical: 8,
                                        }}
                                    >
                                        No orders to suggest.
                                    </Text>
                                </Card>
                            ) : (
                                report.wholesaler_groups.map(
                                    (g: LowStockWholesalerGroup) => (
                                        <WholesalerCard
                                            key={
                                                g.wholesaler_id ?? 'unassigned'
                                            }
                                            group={g}
                                            theme={theme}
                                            subBg={subBg}
                                            borderColor={borderColor}
                                        />
                                    ),
                                )
                            )}
                        </>
                    )}
                </ScrollView>
            ) : null}

            {/* ============ Offer detail sheet ============ */}
            <OfferDetailSheet
                visible={detailProduct !== null}
                product={detailProduct}
                onClose={() => setDetailProduct(null)}
                theme={theme}
                borderColor={borderColor}
                subBg={subBg}
            />
        </View>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

function TabButton({
    label,
    active,
    theme,
    onPress,
}: {
    label: string;
    active: boolean;
    theme: ThemeShape;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="px-3 min-h-[30px] rounded-full border items-center justify-center"
            style={{
                borderColor: active ? theme.primary : theme.textDark + '33',
                backgroundColor: active
                    ? `${theme.primary}15`
                    : 'transparent',
            }}
        >
            <Text
                style={{
                    color: active ? theme.primary : theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/* ---------- Card shell ---------- */

function Card({
    title,
    children,
    theme,
    borderColor,
}: {
    title: string;
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-3xl border overflow-hidden"
            style={{ borderColor, backgroundColor: theme.panel }}
        >
            <View className="px-5 pt-4 pb-2">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                    }}
                >
                    {title}
                </Text>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                {children}
            </View>
        </View>
    );
}

/* ---------- Product card ---------- */

function ProductCard({
    product,
    theme,
    subBg,
    onPress,
}: {
    product: LowStockProductRow;
    theme: ThemeShape;
    subBg: string;
    onPress: () => void;
}) {
    const urgency = URGENCY_COLORS[product.urgency];
    const best = product.best_offer;
    const savings = parseFloat(product.best_offer_savings_on_suggested);

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            className="rounded-2xl px-3.5 py-3 mb-2"
            style={{
                backgroundColor: subBg,
                borderLeftWidth: 3,
                borderLeftColor: urgency,
            }}
        >
            {/* Top row: product + urgency badge */}
            <View className="flex-row items-start justify-between">
                <View
                    style={{
                        flex: 1,
                        minWidth: 0,
                        paddingRight: 8,
                    }}
                >
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                            lineHeight: 18,
                        }}
                        numberOfLines={2}
                    >
                        {product.product_title}
                    </Text>
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                        }}
                    >
                        {product.category}
                    </Text>
                </View>

                <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: alpha(urgency, 0.15) }}
                >
                    <Text
                        style={{
                            color: urgency,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                        }}
                    >
                        {URGENCY_LABELS[product.urgency]}
                    </Text>
                </View>
            </View>

            {/* Stock line */}
            <View
                className="flex-row items-center justify-between mt-2.5 pt-2.5"
                style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.textDark + '22',
                }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                        fontSize: 11,
                    }}
                >
                    Stock {num(product.current_stock)} · cover{' '}
                    {product.days_of_cover === null
                        ? '—'
                        : `${product.days_of_cover.toFixed(0)}d`}
                </Text>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                    }}
                >
                    Order {num(product.suggested_quantity)}
                </Text>
            </View>

            {/* Best offer row */}
            {best ? (
                <View
                    className="rounded-xl px-3 py-2 mt-2 flex-row items-center justify-between"
                    style={{
                        backgroundColor: best.has_discount
                            ? '#10b98115'
                            : alpha(theme.primary, 0.08),
                        gap: 8,
                    }}
                >
                    <View
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                            <Text
                                numberOfLines={1}
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.medium,
                                    fontSize: 12,
                                    flexShrink: 1,
                                }}
                            >
                                {best.wholesaler_title}
                            </Text>
                            {best.has_discount ? (
                                <View
                                    className="px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: '#10b98125' }}
                                >
                                    <Text
                                        style={{
                                            color: '#10b981',
                                            fontFamily: theme.font.bold,
                                            fontSize: 8,
                                            letterSpacing: 0.4,
                                        }}
                                    >
                                        DISC
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: 11,
                            }}
                        >
                            {money(best.effective_unit_price)}/unit
                            {product.wholesale_offer_count > 1
                                ? ` · +${product.wholesale_offer_count - 1} more`
                                : ''}
                        </Text>
                    </View>
                    {savings > 0 ? (
                        <Text
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 12,
                            }}
                        >
                            save {money(product.best_offer_savings_on_suggested)}
                        </Text>
                    ) : (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                            }}
                        >
                            view offers
                        </Text>
                    )}
                </View>
            ) : (
                <View
                    className="rounded-xl px-3 py-2 mt-2 items-center"
                    style={{ backgroundColor: subBg }}
                >
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            opacity: 0.75,
                        }}
                    >
                        No wholesale offers available
                    </Text>
                </View>
            )}
        </Pressable>
    );
}

/* ---------- Wholesaler card ---------- */

function WholesalerCard({
    group,
    theme,
    subBg,
    borderColor,
}: {
    group: LowStockWholesalerGroup;
    theme: ThemeShape;
    subBg: string;
    borderColor: string;
}) {
    const savings = parseFloat(group.total_savings);

    return (
        <Card
            title={group.wholesaler_title}
            theme={theme}
            borderColor={borderColor}
        >
            {/* Group summary */}
            <View
                className="rounded-xl px-3 py-2.5 mb-3 flex-row items-center flex-wrap"
                style={{ backgroundColor: subBg, gap: 8 }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                        fontSize: 11,
                    }}
                >
                    {num(group.line_count)} lines ·{' '}
                    {num(group.total_units)} units ·{' '}
                    {money(group.total_cost)}
                </Text>
                {savings > 0 ? (
                    <View
                        className="px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#10b98120' }}
                    >
                        <Text
                            style={{
                                color: '#10b981',
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            save {money(group.total_savings)}
                        </Text>
                    </View>
                ) : null}
            </View>

            {/* Lines */}
            {group.products.map((p) => (
                <View
                    key={p.product_id}
                    className="rounded-lg px-3 py-2.5 mb-1.5"
                    style={{
                        backgroundColor: subBg,
                        borderLeftWidth: 3,
                        borderLeftColor: URGENCY_COLORS[p.urgency],
                    }}
                >
                    <View className="flex-row items-center justify-between">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 13,
                                flex: 1,
                                paddingRight: 8,
                            }}
                            numberOfLines={2}
                        >
                            {p.product_title}
                        </Text>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 13,
                            }}
                        >
                            ×{num(p.suggested_quantity)}
                        </Text>
                    </View>
                    <View
                        className="flex-row items-center justify-between mt-1"
                    >
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: 11,
                            }}
                        >
                            Stock {num(p.current_stock)} · {money(p.line_cost)}
                        </Text>
                        {parseFloat(p.savings_on_line) > 0 ? (
                            <Text
                                style={{
                                    color: '#10b981',
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                }}
                            >
                                save {money(p.savings_on_line)}
                            </Text>
                        ) : null}
                    </View>
                </View>
            ))}
        </Card>
    );
}

/* ---------- Offer detail sheet ---------- */

function OfferDetailSheet({
    visible,
    product,
    onClose,
    theme,
    borderColor,
    subBg,
}: {
    visible: boolean;
    product: LowStockProductRow | null;
    onClose: () => void;
    theme: ThemeShape;
    borderColor: string;
    subBg: string;
}) {
    if (!product) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <Pressable
                    className="flex-1"
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                />

                <View
                    className="rounded-t-3xl overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        maxHeight: '88%',
                    }}
                >
                    {/* Drag handle */}
                    <View className="items-center pt-2">
                        <View
                            className="w-10 h-1 rounded-full"
                            style={{ backgroundColor: theme.textDark + '55' }}
                        />
                    </View>

                    {/* Header */}
                    <View
                        className="px-5 pt-3 pb-3 border-b flex-row items-start justify-between"
                        style={{ borderBottomColor: borderColor }}
                    >
                        <View
                            className="flex-1 min-w-0 pr-3"
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: 16,
                                    lineHeight: 20,
                                }}
                                numberOfLines={2}
                            >
                                {product.product_title}
                            </Text>
                            <Text
                                className="mt-1"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 12,
                                }}
                            >
                                Order {num(product.suggested_quantity)} · stock{' '}
                                {num(product.current_stock)} · cover{' '}
                                {product.days_of_cover === null
                                    ? '—'
                                    : `${product.days_of_cover.toFixed(0)}d`}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                            className="w-8 h-8 rounded-full items-center justify-center"
                            style={{ backgroundColor: theme.background }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: 14,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{
                            padding: 16,
                            paddingBottom: 32,
                            gap: 10,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        {product.wholesale_offers.length === 0 ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 13,
                                    paddingVertical: 20,
                                    textAlign: 'center',
                                }}
                            >
                                No wholesale offers available for this
                                product right now.
                            </Text>
                        ) : (
                            product.wholesale_offers.map(
                                (o: LowStockOffer, i: number) => (
                                    <MobileOfferCard
                                        key={o.receipt_id}
                                        offer={o}
                                        isBest={i === 0}
                                        theme={theme}
                                        subBg={subBg}
                                        borderColor={borderColor}
                                    />
                                ),
                            )
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function MobileOfferCard({
    offer,
    isBest,
    theme,
    subBg,
    borderColor,
}: {
    offer: LowStockOffer;
    isBest: boolean;
    theme: ThemeShape;
    subBg: string;
    borderColor: string;
}) {
    const savings = parseFloat(offer.savings_on_suggested);
    const expiryExpired =
        offer.days_to_expiry !== null && offer.days_to_expiry < 0;
    const expiryWarning =
        offer.days_to_expiry !== null &&
        offer.days_to_expiry >= 0 &&
        offer.days_to_expiry <= 30;

    return (
        <View
            className="rounded-2xl border px-3.5 py-3"
            style={{
                borderColor: isBest ? theme.primary + '55' : borderColor,
                backgroundColor: isBest
                    ? alpha(theme.primary, 0.06)
                    : subBg,
            }}
        >
            {/* Header row */}
            <View className="flex-row items-start justify-between">
                <View
                    style={{ flex: 1, minWidth: 0, paddingRight: 8 }}
                >
                    <View
                        className="flex-row items-center flex-wrap"
                        style={{ gap: 6 }}
                    >
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: 14,
                            }}
                            numberOfLines={1}
                        >
                            {offer.wholesaler_title}
                        </Text>
                        {isBest ? (
                            <View
                                className="px-1.5 py-0.5 rounded"
                                style={{
                                    backgroundColor: `${theme.primary}20`,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.4,
                                    }}
                                >
                                    BEST
                                </Text>
                            </View>
                        ) : null}
                        {offer.has_discount ? (
                            <View
                                className="px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: '#10b98120' }}
                            >
                                <Text
                                    style={{
                                        color: '#10b981',
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.4,
                                    }}
                                >
                                    DISCOUNT
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
                <View className="items-end">
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 15,
                        }}
                    >
                        {money(offer.effective_unit_price)}
                    </Text>
                    {offer.has_discount ? (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: 11,
                                textDecorationLine: 'line-through',
                                opacity: 0.7,
                            }}
                        >
                            {money(offer.unit_price)}
                        </Text>
                    ) : (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.mono,
                                fontSize: 11,
                            }}
                        >
                            /unit
                        </Text>
                    )}
                </View>
            </View>

            {/* Details grid */}
            <View
                className="flex-row flex-wrap mt-3 pt-3"
                style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.textDark + '22',
                    gap: 16,
                }}
            >
                <MobileDetail
                    label="Available"
                    value={`${num(offer.available_units)} units`}
                    theme={theme}
                />
                <MobileDetail
                    label="Pack"
                    value={num(offer.pack_size)}
                    theme={theme}
                />
                {offer.batch ? (
                    <MobileDetail
                        label="Batch"
                        value={offer.batch}
                        theme={theme}
                    />
                ) : null}
                {offer.days_to_expiry !== null ? (
                    <MobileDetail
                        label="Expiry"
                        value={
                            expiryExpired
                                ? `${Math.abs(offer.days_to_expiry)}d overdue`
                                : `${offer.days_to_expiry}d`
                        }
                        theme={theme}
                        danger={expiryExpired}
                        warning={expiryWarning && !expiryExpired}
                    />
                ) : null}
                <MobileDetail
                    label="Coverage"
                    value={offer.covers_suggested ? 'Full order' : 'Partial'}
                    theme={theme}
                    success={offer.covers_suggested}
                />
            </View>

            {/* Discount lines */}
            {offer.price_discount ? (
                <Text
                    className="mt-2.5"
                    style={{
                        color: '#10b981',
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    {offer.price_discount.title || 'Price discount'} ·{' '}
                    {offer.price_discount.percent}% off
                </Text>
            ) : null}

            {offer.quantity_discount ? (
                <Text
                    className="mt-1"
                    style={{
                        color: theme.primary,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    {offer.quantity_discount.title || 'Bonus'} · buy{' '}
                    {num(offer.quantity_discount.limit_quantity)} get{' '}
                    {num(offer.quantity_discount.awarded_quantity)} free
                </Text>
            ) : null}

            {/* Savings footer */}
            {savings > 0 ? (
                <View
                    className="rounded-xl px-3 py-2 mt-2.5 flex-row items-center justify-between"
                    style={{ backgroundColor: '#10b98120', gap: 8 }}
                >
                    <Text
                        style={{
                            color: '#10b981',
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                        }}
                    >
                        Savings on this order
                    </Text>
                    <Text
                        style={{
                            color: '#10b981',
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        {money(offer.savings_on_suggested)}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function MobileDetail({
    label,
    value,
    theme,
    danger,
    warning,
    success,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    danger?: boolean;
    warning?: boolean;
    success?: boolean;
}) {
    const color = danger
        ? '#dc2626'
        : warning
            ? '#ea580c'
            : success
                ? '#10b981'
                : theme.text;
    return (
        <View style={{ minWidth: 70 }}>
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                style={{
                    color,
                    fontFamily: theme.font.medium,
                    fontSize: 12,
                }}
            >
                {value}
            </Text>
        </View>
    );
}