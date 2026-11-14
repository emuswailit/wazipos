// components/retailers/wholesaleDiscovery/PlacePickerSheet.tsx
//
// Searchable list of counties or sub-counties in a sheet (bottom sheet on
// phones, centred card on wide screens). "All" clears the choice.

import type { PlaceOption } from '@/api/wholesaleDiscoveryApi';
import { AdminSheet, SearchField, useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

interface Props<T extends PlaceOption> {
    visible: boolean;
    title: string;
    allLabel: string;
    options: T[];
    selectedId?: string | null;
    loading?: boolean;
    onPick: (option: T | null) => void;
    onClose: () => void;
}

export function PlacePickerSheet<T extends PlaceOption>({ visible, title, allLabel, options, selectedId, loading, onPick, onClose }: Props<T>) {
    const { theme, divider } = useListTokens();
    const [q, setQ] = useState('');

    useEffect(() => {
        if (visible) setQ('');
    }, [visible]);

    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        return t ? options.filter((o) => o.title.toLowerCase().includes(t)) : options;
    }, [options, q]);

    const row = (key: string, label: string, active: boolean, onPress: () => void) => (
        <Pressable
            key={key}
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            className="flex-row items-center px-1 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: divider, ...webPointer }}
        >
            <Text className="flex-1" style={{ color: active ? theme.primary : theme.text, fontFamily: active ? theme.font.bold : theme.font.medium, fontSize: 14 }}>
                {label}
            </Text>
            {active ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
        </Pressable>
    );

    return (
        <AdminSheet visible={visible} onClose={onClose} title={title} icon="location-outline" width={480} scroll={false}>
            <View style={{ gap: 10, flexShrink: 1 }}>
                <SearchField value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}…`} variant="mobile" />
                {loading ? (
                    <ActivityIndicator color={theme.primary} style={{ paddingVertical: 24 }} />
                ) : (
                    <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                        {!q.trim() ? row('__all', allLabel, !selectedId, () => onPick(null)) : null}
                        {filtered.map((o) => row(o.id, o.title, o.id === selectedId, () => onPick(o)))}
                        {!filtered.length ? (
                            <Text className="text-center py-6" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                                Nothing matches “{q.trim()}”.
                            </Text>
                        ) : null}
                    </ScrollView>
                )}
            </View>
        </AdminSheet>
    );
}

export default PlacePickerSheet;
