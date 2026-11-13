// components/retailers/reports/expiries/ExpiryReportWebView.tsx

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
    ExpiryBucket,
    ExpiryBucketRow,
    ExpiryReceiptRow,
    ExpiryReportData,
} from './ExpiryReport';
import {
    buildExpiryHtml,
    buildExpirySheets,
} from './expiryExport';

export interface ExpiryViewProps {
    report: ExpiryReportData | null;
    loading: boolean;
    error: string | null;
    days: number;
    onDaysChange: (d: number) => void;
    bucket: ExpiryBucket | 'ALL';
    onBucketChange: (b: ExpiryBucket | 'ALL') => void;
    search: string;
    onSearchChange: (s: string) => void;
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

const BUCKET_COLORS: Record<ExpiryBucket, string> = {
    EXPIRED: '#dc2626',
    '0_7': '#ea580c',
    '8_30': '#f59e0b',
    '31_60': '#0ea5e9',
    '61_90': '#10b981',
    '91_PLUS': '#64748b',
};

const WINDOWS = [30, 60, 90, 180, 365];

/* =========================================================
 * Component
 * ======================================================= */

export function ExpiryReportWebView({
    report,
    loading,
    error,
    days,
    onDaysChange,
    bucket,
    onBucketChange,
    search,
    onSearchChange,
    onRefresh,
}: ExpiryViewProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* Header */}
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
                            Expiries
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
                            {report?.period.as_of ?? '—'} ·{' '}
                            {days}-day window
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
                                filename: `expiries_${report!.period.as_of}_${days}d.xlsx`,
                                sheets: buildExpirySheets(report!),
                            })}
                            getPdf={() => ({
                                filename: `expiries_${report!.period.as_of}_${days}d.pdf`,
                                html: buildExpiryHtml(report!),
                            })}
                        />

                        <Pressable
                            onPress={onRefresh}
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

            {/* Filter bar */}
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
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        Window
                    </Text>

                    <View className="flex-row" style={{ gap: 6 }}>
                        {WINDOWS.map((w) => {
                            const active = days === w;
                            return (
                                <Pressable
                                    key={w}
                                    onPress={() => onDaysChange(w)}
                                    className="px-3 min-h-[34px] rounded-full border items-center justify-center"
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
                                        {w}d
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={{ flex: 1 }} />

                    <TextInput
                        value={search}
                        onChangeText={onSearchChange}
                        placeholder="Search product or batch…"
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
                </View>

                <View
                    className="flex-row items-center flex-wrap mt-3"
                    style={{ gap: 6 }}
                >
                    <Text
                        className="uppercase tracking-widest mr-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        Bucket
                    </Text>

                    <BucketChip
                        label="All"
                        active={bucket === 'ALL'}
                        theme={theme}
                        onPress={() => onBucketChange('ALL')}
                    />
                    {(report?.buckets ?? []).map((b) => (
                        <BucketChip
                            key={b.key}
                            label={`${b.label} · ${b.batches}`}
                            tint={BUCKET_COLORS[b.key]}
                            active={bucket === b.key}
                            theme={theme}
                            onPress={() => onBucketChange(b.key)}
                        />
                    ))}
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
                            label="Batches at risk"
                            value={num(report.kpi.total_batches)}
                            subtitle={`${num(report.kpi.total_units)} units`}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Cost value at risk"
                            value={money(report.kpi.cost_value_at_risk)}
                            theme={theme}
                            borderColor={borderColor}
                            accent
                        />
                        <KpiCard
                            label="Retail value at risk"
                            value={money(report.kpi.retail_value_at_risk)}
                            theme={theme}
                            borderColor={borderColor}
                        />
                        <KpiCard
                            label="Already expired"
                            value={num(report.kpi.expired_batches)}
                            subtitle={`${money(report.kpi.expired_cost_value)}`}
                            theme={theme}
                            borderColor={borderColor}
                            danger={report.kpi.expired_batches > 0}
                        />
                        <KpiCard
                            label="Expires this week"
                            value={num(report.kpi.urgent_batches)}
                            subtitle={`${money(report.kpi.urgent_cost_value)}`}
                            theme={theme}
                            borderColor={borderColor}
                            warning={report.kpi.urgent_batches > 0}
                        />
                    </View>

                    {/* Bucket summary */}
                    <Section
                        title="By bucket"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        <SimpleTable
                            headers={[
                                { label: 'Bucket', flex: 3 },
                                { label: 'Batches', flex: 1, right: true },
                                { label: 'Units', flex: 1.2, right: true },
                                { label: 'Cost value', flex: 2, right: true },
                                {
                                    label: 'Retail value',
                                    flex: 2,
                                    right: true,
                                },
                            ]}
                            rows={report.buckets
                                .filter((b) => b.batches > 0)
                                .map((b: ExpiryBucketRow) => [
                                    b.label,
                                    num(b.batches),
                                    num(b.units),
                                    money(b.cost_value),
                                    money(b.retail_value),
                                ])}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </Section>

                    {/* Wholesaler summary */}
                    {report.wholesaler_breakdown.length > 0 ? (
                        <Section
                            title="By wholesaler"
                            theme={theme}
                            borderColor={borderColor}
                        >
                            <SimpleTable
                                headers={[
                                    { label: 'Wholesaler', flex: 4 },
                                    { label: 'Batches', flex: 1, right: true },
                                    { label: 'Units', flex: 1.2, right: true },
                                    {
                                        label: 'Cost value',
                                        flex: 2,
                                        right: true,
                                    },
                                ]}
                                rows={report.wholesaler_breakdown.map(
                                    (w) => [
                                        w.wholesaler_title,
                                        num(w.batches),
                                        num(w.units),
                                        money(w.cost_value),
                                    ],
                                )}
                                theme={theme}
                                borderColor={borderColor}
                            />
                        </Section>
                    ) : null}

                    {/* Detail table */}
                    <Section
                        title={`Detail (${report.receipts.length} batches)`}
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
                                    label: 'Batch',
                                    flex: 2,
                                    align: 'left',
                                },
                                {
                                    label: 'Expiry',
                                    flex: 2,
                                    align: 'left',
                                },
                                {
                                    label: 'Days',
                                    flex: 1.2,
                                    right: true,
                                },
                                {
                                    label: 'Qty',
                                    flex: 1,
                                    right: true,
                                },
                                {
                                    label: 'Cost',
                                    flex: 2,
                                    right: true,
                                },
                                {
                                    label: 'Retail',
                                    flex: 2,
                                    right: true,
                                },
                            ]}
                            rows={report.receipts.map(
                                (r: ExpiryReceiptRow) => [
                                    r.product_title,
                                    r.batch || '—',
                                    r.expiry_date,
                                    r.days_until_expiry < 0
                                        ? `${Math.abs(
                                            r.days_until_expiry,
                                        )} overdue`
                                        : String(r.days_until_expiry),
                                    num(r.quantity),
                                    money(r.cost_value),
                                    money(r.retail_value),
                                ],
                            )}
                            theme={theme}
                            borderColor={borderColor}
                            rowTints={report.receipts.map(
                                (r) => BUCKET_COLORS[r.bucket],
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

function BucketChip({
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
            className="px-3 min-h-[30px] rounded-full border items-center justify-center"
            style={{
                borderColor: active ? color : theme.textDark + '33',
                backgroundColor: active ? `${color}15` : 'transparent',
            }}
        >
            <Text
                className="uppercase tracking-widest text-[10px]"
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
    accent,
    danger,
    warning,
    theme,
    borderColor,
}: {
    label: string;
    value: string;
    subtitle?: string;
    accent?: boolean;
    danger?: boolean;
    warning?: boolean;
    theme: ThemeShape;
    borderColor: string;
}) {
    const color = danger
        ? '#dc2626'
        : warning
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
    rowTints?: string[];
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