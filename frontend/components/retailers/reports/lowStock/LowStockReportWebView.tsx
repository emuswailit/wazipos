// components/retailers/reports/lowStock/LowStockReportWebView.tsx

import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import type {
    LowStockCategoryRow,
    LowStockOffer,
    LowStockProductRow,
    LowStockReportData,
    LowStockUrgency,
    LowStockUrgencyRow,
    LowStockWholesalerGroup,
} from './LowStockReport';
import { buildLowStockHtml, buildLowStockSheets } from './lowStockExport';

export interface LowStockViewProps {
    report: LowStockReportData | null;
    loading: boolean;
    error: string | null;
    coverDays: number;
    onCoverDaysChange: (d: number) => void;
    onlyDanger: boolean;
    onOnlyDangerToggle: () => void;
    search: string;
    onSearchChange: (s: string) => void;
    onRefresh: () => void;
}

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

const URGENCY_COLORS: Record<LowStockUrgency, string> = {
    OUT: '#dc2626',
    CRITICAL: '#ea580c',
    WARNING: '#f59e0b',
    SOON: '#0ea5e9',
};

const COVER_DAY_OPTIONS = [14, 30, 45, 90];

/* =========================================================
 * Component
 * ======================================================= */

export function LowStockReportWebView({
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
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [detailProduct, setDetailProduct] =
        useState<LowStockProductRow | null>(null);

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="px-6 py-4 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-center justify-between gap-4 flex-wrap">
                    <View style={{ flex: 1, minWidth: 200 }}>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                            numberOfLines={1}
                        >
                            Low stock &amp; reorder
                        </Text>
                        <Text
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                            }}
                            numberOfLines={1}
                        >
                            {report?.entity.title ?? '—'} · as of{' '}
                            {report?.period.as_of ?? '—'}
                        </Text>
                    </View>

                    <View
                        className="flex-row items-center gap-2"
                        style={{ flexShrink: 0 }}
                    >
                        <ExportButtons
                            enabled={!!report}
                            variant="primary"
                            height={38}
                            getExcel={() => ({
                                filename: `low_stock_${report!.period.as_of}.xlsx`,
                                sheets: buildLowStockSheets(report!),
                            })}
                            getPdf={() => ({
                                filename: `low_stock_${report!.period.as_of}.pdf`,
                                html: buildLowStockHtml(report!),
                            })}
                        />

                        <Pressable
                            onPress={onRefresh}
                            accessibilityRole="button"
                            className="px-5 h-[38px] rounded-lg items-center justify-center"
                            style={{ backgroundColor: theme.primary }}
                        >
                            <Text
                                className="uppercase tracking-widest text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                }}
                            >
                                {loading ? '...' : 'Refresh'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ============ Filter bar ============ */}
            <View
                className="px-6 py-3 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View
                    className="flex-row items-center flex-wrap"
                    style={{ gap: 10 }}
                >
                    <TextInput
                        value={search}
                        onChangeText={onSearchChange}
                        placeholder="Search product or category…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        className="rounded-lg border px-3 text-sm"
                        style={{
                            borderColor,
                            backgroundColor: inputBg,
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            height: 38,
                            minWidth: 240,
                            maxWidth: 320,
                        }}
                    />

                    <Pressable
                        onPress={onOnlyDangerToggle}
                        accessibilityRole="button"
                        accessibilityState={{ selected: onlyDanger }}
                        className="px-3 h-[38px] rounded-lg border items-center justify-center"
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
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: onlyDanger
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Danger only
                        </Text>
                    </Pressable>

                    <View className="flex-row items-center" style={{ gap: 6 }}>
                        <Text
                            className="uppercase tracking-widest mr-1"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Cover target
                        </Text>
                        {COVER_DAY_OPTIONS.map((d) => {
                            const active = coverDays === d;
                            return (
                                <Pressable
                                    key={d}
                                    onPress={() => onCoverDaysChange(d)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    className="px-2.5 min-h-[30px] rounded-full border items-center justify-center"
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
                                        className="uppercase tracking-widest text-[10px]"
                                        style={{
                                            color: active
                                                ? theme.primary
                                                : theme.textDark,
                                            fontFamily: theme.font.bold,
                                        }}
                                    >
                                        {d}d
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
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
                            fontSize: theme.fontSize.base,
                        }}
                    >
                        Could not load report
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
                        className="mt-4 px-5 h-10 rounded-lg items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 11,
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
                        padding: 24,
                        paddingBottom: 40,
                        gap: 20,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ---- KPI strip ---- */}
                    <View className="flex-row flex-wrap gap-3">
                        <KpiCard
                            label="Products to reorder"
                            value={num(report.kpi.reorder_count)}
                            theme={theme}
                            borderColor={borderColor}
                            accent
                        />
                        <KpiCard
                            label="Out of stock"
                            value={num(report.kpi.out_of_stock_count)}
                            theme={theme}
                            borderColor={borderColor}
                            danger={report.kpi.out_of_stock_count > 0}
                        />
                        <KpiCard
                            label="Critical"
                            value={num(report.kpi.critical_count)}
                            theme={theme}
                            borderColor={borderColor}
                            warning={report.kpi.critical_count > 0}
                        />
                        <KpiCard
                            label="Estimated cost"
                            value={money(report.kpi.estimated_total_cost)}
                            subtitle={`${num(report.kpi.estimated_total_units)} units`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Products with offers"
                            value={num(report.kpi.products_with_offers)}
                            subtitle={`${num(
                                report.kpi.products_with_discounted_offers,
                            )} with active discounts`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Savings available"
                            value={money(
                                report.kpi.estimated_savings_on_orders,
                            )}
                            subtitle={`${num(
                                report.kpi.products_with_cheaper_offer,
                            )} products cheaper elsewhere`}
                            theme={theme}
                            borderColor={borderColor}
                            success={
                                parseFloat(
                                    report.kpi.estimated_savings_on_orders,
                                ) > 0
                            }
                        />
                    </View>

                    {/* ---- Urgency rollup ---- */}
                    <Section
                        title="By urgency"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <View className="flex-row flex-wrap gap-3">
                            {report.urgency_rollup.map(
                                (u: LowStockUrgencyRow) => (
                                    <View
                                        key={u.key}
                                        className="rounded-lg border px-3 py-2.5"
                                        style={{
                                            borderColor:
                                                URGENCY_COLORS[u.key] + '55',
                                            backgroundColor:
                                                URGENCY_COLORS[u.key] + '12',
                                            minWidth: 150,
                                            flex: 1,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-widest"
                                            style={{
                                                color: URGENCY_COLORS[u.key],
                                                fontFamily: theme.font.bold,
                                                fontSize: 9,
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
                                        <Text
                                            className="mt-0.5"
                                            style={{
                                                color: theme.textDark,
                                                fontFamily: theme.font.mono,
                                                fontSize: 10,
                                            }}
                                        >
                                            {money(u.estimated_cost)}
                                        </Text>
                                    </View>
                                ),
                            )}
                        </View>
                    </Section>

                    {/* ---- Category rollup ---- */}
                    {report.category_rollup.length > 0 ? (
                        <Section
                            title="By category"
                            theme={theme}
                            borderColor={borderColor}
                        >
                            <SimpleTable
                                headers={[
                                    {
                                        label: 'Category',
                                        flex: 4,
                                        align: 'left',
                                    },
                                    {
                                        label: 'Products',
                                        flex: 1.4,
                                        right: true,
                                    },
                                    {
                                        label: 'Units',
                                        flex: 1.4,
                                        right: true,
                                    },
                                    {
                                        label: 'Est. cost',
                                        flex: 2,
                                        right: true,
                                    },
                                ]}
                                rows={report.category_rollup.map(
                                    (c: LowStockCategoryRow) => [
                                        c.category,
                                        num(c.count),
                                        num(c.total_units),
                                        money(c.total_cost),
                                    ],
                                )}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>
                    ) : null}

                    {/* ---- Suggested orders by wholesaler ---- */}
                    {report.wholesaler_groups.length > 0 ? (
                        <Section
                            title="Suggested orders by wholesaler"
                            theme={theme}
                            borderColor={borderColor}
                        >
                            <View style={{ gap: 14 }}>
                                {report.wholesaler_groups.map(
                                    (g: LowStockWholesalerGroup) => (
                                        <View
                                            key={g.wholesaler_id ?? 'unassigned'}
                                            className="rounded-lg border"
                                            style={{
                                                borderColor:
                                                    theme.textDark + '22',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <View
                                                className="flex-row items-center justify-between px-4 py-2.5 flex-wrap"
                                                style={{
                                                    backgroundColor:
                                                        theme.background,
                                                    gap: 8,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {g.wholesaler_title}
                                                </Text>
                                                <View className="flex-row items-center flex-wrap" style={{ gap: 10 }}>
                                                    <Text
                                                        style={{
                                                            color:
                                                                theme.textDark,
                                                            fontFamily:
                                                                theme.font.mono,
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        {num(g.line_count)} lines ·{' '}
                                                        {num(g.total_units)} units ·{' '}
                                                        {money(g.total_cost)}
                                                    </Text>
                                                    {parseFloat(g.total_savings) > 0 ? (
                                                        <View
                                                            className="px-2 py-0.5 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    '#10b98120',
                                                            }}
                                                        >
                                                            <Text
                                                                style={{
                                                                    color: '#10b981',
                                                                    fontFamily:
                                                                        theme.font.bold,
                                                                    fontSize: 10,
                                                                }}
                                                            >
                                                                save {money(g.total_savings)}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            </View>
                                            <View style={{ padding: 8 }}>
                                                <SimpleTable
                                                    headers={[
                                                        {
                                                            label: 'Product',
                                                            flex: 4,
                                                            align: 'left',
                                                        },
                                                        {
                                                            label: 'Stock',
                                                            flex: 1,
                                                            right: true,
                                                        },
                                                        {
                                                            label: 'Order',
                                                            flex: 1,
                                                            right: true,
                                                        },
                                                        {
                                                            label: 'Unit cost',
                                                            flex: 1.4,
                                                            right: true,
                                                        },
                                                        {
                                                            label: 'Line cost',
                                                            flex: 1.6,
                                                            right: true,
                                                        },
                                                        {
                                                            label: 'Savings',
                                                            flex: 1.6,
                                                            right: true,
                                                        },
                                                    ]}
                                                    rows={g.products.map(
                                                        (p) => [
                                                            p.product_title,
                                                            num(
                                                                p.current_stock,
                                                            ),
                                                            num(
                                                                p.suggested_quantity,
                                                            ),
                                                            money(p.unit_cost),
                                                            money(p.line_cost),
                                                            parseFloat(
                                                                p.savings_on_line,
                                                            ) > 0
                                                                ? money(
                                                                    p.savings_on_line,
                                                                )
                                                                : '—',
                                                        ],
                                                    )}
                                                    theme={theme}
                                                    borderColor={borderColor}
                                                    rowTints={g.products.map(
                                                        (p) =>
                                                            URGENCY_COLORS[
                                                            p.urgency
                                                            ],
                                                    )}
                                                />
                                            </View>
                                        </View>
                                    ),
                                )}
                            </View>
                        </Section>
                    ) : null}

                    {/* ---- Full product table ---- */}
                    <Section
                        title={`All products (${report.products.length})`}
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <SimpleTable
                            headers={[
                                {
                                    label: 'Product',
                                    flex: 4,
                                    align: 'left',
                                },
                                {
                                    label: 'Stock',
                                    flex: 1,
                                    right: true,
                                },
                                {
                                    label: 'Target',
                                    flex: 1,
                                    right: true,
                                },
                                {
                                    label: 'Order',
                                    flex: 1,
                                    right: true,
                                },
                                {
                                    label: 'Cover',
                                    flex: 1.2,
                                    right: true,
                                },
                                {
                                    label: 'Cost',
                                    flex: 2,
                                    right: true,
                                },
                                {
                                    label: 'Best offer',
                                    flex: 3,
                                    align: 'left',
                                },
                            ]}
                            rows={report.products.map(
                                (p: LowStockProductRow) => [
                                    p.product_title,
                                    num(p.current_stock),
                                    num(p.target_stock),
                                    num(p.suggested_quantity),
                                    p.days_of_cover === null
                                        ? '—'
                                        : `${p.days_of_cover.toFixed(0)}d`,
                                    money(p.line_cost),
                                    '', // rendered as custom cell below
                                ],
                            )}
                            theme={theme}
                            borderColor={borderColor}
                            rowTints={report.products.map(
                                (p) => URGENCY_COLORS[p.urgency],
                            )}
                            onRowPress={(i) =>
                                setDetailProduct(report.products[i])
                            }
                            cellRenderer={(i, j) => {
                                if (j !== 6) return null;
                                const p = report.products[i];
                                return (
                                    <BestOfferCell
                                        product={p}
                                        theme={theme}
                                    />
                                );
                            }}
                        />
                    </Section>
                </ScrollView>
            ) : null}

            {/* ============ Offer detail modal ============ */}
            <OfferDetailModal
                visible={detailProduct !== null}
                product={detailProduct}
                onClose={() => setDetailProduct(null)}
                theme={theme}
                borderColor={borderColor}
            />
        </View>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

function KpiCard({
    label,
    value,
    subtitle,
    accent,
    danger,
    warning,
    success,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    accent?: boolean;
    danger?: boolean;
    warning?: boolean;
    success?: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    const color = danger
        ? '#dc2626'
        : warning
            ? '#ea580c'
            : success
                ? '#10b981'
                : accent
                    ? theme.primary
                    : theme.text;
    return (
        <View
            className="rounded-xl border px-4 py-3"
            style={{
                borderColor,
                minWidth: 180,
                flex: 1,
                backgroundColor: theme.panel,
            }}
        >
            <Text
                className="uppercase tracking-widest mb-1"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 18,
                }}
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
    borderColor,
}: {
    title: string;
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-xl border"
            style={{
                borderColor,
                backgroundColor: theme.panel,
                overflow: 'hidden',
            }}
        >
            <View
                className="px-4 py-2.5 border-b"
                style={{ borderBottomColor: borderColor }}
            >
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {title}
                </Text>
            </View>
            <View style={{ padding: 12 }}>{children}</View>
        </View>
    );
}

function BestOfferCell({
    product,
    theme,
}: {
    product: LowStockProductRow;
    theme: ThemeShape;
}) {
    const best = product.best_offer;

    if (!best) {
        return (
            <View className="flex-row items-center" style={{ gap: 6 }}>
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: 11,
                        opacity: 0.7,
                    }}
                >
                    No offers
                </Text>
            </View>
        );
    }

    const savings = parseFloat(best.savings_on_suggested);

    return (
        <View style={{ gap: 2 }}>
            <View className="flex-row items-center" style={{ gap: 6 }}>
                <Text
                    numberOfLines={1}
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                        flex: 1,
                    }}
                >
                    {best.wholesaler_title}
                </Text>
                {best.has_discount ? (
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
            <View className="flex-row items-center" style={{ gap: 8 }}>
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.mono,
                        fontSize: 11,
                    }}
                >
                    {money(best.effective_unit_price)}/unit
                </Text>
                {savings > 0 ? (
                    <Text
                        style={{
                            color: '#10b981',
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                        }}
                    >
                        save {money(best.savings_on_suggested)}
                    </Text>
                ) : null}
                {product.wholesale_offer_count > 1 ? (
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        +{product.wholesale_offer_count - 1}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

/* =========================================================
 * Offer detail modal
 * ======================================================= */

function OfferDetailModal({
    visible,
    product,
    onClose,
    theme,
    borderColor,
}: {
    visible: boolean;
    product: LowStockProductRow | null;
    onClose: () => void;
    theme: ThemeShape;
    borderColor: string;
}) {
    if (!product) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <View
                    className="rounded-2xl overflow-hidden w-full"
                    style={{
                        backgroundColor: theme.panel,
                        maxWidth: 760,
                        maxHeight: '85%',
                    }}
                >
                    {/* Header */}
                    <View
                        className="px-5 py-3.5 border-b flex-row items-center justify-between"
                        style={{ borderBottomColor: borderColor }}
                    >
                        <View className="flex-1 min-w-0 pr-3">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {product.product_title}
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Order {num(product.suggested_quantity)} units ·
                                current stock {num(product.current_stock)}
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
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 16, gap: 10 }}
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
                                    <OfferRow
                                        key={o.receipt_id}
                                        offer={o}
                                        isBest={i === 0}
                                        theme={theme}
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

function OfferRow({
    offer,
    isBest,
    theme,
    borderColor,
}: {
    offer: LowStockOffer;
    isBest: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    const savings = parseFloat(offer.savings_on_suggested);
    const expiryWarning =
        offer.days_to_expiry !== null && offer.days_to_expiry >= 0 &&
        offer.days_to_expiry <= 30;
    const expiryExpired =
        offer.days_to_expiry !== null && offer.days_to_expiry < 0;

    return (
        <View
            className="rounded-xl border px-4 py-3"
            style={{
                borderColor: isBest ? theme.primary + '55' : borderColor,
                backgroundColor: isBest
                    ? `${theme.primary}08`
                    : 'transparent',
            }}
        >
            {/* Top row: wholesaler + best badge */}
            <View className="flex-row items-center justify-between flex-wrap" style={{ gap: 8 }}>
                <View className="flex-row items-center" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 13,
                        }}
                        numberOfLines={1}
                    >
                        {offer.wholesaler_title}
                    </Text>
                    {isBest ? (
                        <View
                            className="px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${theme.primary}20` }}
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
                {savings > 0 ? (
                    <Text
                        style={{
                            color: '#10b981',
                            fontFamily: theme.font.bold,
                            fontSize: 12,
                        }}
                    >
                        save {money(offer.savings_on_suggested)}
                    </Text>
                ) : null}
            </View>

            {/* Details grid */}
            <View
                className="flex-row flex-wrap mt-2.5"
                style={{ gap: 14 }}
            >
                <Detail
                    label="Price"
                    value={`${money(offer.effective_unit_price)}`}
                    theme={theme}
                    strike={
                        offer.has_discount
                            ? money(offer.unit_price)
                            : undefined
                    }
                />
                <Detail
                    label="Available"
                    value={`${num(offer.available_units)} units`}
                    theme={theme}
                />
                <Detail
                    label="Pack"
                    value={`${num(offer.pack_size)}`}
                    theme={theme}
                />
                {offer.batch ? (
                    <Detail
                        label="Batch"
                        value={offer.batch}
                        theme={theme}
                    />
                ) : null}
                {offer.days_to_expiry !== null ? (
                    <Detail
                        label="Expiry"
                        value={
                            expiryExpired
                                ? `${Math.abs(
                                    offer.days_to_expiry,
                                )}d overdue`
                                : `${offer.days_to_expiry}d`
                        }
                        theme={theme}
                        danger={expiryExpired}
                        warning={expiryWarning && !expiryExpired}
                    />
                ) : null}
                <Detail
                    label="Cover"
                    value={
                        offer.covers_suggested ? 'Full order' : 'Partial'
                    }
                    theme={theme}
                    success={offer.covers_suggested}
                />
            </View>

            {/* Discount detail lines */}
            {offer.price_discount ? (
                <View className="mt-2">
                    <Text
                        style={{
                            color: '#10b981',
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        {offer.price_discount.title || 'Price discount'} ·{' '}
                        {offer.price_discount.percent}% off ·{' '}
                        {money(offer.price_discount.normal_price)} →{' '}
                        {money(offer.price_discount.offer_price)}
                    </Text>
                </View>
            ) : null}

            {offer.quantity_discount ? (
                <View className="mt-1">
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        {offer.quantity_discount.title || 'Bonus'} · buy{' '}
                        {num(offer.quantity_discount.limit_quantity)} get{' '}
                        {num(offer.quantity_discount.awarded_quantity)} free
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function Detail({
    label,
    value,
    theme,
    strike,
    danger,
    warning,
    success,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    strike?: string;
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
        <View style={{ minWidth: 80 }}>
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
            <View className="flex-row items-center" style={{ gap: 6 }}>
                <Text
                    style={{
                        color,
                        fontFamily: theme.font.medium,
                        fontSize: 12,
                    }}
                >
                    {value}
                </Text>
                {strike ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            textDecorationLine: 'line-through',
                            opacity: 0.6,
                        }}
                    >
                        {strike}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

/* =========================================================
 * SimpleTable
 *
 * Same shape as the other reports, extended with:
 *   - onRowPress: makes each row pressable
 *   - cellRenderer: allows a specific cell to render custom JSX
 * ======================================================= */

interface Col {
    label: string;
    flex: number;
    right?: boolean;
    align?: 'left' | 'right';
}

function SimpleTable({
    headers,
    rows,
    rowTints,
    theme,
    borderColor,
    onRowPress,
    cellRenderer,
}: {
    headers: Col[];
    rows: (string | number)[][];
    rowTints?: (string | undefined)[];
    theme: ThemeShape;
    borderColor: string;
    onRowPress?: (rowIndex: number) => void;
    cellRenderer?: (rowIndex: number, colIndex: number) => React.ReactNode;
}) {
    if (!rows.length) {
        return (
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                    fontSize: 12,
                    padding: 8,
                }}
            >
                No data
            </Text>
        );
    }

    return (
        <View>
            {/* Header row */}
            <View
                className="flex-row py-2 px-2"
                style={{
                    borderBottomColor: borderColor,
                    borderBottomWidth: 1,
                }}
            >
                {headers.map((h) => (
                    <View
                        key={h.label}
                        style={{
                            flex: h.flex,
                            alignItems:
                                h.right || h.align === 'right'
                                    ? 'flex-end'
                                    : 'flex-start',
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
                            {h.label}
                        </Text>
                    </View>
                ))}
            </View>

            {/* Data rows */}
            {rows.map((row, i) => {
                const tint = rowTints?.[i];
                const rowContent = (
                    <View
                        className="flex-row py-2 px-2 items-center"
                        style={{
                            borderBottomColor: borderColor + '55',
                            borderBottomWidth: 1,
                            borderLeftWidth: tint ? 3 : 0,
                            borderLeftColor: tint ?? 'transparent',
                        }}
                    >
                        {row.map((cell, j) => {
                            const col = headers[j];
                            const custom = cellRenderer?.(i, j);
                            if (custom) {
                                return (
                                    <View
                                        key={j}
                                        style={{
                                            flex: col.flex,
                                            paddingRight: 4,
                                        }}
                                    >
                                        {custom}
                                    </View>
                                );
                            }
                            const isMoney =
                                typeof cell === 'string' &&
                                cell.includes('.');
                            return (
                                <View
                                    key={j}
                                    style={{
                                        flex: col.flex,
                                        alignItems:
                                            col.right ||
                                                col.align === 'right'
                                                ? 'flex-end'
                                                : 'flex-start',
                                        paddingRight: 4,
                                    }}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: theme.text,
                                            fontFamily: isMoney
                                                ? theme.font.mono
                                                : theme.font.medium,
                                            fontSize: 12,
                                            textAlign:
                                                col.right ||
                                                    col.align === 'right'
                                                    ? 'right'
                                                    : 'left',
                                        }}
                                    >
                                        {String(cell)}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                );

                if (onRowPress) {
                    return (
                        <Pressable
                            key={i}
                            onPress={() => onRowPress(i)}
                            accessibilityRole="button"
                        >
                            {rowContent}
                        </Pressable>
                    );
                }
                return <View key={i}>{rowContent}</View>;
            })}
        </View>
    );
}