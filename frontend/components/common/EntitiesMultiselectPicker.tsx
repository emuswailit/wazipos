// components/common/EntitiesMultiselectPicker.tsx
//
// Standalone autocomplete multi-select picker for entities.
//
// Two modes:
//   - Default (modal):  trigger renders chips, tap opens a modal picker.
//   - Inline:           trigger + modal are skipped; the search field
//                       and list render directly in place.
//
// - Sources entities from useEntitiesSync() by default.
//   (Pass `options` to override with your own list.)
// - NativeWind layout, useAuth() colors.

import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { EntityItem } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */

export interface EntityPickerOption {
    id: string;
    label: string;
    sublabel?: string;
    search?: string;
    meta?: EntityItem;
}

export interface EntitiesMultiselectPickerProps {
    value: string[];
    onChange: (ids: string[]) => void;

    options?: EntityPickerOption[];
    toOption?: (entity: EntityItem) => EntityPickerOption;

    targetIds?: string[];
    excludeIds?: string[];
    entityType?: string;
    entityTypes?: string[];

    label?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    maxSelected?: number;
    showChips?: boolean;

    emptyText?: string;
    loadingText?: string;
    errorText?: string;
    noMatchesText?: string;

    validate?: (ids: string[]) => string | undefined;
    error?: string;

    /**
     * When true, the trigger and modal are skipped entirely.
     * The search field and list render directly inside the component.
     */
    inline?: boolean;

    /**
     * Max height of the inline list container (only when inline).
     * Ignored in modal mode.
     */
    maxInlineHeight?: number;

    testID?: string;
}

const DEFAULT_TO_OPTION = (
    e: EntityItem
): EntityPickerOption => ({
    id: String(e.id),
    label: String(e.title || 'Unknown'),
    sublabel: [e.town, e.phone].filter(Boolean).join(' · '),
    search: [e.entity_type, e.email, e.phone]
        .filter(Boolean)
        .join(' '),
    meta: e,
});

/* =========================================================
 * Component
 * ======================================================= */

export function EntitiesMultiselectPicker({
    value,
    onChange,

    options: providedOptions,
    toOption = DEFAULT_TO_OPTION,

    targetIds,
    excludeIds,
    entityType,
    entityTypes,

    label,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    helperText,
    required,
    disabled,
    maxSelected,
    showChips = true,

    emptyText = 'No entities available',
    loadingText = 'Loading…',
    errorText = 'Could not load entities.',
    noMatchesText = 'No matches',

    validate,
    error,

    inline = false,
    maxInlineHeight = 360,

    testID,
}: EntitiesMultiselectPickerProps) {
    const { theme, isDarkMode } = useAuth();
    const { allWholesalers, isSyncing } = useEntitiesSync();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const inputRef = useRef<TextInput | null>(null);

    /* ---- Base option list ---- */
    const baseOptions: EntityPickerOption[] = useMemo(() => {
        if (providedOptions) return providedOptions;

        const targetSet = targetIds ? new Set(targetIds) : null;
        const excludeSet = excludeIds ? new Set(excludeIds) : null;
        const typeSet = entityTypes ? new Set(entityTypes) : null;

        return (allWholesalers ?? [])
            .filter((e) => {
                const id = String(e.id);
                if (targetSet && !targetSet.has(id)) return false;
                if (excludeSet && excludeSet.has(id)) return false;
                if (entityType && e.entity_type !== entityType) return false;
                if (typeSet && e.entity_type && !typeSet.has(e.entity_type))
                    return false;
                return true;
            })
            .map(toOption);
    }, [
        providedOptions,
        allWholesalers,
        targetIds,
        excludeIds,
        entityType,
        entityTypes,
        toOption,
    ]);

    /* ---- Filter ---- */
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return baseOptions;
        return baseOptions.filter((o) => {
            const blob = [o.label, o.sublabel, o.search]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return blob.includes(q);
        });
    }, [baseOptions, search]);

    const selectedSet = useMemo(() => new Set(value), [value]);

    const labelMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const o of baseOptions) map[o.id] = o.label;
        return map;
    }, [baseOptions]);

    const selectedLabels = useMemo(
        () =>
            value.map((id) => ({
                id,
                label: labelMap[id] ?? id,
            })),
        [value, labelMap]
    );

    const fieldError = error ?? validate?.(value);

    /* ---- Toggle / remove ---- */
    const toggle = useCallback(
        (id: string) => {
            if (selectedSet.has(id)) {
                onChange(value.filter((v) => v !== id));
            } else {
                if (maxSelected !== undefined && value.length >= maxSelected)
                    return;
                onChange([...value, id]);
            }
        },
        [value, selectedSet, onChange, maxSelected]
    );

    const remove = useCallback(
        (id: string) => onChange(value.filter((v) => v !== id)),
        [value, onChange]
    );

    const clearAll = useCallback(() => onChange([]), [onChange]);

    const open = useCallback(() => {
        if (disabled) return;
        setIsOpen(true);
        setSearch('');
    }, [disabled]);

    const close = useCallback(() => {
        setIsOpen(false);
        setSearch('');
        Keyboard.dismiss();
    }, []);

    /* ---- Focus on open (web, modal only) ---- */
    useEffect(() => {
        if (inline) return;
        if (!isOpen) return;
        if (Platform.OS === 'web') {
            const t = setTimeout(() => inputRef.current?.focus?.(), 50);
            return () => clearTimeout(t);
        }
    }, [isOpen, inline]);

    /* =========================================================
     * Row renderer — shared between modal and inline
     * ======================================================= */
    const renderRow = ({ item }: { item: EntityPickerOption }) => {
        const isChecked = selectedSet.has(item.id);
        const reachedMax =
            maxSelected !== undefined &&
            !isChecked &&
            value.length >= maxSelected;

        return (
            <Pressable
                onPress={() => !reachedMax && toggle(item.id)}
                disabled={reachedMax}
                className="px-3 py-2.5 flex-row items-center border-b"
                style={{
                    borderBottomColor: borderColor,
                    backgroundColor: isChecked
                        ? `${theme.primary}10`
                        : 'transparent',
                    opacity: reachedMax ? 0.4 : 1,
                }}
            >
                <View
                    className="w-5 h-5 rounded border items-center justify-center mr-3"
                    style={{
                        borderColor: isChecked ? theme.primary : borderColor,
                        backgroundColor: isChecked
                            ? theme.primary
                            : 'transparent',
                    }}
                >
                    {isChecked ? (
                        <Text
                            className="text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 12,
                                lineHeight: 14,
                            }}
                        >
                            ✓
                        </Text>
                    ) : null}
                </View>
                <View className="flex-1 min-w-0">
                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: 14,
                        }}
                    >
                        {item.label}
                    </Text>
                    {item.sublabel ? (
                        <Text
                            numberOfLines={1}
                            className="mt-0.5"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                            }}
                        >
                            {item.sublabel}
                        </Text>
                    ) : null}
                </View>
            </Pressable>
        );
    };

    /* =========================================================
     * List body — shared between modal and inline
     * ======================================================= */
    const listBody = (
        <>
            {isSyncing && baseOptions.length === 0 && !providedOptions ? (
                <View className="p-8 items-center">
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text
                        className="mt-2"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        {loadingText}
                    </Text>
                </View>
            ) : baseOptions.length === 0 ? (
                <View className="p-6 items-center">
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                            textAlign: 'center',
                        }}
                    >
                        {emptyText}
                    </Text>
                </View>
            ) : filtered.length === 0 ? (
                <View className="p-6 items-center">
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {noMatchesText}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(o) => o.id}
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: inline ? maxInlineHeight : 400 }}
                    renderItem={renderRow}
                />
            )}
        </>
    );

    /* =========================================================
     * INLINE MODE
     * ======================================================= */
    if (inline) {
        return (
            <View className="w-full" testID={testID}>
                {label ? (
                    <View className="flex-row items-center mb-1.5">
                        <Text
                            className="uppercase tracking-wider text-[10px]"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {label}
                        </Text>
                        {required ? (
                            <Text
                                className="text-[10px] ml-1"
                                style={{
                                    color: '#ef4444',
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                <View
                    className="w-full rounded-xl border overflow-hidden"
                    style={{
                        borderColor: fieldError ? '#ef4444' : borderColor,
                        backgroundColor: theme.panel,
                    }}
                >
                    {/* Search */}
                    <View
                        className="p-3 border-b"
                        style={{ borderBottomColor: borderColor }}
                    >
                        <TextInput
                            ref={inputRef}
                            value={search}
                            onChangeText={setSearch}
                            placeholder={searchPlaceholder}
                            placeholderTextColor="#94a3b8"
                            autoCorrect={false}
                            autoCapitalize="none"
                            editable={!disabled}
                            className="h-10 rounded-xl border px-3"
                            style={{
                                borderColor,
                                backgroundColor: subBg,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                opacity: disabled ? 0.55 : 1,
                                ...(Platform.OS === 'web'
                                    ? ({ outlineStyle: 'none' } as any)
                                    : null),
                            }}
                        />
                    </View>

                    {/* List */}
                    {listBody}

                    {/* Footer */}
                    <View
                        className="p-3 border-t flex-row items-center justify-between"
                        style={{ borderTopColor: borderColor }}
                    >
                        <View className="flex-row items-center gap-3">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {value.length} selected
                            </Text>
                            {value.length > 0 && !disabled ? (
                                <Pressable onPress={clearAll} hitSlop={6}>
                                    <Text
                                        className="uppercase tracking-wide"
                                        style={{
                                            color: theme.primary,
                                            fontFamily: theme.font.bold,
                                            fontSize: 10,
                                        }}
                                    >
                                        Clear
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                </View>

                {fieldError ? (
                    <Text
                        className="text-[10px] pl-1 mt-1"
                        style={{
                            color: '#ef4444',
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {fieldError}
                    </Text>
                ) : helperText ? (
                    <Text
                        className="text-[10px] pl-1 mt-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            opacity: 0.75,
                        }}
                    >
                        {helperText}
                    </Text>
                ) : null}
            </View>
        );
    }

    /* =========================================================
     * MODAL MODE (default — unchanged behaviour)
     * ======================================================= */
    return (
        <View className="w-full" testID={testID}>
            {label ? (
                <View className="flex-row items-center mb-1.5">
                    <Text
                        className="uppercase tracking-wider text-[10px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {label}
                    </Text>
                    {required ? (
                        <Text
                            className="text-[10px] ml-1"
                            style={{
                                color: '#ef4444',
                                fontFamily: theme.font.bold,
                            }}
                        >
                            *
                        </Text>
                    ) : null}
                </View>
            ) : null}

            <Pressable
                onPress={open}
                disabled={disabled}
                className="w-full rounded-xl border px-3 min-h-[44px] flex-row items-center flex-wrap gap-1.5 py-2"
                style={{
                    borderColor: fieldError ? '#ef4444' : borderColor,
                    backgroundColor: subBg,
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                {selectedLabels.length === 0 ? (
                    <Text
                        style={{
                            color: '#94a3b8',
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {placeholder}
                    </Text>
                ) : showChips ? (
                    selectedLabels.map((s) => (
                        <View
                            key={s.id}
                            className="flex-row items-center rounded-md px-2 py-0.5"
                            style={{ backgroundColor: `${theme.primary}20` }}
                        >
                            <Text
                                numberOfLines={1}
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    maxWidth: 160,
                                }}
                            >
                                {s.label}
                            </Text>
                            {!disabled ? (
                                <Pressable
                                    onPress={(e) => {
                                        e?.stopPropagation?.();
                                        remove(s.id);
                                    }}
                                    hitSlop={6}
                                    className="ml-1.5"
                                >
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontSize: 11,
                                            lineHeight: 13,
                                        }}
                                    >
                                        ✕
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    ))
                ) : (
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {value.length} selected
                    </Text>
                )}
            </Pressable>

            {fieldError ? (
                <Text
                    className="text-[10px] pl-1 mt-1"
                    style={{
                        color: '#ef4444',
                        fontFamily: theme.font.bold,
                    }}
                >
                    {fieldError}
                </Text>
            ) : helperText ? (
                <Text
                    className="text-[10px] pl-1 mt-1"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.medium,
                        opacity: 0.75,
                    }}
                >
                    {helperText}
                </Text>
            ) : null}

            <Modal
                visible={isOpen}
                animationType="fade"
                transparent
                onRequestClose={close}
            >
                <Pressable
                    onPress={close}
                    className="flex-1 bg-black/55 items-center justify-center p-4"
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation?.()}
                        className="w-full max-w-[560px] max-h-[80%] rounded-2xl border overflow-hidden"
                        style={{
                            backgroundColor: theme.panel,
                            borderColor,
                        }}
                    >
                        <View
                            className="p-3 border-b"
                            style={{ borderBottomColor: borderColor }}
                        >
                            <TextInput
                                ref={inputRef}
                                value={search}
                                onChangeText={setSearch}
                                placeholder={searchPlaceholder}
                                placeholderTextColor="#94a3b8"
                                autoCorrect={false}
                                autoCapitalize="none"
                                autoFocus={Platform.OS === 'web'}
                                className="h-10 rounded-xl border px-3"
                                style={{
                                    borderColor,
                                    backgroundColor: subBg,
                                    color: theme.text,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                    ...(Platform.OS === 'web'
                                        ? ({ outlineStyle: 'none' } as any)
                                        : null),
                                }}
                            />
                            {maxSelected !== undefined ? (
                                <Text
                                    className="mt-2"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: 11,
                                    }}
                                >
                                    {value.length}/{maxSelected} selected
                                </Text>
                            ) : null}
                        </View>

                        {listBody}

                        <View
                            className="p-3 border-t flex-row items-center justify-between"
                            style={{ borderTopColor: borderColor }}
                        >
                            <View className="flex-row items-center gap-3">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    {value.length} selected
                                </Text>
                                {value.length > 0 ? (
                                    <Pressable onPress={clearAll} hitSlop={6}>
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: theme.primary,
                                                fontFamily: theme.font.bold,
                                                fontSize: 10,
                                            }}
                                        >
                                            Clear
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                            <Pressable
                                onPress={close}
                                className="px-4 py-2 rounded-lg"
                                style={{ backgroundColor: theme.primary }}
                            >
                                <Text
                                    className="uppercase tracking-wide text-white"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                    }}
                                >
                                    Done
                                </Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

export default EntitiesMultiselectPicker;