// components/common/EntityAutocomplete.tsx

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

const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const VERTICAL_PADDING = 8;
const HORIZONTAL_PADDING = 12;

const MIN_INPUT_HEIGHT = LINE_HEIGHT * 2;
const MIN_TRIGGER_HEIGHT = MIN_INPUT_HEIGHT + VERTICAL_PADDING * 2;

function safeValidateField(formik: any, field: string) {
    if (!formik?.validateField || !field) return;
    const iv = formik.initialValues;
    if (iv && !(field in iv)) return;
    try {
        const result = formik.validateField(field);
        if (result && typeof (result as any).catch === 'function') {
            (result as any).catch(() => { });
        }
    } catch { }
}

interface EntityAutocompleteProps {
    entities: EntityItem[];
    onSearch?: (query: string) => Promise<EntityItem[]>;
    entityTypes?: string[];
    filter?: (e: EntityItem) => boolean;

    name?: string;
    fieldMap?: {
        id?: string;
        title?: string;
    };
    onAfterSelect?: (e: EntityItem) => void;

    value?: EntityItem | null;
    onSelect?: (e: EntityItem) => void;
    onClear?: () => void;
    error?: string;

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

    const effectiveValue: EntityItem | null = isFormik
        ? formik.values?.[titleField]
            ? ({
                remote_id: formik.values?.[idField] ?? '',
                title: formik.values?.[titleField] ?? '',
            } as any)
            : null
        : controlledValue ?? null;

    const effectiveError: string | undefined = isFormik
        ? formik.touched?.[titleField] && formik.errors?.[titleField]
            ? String(formik.errors[titleField])
            : undefined
        : controlledError;

    const baseDelimiter = isDarkMode
        ? 'rgba(148,163,184,0.15)'
        : 'rgba(15,23,42,0.06)';
    const focusDelimiter = isDarkMode
        ? 'rgba(148,163,184,0.28)'
        : 'rgba(15,23,42,0.14)';

    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const hoverBg = isDarkMode
        ? 'rgba(148,163,184,0.08)'
        : 'rgba(15,23,42,0.04)';
    const placeholderColor = isDarkMode ? '#64748b' : '#94a3b8';

    const danger = '#ef4444';
    const selectedBg = `${theme.primary}15`;

    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [remoteResults, setRemoteResults] = useState<EntityItem[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0 });

    const inputRef = useRef<TextInput>(null);
    const triggerRef = useRef<View>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rowPressInFlightRef = useRef(false);

    const baseList = useMemo(() => {
        let list = entities ?? [];
        if (entityTypes && entityTypes.length > 0) {
            const allowed = new Set(entityTypes);
            list = list.filter((e) => allowed.has(String(e.entity_type ?? '')));
        }
        if (filter) list = list.filter(filter);
        return list;
    }, [entities, entityTypes, filter]);

    useEffect(() => {
        if (effectiveValue) {
            setQuery(String((effectiveValue as any).title ?? ''));
        } else if (!open) {
            setQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [(effectiveValue as any)?.remote_id, (effectiveValue as any)?.title, open]);

    const filterLocally = useCallback((q: string) => {
        if (!q) return baseList;
        const needle = q.toLowerCase();
        return baseList.filter((e) => {
            const t = String(e.title ?? '').toLowerCase();
            const town = String(e.town ?? '').toLowerCase();
            const phone = String(e.phone ?? '').toLowerCase();
            const code = String(e.entity_code ?? '').toLowerCase();
            return t.includes(needle) || town.includes(needle) || phone.includes(needle) || code.includes(needle);
        });
    }, [baseList]);

    useEffect(() => {
        if (!open) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (!onSearch) {
                setRemoteResults(null);
                return;
            }
            try {
                setLoading(true);
                setApiError(null);
                const res = await onSearch(query);
                let filtered = res ?? [];
                if (entityTypes && entityTypes.length > 0) {
                    const allowed = new Set(entityTypes);
                    filtered = filtered.filter((e) => allowed.has(String(e.entity_type ?? '')));
                }
                if (filter) filtered = filtered.filter(filter);
                setRemoteResults(filtered);
            } catch (e: any) {
                setApiError(e?.message ?? 'Failed to search entities.');
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, open, onSearch, entityTypes, filter]);

    const results = useMemo(() => {
        if (remoteResults) return remoteResults;
        return filterLocally(query);
    }, [remoteResults, query, filterLocally]);

    const measure = useCallback(() => {
        if (Platform.OS !== 'web') return;
        const node: any = triggerRef.current;
        if (!node) return;
        const el: HTMLElement | null =
            (typeof node.getScrollableNode === 'function' ? node.getScrollableNode() : null) ??
            (typeof node.getNode === 'function' ? node.getNode() : null) ??
            (node instanceof HTMLElement ? node : null);
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        const r = el.getBoundingClientRect();
        setAnchor({ x: r.left, y: r.bottom, width: r.width });
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

    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        if (typeof document === 'undefined') return;
        const onDown = (ev: MouseEvent) => {
            const node: any = triggerRef.current;
            const triggerEl: HTMLElement | null =
                (typeof node?.getScrollableNode === 'function' ? node.getScrollableNode() : null) ??
                (typeof node?.getNode === 'function' ? node.getNode() : null);
            const target = ev.target as Node;
            const insideTrigger = triggerEl?.contains(target);
            const insideMenu = menuRef.current?.contains(target);
            if (!insideTrigger && !insideMenu) {
                setOpen(false);
                setFocused(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const handleSelect = (e: EntityItem) => {
        if (isFormik) {
            const entityId = (e as any).remote_id ?? (e as any).id ?? '';
            formik.setFieldValue(idField, entityId);
            formik.setFieldValue(titleField, e.title ?? '');
            formik.setFieldTouched(titleField, true, false);
            safeValidateField(formik, idField);
            safeValidateField(formik, titleField);
            onAfterSelect?.(e);
        } else {
            controlledOnSelect?.(e);
        }
        rowPressInFlightRef.current = false;
        setOpen(false);
        setApiError(null);
        setRemoteResults(null);
    };

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
        if (query && results.length === 0) return 'No matching records found.';
        if (!query && results.length === 0) return 'Start typing to search.';
        return null;
    }, [loading, apiError, query, results.length]);

    const showDropdown = open && !disabled;
    const showClear = !!query && !loading;
    const isLoading = loading || externalLoading || false;

    const MenuContent = (
        <View
            className="rounded-xl border overflow-hidden"
            style={{
                maxHeight,
                backgroundColor: dropdownBg,
                borderColor: baseDelimiter,
                ...(Platform.OS === 'web'
                    ? ({ boxShadow: isDarkMode ? '0 12px 32px rgba(0,0,0,0.35)' : '0 12px 32px rgba(15,23,42,0.10)' } as any)
                    : { elevation: 24, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }),
            }}
        >
            <FlatList
                data={results}
                keyExtractor={(e, i) => String(e.remote_id ?? i)}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                style={{ flexGrow: 0, backgroundColor: dropdownBg }}
                renderItem={({ item }) => (
                    <EntityRow
                        entity={item}
                        borderColor={baseDelimiter}
                        hoverBg={hoverBg}
                        selectedBg={selectedBg}
                        primary={theme.primary}
                        textColor={theme.text}
                        textDarkColor={theme.textDark}
                        boldFont={theme.font.bold}
                        mediumFont={theme.font.medium}
                        showMeta={showMeta}
                        selected={effectiveValue != null && (item as any).remote_id === (effectiveValue as any).remote_id}
                        onPressIn={() => { rowPressInFlightRef.current = true; }}
                        onPress={() => handleSelect(item)}
                    />
                )}
                ListEmptyComponent={
                    emptyMessage ? (
                        <View className="py-5 px-4 items-center">
                            <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {emptyMessage}
                            </Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );

    let portal: any = null;
    if (Platform.OS === 'web' && showDropdown && ReactDOM && typeof document !== 'undefined' && anchor.width > 0) {
        portal = ReactDOM.createPortal(
            <div
                ref={(el: HTMLDivElement | null) => {
                    menuRef.current = el;
                    if (el && !(el as any).__waziGuard) {
                        (el as any).__waziGuard = true;
                        el.addEventListener('mousedown', (ev) => {
                            ev.preventDefault();
                            rowPressInFlightRef.current = true;
                        }, true);
                    }
                }}
                style={{ position: 'fixed', top: anchor.y + 4, left: anchor.x, width: anchor.width, zIndex: 2147483647, isolation: 'isolate' }}
            >
                {MenuContent}
            </div>,
            document.body
        );
    }

    return (
        <>
            <View
                testID={testID}
                className="w-full"
                style={Platform.OS === 'web' ? ({ zIndex: open ? 9999 : 1 } as any) : { zIndex: open ? 9999 : 1 }}
            >
                {label ? (
                    <View className="flex-row items-center mb-1 px-1">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                            {label}
                        </Text>
                        {required ? (
                            <Text className="ml-1" style={{ color: danger, fontFamily: theme.font.bold, fontSize: 10 }}>
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                <View style={{ width: '100%', position: 'relative' }}>
                    <Pressable
                        ref={triggerRef as any}
                        onPress={() => inputRef.current?.focus?.()}
                        className="flex-row rounded-xl border"
                        style={{
                            paddingHorizontal: HORIZONTAL_PADDING,
                            paddingVertical: VERTICAL_PADDING,
                            borderColor: effectiveError ? danger : focused || open ? focusDelimiter : baseDelimiter,
                            backgroundColor: inputBg,
                            opacity: disabled ? 0.55 : 1,
                            minHeight: MIN_TRIGGER_HEIGHT,
                            alignItems: 'flex-start',
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
                            multiline={true}
                            scrollEnabled={false}
                            textAlignVertical="top"
                            style={{
                                flex: 1,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: FONT_SIZE,
                                lineHeight: LINE_HEIGHT,
                                textAlign: 'left',
                                textAlignVertical: 'top',
                                minHeight: MIN_INPUT_HEIGHT,
                                paddingTop: 0,
                                paddingBottom: 0,
                                paddingLeft: 0,
                                paddingRight: 4,
                                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as any) : {}),
                            }}
                        />

                        <View style={{ marginTop: 6, marginLeft: 4, minWidth: 18, alignItems: 'center' }}>
                            {isLoading ? (
                                <ActivityIndicator size="small" color={theme.primary} />
                            ) : showClear ? (
                                <Pressable onPress={handleClear} hitSlop={8}>
                                    <Text style={{ color: theme.textDark, fontSize: 13 }}>✕</Text>
                                </Pressable>
                            ) : (
                                <Text style={{ color: theme.textDark, fontSize: 11 }}>▾</Text>
                            )}
                        </View>
                    </Pressable>

                    {Platform.OS !== 'web' && showDropdown ? (
                        <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 9999 }}>
                            {MenuContent}
                        </View>
                    ) : null}
                </View>

                {effectiveError ? (
                    <Text className="mt-1 px-1" style={{ color: danger, fontFamily: theme.font.medium, fontSize: 11 }}>
                        {effectiveError}
                    </Text>
                ) : helperText ? (
                    <Text className="mt-1 px-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, opacity: 0.75 }}>
                        {helperText}
                    </Text>
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

    const distanceText = entity.distance_km ? `📍 ${entity.distance_km} km` : null;
    const ratingText = entity.rating ? `★ ${entity.rating}` : null;
    const locationText = entity.town || entity.county_title || null;
    const phoneText = entity.phone || null;

    const metaParts = [locationText, phoneText].filter(Boolean);

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => {
                onPressIn?.();
                setPressed(true);
            }}
            onPressOut={() => setPressed(false)}
            onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
            className="flex-row items-center px-3 py-2.5 border-b"
            style={{
                borderBottomColor: borderColor,
                backgroundColor: selected ? selectedBg : active ? hoverBg : 'transparent',
            }}
        >
            <View className="flex-1 min-w-0">
                <Text
                    numberOfLines={1}
                    style={{ color: textColor, fontFamily: boldFont, fontSize: 13, lineHeight: 18 }}
                >
                    {entity.title || '—'}
                </Text>

                {showMeta && (metaParts.length > 0 || distanceText || ratingText) ? (
                    <View className="flex-row items-center flex-wrap mt-0.5">

                        {/* Distance Badge */}
                        {distanceText && (
                            <Text style={{ color: primary, fontFamily: boldFont, fontSize: 11, marginRight: 6 }}>
                                {distanceText}
                            </Text>
                        )}

                        {/* Rating Badge */}
                        {ratingText && (
                            <Text style={{ color: '#f59e0b', fontFamily: boldFont, fontSize: 11, marginRight: 6 }}>
                                {ratingText}
                            </Text>
                        )}

                        {/* Town & Phone */}
                        {metaParts.length > 0 && (
                            <Text
                                numberOfLines={1}
                                style={{ color: textDarkColor, fontFamily: mediumFont, fontSize: 11, lineHeight: 16 }}
                            >
                                {metaParts.join(' • ')}
                            </Text>
                        )}
                    </View>
                ) : null}
            </View>

            {selected ? (
                <Text className="ml-2" style={{ color: primary, fontSize: 13 }}>
                    ✓
                </Text>
            ) : null}
        </Pressable>
    );
}

