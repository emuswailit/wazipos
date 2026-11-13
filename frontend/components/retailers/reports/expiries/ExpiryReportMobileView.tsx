// components/retailers/reports/expiries/ExpiryReportMobileView.tsx

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

import type {
    ExpiryBucket,
    ExpiryReceiptRow,
} from './ExpiryReport';
import type { ExpiryViewProps } from './ExpiryReportWebView';
import {
    buildExpiryHtml,
    buildExpirySheets,
} from './expiryExport';

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

const BUCKET_COLORS: Record<ExpiryBucket, string> = {
    EXPIRED: '#dc2626',
    '0_7': '#ea580c',
    '8_30': '#f59e0b',
    '31_60': '#0ea5e9',
    '61_90': '#10b981',
    '91_PLUS': '#64748b',
};

const BUCKET_SHORT: Record<ExpiryBucket, string> = {
    EXPIRED: 'Expired',
    '0_7': '≤7d',
    '8_30': '8–30d',
    '31_60': '31–60d',
    '61_90': '61–90d',
    '91_PLUS': '91d+',
};

const WINDOWS = [30, 60, 90, 180, 365];

/* =========================================================
 * Component
 * ======================================================= */

export function ExpiryReportMobileView({
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
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [filtersOpen, setFiltersOpen] = useState(false);

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: theme.background }}
        >
            {/* Header */}
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
                            Expiries
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

                {/* Row: window toggle + exports */}
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
                            {days}d window
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
                            filename: `expiries_${report!.period.as_of}_${days}d.xlsx`,
                            sheets: buildExpirySheets(report!),
                        })}
                        getPdf={() => ({
                            filename: `expiries_${report!.period.as_of}_${days}d.pdf`,
                            html: buildExpiryHtml(report!),
                        })}
                    />
                </View>

                {/* Filter panel */}
                {filtersOpen ? (
                    <View className="mt-3">
                        <TextInput
                            value={search}
                            onChangeText={onSearchChange}
                            placeholder="Search product or batch…"
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

                        <View
                            className="flex-row flex-wrap mb-2"
                            style={{ gap: 6 }}
                        >
                            {WINDOWS.map((w) => {
                                const active = days === w;
                                return (
                                    <Pressable
                                        key={w}
                                        onPress={() => onDaysChange(w)}
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
                                            {w}d
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View
                            className="flex-row flex-wrap"
                            style={{ gap: 6 }}
                        >
                            <BucketChip
                                label="All"
                                active={bucket === 'ALL'}
                                theme={theme}
                                onPress={() => onBucketChange('ALL')}
                            />
                            {(report?.buckets ?? [])
                                .filter((b) => b.batches > 0)
                                .map((b) => (
                                    <BucketChip
                                        key={b.key}
                                        label={`${BUCKET_SHORT[b.key]} · ${b.batches}`}
                                        tint={BUCKET_COLORS[b.key]}
                                        active={bucket === b.key}
                                        theme={theme}
                                        onPress={() => onBucketChange(b.key)}
                                    />
                                ))}
                        </View>
                    </View>
                ) : null}
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
                    {/* Hero: cost value at risk */}
                    <View
                        className="rounded-3xl px-5 py-5"
                        style={{
                            backgroundColor: alpha('#f59e0b', 0.10),
                            borderWidth: 1,
                            borderColor: alpha('#f59e0b', 0.35),
                        }}
                    >
                        <Text
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                            }}
                        >
                            Cost value at risk
                        </Text>
                        <Text
                            className="mt-1"
                            style={{
                                color: '#f59e0b',
                                fontFamily: theme.font.bold,
                                fontSize: 34,
                                letterSpacing: -1,
                            }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {money(report.kpi.cost_value_at_risk)}
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
                                {num(report.kpi.total_batches)} batches
                            </Text>
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: 12,
                                }}
                            >
                                {num(report.kpi.total_units)} units
                            </Text>
                        </View>
                    </View>

                    {/* Alert cards: expired + this week */}
                    {report.kpi.expired_batches > 0 ? (
                        <View
                            className="rounded-2xl px-4 py-3 flex-row items-center"
                            style={{
                                backgroundColor: alpha('#dc2626', 0.10),
                                borderWidth: 1,
                                borderColor: alpha('#dc2626', 0.30),
                                gap: 12,
                            }}
                        >
                            <View style={{ flex: 1 }}>
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
                                    {num(report.kpi.expired_batches)} batches ·{' '}
                                    {num(report.kpi.expired_units)} units
                                </Text>
                            </View>
                            <Text
                                style={{
                                    color: '#dc2626',
                                    fontFamily: theme.font.bold,
                                    fontSize: 18,
                                }}
                            >
                                {money(report.kpi.expired_cost_value)}
                            </Text>
                        </View>
                    ) : null}

                    {report.kpi.urgent_batches > 0 ? (
                        <View
                            className="rounded-2xl px-4 py-3 flex-row items-center"
                            style={{
                                backgroundColor: alpha('#ea580c', 0.10),
                                borderWidth: 1,
                                borderColor: alpha('#ea580c', 0.30),
                                gap: 12,
                            }}
                        >
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={{
                                        color: '#ea580c',
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                        letterSpacing: 0.8,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Expires this week
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.regular,
                                        fontSize: 12,
                                    }}
                                >
                                    {num(report.kpi.urgent_batches)} batches ·{' '}
                                    {num(report.kpi.urgent_units)} units
                                </Text>
                            </View>
                            <Text
                                style={{
                                    color: '#ea580c',
                                    fontFamily: theme.font.bold,
                                    fontSize: 18,
                                }}
                            >
                                {money(report.kpi.urgent_cost_value)}
                            </Text>
                        </View>
                    ) : null}

                    {/* Bucket summary */}
                    <Card
                        title="By bucket"
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.buckets
                            .filter((b) => b.batches > 0)
                            .map((b) => (
                                <View
                                    key={b.key}
                                    className="flex-row items-center rounded-lg px-3 py-2.5 mb-1.5"
                                    style={{
                                        backgroundColor: subBg,
                                        borderLeftWidth: 3,
                                        borderLeftColor:
                                            BUCKET_COLORS[b.key],
                                        gap: 10,
                                    }}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {b.label}
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
                                            {num(b.batches)} batches ·{' '}
                                            {num(b.units)} units
                                        </Text>
                                    </View>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        {money(b.cost_value)}
                                    </Text>
                                </View>
                            ))}
                    </Card>

                    {/* Wholesaler summary */}
                    {report.wholesaler_breakdown.length > 0 ? (
                        <Card
                            title="By wholesaler"
                            theme={theme}
                            borderColor={borderColor}
                        >
                            {report.wholesaler_breakdown.map((w) => (
                                <View
                                    key={w.wholesaler_id ?? 'unknown'}
                                    className="flex-row items-center rounded-lg px-3 py-2.5 mb-1.5"
                                    style={{ backgroundColor: subBg, gap: 10 }}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 13,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {w.wholesaler_title}
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
                                            {num(w.batches)} batches ·{' '}
                                            {num(w.units)} units
                                        </Text>
                                    </View>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        {money(w.cost_value)}
                                    </Text>
                                </View>
                            ))}
                        </Card>
                    ) : null}

                    {/* Detail cards */}
                    <Card
                        title={`Detail (${report.receipts.length})`}
                        theme={theme}
                        borderColor={borderColor}
                    >
                        {report.receipts.length === 0 ? (
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                    fontSize: 13,
                                    paddingVertical: 8,
                                }}
                            >
                                No batches in this window.
                            </Text>
                        ) : (
                            report.receipts.map((r: ExpiryReceiptRow) => {
                                const tint = BUCKET_COLORS[r.bucket];
                                const overdue = r.days_until_expiry < 0;
                                return (
                                    <View
                                        key={r.id}
                                        className="rounded-2xl px-3.5 py-3 mb-2"
                                        style={{ backgroundColor: subBg }}
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
                                                    {r.product_title}
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
                                                    {r.batch
                                                        ? `Batch ${r.batch}`
                                                        : 'No batch'}
                                                </Text>
                                            </View>

                                            <View
                                                className="px-2 py-0.5 rounded-full"
                                                style={{
                                                    backgroundColor: alpha(
                                                        tint,
                                                        0.15,
                                                    ),
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color: tint,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 10,
                                                        letterSpacing: 0.4,
                                                    }}
                                                >
                                                    {overdue
                                                        ? `${Math.abs(
                                                            r.days_until_expiry,
                                                        )}d overdue`
                                                        : `${r.days_until_expiry}d`}
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
                                            <View>
                                                <Text
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 9,
                                                        letterSpacing: 0.6,
                                                        textTransform:
                                                            'uppercase',
                                                    }}
                                                >
                                                    Expiry
                                                </Text>
                                                <Text
                                                    className="mt-0.5"
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font.medium,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {r.expiry_date}
                                                </Text>
                                            </View>

                                            <View className="items-end">
                                                <Text
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize: 9,
                                                        letterSpacing: 0.6,
                                                        textTransform:
                                                            'uppercase',
                                                    }}
                                                >
                                                    Qty · Cost · Retail
                                                </Text>
                                                <Text
                                                    className="mt-0.5"
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font.mono,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {num(r.quantity)} ·{' '}
                                                    {money(r.cost_value)} ·{' '}
                                                    {money(r.retail_value)}
                                                </Text>
                                            </View>
                                        </View>
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
                style={{
                    color: active ? color : theme.textDark,
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