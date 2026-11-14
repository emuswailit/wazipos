// components/retailers/reports/stock/StockReportMobileView.tsx

import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import type { StockCategoryRow, StockProductRow } from './StockReport';
import type { StockViewProps } from './StockReportWebView';
import { buildStockHtml, buildStockSheets } from './stockExport';

/* =========================================================
 * Formatting
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

const DEAD_DAY_OPTIONS = [30, 60, 90, 180];

/* =========================================================
 * Component
 * ======================================================= */

export function StockReportMobileView({
    report,
    loading,
    error,
    search,
    onSearchChange,
    deadOnly,
    onDeadOnlyToggle,
    deadDays,
    onDeadDaysChange,
    onRefresh,
}: StockViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [filtersOpen, setFiltersOpen] = useState(false);

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
                            Stock
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
                            {deadOnly ? 'Dead only' : `${deadDays}d`}
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
                            filename: `stock_${report!.period.as_of}.xlsx`,
                            sheets: buildStockSheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `stock_${report!.period.as_of}.pdf`,
                            html: buildStockHtml(report!),
                        })}
                    />
                </View>

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
                            onPress={onDeadOnlyToggle}
                            className="px-3 min-h-[32px] rounded-full border items-center justify-center self-start mb-2"
                            style={{
                                borderColor: deadOnly
                                    ? theme.primary
                                    : theme.textDark + '33',
                                backgroundColor: deadOnly
                                    ? `${theme.primary}15`
                                    : 'transparent',
                            }}
                        >
                            <Text
                                style={{
                                    color: deadOnly
                                        ? theme.primary
                                        : theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                }}
                            >
                                Dead stock only
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
                            Dead after
                        </Text>
                        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                            {DEAD_DAY_OPTIONS.map((d) => {
                                const active = deadDays === d;
                                return (
                                    <Pressable
                                        key={d}
                                        onPress={() => onDeadDaysChange(d)}
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
                    {/* Hero — retail value */}
                    <View
                        className="rounded-3xl px-5 py-5"
                        style={{
                            backgroundColor: alpha(theme.primary, 0.10),
                            borderWidth: 1,
                            borderColor: alpha(theme.primary, 0.35),
                        }}
                    >
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                            }}
                        >
                            Retail value on hand
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
                            {money(report.kpi.retail_value)}
                        </Text>
                        <View
                            className="flex-row items-center mt-2"
                            style={{ gap: 14 }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 12,
                                }}
                            >
                                Cost {money(report.kpi.cost_value)}
                            </Text>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 12,
                                }}
                            >
                                {num(report.kpi.sku_count)} SKUs
                            </Text>
                        </View>
                    </View>

                    {/* Alerts */}
                    {report.kpi.dead_sku_count > 0 ? (
                        <View
                            className="rounded-2xl px-4 py-3"
                            style={{
                                backgroundColor: alpha('#f43f5e', 0.10),
                                borderWidth: 1,
                                borderColor: alpha('#f43f5e', 0.30),
                            }}
                        >
                            <Text
                                style={{
                                    color: '#f43f5e',
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.8,
                                    textTransform: 'uppercase',
                                }}
                            >
                                Dead stock
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 12,
                                }}
                            >
                                {num(report.kpi.dead_sku_count)} SKUs with no
                                sales in {report.period.dead_days}d
                            </Text>
                        </View>
                    ) : null}

                    {report.kpi.already_expired > 0 ? (
                        <View
                            className="rounded-2xl px-4 py-3"
                            style={{
                                backgroundColor: alpha('#dc2626', 0.10),
                                borderWidth: 1,
                                borderColor: alpha('#dc2626', 0.30),
                            }}
                        >
                            <Text
                                style={{
                                    color: '#dc2626',
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    letterSpacing: 0.8,
                                    textTransform: 'uppercase',
                                }}
                            >
                                Already expired
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 12,
                                }}
                            >
                                {num(report.kpi.already_expired)} SKUs hold
                                expired stock
                            </Text>
                        </View>
                    ) : null}

                    {/* Category rollup */}
                    <Card
                        title="By category"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.category_rollup.map((c: StockCategoryRow) => (
                            <View
                                key={c.category_id ?? 'uncat'}
                                className="rounded-lg px-3 py-2.5 mb-1.5"
                                style={{ backgroundColor: subBg }}
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
                                        numberOfLines={1}
                                    >
                                        {c.category}
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        {money(c.retail_value)}
                                    </Text>
                                </View>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.regular,
                                        fontSize: 11,
                                    }}
                                >
                                    {num(c.sku_count)} SKUs · {num(c.units)}{' '}
                                    units · margin {c.margin_percent}%
                                </Text>
                            </View>
                        ))}
                    </Card>

                    {/* Products */}
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
                                No products match.
                            </Text>
                        ) : (
                            report.products.map((p: StockProductRow) => {
                                const tint = p.is_dead
                                    ? '#f43f5e'
                                    : p.days_to_expiry !== null &&
                                        p.days_to_expiry < 0
                                        ? '#dc2626'
                                        : undefined;
                                return (
                                    <View
                                        key={p.product_id}
                                        className="rounded-2xl px-3.5 py-3 mb-2"
                                        style={{
                                            backgroundColor: subBg,
                                            borderLeftWidth: tint ? 3 : 0,
                                            borderLeftColor:
                                                tint ?? 'transparent',
                                        }}
                                    >
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
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 14,
                                                        lineHeight: 18,
                                                    }}
                                                    numberOfLines={2}
                                                >
                                                    {p.product_title}
                                                </Text>
                                                <Text
                                                    className="mt-0.5"
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.regular,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {p.category}
                                                </Text>
                                            </View>
                                            <View className="items-end">
                                                <Text
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    {money(p.retail_value)}
                                                </Text>
                                                <Text
                                                    className="mt-0.5"
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.mono,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    ×{num(p.units)}
                                                </Text>
                                            </View>
                                        </View>

                                        <View
                                            className="flex-row items-center justify-between mt-2.5 pt-2.5"
                                            style={{
                                                borderTopWidth: 1,
                                                borderTopColor:
                                                    theme.textDark + '22',
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize: 11,
                                                }}
                                            >
                                                Margin {p.margin_percent}% ·{' '}
                                                {num(p.receipt_count)}{' '}
                                                {p.receipt_count === 1
                                                    ? 'batch'
                                                    : 'batches'}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize: 11,
                                                }}
                                            >
                                                {p.days_since_sale === null
                                                    ? 'never sold'
                                                    : `${p.days_since_sale}d since sale`}
                                            </Text>
                                        </View>

                                        {p.days_to_expiry !== null ? (
                                            <Text
                                                className="mt-1"
                                                style={{
                                                    color:
                                                        p.days_to_expiry < 0
                                                            ? '#dc2626'
                                                            : p.days_to_expiry <=
                                                                30
                                                                ? '#ea580c'
                                                                : theme.textDark,
                                                    fontFamily:
                                                        theme.font.regular,
                                                    fontSize: 11,
                                                }}
                                            >
                                                Nearest expiry in{' '}
                                                {p.days_to_expiry < 0
                                                    ? `${Math.abs(p.days_to_expiry)}d overdue`
                                                    : `${p.days_to_expiry}d`}
                                            </Text>
                                        ) : null}
                                    </View>
                                );
                            })
                        )}
                    </Card>
                </ScrollView>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

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