// components/shopping/prescriptions/UserPrescriptionsWebView.tsx

import type { DimensionValue } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { PaginationBar } from '@/components/common/PaginationBar';
import type { PageSize, PrescriptionCounts, PrescriptionNormalized } from './UserPrescriptionsList';

const TABLE_MAX_WIDTH = 1400;
const COLS = {
    patient: '28%',
    status: '12%',
    ai: '18%',
    meds: '10%',
    created: '16%',
    actions: '16%',
} as const;

export function formatDate(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function resolveImage(raw: any): string | null {
    if (!raw) return null;
    const p = typeof raw === 'string' ? raw : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    return `https://api.wazipos.co.ke/${p.replace(/^\/+/, '')}`;
}

export function FilterPill({ label, active, count, tint, onPress }: any) {
    const { theme } = useAuth();
    const fg = active ? tint.fg : theme.textDark;
    return (
        <Pressable onPress={onPress} className="flex-row items-center px-2.5 py-1 mr-2 rounded-full border" style={{ backgroundColor: active ? tint.bg : 'transparent', borderColor: active ? tint.fg + '55' : theme.border }}>
            <View className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: active ? tint.fg : tint.dot }} />
            <Text className="uppercase tracking-wide" style={{ color: fg, fontFamily: theme.font.bold, fontSize: 10 }}>{label}</Text>
            {count > 0 ? <Text style={{ color: fg, opacity: 0.7, marginLeft: 6, fontFamily: theme.font.bold, fontSize: 9 }}>{count}</Text> : null}
        </Pressable>
    );
}

function StatusPill({ label, tone }: { label: string; tone: 'open' | 'closed' | 'special' }) {
    const { theme } = useAuth();
    const bg = tone === 'open' ? 'rgba(16,185,129,0.12)' : tone === 'special' ? 'rgba(251,191,36,0.15)' : 'rgba(148,163,184,0.15)';
    const color = tone === 'open' ? '#10b981' : tone === 'special' ? '#f59e0b' : theme.textDark;
    return (
        <View className="self-start rounded" style={{ backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text className="uppercase tracking-widest" style={{ color, fontFamily: theme.font.bold, fontSize: 9 }}>{label}</Text>
        </View>
    );
}

function ImageWithFallback({ uri, size, fallback }: { uri: string | null, size: number, fallback: string }) {
    const [errored, setErrored] = useState(false);

    if (!uri || errored) {
        return <Text style={{ fontSize: size / 2, opacity: 0.4 }}>{fallback}</Text>;
    }

    return (
        <Image
            source={{ uri }}
            style={{ width: size, height: size }}
            resizeMode="cover"
            onError={() => setErrored(true)}
        />
    );
}

interface Props {
    query: string;
    setQuery: (v: string) => void;
    onlyPending: boolean;
    setOnlyPending: (fn: (v: boolean) => boolean) => void;
    onRefresh: () => void;
    onOpenCreate: () => void;
    refreshing: boolean;
    counts: PrescriptionCounts;
    items: PrescriptionNormalized[];
    onPressItem: (item: PrescriptionNormalized) => void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
    loading: boolean;
}

export function UserPrescriptionsWebView({
    query, setQuery, onlyPending, setOnlyPending, onRefresh, onOpenCreate, refreshing, counts, items, onPressItem, page, pageSize, totalItems, totalPages, pageStart, pageEnd, onPrev, onNext, onPageSizeChange, loading
}: Props) {
    const { theme } = useAuth();
    const hasActiveFilter = onlyPending || query.trim() !== '';

    const clearFilters = () => {
        if (onlyPending) setOnlyPending((v) => !v);
        if (query.trim() !== '') setQuery('');
    };

    if (loading && !refreshing) {
        return (
            <View className="flex-1 justify-center items-center" style={{ backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="p-4 border-b" style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }}>
                <View className="w-full self-center" style={{ maxWidth: TABLE_MAX_WIDTH }}>
                    <View className="flex-row items-center justify-between mb-3 gap-3">
                        <View className="flex-row items-center gap-3">
                            <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}>Prescriptions</Text>
                            <FilterPill label="Total" active={!onlyPending} count={counts.total} tint={{ fg: theme.primary, dot: theme.primary, bg: theme.primarySoft }} onPress={() => setOnlyPending(() => false)} />
                            <FilterPill label="Queuing" active={onlyPending} count={counts.queuing} tint={{ fg: '#f59e0b', dot: '#f59e0b', bg: 'rgba(251,191,36,0.15)' }} onPress={() => setOnlyPending(() => true)} />
                        </View>
                        <View className="flex-row items-center gap-2">
                            <TextInput
                                value={query} onChangeText={setQuery} placeholder="Search patient name…" placeholderTextColor={theme.textSubtle}
                                className="h-10 rounded-xl border px-3.5 w-[280px]"
                                style={{ borderColor: theme.border, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }}
                            />
                            <Pressable onPress={onOpenCreate} className="px-4 py-2.5 rounded-xl border flex-row items-center gap-1.5" style={{ borderColor: theme.primary, backgroundColor: theme.primarySoft }}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }}>+</Text>
                                <Text className="uppercase tracking-widest" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }}>Add New</Text>
                            </Pressable>
                            <Pressable onPress={onRefresh} disabled={refreshing} className="px-4 py-2.5 rounded-xl" style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.5 : 1 }}>
                                {refreshing ? <ActivityIndicator size="small" color="#fff" /> : <Text className="uppercase tracking-widest text-white" style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }}>Refresh</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />} contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: 'center' }}>
                <View className="w-full" style={{ maxWidth: TABLE_MAX_WIDTH }}>
                    <View className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border }}>
                        <View className="flex-row px-3 py-2.5 border-b" style={{ backgroundColor: theme.surfaceAlt, borderBottomColor: theme.border }}>
                            <Text style={{ ...headerStyle(theme, COLS.patient) }}>Patient</Text>
                            <Text style={{ ...headerStyle(theme, COLS.status) }}>Status</Text>
                            <Text style={{ ...headerStyle(theme, COLS.ai) }}>AI Status</Text>
                            <Text style={{ ...headerStyle(theme, COLS.meds), textAlign: 'center' }}>Meds</Text>
                            <Text style={{ ...headerStyle(theme, COLS.created) }}>Created</Text>
                            <Text style={{ ...headerStyle(theme, COLS.actions), textAlign: 'right' }}>Action</Text>
                        </View>

                        {items.length === 0 ? (
                            <View className="p-8 items-center" style={{ backgroundColor: theme.panel }}>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }}>
                                    {hasActiveFilter ? 'No prescriptions match the filters.' : 'No prescriptions yet.'}
                                </Text>
                                {hasActiveFilter && (
                                    <Pressable onPress={clearFilters} className="mt-4 px-4 py-2.5 rounded-full" style={{ backgroundColor: theme.primary, minHeight: 40 }}>
                                        <Text className="uppercase tracking-widest text-white" style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }}>Clear filters</Text>
                                    </Pressable>
                                )}
                            </View>
                        ) : (
                            items.map((item, index) => {
                                const isLast = index === items.length - 1;
                                const isPending = item.status === 'QUEUING';
                                const needsVerify = item.ai_extraction_status === 'COMPLETED' && item.prescription_items?.some((i: any) => i.is_verified === 'false');
                                const thumb = resolveImage(item.images?.[0]);

                                return (
                                    <View key={item.id} className="flex-row px-3 py-3 items-center" style={{ borderBottomWidth: isLast ? 0 : 1, borderBottomColor: theme.border, backgroundColor: theme.panel }}>
                                        <View className="flex-row items-center" style={{ width: COLS.patient }}>
                                            <View className="w-10 h-10 rounded-lg mr-3 overflow-hidden items-center justify-center border" style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}>
                                                <ImageWithFallback uri={thumb} size={40} fallback="📄" />
                                            </View>
                                            <View className="flex-1">
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>{item.patient_name}</Text>
                                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>{item.patient_gender} · {item.patient_date_of_birth}</Text>
                                            </View>
                                        </View>

                                        <View style={{ width: COLS.status }}>
                                            <StatusPill label={item.status} tone={isPending ? 'special' : 'closed'} />
                                        </View>

                                        <View style={{ width: COLS.ai }}>
                                            <Text style={{ color: needsVerify ? '#f59e0b' : theme.textDark, fontFamily: needsVerify ? theme.font.bold : theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                                                {needsVerify ? 'Needs Verification' : item.ai_extraction_status || 'PENDING'}
                                            </Text>
                                        </View>

                                        <Text style={{ ...cellStyle(theme, COLS.meds), textAlign: 'center', fontFamily: theme.font.bold }}>
                                            {item.prescription_items?.length || 0}
                                        </Text>

                                        <Text style={cellStyle(theme, COLS.created)}>{formatDate(item.created)}</Text>

                                        <View style={{ width: COLS.actions, alignItems: 'flex-end' }}>
                                            <Pressable onPress={() => onPressItem(item)} hitSlop={6}>
                                                <Text className="uppercase tracking-wide" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }}>View</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                    <PaginationBar page={page} pageSize={pageSize} totalItems={totalItems} totalPages={totalPages} pageStart={pageStart} pageEnd={pageEnd} onPrev={onPrev} onNext={onNext} onPageSizeChange={onPageSizeChange} />
                </View>
            </ScrollView>
        </View>
    );
}

function headerStyle(theme: any, width: DimensionValue) {
    return { width, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.3 };
}

function cellStyle(theme: any, width: DimensionValue) {
    return { width, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingRight: 8 };
}