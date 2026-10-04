// components/common/ProductPickerAutocomplete.tsx
//
// Universal autocomplete product picker.
// - React Native (iOS / Android) + React Native Web
// - Formik-aware via `name` (falls back to controlled mode)
// - Opaque dropdown
// - Web: rendered via ReactDOM portal into document.body
// - Single-tap select (no blur race) on both web and native
// - Tolerant image resolution (string | string[] | object[] | object)
// - Web rows are plain DOM <div> so click always fires inside the portal
// - Schema-safe validation: never crashes on missing field paths

import { useAuth } from '@/context/AuthContext';
import { Product } from '@/databases/types';
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
    Image,
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
 * Image URL resolution
 * ======================================================= */
const IMAGE_KEY_CANDIDATES = [
    'thumbnail_url',
    'thumbnail',
    'image_url',
    'image',
    'images',
    'photos',
    'media',
    'picture',
];

function tryExtractImage(raw: any): string | undefined {
    if (!raw) return undefined;

    if (typeof raw === 'string') return raw || undefined;

    if (Array.isArray(raw)) {
        const first = raw[0];
        if (!first) return undefined;
        if (typeof first === 'string') return first || undefined;
        return (
            (first?.thumbnail as string) ||
            (first?.image as string) ||
            (first?.url as string) ||
            undefined
        );
    }

    if (typeof raw === 'object') {
        return (
            (raw.thumbnail as string) ||
            (raw.image as string) ||
            (raw.url as string) ||
            undefined
        );
    }

    return undefined;
}

export function resolveImageUri(
    source: any,
    key: string = 'thumbnail_url'
): string | undefined {
    if (!source) return undefined;
    const ordered = [
        key,
        ...IMAGE_KEY_CANDIDATES.filter((k) => k !== key),
    ];
    for (const k of ordered) {
        const result = tryExtractImage(source[k]);
        if (result) return result;
    }
    return undefined;
}

/* =========================================================
 * Safe field validation
 *
 * Formik `validateField(name)` throws (or returns a rejecting
 * promise) if `name` is not a path in the Yup schema. Callers
 * frequently don't declare the *display* field (e.g.
 * `product_title`) in their schema — only the id. Swallow both
 * sync and async errors so a missing path never crashes the UI.
 * ======================================================= */
function safeValidateField(formik: any, field: string) {
    if (!formik?.validateField || !field) return;

    // Cheap guard: skip if the field isn't even in initialValues.
    const iv = formik.initialValues;
    if (iv && !(field in iv)) return;

    try {
        const result = formik.validateField(field);
        if (result && typeof (result as any).catch === 'function') {
            (result as any).catch(() => { });
        }
    } catch {
        // Synchronous throw from Yup — safe to ignore.
    }
}

/* =========================================================
 * Types
 * ======================================================= */
export interface ProductPickerAutocompleteProps {
    name?: string;
    fieldMap?: {
        id?: string;
        title?: string;
        bar_code?: string;
        thumbnail_url?: string;
    };
    onAfterSelect?: (p: any) => void;

    value?: Product | null;
    onSelect?: (product: Product) => void;
    onClear?: () => void;
    error?: string;

    onSearch?: (query: string) => Promise<Product[]>;
    products?: Product[];

    titleKey?: string;
    subtitleKey?: string;
    imageKey?: string;

    placeholder?: string;
    minChars?: number;
    debounceMs?: number;
    maxDropdownHeight?: number;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    testID?: string;
}

/* =========================================================
 * Component
 * ======================================================= */
export function ProductPickerAutocomplete({
    name,
    fieldMap,
    onAfterSelect,

    value: controlledValue,
    onSelect: controlledOnSelect,
    onClear: controlledOnClear,
    error: controlledError,

    onSearch,
    products,

    titleKey = 'title',
    subtitleKey = 'bar_code',
    imageKey = 'thumbnail_url',

    placeholder = 'Search products…',
    minChars = 0,
    debounceMs = 250,
    maxDropdownHeight = 320,
    disabled,
    label,
    required,
    testID,
}: ProductPickerAutocompleteProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* ---- Dev diagnostic: no FormikProvider wrapping the tree ---- */
    const warnedRef = useRef(false);
    useEffect(() => {
        if (__DEV__ && name && !formik && !warnedRef.current) {
            warnedRef.current = true;
            console.warn(
                '[ProductPicker] `name` was provided but no Formik context was found. ' +
                'Wrap the tree in <FormikProvider value={formik}> or drop `name` ' +
                'and use the controlled `value` / `onSelect` props instead.'
            );
        }
    }, [name, formik]);

    const fm = fieldMap ?? {};
    const idField = fm.id ?? 'product_id';
    const titleField = fm.title ?? 'title';
    const barField = fm.bar_code ?? 'bar_code';
    const thumbField = fm.thumbnail_url ?? 'thumbnail_url';

    /* -------- Effective value -------- */
    const effectiveValue: any = isFormik
        ? formik.values?.[titleField]
            ? {
                id: formik.values?.[idField],
                title: formik.values?.[titleField],
                bar_code: formik.values?.[barField],
                [thumbField]: formik.values?.[thumbField],
            }
            : null
        : controlledValue ?? null;

    /* -------- Trigger image URI -------- */
    const triggerImageUri: string | undefined = isFormik
        ? (formik.values?.[thumbField] as string) || undefined
        : resolveImageUri(controlledValue ?? undefined, imageKey);

    /* -------- Effective error -------- */
    const effectiveError: string | undefined = isFormik
        ? formik.touched?.[titleField] &&
            formik.errors?.[titleField]
            ? String(formik.errors[titleField])
            : undefined
        : controlledError;

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const thumbBg = isDarkMode ? '#1e293b' : '#e2e8f0';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode ? '#334155' : '#cbd5e1';
    const hoverBg = isDarkMode ? '#1e293b' : '#f1f5f9';
    const placeholderColor = '#94a3b8';
    const danger = '#ef4444';
    const selectedBg = `${theme.primary}15`;

    /* -------- State -------- */
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Product[]>(
        products ?? []
    );
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
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

    /* -------- Seed from props -------- */
    useEffect(() => {
        if (products) setResults(products);
    }, [products]);

    /* -------- Sync input text with selected value -------- */
    useEffect(() => {
        if (effectiveValue) {
            setQuery(
                String((effectiveValue as any)[titleKey] ?? '')
            );
        } else if (!open) {
            setQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveValue]);

    /* -------- Search -------- */
    const runSearch = useCallback(
        async (q: string) => {
            setApiError(null);

            if (!onSearch) {
                const list = products ?? [];
                if (!q) {
                    setResults(list);
                    return;
                }
                const needle = q.toLowerCase();
                setResults(
                    list.filter((p) => {
                        const t = String(
                            (p as any)[titleKey] ?? ''
                        ).toLowerCase();
                        const s = String(
                            (p as any)[subtitleKey] ?? ''
                        ).toLowerCase();
                        return (
                            t.includes(needle) ||
                            s.includes(needle)
                        );
                    })
                );
                return;
            }

            if (q.length < minChars) {
                setResults(products ?? []);
                return;
            }

            try {
                setLoading(true);
                const res = await onSearch(q);
                setResults(res);
            } catch (e: any) {
                setApiError(
                    e?.message ?? 'Failed to load products.'
                );
            } finally {
                setLoading(false);
            }
        },
        [onSearch, products, titleKey, subtitleKey, minChars]
    );

    useEffect(() => {
        if (!open) return;
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            runSearch(query);
        }, debounceMs);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [query, open, debounceMs, runSearch]);

    /* -------- Measure trigger (web) -------- */
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

    /* -------- Re-measure on scroll / resize -------- */
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

    /* -------- Click outside closes (web) -------- */
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
    const handleSelect = (p: Product) => {
        const resolvedThumb =
            resolveImageUri(p, imageKey) ?? '';

        if (isFormik) {
            formik.setFieldValue(
                idField,
                (p as any).remote_id ?? (p as any).id
            );
            formik.setFieldValue(
                titleField,
                (p as any).title ??
                (p as any).product_title ??
                ''
            );
            formik.setFieldValue(
                barField,
                (p as any).bar_code ?? ''
            );
            formik.setFieldValue(thumbField, resolvedThumb);

            formik.setFieldTouched(titleField, true, false);

            // Schema-safe validation — no crash if the caller's
            // Yup schema omits either field.
            safeValidateField(formik, idField);
            safeValidateField(formik, titleField);

            onAfterSelect?.(p);
        } else {
            controlledOnSelect?.(p);
        }
        rowPressInFlightRef.current = false;
        setOpen(false);
        setApiError(null);
    };

    /* -------- Clear -------- */
    const handleClear = () => {
        if (isFormik) {
            formik.setFieldValue(idField, undefined);
            formik.setFieldValue(titleField, '');
            formik.setFieldValue(barField, '');
            formik.setFieldValue(thumbField, '');
        } else {
            controlledOnClear?.();
        }
        setQuery('');
        setResults(products ?? []);
        inputRef.current?.focus?.();
    };

    const emptyMessage = useMemo(() => {
        if (loading || apiError) return null;
        if (query && results.length === 0)
            return 'No products match your search.';
        if (!query && results.length === 0)
            return 'Start typing to search products.';
        return null;
    }, [loading, apiError, query, results.length]);

    const showDropdown = open && !disabled;
    const showClear = !!query && !loading;

    /* =========================================================
     * Menu content
     * ======================================================= */
    const MenuContent = (
        <View
            className="rounded-xl border overflow-hidden"
            style={{
                maxHeight: maxDropdownHeight,
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
                keyExtractor={(p, i) =>
                    String(
                        (p as any).remote_id ??
                        (p as any).id ??
                        i
                    )
                }
                keyboardShouldPersistTaps="handled"
                style={{
                    flexGrow: 0,
                    backgroundColor: dropdownBg,
                }}
                renderItem={({ item }) => (
                    <ProductRow
                        product={item}
                        titleKey={titleKey}
                        subtitleKey={subtitleKey}
                        imageKey={imageKey}
                        hoverBg={hoverBg}
                        selectedBg={selectedBg}
                        borderColor={borderColor}
                        thumbBg={thumbBg}
                        primary={theme.primary}
                        textColor={theme.text}
                        textDarkColor={theme.textDark}
                        boldFont={theme.font.bold}
                        mediumFont={theme.font.medium}
                        selected={
                            effectiveValue != null &&
                            (item as any).id ===
                            (effectiveValue as any).id
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
                            () => {
                                rowPressInFlightRef.current =
                                    true;
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
                {/* -------- Label -------- */}
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

                {/* -------- Trigger -------- */}
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
                    <View
                        className="rounded-lg overflow-hidden mr-2.5"
                        style={{
                            width: 32,
                            height: 32,
                            backgroundColor: thumbBg,
                        }}
                    >
                        {triggerImageUri ? (
                            <Image
                                source={{ uri: triggerImageUri }}
                                className="w-full h-full"
                                resizeMode="cover"
                                onError={(e) =>
                                    console.warn(
                                        '[ProductPicker] trigger image failed',
                                        {
                                            uri: triggerImageUri,
                                            error: e?.nativeEvent,
                                        }
                                    )
                                }
                            />
                        ) : null}
                    </View>

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

                    {loading ? (
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

                {/* -------- Error -------- */}
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
                ) : null}

                {/* -------- Native inline dropdown -------- */}
                {Platform.OS !== 'web' && showDropdown ? (
                    <View
                        className="absolute left-0 right-0 rounded-xl"
                        style={{
                            top: 68,
                            zIndex: 9999,
                        }}
                    >
                        {MenuContent}
                    </View>
                ) : null}
            </View>

            {/* -------- Web portal -------- */}
            {portal}
        </>
    );
}

/* =========================================================
 * Row
 * ======================================================= */
function ProductRow({
    product,
    titleKey,
    subtitleKey,
    imageKey,
    hoverBg,
    selectedBg,
    borderColor,
    thumbBg,
    primary,
    textColor,
    textDarkColor,
    boldFont,
    mediumFont,
    selected,
    onPress,
    onPressIn,
}: {
    product: Product;
    titleKey: string;
    subtitleKey: string;
    imageKey: string;
    hoverBg: string;
    selectedBg: string;
    borderColor: string;
    thumbBg: string;
    primary: string;
    textColor: string;
    textDarkColor: string;
    boldFont: string;
    mediumFont: string;
    selected?: boolean;
    onPress: () => void;
    onPressIn?: () => void;
}) {
    const title = String((product as any)[titleKey] ?? '—');
    const subtitle = String(
        (product as any)[subtitleKey] ?? ''
    ).trim();

    const imageUri = resolveImageUri(product, imageKey);

    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    const active = hovered || pressed;

    /* -------- Shared content -------- */
    const content = (
        <>
            <View
                className="rounded-lg overflow-hidden mr-3"
                style={{
                    width: 36,
                    height: 36,
                    backgroundColor: thumbBg,
                }}
            >
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        className="w-full h-full"
                        resizeMode="cover"
                        onError={(e) =>
                            console.warn(
                                '[ProductPicker] row image failed',
                                {
                                    uri: imageUri,
                                    error: e?.nativeEvent,
                                }
                            )
                        }
                    />
                ) : null}
            </View>

            <View className="flex-1 min-w-0">
                <Text
                    numberOfLines={1}
                    style={{
                        color: textColor,
                        fontFamily: boldFont,
                        fontSize: 13,
                    }}
                >
                    {title}
                </Text>
                {subtitle ? (
                    <Text
                        numberOfLines={1}
                        className="mt-[1px]"
                        style={{
                            color: textDarkColor,
                            fontFamily: mediumFont,
                            fontSize: 11,
                        }}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>

            {selected ? (
                <Text
                    className="ml-2"
                    style={{
                        color: primary,
                        fontSize: 13,
                    }}
                >
                    ✓
                </Text>
            ) : null}
        </>
    );

    /* -------- Web: plain DOM <div> -------- */
    if (Platform.OS === 'web') {
        return React.createElement(
            'div',
            {
                onClick: (e: any) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPress();
                },
                onMouseDown: (e: any) => {
                    e.preventDefault();
                    onPressIn?.();
                    setPressed(true);
                },
                onMouseUp: () => setPressed(false),
                onMouseEnter: () => setHovered(true),
                onMouseLeave: () => {
                    setHovered(false);
                    setPressed(false);
                },
                style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderBottom: `1px solid ${borderColor}`,
                    backgroundColor: selected
                        ? selectedBg
                        : active
                            ? hoverBg
                            : 'transparent',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                },
            },
            content
        );
    }

    /* -------- Native: RN Pressable -------- */
    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => {
                onPressIn?.();
                setPressed(true);
            }}
            onPressOut={() => setPressed(false)}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
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
            {content}
        </Pressable>
    );
}