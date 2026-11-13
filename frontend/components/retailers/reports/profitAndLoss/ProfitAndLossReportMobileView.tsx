// components/retailers/reports/profitAndLoss/ProfitAndLossReportMobileView.tsx

import { DateField } from '@/components/common/DateField';
import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from 'react-native';

import type {
    PeriodPreset,
    PlExpenseCategory
} from './ProfitAndLossReport';
import type { ProfitAndLossViewProps } from './ProfitAndLossReportWebView';
import {
    buildProfitAndLossHtml,
    buildProfitAndLossSheets,
} from './profitAndLossExport';

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

const PRESETS: Array<{ label: string; value: PeriodPreset }> = [
    { label: 'This month', value: 'THIS_MONTH' },
    { label: 'Last month', value: 'LAST_MONTH' },
    { label: 'This year', value: 'THIS_YEAR' },
    { label: 'Custom', value: 'CUSTOM' },
];

/* =========================================================
 * Component
 * ======================================================= */

export function ProfitAndLossReportMobileView({
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
    const divider = theme.textDark + '22';

    const [filtersOpen, setFiltersOpen] = useState(false);

    const netProfit = report ? parseFloat(report.net_profit) : 0;
    const isProfit = netProfit >= 0;
    const profitColor = isProfit ? '#10b981' : '#f43f5e';

    const periodLabel = report
        ? report.period.days <= 1
            ? report.period.from
            : `${report.period.from} → ${report.period.to}`
        : '—';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header ============ */}
            <View
                className="px-4 pt-3 pb-2"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                    borderBottomWidth: 1,
                }}
            >
                {/* Row 1: title + refresh */}
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
                            Profit &amp; loss
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
                            {report?.entity.title ?? '—'} · {periodLabel}
                        </Text>
                    </View>

                    <Pressable
                        onPress={onRefresh}
                        accessibilityRole="button"
                        hitSlop={8}
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

                {/* Row 2: filter toggle */}
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
                            {PRESETS.find((p) => p.value === preset)?.label ??
                                'Period'}
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
                            filename: `profit_and_loss_${report!.period.from}_to_${report!.period.to}.xlsx`,
                            sheets: buildProfitAndLossSheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `profit_and_loss_${report!.period.from}_to_${report!.period.to}.pdf`,
                            html: buildProfitAndLossHtml(report!),
                        })}
                    />
                </View>

                {/* Row 3: filter panel (collapsible) */}
                {filtersOpen ? (
                    <View className="mt-3">
                        <View
                            className="flex-row flex-wrap"
                            style={{ gap: 6 }}
                        >
                            {PRESETS.map((p) => {
                                const active = preset === p.value;
                                return (
                                    <Pressable
                                        key={p.value}
                                        onPress={() =>
                                            onPresetChange(p.value)
                                        }
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
                                            {p.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {preset === 'CUSTOM' ? (
                            <View className="flex-row mt-2" style={{ gap: 8 }}>
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
                        ) : null}
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
                    {/* ---- Hero: net profit / loss ---- */}
                    <View
                        className="rounded-3xl px-5 py-5"
                        style={{
                            backgroundColor: alpha(profitColor, 0.10),
                            borderWidth: 1,
                            borderColor: alpha(profitColor, 0.35),
                        }}
                    >
                        <Text
                            style={{
                                color: profitColor,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                            }}
                        >
                            {isProfit ? 'Net profit' : 'Net loss'}
                        </Text>
                        <Text
                            className="mt-1"
                            style={{
                                color: profitColor,
                                fontFamily: theme.font.bold,
                                fontSize: 36,
                                letterSpacing: -1,
                            }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {money(report.net_profit)}
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
                                Margin {report.net_margin_percent}%
                            </Text>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 12,
                                }}
                            >
                                {num(report.revenue.orders_count)} orders
                            </Text>
                        </View>
                    </View>

                    {/* ---- Quick stats ---- */}
                    <View className="flex-row" style={{ gap: 8 }}>
                        <QuickStat
                            label="Net revenue"
                            value={money(report.revenue.net_revenue)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <QuickStat
                            label="Gross profit"
                            value={money(report.gross_profit)}
                            sub={`${report.gross_margin_percent}%`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>

                    {/* ---- Trading account ---- */}
                    <StatementCard
                        title="Trading account"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <Row
                            label="Gross sales"
                            value={money(report.revenue.gross_sales)}
                            theme={theme}
                        />
                        <Deduction
                            label="Discounts"
                            value={money(report.revenue.discounts)}
                            theme={theme}
                        />
                        <Deduction
                            label="Sales returns"
                            value={money(report.revenue.returns_value)}
                            theme={theme}
                        />
                        <Deduction
                            label="Tax collected"
                            value={money(report.revenue.tax_collected)}
                            theme={theme}
                        />
                        <Subtotal
                            label="Net revenue"
                            value={money(report.revenue.net_revenue)}
                            theme={theme}
                            divider={divider}
                        />

                        <RowSpacer />

                        <Row
                            label="Cost of goods sold"
                            value={money(report.cogs.sold_cost)}
                            theme={theme}
                        />
                        <Deduction
                            label="Returned cost"
                            value={money(report.cogs.returned_cost)}
                            theme={theme}
                        />
                        {report.cogs.expense_categories.map((cat) => (
                            <Row
                                key={cat.category_id ?? cat.category}
                                label={cat.category}
                                value={money(cat.amount)}
                                theme={theme}
                                muted
                            />
                        ))}
                        <Subtotal
                            label="Total cost of sales"
                            value={money(report.cogs.total)}
                            theme={theme}
                            divider={divider}
                        />

                        <RowSpacer />

                        <Highlight
                            label="Gross profit"
                            value={money(report.gross_profit)}
                            margin={report.gross_margin_percent}
                            tint={theme.primary}
                            theme={theme}
                        />
                    </StatementCard>

                    {/* ---- Operating expenses ---- */}
                    <StatementCard
                        title="Operating expenses"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.operating_expenses.categories.length === 0 ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 13,
                                    paddingVertical: 8,
                                }}
                            >
                                No operating expenses in this period.
                            </Text>
                        ) : (
                            report.operating_expenses.categories.map(
                                (cat: PlExpenseCategory) => (
                                    <Row
                                        key={cat.category_id ?? cat.category}
                                        label={cat.category}
                                        value={money(cat.amount)}
                                        sub={`${cat.count} ${cat.count === 1
                                                ? 'entry'
                                                : 'entries'
                                            }`}
                                        theme={theme}
                                    />
                                ),
                            )
                        )}

                        {parseFloat(
                            report.operating_expenses.payment_fees.fees,
                        ) > 0 ? (
                            <Row
                                label="Payment fees"
                                value={money(
                                    report.operating_expenses.payment_fees
                                        .fees,
                                )}
                                sub={`${num(
                                    report.operating_expenses.payment_fees
                                        .transactions,
                                )} transactions`}
                                theme={theme}
                            />
                        ) : null}

                        {report.operating_expenses.inventory_write_offs.breakdown.map(
                            (w) => (
                                <Row
                                    key={w.reason}
                                    label={w.reason.replace(/_/g, ' ')}
                                    value={money(w.cost)}
                                    sub={`${num(w.quantity)} units`}
                                    theme={theme}
                                />
                            ),
                        )}

                        <Highlight
                            label="Total operating expenses"
                            value={money(report.operating_expenses.total)}
                            tint="#f43f5e"
                            theme={theme}
                        />
                    </StatementCard>

                    {/* ---- Stock position ---- */}
                    <StatementCard
                        title="Stock position"
                        subtitle="Current, all-time"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <Row
                            label="Units on hand"
                            value={num(report.stock_position.units)}
                            theme={theme}
                        />
                        <Row
                            label="Cost value"
                            value={money(report.stock_position.cost_value)}
                            theme={theme}
                        />
                        <Row
                            label="Retail value"
                            value={money(report.stock_position.retail_value)}
                            theme={theme}
                        />
                    </StatementCard>
                </ScrollView>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

function QuickStat({
    label,
    value,
    sub,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    sub?: string;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-2xl border px-3.5 py-3"
            style={{
                borderColor,
                backgroundColor: theme.panel,
                flex: 1,
            }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                }}
                numberOfLines={1}
            >
                {label}
            </Text>
            <Text
                className="mt-1.5"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 17,
                    letterSpacing: -0.3,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {value}
            </Text>
            {sub ? (
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {sub}
                </Text>
            ) : null}
        </View>
    );
}

function StatementCard({
    title,
    subtitle,
    children,
    theme,
    borderColor,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-3xl border overflow-hidden"
            style={{
                borderColor,
                backgroundColor: theme.panel,
            }}
        >
            <View
                className="px-5 pt-4 pb-2 flex-row items-baseline justify-between"
                style={{ gap: 8 }}
            >
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
                {subtitle ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                        }}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>

            <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                {children}
            </View>
        </View>
    );
}

function Row({
    label,
    value,
    sub,
    theme,
    muted,
}: {
    label: string;
    value: string;
    sub?: string;
    theme: ThemeShape;
    muted?: boolean;
}) {
    return (
        <View
            className="flex-row items-center justify-between py-2.5"
            style={{ gap: 12 }}
        >
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        color: muted ? theme.textDark : theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 14,
                    }}
                    numberOfLines={2}
                >
                    {label}
                </Text>
                {sub ? (
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            opacity: 0.8,
                        }}
                    >
                        {sub}
                    </Text>
                ) : null}
            </View>
            <Text
                style={{
                    color: muted ? theme.textDark : theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
                    letterSpacing: -0.2,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function Deduction({
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
            className="flex-row items-center justify-between py-1.5"
            style={{ gap: 12, paddingLeft: 14 }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.regular,
                    fontSize: 13,
                    flex: 1,
                }}
                numberOfLines={1}
            >
                − {label}
            </Text>
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: 13,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function Subtotal({
    label,
    value,
    theme,
    divider,
}: {
    label: string;
    value: string;
    theme: ThemeShape;
    divider: string;
}) {
    return (
        <View
            className="flex-row items-center justify-between pt-3 mt-1.5"
            style={{
                gap: 12,
                borderTopWidth: 1,
                borderTopColor: divider,
            }}
        >
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 14,
                    flex: 1,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 16,
                    letterSpacing: -0.3,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function Highlight({
    label,
    value,
    margin,
    tint,
    theme,
}: {
    label: string;
    value: string;
    margin?: string;
    tint: string;
    theme: ThemeShape;
}) {
    return (
        <View
            className="rounded-2xl px-4 py-3 mt-3 flex-row items-center justify-between"
            style={{
                backgroundColor: alpha(tint, 0.10),
                gap: 12,
            }}
        >
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        color: tint,
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                    }}
                >
                    {label}
                </Text>
                {margin ? (
                    <Text
                        className="mt-0.5"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 11,
                        }}
                    >
                        {margin}% margin
                    </Text>
                ) : null}
            </View>
            <Text
                style={{
                    color: tint,
                    fontFamily: theme.font.bold,
                    fontSize: 20,
                    letterSpacing: -0.4,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {value}
            </Text>
        </View>
    );
}

function RowSpacer() {
    return <View style={{ height: 12 }} />;
}