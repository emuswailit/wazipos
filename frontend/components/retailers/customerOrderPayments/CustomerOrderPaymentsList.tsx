// components/retailers/customerOrderPayments/CustomerOrderPaymentsList.tsx
//
// Payments screen: the latest 50 customer order payments received by the business,
// live over WebSocket. Table on wide web screens, cards on phones / narrow web.

import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { PaymentsCompactBar, PaymentsFilterSheet, STATUS_FILTERS, type ActiveLabel, type StatusFilter } from './PaymentsFilterSheet';

import {
    Avatar,
    formatDate,
    formatKES,
    MethodFilter,
    PAYMENT_METHOD_FILTERS,
    PAYMENT_METHOD_LABELS,
    type PaymentMethodFilter,
} from '../customerOrders/CustomerOrdersWebView';
import { useCustomerOrderPayments, type CustomerOrderPaymentItem } from './useCustomerOrderPayments';

const LARGE_SCREEN_MIN_WIDTH = 768;
const MAX_WIDTH = 1600;
const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};


/** Group a raw provider status into the four the screen shows. */
function statusGroup(status: string | null | undefined): Exclude<StatusFilter, 'ALL'> | 'OTHER' {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'COMPLETED' || s === 'PAID') return 'SUCCESS';
    if (s === 'PENDING' || s === 'PROCESSING' || s === 'INITIATED' || s === '') return 'PENDING';
    if (s === 'FAILED' || s === 'CANCELLED' || s === 'REVERSED' || s === 'DECLINED') return 'FAILED';
    return 'OTHER';
}

const STATUS_STYLE = {
    SUCCESS: { fg: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Successful' },
    PENDING: { fg: '#f59e0b', bg: 'rgba(245,158,11,0.14)', label: 'Pending' },
    FAILED: { fg: '#f43f5e', bg: 'rgba(244,63,94,0.12)', label: 'Failed' },
    OTHER: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.15)', label: '' },
} as const;

const amountOf = (p: CustomerOrderPaymentItem): number => {
    const n = parseFloat(String(p.amount ?? 0));
    return Number.isNaN(n) ? 0 : n;
};

const timeOf = (raw: string | null | undefined): string => {
    if (!raw) return '';
    const d = new Date(String(raw).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const referenceOf = (p: CustomerOrderPaymentItem): string =>
    p.provider_reference_number || p.psp_reference_number || p.reference_number || '—';

/** Same rule as the Customer Orders screen: titles CASH / CREDIT / MOBILE MONEY (+ M-PESA, Airtel). */
function matchesMethod(p: CustomerOrderPaymentItem, filter: PaymentMethodFilter): boolean {
    if (filter === 'ALL') return true;
    const title = String(p.payment_method_title || '').trim().toUpperCase();
    if (filter === 'MOBILE MONEY') return title === 'MOBILE MONEY' || /MOBILE|M-?PESA|AIRTEL/.test(title);
    return title === filter;
}

function matchesQuery(p: CustomerOrderPaymentItem, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [p.order_number, p.customer_name, p.customer_phone, p.payment_method_title, p.reference_number, p.psp_reference_number, p.provider_reference_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
}

/* =========================================================
 * Screen
 * ======================================================= */

export default function CustomerOrderPaymentsList() {
    const { token, theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = isWeb && width >= LARGE_SCREEN_MIN_WIDTH;

    const { payments, isConnected, isLoading, lastSynced, authRejected, isOnline, refresh } = useCustomerOrderPayments(token);

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [methodFilter, setMethodFilter] = useState<PaymentMethodFilter>('ALL');
    const [filtersOpen, setFiltersOpen] = useState(false);

    const sorted = useMemo(
        () => [...payments].sort((a, b) => String(b.created).localeCompare(String(a.created))),
        [payments]
    );

    const matchesStatus = (p: CustomerOrderPaymentItem) => statusFilter === 'ALL' || statusGroup(p.status) === statusFilter;

    const visible = useMemo(
        () =>
            sorted.filter(
                (p) => matchesStatus(p) && matchesMethod(p, methodFilter) && matchesQuery(p, query.trim())
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sorted, statusFilter, methodFilter, query]
    );

    // Per-method counts after the search and status filter, so each chip shows what picking it would give.
    const methodCounts = useMemo(() => {
        const counts = {} as Record<PaymentMethodFilter, number>;
        for (const m of PAYMENT_METHOD_FILTERS) counts[m] = 0;
        for (const p of payments) {
            if (!matchesStatus(p) || !matchesQuery(p, query.trim())) continue;
            for (const m of PAYMENT_METHOD_FILTERS) if (matchesMethod(p, m)) counts[m] += 1;
        }
        return counts;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payments, statusFilter, query]);

    const hasFilter = !!query.trim() || statusFilter !== 'ALL' || methodFilter !== 'ALL';

    const stats = useMemo(() => {
        let received = 0;
        const counts = { SUCCESS: 0, PENDING: 0, FAILED: 0 } as Record<'SUCCESS' | 'PENDING' | 'FAILED', number>;
        for (const p of payments) {
            const g = statusGroup(p.status);
            if (g === 'SUCCESS') received += amountOf(p);
            if (g !== 'OTHER') counts[g] += 1;
        }
        return { received, counts };
    }, [payments]);

    // Totals for what's currently shown (after search, status and method filters).
    const visibleStats = useMemo(() => {
        let total = 0;
        let received = 0;
        let pendingValue = 0;
        let failedValue = 0;
        const counts = { SUCCESS: 0, PENDING: 0, FAILED: 0 } as Record<'SUCCESS' | 'PENDING' | 'FAILED', number>;
        for (const p of visible) {
            const amount = amountOf(p);
            total += amount;
            const g = statusGroup(p.status);
            if (g === 'SUCCESS') received += amount;
            if (g === 'PENDING') pendingValue += amount;
            if (g === 'FAILED') failedValue += amount;
            if (g !== 'OTHER') counts[g] += 1;
        }
        return { count: visible.length, total, received, pendingValue, failedValue, counts };
    }, [visible]);

    const borderColor = isDarkMode ? '#1e293b' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <SyncNotice isOnline={isOnline} isConnected={isConnected} authRejected={authRejected} lastSynced={lastSynced} />

            <View className={`flex-1 w-full self-center ${isLarge ? 'px-6 pt-4 pb-4' : 'px-4 pt-3'}`} style={{ maxWidth: MAX_WIDTH }}>
                {isLarge ? (
                <>
                {/* Header */}
                <View className="flex-row items-center gap-3 mb-3 flex-wrap">
                    <View className="flex-1 min-w-[160px]">
                        <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: isLarge ? 18 : 22 }}>
                            Payments
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-0.5">
                            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: isConnected ? '#10b981' : '#f59e0b' }} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {isConnected ? 'Live' : isOnline ? 'Connecting…' : 'Offline'}
                                {lastSynced ? ` · ${lastSynced}` : ''} · latest 50
                            </Text>
                        </View>
                    </View>
                    <Pressable
                        onPress={refresh}
                        disabled={!isOnline}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh payments"
                        className="flex-row items-center gap-1.5 px-3 h-9 rounded-lg"
                        style={{ backgroundColor: theme.primary, opacity: isOnline ? 1 : 0.5, ...webPointer }}
                    >
                        <Ionicons name="refresh" size={14} color="#fff" />
                        {isLarge ? <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12 }}>Refresh</Text> : null}
                    </Pressable>
                </View>

                {/* Summary: totals for what's shown (follows the filters) */}
                <View className="flex-row gap-2 mb-3 flex-wrap items-center">
                    <Stat
                        label={hasFilter ? 'Payments (filtered)' : 'Payments'}
                        value={`${visibleStats.count} · KES ${formatKES(visibleStats.total)}`}
                    />
                    <Stat label="Received" value={`KES ${formatKES(visibleStats.received)}`} color="#10b981" />
                    <Stat
                        label="Pending"
                        value={`${visibleStats.counts.PENDING} · KES ${formatKES(visibleStats.pendingValue)}`}
                        color={visibleStats.counts.PENDING ? '#b45309' : undefined}
                    />
                    <Stat
                        label="Failed"
                        value={`${visibleStats.counts.FAILED} · KES ${formatKES(visibleStats.failedValue)}`}
                        color={visibleStats.counts.FAILED ? '#e11d48' : undefined}
                    />
                </View>

                {/* Toolbar */}
                <View className={`gap-2 mb-3 ${isLarge ? 'flex-row items-center' : ''}`}>
                    <View className="flex-row items-center h-10 rounded-xl px-3 flex-1" style={{ backgroundColor: inputBg, maxWidth: isLarge ? 360 : undefined }}>
                        <Ionicons name="search" size={16} color={theme.textDark} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search order #, customer, phone, reference…"
                            placeholderTextColor="#94a3b8"
                            autoCorrect={false}
                            autoCapitalize="none"
                            className="flex-1 h-full ml-2"
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: isLarge ? 13 : 16,
                                ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}),
                            }}
                        />
                        {query ? (
                            <Pressable onPress={() => setQuery('')} hitSlop={8} style={webPointer}>
                                <Ionicons name="close-circle" size={16} color={theme.textDark} />
                            </Pressable>
                        ) : null}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {STATUS_FILTERS.map((f) => {
                            const active = f.key === statusFilter;
                            const count = f.key === 'ALL' ? payments.length : stats.counts[f.key];
                            return (
                                <Pressable
                                    key={f.key}
                                    onPress={() => setStatusFilter(f.key)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    className="flex-row items-center gap-1.5 px-3 h-9 rounded-full border"
                                    style={{
                                        borderColor: active ? theme.primary : borderColor,
                                        backgroundColor: active ? `${theme.primary}12` : 'transparent',
                                        ...webPointer,
                                    }}
                                >
                                    <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{f.label}</Text>
                                    <Text style={{ color: active ? theme.primary : theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{count}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Payment method */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-3 flex-grow-0"
                    contentContainerStyle={{ alignItems: 'center' }}
                >
                    <MethodFilter value={methodFilter} onChange={setMethodFilter} counts={methodCounts} />
                    {hasFilter ? (
                        <Pressable
                            onPress={() => {
                                setQuery('');
                                setStatusFilter('ALL');
                                setMethodFilter('ALL');
                            }}
                            hitSlop={6}
                            className="ml-3"
                            style={webPointer}
                        >
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear filters</Text>
                        </Pressable>
                    ) : null}
                </ScrollView>
                </>
                ) : (
                    /* Small screens: one slim bar; title, totals and filters live in the sheet */
                    <PaymentsCompactBar
                        query={query}
                        setQuery={setQuery}
                        filterCount={(statusFilter !== 'ALL' ? 1 : 0) + (methodFilter !== 'ALL' ? 1 : 0)}
                        onOpenFilters={() => setFiltersOpen(true)}
                        isConnected={isConnected}
                        isOnline={isOnline}
                        summary={`${visibleStats.count} payment${visibleStats.count === 1 ? '' : 's'} · KES ${formatKES(visibleStats.total)}`}
                        activeLabels={
                            [
                                statusFilter !== 'ALL'
                                    ? { key: 'status', label: STATUS_FILTERS.find((f) => f.key === statusFilter)?.label ?? '', clear: () => setStatusFilter('ALL') }
                                    : null,
                                methodFilter !== 'ALL' ? { key: 'method', label: PAYMENT_METHOD_LABELS[methodFilter], clear: () => setMethodFilter('ALL') } : null,
                            ].filter(Boolean) as ActiveLabel[]
                        }
                    />
                )}

                {/* List */}
                {isLoading && payments.length === 0 ? (
                    <View className="py-16 items-center">
                        <ActivityIndicator color={theme.primary} />
                    </View>
                ) : isLarge ? (
                    <PaymentsTable payments={visible} hasFilter={hasFilter} />
                ) : (
                    <FlatList
                        data={visible}
                        keyExtractor={(p) => String(p.id)}
                        renderItem={({ item }) => <PaymentCard payment={item} />}
                        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                        contentContainerStyle={{ paddingBottom: 32 }}
                        ListEmptyComponent={<EmptyState hasFilter={hasFilter} />}
                        showsVerticalScrollIndicator={false}
                        refreshing={false}
                        onRefresh={isOnline ? refresh : undefined}
                    />
                )}
            </View>

            {!isLarge ? (
                <PaymentsFilterSheet
                    visible={filtersOpen}
                    onClose={() => setFiltersOpen(false)}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    statusCounts={{ ALL: payments.length, ...stats.counts }}
                    methodFilter={methodFilter}
                    setMethodFilter={setMethodFilter}
                    methodCounts={methodCounts}
                    visibleStats={visibleStats}
                    hasFilter={hasFilter}
                    onReset={() => {
                        setStatusFilter('ALL');
                        setMethodFilter('ALL');
                    }}
                    isConnected={isConnected}
                    isOnline={isOnline}
                    lastSynced={lastSynced}
                    onRefresh={refresh}
                />
            ) : null}
        </View>
    );
}

/* =========================================================
 * Pieces
 * ======================================================= */

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}

function StatusBadge({ status }: { status: string | null }) {
    const { theme } = useAuth();
    const group = statusGroup(status);
    const style = STATUS_STYLE[group];
    return (
        <View className="self-start rounded-full px-2 py-0.5" style={{ backgroundColor: style.bg }}>
            <Text className="uppercase tracking-wide" style={{ color: style.fg, fontFamily: theme.font.bold, fontSize: 10 }} numberOfLines={1}>
                {style.label || status || 'Unknown'}
            </Text>
        </View>
    );
}

const COLS = { when: 1.2, order: 1.2, customer: 1.8, method: 1.1, reference: 1.4, status: 1, amount: 1.1 } as const;

function PaymentsTable({ payments, hasFilter }: { payments: CustomerOrderPaymentItem[]; hasFilter: boolean }) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#1e293b' : '#e2e8f0';
    const headerBg = isDarkMode ? '#0b1220' : '#f8fafc';

    const Head = ({ flex, children, align = 'left' }: { flex: number; children: React.ReactNode; align?: 'left' | 'right' }) => (
        <Text
            style={{ flex, textAlign: align, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', paddingRight: align === 'right' ? 0 : 12 }}
            numberOfLines={1}
        >
            {children}
        </Text>
    );

    return (
        <View
            className="flex-1 rounded-2xl border overflow-hidden"
            style={{
                backgroundColor: theme.panel,
                borderColor,
                ...(isWeb ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)' } as any) : {}),
            }}
        >
            <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                <Head flex={COLS.when}>Date</Head>
                <Head flex={COLS.order}>Order</Head>
                <Head flex={COLS.customer}>Customer</Head>
                <Head flex={COLS.method}>Method</Head>
                <Head flex={COLS.reference}>Reference</Head>
                <Head flex={COLS.status}>Status</Head>
                <Head flex={COLS.amount} align="right">Amount</Head>
            </View>
            <FlatList
                data={payments}
                keyExtractor={(p) => String(p.id)}
                ListEmptyComponent={<EmptyState hasFilter={hasFilter} />}
                renderItem={({ item, index }) => (
                    <View
                        className="flex-row items-center px-5 py-3"
                        style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: isDarkMode ? '#1e293b' : '#f1f5f9' }}
                    >
                        <View style={{ flex: COLS.when, paddingRight: 12 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                {formatDate(item.created)}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 2 }}>{timeOf(item.created)}</Text>
                        </View>
                        <Text style={{ flex: COLS.order, color: theme.text, fontFamily: theme.font.medium, fontSize: 13, paddingRight: 12 }} numberOfLines={1}>
                            {item.order_number || '—'}
                        </Text>
                        <View style={{ flex: COLS.customer, paddingRight: 12 }} className="flex-row items-center gap-2.5">
                            <Avatar name={item.customer_name} size={30} />
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                    {item.customer_name || 'Walk-in Customer'}
                                </Text>
                                {item.customer_phone ? (
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                                        {item.customer_phone}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                        <Text style={{ flex: COLS.method, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 12 }} numberOfLines={1}>
                            {item.payment_method_title || '—'}
                            {item.telco ? ` · ${item.telco}` : ''}
                        </Text>
                        <Text style={{ flex: COLS.reference, color: theme.textDark, fontFamily: theme.font.mono, fontSize: 12, paddingRight: 12 }} numberOfLines={1}>
                            {referenceOf(item)}
                        </Text>
                        <View style={{ flex: COLS.status, paddingRight: 12 }}>
                            <StatusBadge status={item.status} />
                        </View>
                        <Text style={{ flex: COLS.amount, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                            KES {formatKES(amountOf(item))}
                        </Text>
                    </View>
                )}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

function PaymentCard({ payment }: { payment: CustomerOrderPaymentItem }) {
    const { theme, isDarkMode } = useAuth();
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    const group = statusGroup(payment.status);
    const failedReason = group === 'FAILED' ? payment.description || payment.narration : '';

    return (
        <View
            style={{
                backgroundColor: theme.panel,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDarkMode ? '#1e293b' : '#eef2f7',
                ...(isWeb
                    ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.05)' } as any)
                    : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }),
            }}
        >
            <View className="p-4">
                <View className="flex-row items-center gap-3">
                    <Avatar name={payment.customer_name} size={40} />
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>
                            {payment.customer_name || 'Walk-in Customer'}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                            {payment.order_number || 'Order'} · {payment.payment_method_title || '—'}
                            {payment.telco ? ` · ${payment.telco}` : ''}
                        </Text>
                    </View>
                    <View className="items-end">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>KES {formatKES(amountOf(payment))}</Text>
                        <View className="mt-1">
                            <StatusBadge status={payment.status} />
                        </View>
                    </View>
                </View>

                <View className="flex-row items-center mt-3 pt-3 gap-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <Ionicons name="calendar-outline" size={13} color={theme.textDark} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {formatDate(payment.created)} {timeOf(payment.created)}
                    </Text>
                    <View className="flex-1" />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.mono, fontSize: 11 }} numberOfLines={1}>
                        {referenceOf(payment)}
                    </Text>
                </View>

                {failedReason ? (
                    <Text className="mt-2" style={{ color: '#e11d48', fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                        {failedReason}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
    const { theme } = useAuth();
    return (
        <View className="py-16 items-center px-6">
            <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={hasFilter ? 'search' : 'cash-outline'} size={22} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                {hasFilter ? 'No matching payments' : 'No payments yet'}
            </Text>
            <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                {hasFilter ? 'Try a different search or status.' : 'Payments for customer orders will appear here as they arrive.'}
            </Text>
        </View>
    );
}

function SyncNotice({
    isOnline,
    isConnected,
    authRejected,
    lastSynced,
}: {
    isOnline: boolean;
    isConnected: boolean;
    authRejected: boolean;
    lastSynced: string | null;
}) {
    const { theme } = useAuth();
    if (isOnline && isConnected) return null;
    const since = lastSynced ? ` since ${lastSynced}` : '';
    const n = !isOnline
        ? { fg: '#be123c', bg: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.35)', text: `You're offline. Payments may have changed on the server${since}. They'll update automatically when you're back online.` }
        : authRejected
            ? { fg: '#be123c', bg: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.35)', text: `Your session has expired, so payments can't sync. Log in again to see the latest payments.` }
            : { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', text: `Connecting… payments may be out of date${since}.` };
    return (
        <View accessibilityRole="alert" className="px-4 py-2.5 border-b" style={{ backgroundColor: n.bg, borderBottomColor: n.border }}>
            <Text style={{ color: n.fg, fontFamily: theme.font.bold, fontSize: 12 }}>{n.text}</Text>
        </View>
    );
}
