// components/retailers/reports/profitAndLoss/ProfitAndLossReportWebView.tsx

import { DateField } from '@/components/common/DateField';
import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import type {
    PeriodPreset,
    PlExpenseCategory,
    ProfitAndLossData,
} from './ProfitAndLossReport';
import {
    buildProfitAndLossHtml,
    buildProfitAndLossSheets,
} from './profitAndLossExport';

export interface ProfitAndLossViewProps {
    report: ProfitAndLossData | null;
    loading: boolean;
    error: string | null;
    from: string;
    onFromChange: (v: string) => void;
    to: string;
    onToChange: (v: string) => void;
    preset: PeriodPreset;
    onPresetChange: (p: PeriodPreset) => void;
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

function fmtPeriod(from: string, to: string, days: number): string {
    const a = new Date(from).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    const b = new Date(to).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    if (from === to || days <= 1) return a;
    return `${a} – ${b}  (${days}d)`;
}

const PRESETS: Array<{ label: string; value: PeriodPreset }> = [
    { label: 'This month', value: 'THIS_MONTH' },
    { label: 'Last month', value: 'LAST_MONTH' },
    { label: 'This year', value: 'THIS_YEAR' },
    { label: 'Custom', value: 'CUSTOM' },
];

/* =========================================================
 * Component
 * ======================================================= */

export function ProfitAndLossReportWebView({
    report,
    loading,
    error,
    from,
    onFromChange,
    to,
    onToChange,
    preset,
    onPresetChange,
    onRefresh,
}: ProfitAndLossViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const netProfit = report ? parseFloat(report.net_profit) : 0;
    const isProfit = netProfit >= 0;

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
                            Profit & loss
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
                            {report?.entity.title ?? '—'} ·{' '}
                            {report
                                ? fmtPeriod(
                                    report.period.from,
                                    report.period.to,
                                    report.period.days,
                                )
                                : '—'}
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
                                filename: `profit_and_loss_${report!.period.from}_to_${report!.period.to}.xlsx`,
                                sheets: buildProfitAndLossSheets(report!),
                            })}
                            getPdf={() => ({
                                filename: `profit_and_loss_${report!.period.from}_to_${report!.period.to}.pdf`,
                                html: buildProfitAndLossHtml(report!),
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
                    className="flex-row items-end flex-wrap"
                    style={{ gap: 10 }}
                >
                    <View style={{ gap: 6 }}>
                        <Text
                            className="uppercase tracking-widest"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                marginBottom: 4,
                            }}
                        >
                            Period
                        </Text>
                        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                            {PRESETS.map((p) => {
                                const active = preset === p.value;
                                return (
                                    <Pressable
                                        key={p.value}
                                        onPress={() => onPresetChange(p.value)}
                                        accessibilityRole="button"
                                        accessibilityState={{
                                            selected: active,
                                        }}
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
                                            className="uppercase tracking-widest text-[10px]"
                                            style={{
                                                color: active
                                                    ? theme.primary
                                                    : theme.textDark,
                                                fontFamily: theme.font.bold,
                                            }}
                                        >
                                            {p.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    <View style={{ width: 180 }}>
                        <DateField
                            label="From"
                            value={from}
                            onChangeText={onFromChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>

                    <View style={{ width: 180 }}>
                        <DateField
                            label="To"
                            value={to}
                            onChangeText={onToChange}
                            placeholder="YYYY-MM-DD"
                        />
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
                    {/* ---- Headline KPIs ---- */}
                    <View className="flex-row flex-wrap gap-3">
                        <KpiCard
                            label="Net revenue"
                            value={money(report.revenue.net_revenue)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Gross profit"
                            value={money(report.gross_profit)}
                            subtitle={`${report.gross_margin_percent}%`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Net profit"
                            value={money(report.net_profit)}
                            subtitle={`${report.net_margin_percent}%`}
                            theme={theme}
                            borderColor={borderColor}
                            accent={isProfit}
                            danger={!isProfit}
                        />
                        <KpiCard
                            label="Orders"
                            value={num(report.revenue.orders_count)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>

                    {/* ---- Trading account ---- */}
                    <Section
                        title="Trading account"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {/* Revenue */}
                        <Line
                            label="Gross sales"
                            value={money(report.revenue.gross_sales)}
                            theme={theme}
                            indent={0}
                            bold
                        />
                        <Line
                            label="Less: discounts"
                            value={`(${money(report.revenue.discounts)})`}
                            theme={theme}
                            indent={1}
                            muted
                        />
                        <Line
                            label="Less: sales returns"
                            value={`(${money(report.revenue.returns_value)})`}
                            theme={theme}
                            indent={1}
                            muted
                        />
                        <Line
                            label="Less: tax collected"
                            value={`(${money(report.revenue.tax_collected)})`}
                            theme={theme}
                            indent={1}
                            muted
                        />
                        <SubtotalLine
                            label="Net revenue"
                            value={money(report.revenue.net_revenue)}
                            theme={theme}
                        />

                        {/* COGS */}
                        <Spacer />
                        <Line
                            label="Cost of goods sold"
                            value={money(report.cogs.sold_cost)}
                            theme={theme}
                            indent={0}
                        />
                        <Line
                            label="Less: cost of returned goods"
                            value={`(${money(report.cogs.returned_cost)})`}
                            theme={theme}
                            indent={1}
                            muted
                        />
                        {report.cogs.expense_categories.map((c) => (
                            <Line
                                key={c.category_id ?? c.category}
                                label={c.category}
                                value={money(c.amount)}
                                theme={theme}
                                indent={1}
                                muted
                            />
                        ))}
                        <SubtotalLine
                            label="Total cost of sales"
                            value={money(report.cogs.total)}
                            theme={theme}
                        />

                        <Spacer />

                        {/* Gross profit */}
                        <TotalLine
                            label="Gross profit"
                            value={money(report.gross_profit)}
                            margin={report.gross_margin_percent}
                            theme={theme}
                        />
                    </Section>

                    {/* ---- Operating expenses ---- */}
                    <Section
                        title="Operating expenses"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.operating_expenses.categories.length === 0 ? (
                            <Line
                                label="No operating expenses in period"
                                value=""
                                theme={theme}
                                indent={1}
                                muted
                            />
                        ) : (
                            report.operating_expenses.categories.map(
                                (c: PlExpenseCategory) => (
                                    <Line
                                        key={c.category_id ?? c.category}
                                        label={`${c.category} (${c.count})`}
                                        value={money(c.amount)}
                                        theme={theme}
                                        indent={1}
                                    />
                                ),
                            )
                        )}
                        <SubtotalLine
                            label="Total categories"
                            value={money(
                                report.operating_expenses.categories_total,
                            )}
                            theme={theme}
                        />

                        {parseFloat(
                            report.operating_expenses.payment_fees.fees,
                        ) > 0 ? (
                            <>
                                <Spacer />
                                <Line
                                    label={`Payment fees (${num(
                                        report.operating_expenses.payment_fees
                                            .transactions,
                                    )} txns)`}
                                    value={money(
                                        report.operating_expenses.payment_fees
                                            .fees,
                                    )}
                                    theme={theme}
                                    indent={1}
                                />
                            </>
                        ) : null}

                        {parseFloat(
                            report.operating_expenses.inventory_write_offs
                                .total_cost,
                        ) > 0 ? (
                            <>
                                <Spacer />
                                {report.operating_expenses.inventory_write_offs.breakdown.map(
                                    (w) => (
                                        <Line
                                            key={w.reason}
                                            label={`Write-off · ${w.reason} (${num(
                                                w.quantity,
                                            )} units)`}
                                            value={money(w.cost)}
                                            theme={theme}
                                            indent={1}
                                        />
                                    ),
                                )}
                            </>
                        ) : null}

                        <Spacer />

                        <TotalLine
                            label="Total operating expenses"
                            value={money(report.operating_expenses.total)}
                            theme={theme}
                            danger
                        />
                    </Section>

                    {/* ---- Net profit ---- */}
                    <View
                        className="rounded-2xl border px-5 py-5"
                        style={{
                            borderColor: isProfit
                                ? theme.primary + '55'
                                : '#f43f5e55',
                            backgroundColor: isProfit
                                ? `${theme.primary}10`
                                : '#f43f5e15',
                        }}
                    >
                        <View className="flex-row items-center justify-between flex-wrap gap-3">
                            <View>
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: isProfit
                                            ? theme.primary
                                            : '#f43f5e',
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    {isProfit ? 'Net profit' : 'Net loss'}
                                </Text>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: isProfit
                                            ? theme.primary
                                            : '#f43f5e',
                                        fontFamily: theme.font.bold,
                                        fontSize: 32,
                                        letterSpacing: -0.5,
                                    }}
                                >
                                    {money(report.net_profit)}
                                </Text>
                            </View>
                            <View className="items-end">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                        letterSpacing: 1,
                                    }}
                                >
                                    MARGIN
                                </Text>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: isProfit
                                            ? theme.primary
                                            : '#f43f5e',
                                        fontFamily: theme.font.bold,
                                        fontSize: 22,
                                    }}
                                >
                                    {report.net_margin_percent}%
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ---- Stock position ---- */}
                    <Section
                        title="Stock position (all-time)"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <Line
                            label="Units on hand"
                            value={num(report.stock_position.units)}
                            theme={theme}
                            indent={0}
                        />
                        <Line
                            label="Cost value"
                            value={money(report.stock_position.cost_value)}
                            theme={theme}
                            indent={1}
                        />
                        <Line
                            label="Retail value"
                            value={money(report.stock_position.retail_value)}
                            theme={theme}
                            indent={1}
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
    danger,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    accent?: boolean;
    danger?: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    const color = danger
        ? '#f43f5e'
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
                    fontSize: 20,
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
                        fontSize: 11,
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
            <View style={{ paddingVertical: 10 }}>{children}</View>
        </View>
    );
}

function Line({
    label,
    value,
    theme,
    indent = 0,
    muted,
    bold,
    danger,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    indent?: number;
    muted?: boolean;
    bold?: boolean;
    danger?: boolean;
}) {
    const color = danger
        ? '#f43f5e'
        : muted
            ? theme.textDark
            : theme.text;
    return (
        <View
            className="flex-row items-center justify-between"
            style={{
                paddingHorizontal: 16,
                paddingLeft: 16 + indent * 16,
                paddingVertical: 5,
            }}
        >
            <Text
                style={{
                    color,
                    fontFamily: bold ? theme.font.bold : theme.font.regular,
                    fontSize: 13,
                    flex: 1,
                    paddingRight: 12,
                }}
                numberOfLines={2}
            >
                {label}
            </Text>
            <Text
                style={{
                    color,
                    fontFamily: theme.font.mono,
                    fontSize: 13,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function SubtotalLine({
    label,
    value,
    theme,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
}) {
    return (
        <View
            className="flex-row items-center justify-between mt-1 pt-2"
            style={{
                paddingHorizontal: 16,
                borderTopWidth: 1,
                borderTopColor: theme.textDark + '22',
            }}
        >
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 13,
                    flex: 1,
                    paddingRight: 12,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 13,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function TotalLine({
    label,
    value,
    margin,
    theme,
    danger,
}: {
    label: string;
    value: string;
    margin?: string;
    theme: ThemeShape;
    danger?: boolean;
}) {
    const color = danger ? '#f43f5e' : theme.primary;
    return (
        <View
            className="flex-row items-center justify-between mt-2 pt-3"
            style={{
                paddingHorizontal: 16,
                borderTopWidth: 2,
                borderTopColor: color + '55',
            }}
        >
            <Text
                style={{
                    color,
                    fontFamily: theme.font.bold,
                    fontSize: 14,
                    letterSpacing: 0.4,
                    flex: 1,
                    paddingRight: 12,
                }}
            >
                {label}
            </Text>
            <View className="items-end">
                <Text
                    style={{
                        color,
                        fontFamily: theme.font.bold,
                        fontSize: 16,
                    }}
                >
                    {value}
                </Text>
                {margin ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.mono,
                            fontSize: 10,
                            marginTop: 1,
                        }}
                    >
                        {margin}%
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

function Spacer() {
    return <View style={{ height: 10 }} />;
}