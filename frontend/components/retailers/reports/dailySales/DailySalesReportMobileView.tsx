// components/retailers/reports/dailySales/DailySalesReportMobileView.tsx

import { DateField } from '@/components/common/DateField';
import { ExportButtons } from '@/components/common/Exportable';
import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from 'react-native';

import type { DailySalesReportViewProps } from './DailySalesReportWebView';
import {
    buildDailySalesHtml,
    buildDailySalesSheets,
} from './dailySalesExport';

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

/* =========================================================
 * Component
 * ======================================================= */

export function DailySalesReportMobileView({
    report,
    loading,
    error,
    from,
    onFromChange,
    to,
    onToChange,
    includeCancelled,
    onToggleCancelled,
    onClearPeriod,
    onRefresh,
}: DailySalesReportViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

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
                className="px-4 pt-3 pb-3 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row items-center justify-between gap-3">
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xl,
                            }}
                            numberOfLines={1}
                        >
                            Daily sales
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
                            {report?.entity.title ?? '—'} · {periodLabel}
                        </Text>
                    </View>

                    <Pressable
                        onPress={onRefresh}
                        accessibilityRole="button"
                        className="px-4 min-h-[36px] rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white text-[10px]"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            {loading ? '...' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>
            </View>

            {/* ============ Filter bar ============ */}
            <View
                className="px-4 py-3 border-b"
                style={{
                    backgroundColor: theme.panel,
                    borderBottomColor: borderColor,
                }}
            >
                <View className="flex-row" style={{ gap: 0 }}>
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

                <View
                    className="flex-row items-center flex-wrap"
                    style={{ gap: 8 }}
                >
                    <Pressable
                        onPress={onToggleCancelled}
                        accessibilityRole="button"
                        accessibilityState={{ selected: includeCancelled }}
                        className="px-3 min-h-[32px] rounded-full border items-center justify-center"
                        style={{
                            borderColor: includeCancelled
                                ? theme.primary
                                : theme.textDark + '33',
                            backgroundColor: includeCancelled
                                ? `${theme.primary}15`
                                : 'transparent',
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest text-[10px]"
                            style={{
                                color: includeCancelled
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {includeCancelled ? 'Incl.' : 'Excl.'} cancelled
                        </Text>
                    </Pressable>

                    {(from || to) ? (
                        <Pressable
                            onPress={onClearPeriod}
                            className="px-3 min-h-[32px] rounded-full border items-center justify-center"
                            style={{ borderColor: theme.textDark + '33' }}
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
                    ) : null}

                    <View style={{ flex: 1 }} />

                    <ExportButtons
                        enabled={!!report}
                        variant="inline"
                        height={32}
                        getExcel={() => ({
                            filename: `daily_sales_${report!.period.from}.xlsx`,
                            sheets: buildDailySalesSheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `daily_sales_${report!.period.from}.pdf`,
                            html: buildDailySalesHtml(report!),
                        })}
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
                        className="mt-4 px-5 min-h-[40px] rounded-full items-center justify-center"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white text-[11px]"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            Retry
                        </Text>
                    </Pressable>
                </View>
            ) : report ? (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingTop: 16,
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
                    {/* Headline KPI */}
                    <View
                        className="rounded-2xl border px-4 py-4"
                        style={{
                            borderColor: alpha(theme.primary, 0.35),
                            backgroundColor: alpha(
                                theme.primary,
                                isDarkMode ? 0.10 : 0.05,
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
                            Net sales
                        </Text>
                        <Text
                            className="mt-1"
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 30,
                                letterSpacing: -0.5,
                            }}
                        >
                            {money(report.kpi.net_sales)}
                        </Text>
                        <View
                            className="flex-row items-center mt-2"
                            style={{ gap: 14 }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 11,
                                }}
                            >
                                {num(report.kpi.orders_count)} orders
                            </Text>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 11,
                                }}
                            >
                                {num(report.kpi.units_sold)} units
                            </Text>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 11,
                                }}
                            >
                                {num(report.kpi.returns_count)} returns
                            </Text>
                        </View>
                    </View>

                    {/* Secondary KPIs */}
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        <MobileKpi
                            label="Paid"
                            value={money(report.kpi.paid_total)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <MobileKpi
                            label="Balance"
                            value={money(report.kpi.balance_due_total)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <MobileKpi
                            label="Returns value"
                            value={money(report.kpi.returns_value)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <MobileKpi
                            label="Stock on hand"
                            value={num(report.kpi.receipts_on_hand_units)}
                            subtitle={money(report.kpi.receipts_on_hand_value)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>

                    <MobileSection
                        title="By origin"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.origin_counts.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.origin_counts.map((r) => (
                                <MobileRow
                                    key={r.order_origin}
                                    label={r.order_origin}
                                    right={money(r.net)}
                                    sub={`${num(r.orders_count)} orders · paid ${money(r.paid)}`}
                                    theme={theme}
                                    subBg={subBg}
                                />
                            ))
                        )}
                    </MobileSection>

                    <MobileSection
                        title="By channel"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.channel_counts.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.channel_counts.map((r) => (
                                <MobileRow
                                    key={r.order_channel}
                                    label={r.order_channel}
                                    right={money(r.net)}
                                    sub={`${num(r.orders_count)} orders`}
                                    theme={theme}
                                    subBg={subBg}
                                />
                            ))
                        )}
                    </MobileSection>

                    <MobileSection
                        title="Payment methods (declared)"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.payment_breakdown.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.payment_breakdown.map((p) => (
                                <MobileRow
                                    key={p.payment_method_title}
                                    label={p.payment_method_title}
                                    right={money(p.net)}
                                    sub={`${num(p.orders_count)} orders · paid ${money(p.paid)}`}
                                    theme={theme}
                                    subBg={subBg}
                                />
                            ))
                        )}
                    </MobileSection>

                    <MobileSection
                        title="Collections (actual)"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.collections_breakdown.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.collections_breakdown.map((c) => (
                                <MobileRow
                                    key={c.payment_method_title}
                                    label={c.payment_method_title}
                                    right={money(c.collected)}
                                    sub={`${num(c.transactions)} transactions`}
                                    theme={theme}
                                    subBg={subBg}
                                />
                            ))
                        )}
                    </MobileSection>

                    <MobileSection
                        title="Origin x payment"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.origin_payment_breakdown.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.origin_payment_breakdown.map((op) => (
                                <View
                                    key={op.order_origin}
                                    className="rounded-xl px-3 py-3 mb-2"
                                    style={{ backgroundColor: subBg }}
                                >
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text
                                            className="uppercase tracking-widest"
                                            style={{
                                                color: theme.primary,
                                                fontFamily: theme.font.bold,
                                                fontSize: 10,
                                            }}
                                        >
                                            {op.order_origin}
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 12,
                                            }}
                                        >
                                            {money(op.summary.net)}
                                        </Text>
                                    </View>
                                    {op.methods.map((m) => (
                                        <View
                                            key={m.payment_method_title}
                                            className="flex-row items-center justify-between py-1"
                                        >
                                            <Text
                                                style={{
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font.medium,
                                                    fontSize: 11,
                                                    flex: 1,
                                                    paddingRight: 8,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {m.payment_method_title}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize: 11,
                                                }}
                                            >
                                                {money(m.net)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ))
                        )}
                    </MobileSection>

                    <MobileSection
                        title="Products"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.product_breakdown.length === 0 ? (
                            <MobileEmpty theme={theme} />
                        ) : (
                            report.product_breakdown.map((p) => (
                                <View
                                    key={p.product_id}
                                    className="rounded-xl px-3 py-3 mb-2"
                                    style={{ backgroundColor: subBg }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                            lineHeight: 17,
                                        }}
                                        numberOfLines={2}
                                    >
                                        {p.product_title}
                                    </Text>

                                    <View className="flex-row items-center justify-between mt-2">
                                        <View
                                            className="px-2 py-0.5 rounded-full"
                                            style={{
                                                backgroundColor: alpha(
                                                    theme.primary,
                                                    0.12,
                                                ),
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: theme.primary,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                ×{num(p.net_quantity)}
                                            </Text>
                                        </View>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            {money(p.net_value)}
                                        </Text>
                                    </View>

                                    <View className="flex-row items-center justify-between mt-1.5">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily: theme.font.mono,
                                                fontSize: 10,
                                            }}
                                        >
                                            Stock {num(p.current_stock)}
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily: theme.font.mono,
                                                fontSize: 10,
                                            }}
                                        >
                                            {money(p.stock_value)}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </MobileSection>

                    {/* Totals */}
                    <View
                        className="rounded-2xl border px-4 py-3"
                        style={{
                            borderColor,
                            backgroundColor: theme.panel,
                        }}
                    >
                        <Text
                            className="uppercase tracking-widest mb-2"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Totals
                        </Text>
                        <MobileRow
                            label="Sold quantity"
                            right={num(report.totals.sold_quantity)}
                            theme={theme}
                            subBg={subBg}
                        />
                        <MobileRow
                            label="Returned quantity"
                            right={num(report.totals.returned_quantity)}
                            theme={theme}
                            subBg={subBg}
                        />
                        <MobileRow
                            label="Gross value"
                            right={money(report.totals.gross_value)}
                            theme={theme}
                            subBg={subBg}
                        />
                        <MobileRow
                            label="Net value"
                            right={money(report.totals.net_value)}
                            theme={theme}
                            subBg={subBg}
                        />
                        <MobileRow
                            label="Stock on hand"
                            right={`${num(report.totals.current_stock)} · ${money(report.totals.stock_value)}`}
                            theme={theme}
                            subBg={subBg}
                        />
                    </View>
                </ScrollView>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Subcomponents
 * ======================================================= */

function MobileKpi({
    label,
    value,
    subtitle,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-xl border px-3 py-2.5"
            style={{
                borderColor,
                minWidth: '47%',
                flex: 1,
                backgroundColor: theme.panel,
            }}
        >
            <Text
                className="uppercase tracking-widest mb-0.5"
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
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: 15,
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

function MobileSection({
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
            className="rounded-2xl border"
            style={{
                borderColor,
                overflow: 'hidden',
                backgroundColor: theme.panel,
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

function MobileRow({
    label,
    right,
    sub,
    theme,
    subBg,
}: {
    label: string;
    right: string;
    sub?: string;
    theme: ThemeShape;
    subBg: string;
}) {
    return (
        <View
            className="rounded-xl px-3 py-2 mb-1.5"
            style={{ backgroundColor: subBg }}
        >
            <View className="flex-row items-center justify-between">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 12,
                        flex: 1,
                        paddingRight: 8,
                    }}
                    numberOfLines={1}
                >
                    {label}
                </Text>
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: 12,
                    }}
                >
                    {right}
                </Text>
            </View>
            {sub ? (
                <Text
                    className="mt-0.5"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.regular,
                        fontSize: 10,
                    }}
                >
                    {sub}
                </Text>
            ) : null}
        </View>
    );
}

function MobileEmpty({ theme }: { theme: ThemeShape }) {
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