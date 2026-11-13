// components/common/listScreen/FilterSheetParts.tsx
//
// Building blocks for phone list headers that keep extra controls in a bottom sheet:
//   header:  <FilterButton> next to the search field, <ActiveFilterPill> on the context line
//   sheet:   <SheetTile> stats, <SheetChoiceGroup> radio lists, <SheetSyncRow> sync + refresh

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconName } from './AdminListView';
import { useListTokens, webPointer } from './tokens';

/** Square "options" button; shows a dot while any sheet filter is on. */
export function FilterButton({ active, onPress, label = 'Filters and sync' }: { active: boolean; onPress: () => void; label?: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={active ? `${label}, filters applied` : label}
            style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? `${theme.primary}18` : chipBg,
                opacity: pressed ? 0.8 : 1,
                ...webPointer,
            })}
        >
            <Ionicons name="options-outline" size={19} color={active ? theme.primary : theme.text} />
            {active ? (
                <View
                    style={{ position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.primary, borderWidth: 1.5, borderColor: theme.background }}
                />
            ) : null}
        </Pressable>
    );
}

/** "Unpaid ✕" pill on the context line; tap to clear that filter. */
export function ActiveFilterPill({ label, onClear }: { label: string; onClear: () => void }) {
    const { theme } = useListTokens();
    return (
        <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label} filter`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${theme.primary}18`, ...webPointer }}
        >
            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }} numberOfLines={1}>
                {label}
            </Text>
            <Ionicons name="close" size={12} color={theme.primary} />
        </Pressable>
    );
}

/** Small stat tile for the top of a filters sheet. */
export function SheetTile({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ flexGrow: 1, flexBasis: 96, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: chipBg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

interface SheetChoice {
    key: string;
    label: string;
    icon: IconName;
    count?: number;
}

/** Labelled radio list (one choice) for a filters sheet. */
export function SheetChoiceGroup({ label, options, value, onChange }: { label: string; options: SheetChoice[]; value: string; onChange: (key: string) => void }) {
    const { theme, divider } = useListTokens();
    return (
        <View style={{ gap: 4 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4, marginBottom: 2 }}>{label}</Text>
            {options.map((o) => {
                const active = o.key === value;
                return (
                    <Pressable
                        key={o.key}
                        onPress={() => onChange(o.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                            borderRadius: 16,
                            backgroundColor: active ? `${theme.primary}14` : pressed ? divider : 'transparent',
                            ...webPointer,
                        })}
                    >
                        <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: `${theme.primary}14` }}>
                            <Ionicons name={o.icon} size={17} color={theme.primary} />
                        </View>
                        <Text style={{ flex: 1, color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{o.label}</Text>
                        {o.count !== undefined ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginRight: 10 }}>{o.count.toLocaleString()}</Text>
                        ) : null}
                        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textDark} />
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Sync status line + Refresh button for the bottom of a filters sheet. */
export function SheetSyncRow({
    dotColor,
    label,
    refreshing,
    onRefresh,
    refreshLabel = 'Refresh',
}: {
    dotColor: string;
    label: string;
    refreshing: boolean;
    onRefresh: () => void;
    refreshLabel?: string;
}) {
    const { theme, divider } = useListTokens();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: divider }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 8, backgroundColor: dotColor }} />
            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                {label}
            </Text>
            <Pressable
                onPress={onRefresh}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel={refreshLabel}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: `${theme.primary}14`, opacity: refreshing ? 0.5 : 1, ...webPointer }}
            >
                <Ionicons name="refresh" size={15} color={theme.primary} />
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
            </Pressable>
        </View>
    );
}
