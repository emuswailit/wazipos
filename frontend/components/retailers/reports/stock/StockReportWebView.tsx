// components/retailers/reports/stock/StockReportWebView.tsx

import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import type {
    StockCategoryRow,
    StockProductRow,
    StockReportData,
} from './StockReport';
import { buildStockHtml, buildStockSheets } from './stockExport';

export interface StockViewProps {
    report: StockReportData | null;
    loading: boolean;
    error: string | null;
    search: string;
    onSearchChange: (s: string) => void;
    deadOnly: boolean;
    onDeadOnlyToggle: () => void;
    deadDays: number;
    onDeadDaysChange: (d: number) => void;
    onRefresh: () => void;
}

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

const DEAD_DAY_OPTIONS = [30, 60, 90, 180];

/* =========================================================
 * Component
 * ======================================================= */

export function StockReportWebView({
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
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

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
                            Stock report
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
                                filename: `stock_${report!.period.as_of}.xlsx`,
                                sheets: buildStockSheets(report!),
                            })}
                            getPdf={() => ({
                                filename: `stock_${report!.period.as_of}.pdf`,
                                html: buildStockHtml(report!),
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
                            minWidth: 260,
                            maxWidth: 340,
                        }}
                    />

                    <Pressable
                        onPress={onDeadOnlyToggle}
                        accessibilityRole="button"
                        accessibilityState={{ selected: deadOnly }}
                        className="px-3 h-[38px] rounded-lg border items-center justify-center"
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
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: deadOnly
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Dead stock only
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
                            Dead after
                        </Text>
                        {DEAD_DAY_OPTIONS.map((d) => {
                            const active = deadDays === d;
                            return (
                                <Pressable
                                    key={d}
                                    onPress={() => onDeadDaysChange(d)}
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
                    {/* KPI strip */}
                    <View className="flex-row flex-wrap gap-3">
                        <KpiCard
                            label="SKUs"
                            value={num(report.kpi.sku_count)}
                            subtitle={`${num(report.kpi.batch_count)} batches`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Units on hand"
                            value={num(report.kpi.total_units)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Cost value"
                            value={money(report.kpi.cost_value)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Retail value"
                            value={money(report.kpi.retail_value)}
                            theme={theme}
                            borderColor={borderColor}
                            accent
                        />
                        <KpiCard
                            label="Potential margin"
                            value={money(report.kpi.potential_margin)}
                            subtitle={`${report.kpi.margin_percent}%`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Dead SKUs"
                            value={num(report.kpi.dead_sku_count)}
                            subtitle={`${deadDays}d+ no sales`}
                            theme={theme}
                            borderColor={borderColor}
                            warning={report.kpi.dead_sku_count > 0}
                        />
                        <KpiCard
                            label="Expiring ≤30d"
                            value={num(report.kpi.expiring_within_30)}
                            theme={theme}
                            borderColor={borderColor}
                            warning={report.kpi.expiring_within_30 > 0}
                        />
                    </View>

                    {/* Category rollup */}
                    <Section
                        title="By category"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <SimpleTable
                            headers={[
                                { label: 'Category', flex: 4, align: 'left' },
                                { label: 'SKUs', flex: 1, right: true },
                                { label: 'Units', flex: 1.2, right: true },
                                {
                                    label: 'Cost value',
                                    flex: 2,
                                    right: true,
                                },
                                {
                                    label: 'Retail value',
                                    flex: 2,
                                    right: true,
                                },
                                { label: 'Margin', flex: 2, right: true },
                            ]}
                            rows={report.category_rollup.map(
                                (c: StockCategoryRow) => [
                                    c.category,
                                    num(c.sku_count),
                                    num(c.units),
                                    money(c.cost_value),
                                    money(c.retail_value),
                                    `${money(c.margin)} (${c.margin_percent}%)`,
                                ],
                            )}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </Section>

                    {/* Products */}
                    <Section
                        title={`Products (${report.products.length})`}
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
                                    label: 'Category',
                                    flex: 2,
                                    align: 'left',
                                },
                                { label: 'Units', flex: 1, right: true },
                                { label: 'Batches', flex: 1, right: true },
                                {
                                    label: 'Cost value',
                                    flex: 2,
                                    right: true,
                                },
                                {
                                    label: 'Retail value',
                                    flex: 2,
                                    right: true,
                                },
                                { label: 'Margin', flex: 2, right: true },
                                {
                                    label: 'Nearest expiry',
                                    flex: 2,
                                    align: 'left',
                                },
                                {
                                    label: 'Last sale',
                                    flex: 1.6,
                                    align: 'left',
                                },
                            ]}
                            rows={report.products.map(
                                (p: StockProductRow) => [
                                    p.cost_basis_missing
                                        ? `${p.product_title} ⚠`
                                        : p.product_title,
                                    p.category,
                                    num(p.units),
                                    num(p.receipt_count),
                                    money(p.cost_value),
                                    money(p.retail_value),
                                    `${money(p.margin)} (${p.margin_percent}%)`,
                                    p.days_to_expiry === null
                                        ? '—'
                                        : p.days_to_expiry < 0
                                            ? `${Math.abs(p.days_to_expiry)}d overdue`
                                            : `${p.days_to_expiry}d`,
                                    p.days_since_sale === null
                                        ? 'never'
                                        : `${p.days_since_sale}d ago`,
                                ],
                            )}
                            theme={theme}
                            borderColor={borderColor}
                            rowTints={report.products.map((p) =>
                                p.is_dead
                                    ? '#f43f5e'
                                    : p.days_to_expiry !== null &&
                                        p.days_to_expiry < 0
                                        ? '#dc2626'
                                        : undefined,
                            )}
                        />
                    </Section>
                </ScrollView>
            ) : null}
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
    warning,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    accent?: boolean;
    warning?: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    const color = warning
        ? '#ea580c'
        : accent
            ? theme.primary
            : theme.text;
    return (
        <View
            className="rounded-xl border px-4 py-3"
            style={{
                borderColor,
                minWidth: 170,
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
}: {
    headers: Col[];
    rows: (string | number)[][];
    rowTints?: (string | undefined)[];
    theme: ThemeShape;
    borderColor: string;
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

            {rows.map((row, i) => {
                const tint = rowTints?.[i];
                return (
                    <View
                        key={i}
                        className="flex-row py-2 px-2"
                        style={{
                            borderBottomColor: borderColor + '55',
                            borderBottomWidth: 1,
                            borderLeftWidth: tint ? 3 : 0,
                            borderLeftColor: tint ?? 'transparent',
                        }}
                    >
                        {row.map((cell, j) => {
                            const col = headers[j];
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
            })}
        </View>
    );
}