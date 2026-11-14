// components/shopping/prescriptions/UserPrescriptionsMobileView.tsx

import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import type { PageSize, PrescriptionCounts, PrescriptionNormalized } from './UserPrescriptionsList';
import { FilterPill, formatDate, resolveImage } from './UserPrescriptionsWebView';

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
    loading: boolean;
}

export function UserPrescriptionsMobileView({
    query, setQuery, onlyPending, setOnlyPending, onRefresh, onOpenCreate, refreshing, counts, items, onPressItem, loading
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
            <View className="px-4 pt-3 pb-2 border-b" style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }}>
                <View className="flex-row items-center justify-between mb-2">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}>Prescriptions</Text>
                    <Pressable onPress={onRefresh} disabled={refreshing} className="px-3 py-1.5 rounded-full" style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.5 : 1 }}>
                        <Text className="uppercase tracking-widest text-white" style={{ fontFamily: theme.font.bold, fontSize: 10 }}>{refreshing ? '...' : 'Refresh'}</Text>
                    </Pressable>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-2" contentContainerStyle={{ paddingHorizontal: 4 }}>
                    <FilterPill label="All" active={!onlyPending} count={counts.total} tint={{ fg: theme.primary, dot: theme.primary, bg: theme.primarySoft }} onPress={() => setOnlyPending(() => false)} />
                    <FilterPill label="Queuing" active={onlyPending} count={counts.queuing} tint={{ fg: '#f59e0b', dot: '#f59e0b', bg: 'rgba(251,191,36,0.15)' }} onPress={() => setOnlyPending(() => true)} />
                </ScrollView>

                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search patient name…"
                    placeholderTextColor={theme.textSubtle}
                    className="h-9 rounded-lg border px-3 text-sm"
                    style={{ borderColor: theme.border, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium }}
                />
                {hasActiveFilter && (
                    <Pressable onPress={clearFilters} className="mt-1.5 self-start">
                        <Text className="uppercase tracking-widest text-[10px]" style={{ color: theme.primary, fontFamily: theme.font.bold }}>Clear filters</Text>
                    </Pressable>
                )}
            </View>

            <FlatList
                data={items}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={
                    <View className="p-8 items-center">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>
                            {hasActiveFilter ? 'No matches found' : 'No prescriptions yet'}
                        </Text>
                        <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: theme.fontSize.sm }}>
                            {hasActiveFilter ? 'Try adjusting your filters.' : 'Upload a prescription to get started.'}
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <MobilePrescriptionCard
                        item={item}
                        onPress={() => onPressItem(item)}
                    />
                )}
            />

            <Pressable
                onPress={onOpenCreate}
                className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg"
                style={{ backgroundColor: theme.primary, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 }}
            >
                <Ionicons name="add" size={28} color={theme.textInverse} />
            </Pressable>
        </View>
    );
}

function MobilePrescriptionCard({ item, onPress }: { item: PrescriptionNormalized, onPress: () => void }) {
    const { theme } = useAuth();
    const [imageError, setImageError] = useState(false);

    const thumb = resolveImage(item.images?.[0]);
    const isPending = item.status === 'QUEUING';
    const needsVerify = item.ai_extraction_status === 'COMPLETED' && item.prescription_items?.some((i: any) => i.is_verified === 'false');

    return (
        <Pressable
            onPress={onPress}
            className="rounded-2xl border mb-4 overflow-hidden"
            style={{
                backgroundColor: theme.panel,
                borderColor: theme.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 3,
            }}
        >
            <View className="w-full h-40 relative" style={{ backgroundColor: theme.surfaceAlt }}>
                {thumb && !imageError ? (
                    <Image
                        source={{ uri: thumb }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <View className="w-full h-full items-center justify-center">
                        <Ionicons name="document-text" size={48} color={theme.textSubtle} />
                        <Text className="mt-2 text-xs uppercase tracking-widest" style={{ color: theme.textSubtle, fontFamily: theme.font.medium }}>
                            No Image
                        </Text>
                    </View>
                )}

                <View className="absolute top-3 right-3 shadow-sm">
                    <View className="px-3 py-1 rounded-full" style={{ backgroundColor: isPending ? 'rgba(251,191,36,0.95)' : 'rgba(16,185,129,0.95)' }}>
                        <Text className="uppercase tracking-widest text-white" style={{ fontFamily: theme.font.bold, fontSize: 10 }}>
                            {item.status}
                        </Text>
                    </View>
                </View>
            </View>

            <View className="p-4">
                <View className="flex-row justify-between items-start mb-1">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18, flex: 1 }} numberOfLines={1}>
                        {item.patient_name}
                    </Text>
                </View>

                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {item.patient_gender} · DOB: {item.patient_date_of_birth}
                </Text>

                <View className="flex-row items-center flex-wrap gap-2 mt-4 pt-3 border-t" style={{ borderTopColor: theme.border }}>
                    <View className="flex-row items-center gap-1.5">
                        <Ionicons name="calendar-outline" size={14} color={theme.textDark} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {formatDate(item.created)}
                        </Text>
                    </View>

                    <View className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.border }} />

                    <View className="flex-row items-center gap-1.5">
                        <Ionicons name="medkit-outline" size={14} color={theme.textDark} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {item.prescription_items?.length || 0} Meds
                        </Text>
                    </View>

                    {needsVerify && (
                        <>
                            <View className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.border }} />
                            <View className="flex-row items-center gap-1">
                                <Ionicons name="alert-circle" size={14} color="#f59e0b" />
                                <Text style={{ color: '#f59e0b', fontFamily: theme.font.bold, fontSize: 12 }}>
                                    Verify
                                </Text>
                            </View>
                        </>
                    )}
                </View>
            </View>

            <View
                className="px-4 py-3 border-t flex-row items-center justify-between"
                style={{ borderTopColor: theme.border, backgroundColor: theme.surfaceAlt }}
            >
                <Text className="uppercase tracking-widest" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }}>
                    View Details
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.primary} />
            </View>
        </Pressable>
    );
}