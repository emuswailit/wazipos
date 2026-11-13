// components/retailers/customerOrderPayments/PaymentsFilterSheet.tsx
//
// Small-screen pieces for the Payments screen (native apps and narrow web), matching
// Inventory and Out of Stock:
//   - PaymentsCompactBar: search · filters button, plus one line of context.
//   - PaymentsFilterSheet: bottom sheet holding what used to be the header — title and
//     live status, filtered totals, status + payment-method filters, refresh.

import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatKES, PAYMENT_METHOD_FILTERS, PAYMENT_METHOD_ICONS, PAYMENT_METHOD_LABELS, type PaymentMethodFilter } from '../customerOrders/CustomerOrdersWebView';

const isWeb = Platform.OS === 'web';

/* =========================================================
 * Status filter (shared with CustomerOrderPaymentsList)
 * ======================================================= */

export type StatusFilter = 'ALL' | 'SUCCESS' | 'PENDING' | 'FAILED';

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'SUCCESS', label: 'Successful' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'FAILED', label: 'Failed' },
];

const STATUS_ICONS: Record<StatusFilter, keyof typeof Ionicons.glyphMap> = {
    ALL: 'apps-outline',
    SUCCESS: 'checkmark-circle-outline',
    PENDING: 'time-outline',
    FAILED: 'close-circle-outline',
};

const STATUS_COLORS: Record<StatusFilter, string | null> = {
    ALL: null, // theme primary
    SUCCESS: '#10b981',
    PENDING: '#f59e0b',
    FAILED: '#f43f5e',
};

export type ActiveLabel = { key: string; label: string; clear: () => void };

interface VisibleStats {
    count: number;
    total: number;
    received: number;
    pendingValue: number;
    failedValue: number;
    counts: Record<'SUCCESS' | 'PENDING' | 'FAILED', number>;
}

/* =========================================================
 * Compact bar
 * ======================================================= */

export function PaymentsCompactBar({
    query,
    setQuery,
    filterCount,
    onOpenFilters,
    isConnected,
    isOnline,
    summary,
    activeLabels,
}: {
    query: string;
    setQuery: (q: string) => void;
    filterCount: number;
    onOpenFilters: () => void;
    isConnected: boolean;
    isOnline: boolean;
    summary: string;
    activeLabels: ActiveLabel[];
}) {
    const { theme, isDarkMode } = useAuth();
    const searchBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const filtered = filterCount > 0;

    return (
        <View className="mb-3">
            <View className="flex-row items-center gap-2">
                <View className="flex-1 flex-row items-center h-11 rounded-2xl px-3.5" style={{ backgroundColor: searchBg }}>
                    <Ionicons name="search" size={17} color={theme.textDark} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search payments…"
                        placeholderTextColor="#94a3b8"
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        className="flex-1 h-full ml-2"
                        style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13, ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}) }}
                    />
                    {query ? (
                        <Pressable onPress={() => setQuery('')} hitSlop={10}>
                            <Ionicons name="close-circle" size={17} color={theme.textDark} />
                        </Pressable>
                    ) : null}
                </View>

                <Pressable
                    onPress={onOpenFilters}
                    accessibilityRole="button"
                    accessibilityLabel={filtered ? `Filters and totals, ${filterCount} applied` : 'Filters and totals'}
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: filtered ? `${theme.primary}18` : searchBg }}
                >
                    <Ionicons name="options-outline" size={19} color={filtered ? theme.primary : theme.text} />
                    {filtered ? (
                        <View
                            style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                minWidth: 16,
                                height: 16,
                                borderRadius: 8,
                                paddingHorizontal: 3,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: theme.primary,
                                borderWidth: 1.5,
                                borderColor: theme.background,
                            }}
                        >
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 9 }}>{filterCount}</Text>
                        </View>
                    ) : null}
                </Pressable>
            </View>

            {/* One line of context: live · count · total · active filters (tap ✕ to clear) */}
            <View className="flex-row items-center mt-2.5 px-1 gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isConnected ? '#10b981' : isOnline ? '#f59e0b' : '#94a3b8' }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {summary}
                </Text>
                <View className="flex-1" />
                {activeLabels.map((a) => (
                    <Pressable
                        key={a.key}
                        onPress={a.clear}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${a.label} filter`}
                        className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${theme.primary}18` }}
                    >
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }} numberOfLines={1}>
                            {a.label}
                        </Text>
                        <Ionicons name="close" size={12} color={theme.primary} />
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

/* =========================================================
 * Bottom sheet
 * ======================================================= */

export function PaymentsFilterSheet({
    visible,
    onClose,
    statusFilter,
    setStatusFilter,
    statusCounts,
    methodFilter,
    setMethodFilter,
    methodCounts,
    visibleStats,
    hasFilter,
    onReset,
    isConnected,
    isOnline,
    lastSynced,
    onRefresh,
}: {
    visible: boolean;
    onClose: () => void;
    statusFilter: StatusFilter;
    setStatusFilter: (f: StatusFilter) => void;
    statusCounts: Record<StatusFilter, number>;
    methodFilter: PaymentMethodFilter;
    setMethodFilter: (m: PaymentMethodFilter) => void;
    methodCounts: Record<PaymentMethodFilter, number>;
    visibleStats: VisibleStats;
    hasFilter: boolean;
    onReset: () => void;
    isConnected: boolean;
    isOnline: boolean;
    lastSynced: string | null;
    onRefresh: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const insets = useSafeAreaInsets();
    const divider = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)';
    const tileBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const anyFilter = statusFilter !== 'ALL' || methodFilter !== 'ALL';

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
                />
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderTopLeftRadius: 28,
                        borderTopRightRadius: 28,
                        paddingBottom: insets.bottom + 12,
                        maxHeight: '88%',
                        width: '100%',
                        maxWidth: 640,
                        alignSelf: 'center',
                    }}
                >
                    <View className="items-center pt-2.5 pb-1">
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1' }} />
                    </View>

                    {/* Title + live status (was the screen header) */}
                    <View className="flex-row items-center px-5 pt-2 pb-3">
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>Payments</Text>
                            <View className="flex-row items-center gap-1.5 mt-0.5">
                                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isConnected ? '#10b981' : '#f59e0b' }} />
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {isConnected ? 'Live' : isOnline ? 'Connecting…' : 'Offline'}
                                    {lastSynced ? ` · ${lastSynced}` : ''} · latest 50
                                </Text>
                            </View>
                        </View>
                        {anyFilter ? (
                            <Pressable onPress={onReset} hitSlop={8} style={{ marginRight: 16 }}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Reset</Text>
                            </Pressable>
                        ) : null}
                        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={theme.textDark} />
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                        {/* Totals for what's shown (they follow the filters) */}
                        <View className="flex-row flex-wrap px-1 mb-4" style={{ gap: 8 }}>
                            <Tile
                                label={hasFilter ? 'Shown' : 'All payments'}
                                value={`KES ${formatKES(visibleStats.total)}`}
                                sub={`${visibleStats.count} payment${visibleStats.count === 1 ? '' : 's'}`}
                                color={theme.text}
                                bg={tileBg}
                            />
                            <Tile label="Received" value={`KES ${formatKES(visibleStats.received)}`} sub={`${visibleStats.counts.SUCCESS} successful`} color="#10b981" bg={tileBg} />
                            <Tile label="Pending" value={`KES ${formatKES(visibleStats.pendingValue)}`} sub={`${visibleStats.counts.PENDING} pending`} color="#b45309" bg={tileBg} />
                            <Tile label="Failed" value={`KES ${formatKES(visibleStats.failedValue)}`} sub={`${visibleStats.counts.FAILED} failed`} color="#e11d48" bg={tileBg} />
                        </View>

                        <SheetHeading text="Status" />
                        {STATUS_FILTERS.map((f) => (
                            <OptionRow
                                key={f.key}
                                label={f.label}
                                icon={STATUS_ICONS[f.key]}
                                color={STATUS_COLORS[f.key] ?? theme.primary}
                                count={statusCounts[f.key] ?? 0}
                                active={statusFilter === f.key}
                                onPress={() => setStatusFilter(f.key)}
                                divider={divider}
                            />
                        ))}

                        <View style={{ height: 12 }} />
                        <SheetHeading text="Payment method" />
                        {PAYMENT_METHOD_FILTERS.map((m) => (
                            <OptionRow
                                key={m}
                                label={PAYMENT_METHOD_LABELS[m]}
                                icon={PAYMENT_METHOD_ICONS[m]}
                                color={theme.primary}
                                count={methodCounts[m] ?? 0}
                                active={methodFilter === m}
                                onPress={() => setMethodFilter(m)}
                                divider={divider}
                            />
                        ))}

                        {/* Refresh */}
                        <View className="flex-row items-center mx-2 mt-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>You can also pull down on the list.</Text>
                            <Pressable
                                onPress={onRefresh}
                                disabled={!isOnline}
                                accessibilityRole="button"
                                accessibilityLabel="Refresh payments"
                                className="flex-row items-center gap-1.5 px-3 h-9 rounded-full"
                                style={{ backgroundColor: `${theme.primary}14`, opacity: isOnline ? 1 : 0.5 }}
                            >
                                <Ionicons name="refresh" size={15} color={theme.primary} />
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Refresh</Text>
                            </Pressable>
                        </View>
                    </ScrollView>

                    {/* Status and method are picked together, so the sheet stays open until Done */}
                    <View className="px-4 pt-2">
                        <Pressable onPress={onClose} accessibilityRole="button" className="h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: theme.primary }}>
                            <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 14 }}>
                                Show {visibleStats.count} payment{visibleStats.count === 1 ? '' : 's'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Pieces
 * ======================================================= */

function SheetHeading({ text }: { text: string }) {
    const { theme } = useAuth();
    return (
        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 8, marginBottom: 6 }}>
            {text}
        </Text>
    );
}

function OptionRow({
    label,
    icon,
    color,
    count,
    active,
    onPress,
    divider,
}: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    count: number;
    active: boolean;
    onPress: () => void;
    divider: string;
}) {
    const { theme } = useAuth();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            className="flex-row items-center px-3 py-2.5 rounded-2xl mb-1"
            style={({ pressed }) => ({ backgroundColor: active ? `${color}14` : pressed ? divider : 'transparent' })}
        >
            <View className="w-8 h-8 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: `${color}18` }}>
                <Ionicons name={icon} size={16} color={color} />
            </View>
            <Text style={{ flex: 1, color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{label}</Text>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginRight: 10 }}>{count.toLocaleString()}</Text>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? color : theme.textDark} />
        </Pressable>
    );
}

function Tile({ label, value, sub, color, bg }: { label: string; value: string; sub: string; color: string; bg: string }) {
    const { theme } = useAuth();
    return (
        <View className="rounded-2xl px-3.5 py-3" style={{ backgroundColor: bg, flexGrow: 1, flexBasis: '45%' }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                {value}
            </Text>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                {sub}
            </Text>
        </View>
    );
}
