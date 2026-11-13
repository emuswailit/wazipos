// components/retailers/reports/dailySales/DailySalesReportWebView.tsx

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
    CollectionRow,
    DailySalesReportData,
    OriginPaymentRow,
    PaymentRow,
    ProductRow,
} from './DailySalesReport';
import {
    buildDailySalesHtml,
    buildDailySalesSheets,
} from './dailySalesExport';

export interface DailySalesReportViewProps {
    report: DailySalesReportData | null;
    loading: boolean;
    error: string | null;
    from: string;
    onFromChange: (v: string) => void;
    to: string;
    onToChange: (v: string) => void;
    includeCancelled: boolean;
    onToggleCancelled: () => void;
    onClearPeriod: () => void;
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
    if (days <= 1) {
        return new Date(from).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }
    const a = new Date(from).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
    });
    const b = new Date(to).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    return `${a} – ${b}  (${days}d)`;
}

/* =========================================================
 * Component
 * ======================================================= */

export function DailySalesReportWebView({
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

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* ============ Header — title + actions ============ */}
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
                            Daily sales report
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
                                filename: `daily_sales_${report!.period.from}.xlsx`,
                                sheets: buildDailySalesSheets(report!),
                            })}
                            getPdf={() => ({
                                filename: `daily_sales_${report!.period.from}.pdf`,
                                html: buildDailySalesHtml(report!),
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
                    style={{ gap: 12 }}
                >
                    <View style={{ width: 200 }}>
                        <DateField
                            label="From"
                            value={from}
                            onChangeText={onFromChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>

                    <View style={{ width: 200 }}>
                        <DateField
                            label="To"
                            value={to}
                            onChangeText={onToChange}
                            placeholder="YYYY-MM-DD"
                        />
                    </View>

                    {(from || to) ? (
                        <Pressable
                            onPress={onClearPeriod}
                            accessibilityRole="button"
                            accessibilityLabel="Clear period"
                            className="px-4 h-[46px] rounded-lg border items-center justify-center"
                            style={{ borderColor: theme.textDark + '33' }}
                        >
                            <Text
                                className="uppercase tracking-widest"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                }}
                            >
                                Clear
                            </Text>
                        </Pressable>
                    ) : null}

                    <View
                        style={{
                            width: 1,
                            height: 30,
                            backgroundColor: theme.textDark + '22',
                        }}
                    />

                    <Pressable
                        onPress={onToggleCancelled}
                        accessibilityRole="button"
                        accessibilityState={{ selected: includeCancelled }}
                        className="px-4 h-[46px] rounded-lg border items-center justify-center"
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
                            className="uppercase tracking-widest"
                            style={{
                                color: includeCancelled
                                    ? theme.primary
                                    : theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            {includeCancelled
                                ? 'Incl. cancelled'
                                : 'Excl. cancelled'}
                        </Text>
                    </Pressable>
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
                        gap: 24,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* KPI strip */}
                    <View className="flex-row flex-wrap gap-3">
                        <KpiCard
                            label="Orders"
                            value={num(report.kpi.orders_count)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Net sales"
                            value={money(report.kpi.net_sales)}
                            theme={theme}
                            borderColor={borderColor}
                            accent
                        />
                        <KpiCard
                            label="Paid"
                            value={money(report.kpi.paid_total)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Balance due"
                            value={money(report.kpi.balance_due_total)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Units sold"
                            value={num(report.kpi.units_sold)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Returns"
                            value={num(report.kpi.returns_count)}
                            subtitle={money(report.kpi.returns_value)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Stock on hand"
                            value={num(report.kpi.receipts_on_hand_units)}
                            subtitle={money(report.kpi.receipts_on_hand_value)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>

                    {/* Origin + Channel */}
                    <View className="flex-row gap-6 flex-wrap">
                        <Section
                            title="By origin"
                            theme={theme}
                            borderColor={borderColor}
                            style={{ flex: 1, minWidth: 360 }}
                        >
                            <SimpleTable
                                headers={[
                                    { label: 'Origin', flex: 2 },
                                    { label: 'Orders', flex: 1, right: true },
                                    { label: 'Net', flex: 2, right: true },
                                    { label: 'Paid', flex: 2, right: true },
                                ]}
                                rows={report.origin_counts.map((r) => [
                                    r.order_origin,
                                    num(r.orders_count),
                                    money(r.net),
                                    money(r.paid),
                                ])}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>

                        <Section
                            title="By channel"
                            theme={theme}
                            borderColor={borderColor}
                            style={{ flex: 1, minWidth: 360 }}
                        >
                            <SimpleTable
                                headers={[
                                    { label: 'Channel', flex: 2 },
                                    { label: 'Orders', flex: 1, right: true },
                                    { label: 'Net', flex: 2, right: true },
                                ]}
                                rows={report.channel_counts.map((r) => [
                                    r.order_channel,
                                    num(r.orders_count),
                                    money(r.net),
                                ])}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>
                    </View>

                    {/* Payment + Collections */}
                    <View className="flex-row gap-6 flex-wrap">
                        <Section
                            title="Payment methods (declared)"
                            theme={theme}
                            borderColor={borderColor}
                            style={{ flex: 1, minWidth: 420 }}
                        >
                            <SimpleTable
                                headers={[
                                    { label: 'Method', flex: 3 },
                                    { label: 'Orders', flex: 1, right: true },
                                    { label: 'Net', flex: 2, right: true },
                                    { label: 'Paid', flex: 2, right: true },
                                ]}
                                rows={report.payment_breakdown.map(
                                    (p: PaymentRow) => [
                                        p.payment_method_title,
                                        num(p.orders_count),
                                        money(p.net),
                                        money(p.paid),
                                    ],
                                )}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>

                        <Section
                            title="Collections (actual)"
                            theme={theme}
                            borderColor={borderColor}
                            style={{ flex: 1, minWidth: 420 }}
                        >
                            <SimpleTable
                                headers={[
                                    { label: 'Method', flex: 3 },
                                    {
                                        label: 'Transactions',
                                        flex: 1,
                                        right: true,
                                    },
                                    {
                                        label: 'Collected',
                                        flex: 2,
                                        right: true,
                                    },
                                ]}
                                rows={report.collections_breakdown.map(
                                    (c: CollectionRow) => [
                                        c.payment_method_title,
                                        num(c.transactions),
                                        money(c.collected),
                                    ],
                                )}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>
                    </View>

                    {/* Origin x Payment */}
                    <Section
                        title="Origin x payment method"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <View style={{ gap: 16 }}>
                            {report.origin_payment_breakdown.map(
                                (op: OriginPaymentRow) => (
                                    <View key={op.order_origin}>
                                        <View className="flex-row items-center justify-between mb-2">
                                            <Text
                                                className="uppercase tracking-widest"
                                                style={{
                                                    color: theme.primary,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize: 11,
                                                }}
                                            >
                                                {op.order_origin}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.mono,
                                                    fontSize: 11,
                                                }}
                                            >
                                                {num(op.summary.orders_count)} ·{' '}
                                                {money(op.summary.net)}
                                            </Text>
                                        </View>
                                        <SimpleTable
                                            headers={[
                                                {
                                                    label: 'Method',
                                                    flex: 3,
                                                },
                                                {
                                                    label: 'Orders',
                                                    flex: 1,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Net',
                                                    flex: 2,
                                                    right: true,
                                                },
                                                {
                                                    label: 'Paid',
                                                    flex: 2,
                                                    right: true,
                                                },
                                            ]}
                                            rows={op.methods.map(
                                                (m: PaymentRow) => [
                                                    m.payment_method_title,
                                                    num(m.orders_count),
                                                    money(m.net),
                                                    money(m.paid),
                                                ],
                                            )}
                                            theme={theme}
                                            borderColor={borderColor}
                                        />
                                    </View>
                                ),
                            )}
                        </View>
                    </Section>

                    {/* Products */}
                    <Section
                        title="Products"
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
                                    label: 'Sold',
                                    flex: 1.2,
                                    right: true,
                                },
                                {
                                    label: 'Returned',
                                    flex: 1.2,
                                    right: true,
                                },
                                {
                                    label: 'Net qty',
                                    flex: 1.2,
                                    right: true,
                                },
                                { label: 'Gross', flex: 2, right: true },
                                { label: 'Net', flex: 2, right: true },
                                {
                                    label: 'Stock',
                                    flex: 1.4,
                                    right: true,
                                },
                                {
                                    label: 'Stock value',
                                    flex: 2,
                                    right: true,
                                },
                            ]}
                            rows={report.product_breakdown.map(
                                (p: ProductRow) => [
                                    p.product_title,
                                    num(p.sold_quantity),
                                    num(p.returned_quantity),
                                    num(p.net_quantity),
                                    money(p.gross_value),
                                    money(p.net_value),
                                    num(p.current_stock),
                                    money(p.stock_value),
                                ],
                            )}
                            theme={theme}
                            borderColor={borderColor}
                            footer={[
                                'Totals',
                                num(report.totals.sold_quantity),
                                num(report.totals.returned_quantity),
                                (
                                    parseFloat(report.totals.sold_quantity) -
                                    parseFloat(report.totals.returned_quantity)
                                ).toFixed(2),
                                money(report.totals.gross_value),
                                money(report.totals.net_value),
                                num(report.totals.current_stock),
                                money(report.totals.stock_value),
                            ]}
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
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    accent?: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    return (
        <View
            className="rounded-xl border px-4 py-3"
            style={{
                borderColor,
                minWidth: 160,
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
                    color: accent ? theme.primary : theme.text,
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
    style,
}: {
    title: string;
    children: React.ReactNode;
    theme: ThemeShape;
    borderColor: string;
    style?: any;
}) {
    return (
        <View
            className="rounded-xl border"
            style={[
                {
                    borderColor,
                    backgroundColor: theme.panel,
                    overflow: 'hidden',
                },
                style,
            ]}
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
    footer,
    theme,
    borderColor,
}: {
    headers: Col[];
    rows: (string | number)[][];
    footer?: (string | number)[];
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
                style={{ borderBottomColor: borderColor, borderBottomWidth: 1 }}
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

            {rows.map((row, i) => (
                <View
                    key={i}
                    className="flex-row py-2 px-2"
                    style={{
                        borderBottomColor: borderColor + '55',
                        borderBottomWidth: 1,
                    }}
                >
                    {row.map((cell, j) => {
                        const col = headers[j];
                        const isMoney =
                            typeof cell === 'string' && cell.includes('.');
                        return (
                            <View
                                key={j}
                                style={{
                                    flex: col.flex,
                                    alignItems:
                                        col.right || col.align === 'right'
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
            ))}

            {footer ? (
                <View
                    className="flex-row py-2 px-2"
                    style={{ backgroundColor: theme.background }}
                >
                    {footer.map((cell, j) => {
                        const col = headers[j];
                        return (
                            <View
                                key={j}
                                style={{
                                    flex: col.flex,
                                    alignItems:
                                        col.right || col.align === 'right'
                                            ? 'flex-end'
                                            : 'flex-start',
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
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
            ) : null}
        </View>
    );
}