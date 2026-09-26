// components/common/EntityAutocomplete.tsx
//
// Universal entity autocomplete.
// - Generic: works for retailers, suppliers, wholesalers, staff, etc.
// - Optional `entityTypes` shortcut filters by EntityItem.entity_type
// - Optional `filter` for arbitrary predicate
// - Formik-aware via `name` (falls back to controlled mode)
// - Web: portal into document.body, single-tap select
// - Native: inline dropdown
// - NativeWind layout, useAuth() colors

import { useAuth } from '@/context/AuthContext';
import type { EntityItem } from '@/databases/types';
import { useFormikContext } from 'formik';
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
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

/* ---- Web-only portal ---- */
let ReactDOM: any = null;
if (Platform.OS === 'web') {
    try {
        ReactDOM = require('react-dom');
    } catch {
        ReactDOM = null;
    }
}

/* =========================================================
 * Types
 * ======================================================= */
export interface EntityAutocompleteProps {
    /* -------- Data -------- */
    /** Full list of entities to search through. */
    entities: EntityItem[];

    /** Optional remote search override. */
    onSearch?: (query: string) => Promise<EntityItem[]>;

    /**
     * Convenience filter — keeps only entities whose
     * `entity_type` is in this list.
     * Example: ['GeneralRetailer', 'PharmaceuticalRetailer']
     */
    entityTypes?: string[];

    /**
     * Arbitrary predicate filter, applied after `entityTypes`.
     * Use for extra conditions (e.g. is_verified).
     */
    filter?: (e: EntityItem) => boolean;

    /* -------- Formik integration -------- */
    name?: string;
    fieldMap?: {
        id?: string;
        title?: string;
    };
    onAfterSelect?: (e: EntityItem) => void;

    /* -------- Controlled mode -------- */
    value?: EntityItem | null;
    onSelect?: (e: EntityItem) => void;
    onClear?: () => void;
    error?: string;

    /* -------- Shared -------- */
    label?: string;
    placeholder?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    loading?: boolean;
    maxHeight?: number;
    showMeta?: boolean;
    testID?: string;
}

/* =========================================================
 * Component
 * ======================================================= */
export function EntityAutocomplete({
    entities,
    onSearch,
    entityTypes,
    filter,

    name,
    fieldMap,
    onAfterSelect,

    value: controlledValue,
    onSelect: controlledOnSelect,
    onClear: controlledOnClear,
    error: controlledError,

    label,
    placeholder = 'Search…',
    helperText,
    required,
    disabled,
    loading: externalLoading,
    maxHeight = 224,
    showMeta = true,
    testID,
}: EntityAutocompleteProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    const fm = fieldMap ?? {};
    const idField = fm.id ?? 'remote_id';
    const titleField = fm.title ?? 'title';

    /* -------- Effective value -------- */
    const effectiveValue: EntityItem | null = isFormik
        ? formik.values?.[titleField]
            ? ({
                remote_id: formik.values?.[idField] ?? '',
                title: formik.values?.[titleField] ?? '',
            } as any)
            : null
        : controlledValue ?? null;

    /* -------- Effective error -------- */
    const effectiveError: string | undefined = isFormik
        ? formik.touched?.[titleField] && formik.errors?.[titleField]
            ? String(formik.errors[titleField])
            : undefined
        : controlledError;

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode ? '#334155' : '#cbd5e1';
    const hoverBg = isDarkMode ? '#1e293b' : '#f1f5f9';
    const placeholderColor = isDarkMode ? '#64748b' : '#a1a1aa';
    const danger = '#ef4444';
    const selectedBg = `${theme.primary}15`;

    /* -------- State -------- */
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [remoteResults, setRemoteResults] = useState<
        EntityItem[] | null
    >(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [anchor, setAnchor] = useState({
        x: 0,
        y: 0,
        width: 0,
    });

    /* -------- Refs -------- */
    const inputRef = useRef<TextInput>(null);
    const triggerRef = useRef<View>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const rowPressInFlightRef = useRef(false);

    /* -------- Base list (entityTypes + filter) -------- */
    const baseList = useMemo(() => {
        let list = entities ?? [];

        // 1. Filter by entity_type if the caller supplied a list
        if (entityTypes && entityTypes.length > 0) {
            const allowed = new Set(entityTypes);
            list = list.filter((e) =>
                allowed.has(String(e.entity_type ?? ''))
            );
        }

        // 2. Apply the caller's custom predicate
        if (filter) list = list.filter(filter);

        return list;
    }, [entities, entityTypes, filter]);

    /* -------- Sync input with selected --------
     *
     * `effectiveValue` is a short object built with `remote_id`
     * and `title` keys. Read those exact keys, not the raw
     * Formik field names. Deps use scalar sub-fields so the
     * effect only re-runs when the selection actually changes.
     */
    useEffect(() => {
        if (effectiveValue) {
            setQuery(
                String((effectiveValue as any).title ?? '')
            );
        } else if (!open) {
            setQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        (effectiveValue as any)?.remote_id,
        (effectiveValue as any)?.title,
        open,
    ]);

    /* -------- Local filter -------- */
    const filterLocally = useCallback(
        (q: string) => {
            if (!q) return baseList;
            const needle = q.toLowerCase();
            return baseList.filter((e) => {
                const t = String(e.title ?? '').toLowerCase();
                const town = String(e.town ?? '').toLowerCase();
                const phone = String(e.phone ?? '').toLowerCase();
                const code = String(
                    e.entity_code ?? ''
                ).toLowerCase();
                return (
                    t.includes(needle) ||
                    town.includes(needle) ||
                    phone.includes(needle) ||
                    code.includes(needle)
                );
            });
        },
        [baseList]
    );

    /* -------- Debounced remote search -------- */
    useEffect(() => {
        if (!open) return;
        if (debounceRef.current)
            clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            if (!onSearch) {
                setRemoteResults(null);
                return;
            }
            try {
                setLoading(true);
                setApiError(null);
                const res = await onSearch(query);

                // Remote results still pass through entityTypes
                // + filter so the constraint isn't bypassed.
                let filtered = res ?? [];
                if (entityTypes && entityTypes.length > 0) {
                    const allowed = new Set(entityTypes);
                    filtered = filtered.filter((e) =>
                        allowed.has(
                            String(e.entity_type ?? '')
                        )
                    );
                }
                if (filter) filtered = filtered.filter(filter);

                setRemoteResults(filtered);
            } catch (e: any) {
                setApiError(
                    e?.message ?? 'Failed to search entities.'
                );
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [query, open, onSearch, entityTypes, filter]);

    const results = useMemo(() => {
        if (remoteResults) return remoteResults;
        return filterLocally(query);
    }, [remoteResults, query, filterLocally]);

    /* -------- Measure (web) -------- */
    const measure = useCallback(() => {
        if (Platform.OS !== 'web') return;
        const node: any = triggerRef.current;
        if (!node) return;

        const el: HTMLElement | null =
            (typeof node.getScrollableNode === 'function'
                ? node.getScrollableNode()
                : null) ??
            (typeof node.getNode === 'function'
                ? node.getNode()
                : null) ??
            (node instanceof HTMLElement ? node : null);

        if (!el || typeof el.getBoundingClientRect !== 'function')
            return;

        const r = el.getBoundingClientRect();
        setAnchor({
            x: r.left,
            y: r.bottom,
            width: r.width,
        });
    }, []);

    const openDropdown = () => {
        if (disabled) return;
        measure();
        setOpen(true);
        if (Platform.OS === 'web') {
            requestAnimationFrame(measure);
        }
    };

    const closeDropdown = useCallback(() => {
        if (rowPressInFlightRef.current) {
            rowPressInFlightRef.current = false;
            return;
        }
        setTimeout(() => {
            if (rowPressInFlightRef.current) return;
            setOpen(false);
            setFocused(false);
        }, 300);
    }, []);

    /* -------- Re-measure -------- */
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        const handler = () => measure();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [open, measure]);

    /* -------- Click outside (web) -------- */
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        if (typeof document === 'undefined') return;

        const onDown = (ev: MouseEvent) => {
            const node: any = triggerRef.current;
            const triggerEl: HTMLElement | null =
                (typeof node?.getScrollableNode === 'function'
                    ? node.getScrollableNode()
                    : null) ??
                (typeof node?.getNode === 'function'
                    ? node.getNode()
                    : null);
            const target = ev.target as Node;
            const insideTrigger = triggerEl?.contains(target);
            const insideMenu = menuRef.current?.contains(target);
            if (!insideTrigger && !insideMenu) {
                setOpen(false);
                setFocused(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () =>
            document.removeEventListener('mousedown', onDown);
    }, [open]);

    /* -------- Select -------- */
    const handleSelect = (e: EntityItem) => {
        if (isFormik) {
            formik.setFieldValue(idField, e.remote_id);
            formik.setFieldValue(
                titleField,
                e.title ?? ''
            );
            formik.setFieldTouched(titleField, true, false);
            formik.validateField(titleField);
            onAfterSelect?.(e);
        } else {
            controlledOnSelect?.(e);
        }

        rowPressInFlightRef.current = false;
        setOpen(false);
        setApiError(null);
        setRemoteResults(null);
    };

    /* -------- Clear -------- */
    const handleClear = () => {
        if (isFormik) {
            formik.setFieldValue(idField, '');
            formik.setFieldValue(titleField, '');
        } else {
            controlledOnClear?.();
        }
        setQuery('');
        setRemoteResults(null);
        inputRef.current?.focus?.();
    };

    const emptyMessage = useMemo(() => {
        if (loading || apiError) return null;
        if (query && results.length === 0)
            return 'No matching records found.';
        if (!query && results.length === 0)
            return 'Start typing to search.';
        return null;
    }, [loading, apiError, query, results.length]);

    const showDropdown = open && !disabled;
    const showClear = !!query && !loading;
    const isLoading = loading || externalLoading || false;

    /* =========================================================
     * Menu content
     * ======================================================= */
    const MenuContent = (
        <View
            className="rounded-xl border overflow-hidden"
            style={{
                maxHeight,
                backgroundColor: dropdownBg,
                borderColor: dropdownBorder,
                ...(Platform.OS === 'web'
                    ? ({
                        boxShadow:
                            '0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.1)',
                    } as any)
                    : {
                        elevation: 24,
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 16,
                        shadowOffset: {
                            width: 0,
                            height: 8,
                        },
                    }),
            }}
        >
            <FlatList
                data={results}
                keyExtractor={(e, i) =>
                    String(e.remote_id ?? i)
                }
                keyboardShouldPersistTaps="handled"
                style={{
                    flexGrow: 0,
                    backgroundColor: dropdownBg,
                }}
                renderItem={({ item }) => (
                    <EntityRow
                        entity={item}
                        borderColor={borderColor}
                        hoverBg={hoverBg}
                        selectedBg={selectedBg}
                        primary={theme.primary}
                        textColor={theme.text}
                        textDarkColor={theme.textDark}
                        boldFont={theme.font.bold}
                        mediumFont={theme.font.medium}
                        showMeta={showMeta}
                        selected={
                            effectiveValue != null &&
                            (item as any).remote_id ===
                            (effectiveValue as any).remote_id
                        }
                        onPressIn={() => {
                            rowPressInFlightRef.current = true;
                        }}
                        onPress={() => handleSelect(item)}
                    />
                )}
                ListEmptyComponent={
                    emptyMessage ? (
                        <View className="py-5 px-4 items-center">
                            <Text
                                className="text-center"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                }}
                            >
                                {emptyMessage}
                            </Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );

    /* =========================================================
     * Web portal
     * ======================================================= */
    let portal: any = null;
    if (
        Platform.OS === 'web' &&
        showDropdown &&
        ReactDOM &&
        typeof document !== 'undefined' &&
        anchor.width > 0
    ) {
        portal = ReactDOM.createPortal(
            <div
                ref={(el: HTMLDivElement | null) => {
                    menuRef.current = el;
                    if (el && !(el as any).__waziGuard) {
                        (el as any).__waziGuard = true;
                        el.addEventListener(
                            'mousedown',
                            (ev) => {
                                ev.preventDefault();
                                rowPressInFlightRef.current = true;
                            },
                            true
                        );
                    }
                }}
                style={{
                    position: 'fixed',
                    top: anchor.y + 4,
                    left: anchor.x,
                    width: anchor.width,
                    zIndex: 2147483647,
                    isolation: 'isolate',
                }}
            >
                {MenuContent}
            </div>,
            document.body
        );
    }

    /* =========================================================
     * Render
     * ======================================================= */
    return (
        <>
            <View
                testID={testID}
                className="w-full relative"
                style={
                    Platform.OS === 'web'
                        ? ({ zIndex: open ? 9999 : 1 } as any)
                        : { zIndex: open ? 9999 : 1 }
                }
            >
                {/* Label */}
                {label ? (
                    <View className="flex-row items-center mb-1">
                        <Text
                            className="uppercase tracking-wide text-[10px]"
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
                                    color: danger,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Trigger */}
                <Pressable
                    ref={triggerRef as any}
                    onPress={() => inputRef.current?.focus?.()}
                    className="flex-row items-center rounded-xl border px-3"
                    style={{
                        borderColor: effectiveError
                            ? danger
                            : focused
                                ? theme.primary
                                : borderColor,
                        backgroundColor: inputBg,
                        opacity: disabled ? 0.55 : 1,
                        minHeight: 44,
                    }}
                >
                    <TextInput
                        ref={inputRef}
                        value={query}
                        onChangeText={(v) => {
                            setQuery(v);
                            if (!open) openDropdown();
                        }}
                        onFocus={() => {
                            setFocused(true);
                            openDropdown();
                        }}
                        onBlur={closeDropdown}
                        placeholder={placeholder}
                        placeholderTextColor={placeholderColor}
                        autoCorrect={false}
                        autoCapitalize="none"
                        editable={!disabled}
                        className="flex-1 py-2.5"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                            ...(Platform.OS === 'web'
                                ? ({
                                    outlineStyle: 'none',
                                } as any)
                                : null),
                        }}
                    />

                    {isLoading ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.primary}
                        />
                    ) : showClear ? (
                        <Pressable
                            onPress={handleClear}
                            hitSlop={8}
                            className="p-1"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontSize: 13,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    ) : (
                        <Text
                            style={{
                                color: theme.textDark,
                                fontSize: 11,
                            }}
                        >
                            ▾
                        </Text>
                    )}
                </Pressable>

                {/* Error / helper */}
                {effectiveError ? (
                    <Text
                        className="mt-1 text-[11px]"
                        style={{
                            color: danger,
                            fontFamily: theme.font.medium,
                        }}
                    >
                        {effectiveError}
                    </Text>
                ) : helperText ? (
                    <Text
                        className="mt-1 text-[11px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            opacity: 0.75,
                        }}
                    >
                        {helperText}
                    </Text>
                ) : null}

                {/* Native inline dropdown */}
                {Platform.OS !== 'web' && showDropdown ? (
                    <View
                        className="absolute left-0 right-0 rounded-xl"
                        style={{ top: 68, zIndex: 9999 }}
                    >
                        {MenuContent}
                    </View>
                ) : null}
            </View>

            {portal}
        </>
    );
}

/* =========================================================
 * Row
 * ======================================================= */
function EntityRow({
    entity,
    borderColor,
    hoverBg,
    selectedBg,
    primary,
    textColor,
    textDarkColor,
    boldFont,
    mediumFont,
    showMeta,
    selected,
    onPress,
    onPressIn,
}: {
    entity: EntityItem;
    borderColor: string;
    hoverBg: string;
    selectedBg: string;
    primary: string;
    textColor: string;
    textDarkColor: string;
    boldFont: string;
    mediumFont: string;
    showMeta: boolean;
    selected?: boolean;
    onPress: () => void;
    onPressIn?: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    const active = hovered || pressed;

    const metaParts = [
        entity.town || entity.county_title,
        entity.phone,
    ].filter(Boolean);

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => {
                onPressIn?.();
                setPressed(true);
            }}
            onPressOut={() => setPressed(false)}
            onHoverIn={
                Platform.OS === 'web'
                    ? () => setHovered(true)
                    : undefined
            }
            onHoverOut={
                Platform.OS === 'web'
                    ? () => setHovered(false)
                    : undefined
            }
            className="flex-row items-center px-3 py-2.5 border-b"
            style={{
                borderBottomColor: borderColor,
                backgroundColor: selected
                    ? selectedBg
                    : active
                        ? hoverBg
                        : 'transparent',
            }}
        >
            <View className="flex-1 min-w-0">
                <Text
                    numberOfLines={1}
                    style={{
                        color: textColor,
                        fontFamily: boldFont,
                        fontSize: 13,
                    }}
                >
                    {entity.title || '—'}
                </Text>

                {showMeta && metaParts.length > 0 ? (
                    <Text
                        numberOfLines={1}
                        style={{
                            color: textDarkColor,
                            fontFamily: mediumFont,
                            fontSize: 11,
                            marginTop: 1,
                        }}
                    >
                        {metaParts.join(' • ')}
                    </Text>
                ) : null}
            </View>

            {selected ? (
                <Text
                    className="ml-2"
                    style={{ color: primary, fontSize: 13 }}
                >
                    ✓
                </Text>
            ) : null}
        </Pressable>
    );
}