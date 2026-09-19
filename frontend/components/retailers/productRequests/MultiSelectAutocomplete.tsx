// components/common/MultiSelectAutocomplete.tsx

import { useAuth } from '@/context/AuthContext';
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
 * Public types
 * ======================================================= */

export interface AutocompleteOption {
    id: string;
    label: string;
    sublabel?: string;
    search?: string;
    meta?: Record<string, any>;
}

export interface MultiSelectAutocompleteProps {
    value: string[];
    onChange: (ids: string[]) => void;

    loadOptions: (query?: string) => Promise<AutocompleteOption[]>;
    clientFilter?: boolean;

    /**
     * Display labels for already-selected ids. Pass the parent's
     * cache here so the chips render even before `loadOptions`
     * has resolved.
     */
    knownLabels?: Record<string, string>;

    placeholder?: string;
    label?: string;
    disabled?: boolean;
    maxSelected?: number;

    emptyText?: string;
    loadingText?: string;
    errorText?: string;

    lazy?: boolean;
}

/* =========================================================
 * Component
 * ======================================================= */

export function MultiSelectAutocomplete({
    value,
    onChange,
    loadOptions,
    clientFilter = true,
    knownLabels = {},
    placeholder = 'Search...',
    label,
    disabled = false,
    maxSelected,
    emptyText = 'No matches',
    loadingText = 'Loading...',
    errorText = 'Could not load options.',
    lazy = true,
}: MultiSelectAutocompleteProps) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<AutocompleteOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const inputRef = useRef<TextInput | null>(null);

    /* Label memory: every option this component has ever seen,
     * keyed by id. Survives list replacements so chips never fall
     * back to the raw id once a label has been resolved at least
     * once. */
    const labelMemoryRef = useRef<Map<string, string>>(new Map());
    const [labelMemoryVersion, setLabelMemoryVersion] = useState(0);

    const rememberOptions = useCallback(
        (opts: AutocompleteOption[]) => {
            let changed = false;
            for (const o of opts) {
                const prev = labelMemoryRef.current.get(o.id);
                if (prev !== o.label) {
                    labelMemoryRef.current.set(o.id, o.label);
                    changed = true;
                }
            }
            if (changed) {
                setLabelMemoryVersion((v) => v + 1);
            }
        },
        []
    );

    /* Whenever parent-supplied labels arrive, remember them too. */
    useEffect(() => {
        let changed = false;
        for (const [id, lbl] of Object.entries(knownLabels)) {
            if (!id || !lbl) continue;
            const prev = labelMemoryRef.current.get(id);
            if (prev !== lbl) {
                labelMemoryRef.current.set(id, lbl);
                changed = true;
            }
        }
        if (changed) {
            setLabelMemoryVersion((v) => v + 1);
        }
    }, [knownLabels]);

    /* ---------------- Load options on open ---------------- */
    useEffect(() => {
        if (!isOpen) return;
        if (!lazy && options.length > 0) return;

        let cancelled = false;
        setIsLoading(true);
        setError('');

        (async () => {
            try {
                const res = await loadOptions();
                if (cancelled) return;
                setOptions(res);
                rememberOptions(res);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message || 'Failed to load options.');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    /* ---------------- Filter ---------------- */
    const filtered = useMemo(() => {
        if (!clientFilter) return options;
        const q = search.trim().toLowerCase();
        if (!q) return options;

        return options.filter((o) => {
            const hay = [o.label, o.sublabel, o.search]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [options, search, clientFilter]);

    const selectedSet = useMemo(() => new Set(value), [value]);

    /* ---------------- Toggle / remove ---------------- */
    const toggle = useCallback(
        (id: string) => {
            if (selectedSet.has(id)) {
                onChange(value.filter((v) => v !== id));
            } else {
                if (maxSelected && value.length >= maxSelected)
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

    /* ---------------- Open / close ---------------- */
    const open = useCallback(() => {
        if (disabled) return;
        setIsOpen(true);
        setSearch('');
    }, [disabled]);

    const close = useCallback(() => {
        setIsOpen(false);
        Keyboard.dismiss();
    }, []);

    /* ---------------- Selected labels ----------------
     * Resolution order:
     *   1. `knownLabels` (parent's cache — freshest source)
     *   2. label memory (everything this component has seen)
     *   3. current `options`
     *   4. fall back to the id only if nothing else worked
     *
     * `labelMemoryVersion` is referenced to force recompute when
     * the memory map mutates.
     */
    const selectedLabels = useMemo(() => {
        void labelMemoryVersion;
        return value.map((id) => {
            const label =
                knownLabels[id] ||
                labelMemoryRef.current.get(id) ||
                options.find((o) => o.id === id)?.label ||
                id;
            return { id, label };
        });
    }, [value, knownLabels, options, labelMemoryVersion]);

    /* ---------------- Render ---------------- */
    return (
        <View className="w-full">
            {label ? (
                <Text
                    className="uppercase tracking-widest mb-2"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                    }}
                >
                    {label}
                </Text>
            ) : null}

            {/* Trigger */}
            <Pressable
                onPress={open}
                disabled={disabled}
                className="rounded-xl border px-3 py-2.5 min-h-[44px] flex-row items-center flex-wrap gap-1.5"
                style={{
                    borderColor,
                    backgroundColor: subBg,
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                {selectedLabels.length === 0 ? (
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {placeholder}
                    </Text>
                ) : (
                    selectedLabels.map((s) => (
                        <View
                            key={s.id}
                            className="flex-row items-center rounded-md px-2 py-0.5 mr-1"
                            style={{
                                backgroundColor: `${theme.primary}20`,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide mr-1"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    maxWidth: 140,
                                }}
                                numberOfLines={1}
                            >
                                {s.label}
                            </Text>
                            <Pressable
                                onPress={() => remove(s.id)}
                                hitSlop={6}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>
                    ))
                )}
            </Pressable>

            {/* Modal picker */}
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
                        {/* Search input */}
                        <View
                            className="p-3 border-b"
                            style={{ borderBottomColor: borderColor }}
                        >
                            <TextInput
                                ref={inputRef}
                                value={search}
                                onChangeText={setSearch}
                                placeholder={placeholder}
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
                                }}
                            />
                            {maxSelected ? (
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

                        {/* Options */}
                        {isLoading ? (
                            <View className="p-8 items-center">
                                <ActivityIndicator
                                    size="small"
                                    color={theme.primary}
                                />
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
                        ) : error ? (
                            <View className="p-6 items-center">
                                <Text
                                    style={{
                                        color: '#ef4444',
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.sm,
                                        textAlign: 'center',
                                    }}
                                >
                                    {error || errorText}
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
                                    {emptyText}
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filtered}
                                keyExtractor={(o) => o.id}
                                keyboardShouldPersistTaps="handled"
                                style={{ maxHeight: 400 }}
                                renderItem={({ item }) => {
                                    const isChecked = selectedSet.has(
                                        item.id
                                    );
                                    const reachedMax =
                                        maxSelected !== undefined &&
                                        !isChecked &&
                                        value.length >= maxSelected;

                                    return (
                                        <Pressable
                                            onPress={() =>
                                                !reachedMax &&
                                                toggle(item.id)
                                            }
                                            disabled={reachedMax}
                                            className="px-3 py-2.5 flex-row items-center border-b"
                                            style={{
                                                borderBottomColor:
                                                    borderColor,
                                                opacity: reachedMax
                                                    ? 0.4
                                                    : 1,
                                            }}
                                        >
                                            <View
                                                className="w-5 h-5 rounded border items-center justify-center mr-3"
                                                style={{
                                                    borderColor: isChecked
                                                        ? theme.primary
                                                        : borderColor,
                                                    backgroundColor:
                                                        isChecked
                                                            ? theme.primary
                                                            : 'transparent',
                                                }}
                                            >
                                                {isChecked ? (
                                                    <Text
                                                        className="text-white"
                                                        style={{
                                                            fontFamily:
                                                                theme.font
                                                                    .bold,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        ✓
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <View className="flex-1 min-w-0">
                                                <Text
                                                    style={{
                                                        color: theme.text,
                                                        fontFamily:
                                                            theme.font
                                                                .bold,
                                                        fontSize: 14,
                                                    }}
                                                    numberOfLines={1}
                                                >
                                                    {item.label}
                                                </Text>
                                                {item.sublabel ? (
                                                    <Text
                                                        className="mt-0.5"
                                                        style={{
                                                            color: theme
                                                                .textDark,
                                                            fontFamily:
                                                                theme
                                                                    .font
                                                                    .medium,
                                                            fontSize: 11,
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        {item.sublabel}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                }}
                            />
                        )}

                        {/* Footer */}
                        <View
                            className="p-3 border-t flex-row items-center justify-between"
                            style={{ borderTopColor: borderColor }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {value.length} selected
                            </Text>
                            <Pressable
                                onPress={close}
                                className="px-4 py-2 rounded-lg"
                                style={{
                                    backgroundColor: theme.primary,
                                }}
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

export default MultiSelectAutocomplete;