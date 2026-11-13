// components/common/listScreen/controls.tsx
//
// Small building blocks shared by list screens: stat chips, search, segmented switch,
// filter chips, status badges, empty state and the sync notice. Web + native.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { isWeb, useListTokens, webNoOutline, webPointer } from './tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/* ---------------------------------------------------------------- StatChip */

/** "Label  value" chip used in the compact header (web) and above lists. */
export function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg" style={{ backgroundColor: chipBg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
}

/* ------------------------------------------------------------- SearchField */

export function SearchField({
    value,
    onChangeText,
    placeholder = 'Search…',
    variant = 'web',
    maxWidth,
}: {
    value: string;
    onChangeText: (q: string) => void;
    placeholder?: string;
    /** 'web' = compact bordered field for table toolbars; 'mobile' = large rounded field. */
    variant?: 'web' | 'mobile';
    maxWidth?: number;
}) {
    const { theme, border, inputBg } = useListTokens();
    const isMobile = variant === 'mobile';
    return (
        <View
            className={`flex-row items-center ${isMobile ? 'h-11 rounded-2xl px-3.5' : 'h-9 rounded-xl border px-3 flex-1 min-w-[220px]'}`}
            style={{
                backgroundColor: isMobile ? inputBg : theme.background === '#ffffff' ? '#f8fafc' : inputBg,
                borderColor: border,
                ...(maxWidth ? { maxWidth } : {}),
            }}
        >
            <Ionicons name="search" size={isMobile ? 17 : 16} color={theme.textDark} />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#94a3b8"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                className="flex-1 h-full ml-2"
                style={{
                    color: theme.text,
                    fontFamily: theme.font.medium,
                    // >= 16 on phones so iOS Safari doesn't zoom on focus
                    fontSize: isMobile ? 16 : 13,
                    ...webNoOutline,
                }}
            />
            {value ? (
                <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search" style={webPointer}>
                    <Ionicons name="close-circle" size={isMobile ? 17 : 16} color={theme.textDark} />
                </Pressable>
            ) : null}
        </View>
    );
}

/* -------------------------------------------------------- SegmentedControl */

interface SegmentOption<K extends string> {
    key: K;
    label: string;
}

export function SegmentedControl<K extends string>({
    options,
    value,
    onChange,
    variant = 'web',
}: {
    options: SegmentOption<K>[];
    value: K;
    onChange: (key: K) => void;
    /** 'mobile' stretches the segments to full width. */
    variant?: 'web' | 'mobile';
}) {
    const { theme, chipBg } = useListTokens();
    const isMobile = variant === 'mobile';
    return (
        <View className={`flex-row p-1 ${isMobile ? 'rounded-2xl' : 'rounded-xl'}`} style={{ backgroundColor: chipBg }}>
            {options.map((o) => {
                const active = o.key === value;
                return (
                    <Pressable
                        key={o.key}
                        onPress={() => onChange(o.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`items-center justify-center ${isMobile ? 'flex-1 h-9 rounded-xl' : 'px-3.5 h-7 rounded-lg'}`}
                        style={{
                            backgroundColor: active ? theme.panel : 'transparent',
                            ...(active ? (isWeb ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.08)' } as any) : { elevation: 1 }) : {}),
                            ...webPointer,
                        }}
                    >
                        <Text style={{ color: active ? theme.text : theme.textDark, fontFamily: theme.font.bold, fontSize: isMobile ? 13 : 12 }}>
                            {o.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/* ------------------------------------------------------------- FilterChips */

export interface FilterChipOption<K extends string> {
    key: K;
    label: string;
    count?: number;
    icon?: IconName;
}

/** Row of pill chips (one selected). Scrolls sideways on narrow screens. */
export function FilterChips<K extends string>({
    options,
    value,
    onChange,
    trailing,
}: {
    options: FilterChipOption<K>[];
    value: K;
    onChange: (key: K) => void;
    /** Extra content after the chips (e.g. a "Clear filters" link). */
    trailing?: React.ReactNode;
}) {
    const { theme, border } = useListTokens();
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0" contentContainerStyle={{ alignItems: 'center', gap: 6 }}>
            {options.map((o) => {
                const active = o.key === value;
                return (
                    <Pressable
                        key={o.key}
                        onPress={() => onChange(o.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-full border"
                        style={{
                            borderColor: active ? theme.primary : border,
                            backgroundColor: active ? `${theme.primary}12` : 'transparent',
                            ...webPointer,
                        }}
                    >
                        {o.icon ? <Ionicons name={o.icon} size={13} color={active ? theme.primary : theme.textDark} /> : null}
                        <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{o.label}</Text>
                        {o.count !== undefined ? (
                            <Text style={{ color: active ? theme.primary : theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{o.count}</Text>
                        ) : null}
                    </Pressable>
                );
            })}
            {trailing}
        </ScrollView>
    );
}

/* ------------------------------------------------------------- StatusBadge */

/* --------------------------------------------------------------- TextLink */

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
    icon = 'file-tray-outline',
    title,
    message,
    actionLabel,
    onAction,
}: {
    icon?: IconName;
    title: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    const { theme } = useListTokens();
    return (
        <View className="py-16 items-center px-6">
            <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${theme.primary}14` }}>
                <Ionicons name={icon} size={22} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{title}</Text>
            {message ? (
                <Text className="mt-1 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {message}
                </Text>
            ) : null}
            {actionLabel && onAction ? (
                <Pressable
                    onPress={onAction}
                    className="mt-4 px-5 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: theme.primary, ...webPointer }}
                >
                    <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                        {actionLabel}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/* -------------------------------------------------------------- SyncNotice */

/**
 * Warns that a live list may not match the server: offline, connecting, or login
 * rejected. Renders nothing while connected. `noun` e.g. "orders", "payments".
 */
