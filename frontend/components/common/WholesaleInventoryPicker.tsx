// components/common/WholesaleInventoryPicker.tsx
//
// Universal wholesale inventory picker.
// - Sources rows from useWholesalerReceiptsSync()
// - Autocomplete on title / bar_code / batch
// - Formik-aware via `name` (falls back to controlled mode)
// - On select, writes multiple fields into Formik (configurable via fieldMap)
// - Web: portal into document.body
// - Native: inline dropdown
// - NativeWind layout, useAuth() colors
//
// Filtering model:
//   - `productId` (optional) always scopes the list to receipts
//     whose `product_id` matches. No escape hatch.
//   - `filter` (optional) is an additional predicate.
//   - Text search narrows within the scoped list.
//   - On focus with no query: shows the scoped list (or a
//     "no match" message).
//   - On typing: filters the scoped list further.

import { useAuth } from '@/context/AuthContext';
import { useWholesalerReceiptsSync } from '@/context/WholesalerReceiptsSyncContext';
import { WholesalerReceipt } from '@/databases/types';
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
 * Logging
 * ======================================================= */

const LOG_TAG = '[WholesaleInventoryPicker]';
const log = (...args: any[]) => {
    if (__DEV__) console.log(LOG_TAG, ...args);
};

/* =========================================================
 * Types
 * ======================================================= */
export interface WholesaleInventoryFieldMap {
    id?: string;
    title?: string;
    bar_code?: string;
    batch?: string;
    thumbnail_url?: string;
    unit_of_receipt?: string;
    current_unit_quantity?: string;
    received_unit_quantity?: string;
    unit_buying_price?: string;
    final_unit_selling_price?: string;
    manufacture_date?: string;
    expiry_date?: string;
    product?: string;
}

export interface WholesaleInventoryPickerProps {
    /* -------- Formik integration -------- */
    name?: string;
    fieldMap?: WholesaleInventoryFieldMap;
    onAfterSelect?: (r: WholesalerReceipt) => void;

    /* -------- Controlled mode -------- */
    value?: WholesalerReceipt | null;
    onSelect?: (r: WholesalerReceipt) => void;
    onClear?: () => void;
    error?: string;

    /* -------- Shared -------- */
    placeholder?: string;
    maxDropdownHeight?: number;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    onSearch?: (
        query: string
    ) => Promise<WholesalerReceipt[]>;

    /**
     * Scope the list to receipts whose `product_id` matches.
     * When omitted, all in-stock receipts are shown.
     */
    productId?: string | null;

    /**
     * Additional predicate applied on top of productId and
     * in-stock filters.
     */
    filter?: (r: WholesalerReceipt) => boolean;

    inStockOnly?: boolean;

    testID?: string;
}

/* =========================================================
 * Helpers
 * ======================================================= */

function receiptProductId(
    r: WholesalerReceipt | null | undefined
): string {
    return r?.product_id ?? '';
}

/* =========================================================
 * Public component
 * ======================================================= */
export function WholesaleInventoryPicker(
    props: WholesaleInventoryPickerProps
) {
    if (!props.name) {
        return <ControlledPicker {...props} />;
    }
    return <FormikPicker {...props} />;
}

/* =========================================================
 * Formik wrapper
 * ======================================================= */
function FormikPicker(
    props: WholesaleInventoryPickerProps
) {
    const formik = useFormikContext<any>();

    const fm = props.fieldMap ?? {};
    const idField = fm.id ?? 'remote_id';
    const titleField = fm.title ?? 'title';
    const barField = fm.bar_code ?? 'bar_code';
    const batchField = fm.batch ?? 'batch';
    const thumbField = fm.thumbnail_url ?? 'thumbnail_url';
    const unitField =
        fm.unit_of_receipt ?? 'unit_of_receipt';
    const qtyField =
        fm.received_unit_quantity ??
        'received_unit_quantity';
    const buyField =
        fm.unit_buying_price ?? 'unit_buying_price';
    const sellField =
        fm.final_unit_selling_price ??
        'final_unit_selling_price';
    const mfgField =
        fm.manufacture_date ?? 'manufacture_date';
    const expField = fm.expiry_date ?? 'expiry_date';
    const productField = fm.product ?? 'product_id';

    const value: WholesalerReceipt | null = formik.values?.[
        titleField
    ]
        ? ({
            remote_id: String(
                formik.values?.[idField] ?? ''
            ),
            title: String(
                formik.values?.[titleField] ?? ''
            ),
            bar_code: String(
                formik.values?.[barField] ?? ''
            ),
            batch: formik.values?.[batchField] ?? null,
            thumbnail_url:
                formik.values?.[thumbField] ?? null,
        } as any)
        : null;

    const error: string | undefined =
        formik.touched?.[titleField] &&
            formik.errors?.[titleField]
            ? String(formik.errors[titleField])
            : undefined;

    const handleSelect = useCallback(
        (r: WholesalerReceipt) => {
            formik.setFieldValue(
                idField,
                r.remote_id ?? r.id
            );
            formik.setFieldValue(
                titleField,
                r.title ?? r.product_title ?? ''
            );
            formik.setFieldValue(
                barField,
                r.bar_code ?? ''
            );
            formik.setFieldValue(
                batchField,
                r.batch ?? ''
            );
            formik.setFieldValue(
                thumbField,
                r.thumbnail_url ?? ''
            );
            formik.setFieldValue(
                unitField,
                r.unit_of_receipt ?? ''
            );
            formik.setFieldValue(
                qtyField,
                Number(r.received_unit_quantity ?? 0)
            );
            formik.setFieldValue(
                buyField,
                Number(r.unit_buying_price ?? 0)
            );
            formik.setFieldValue(
                sellField,
                Number(
                    r.final_unit_selling_price ??
                    r.unit_selling_price ??
                    0
                )
            );
            formik.setFieldValue(
                mfgField,
                r.manufacture_date ?? ''
            );
            formik.setFieldValue(
                expField,
                r.expiry_date ?? ''
            );
            formik.setFieldValue(
                productField,
                String(r.product_id ?? r.remote_id ?? '')
            );

            formik.setFieldTouched(titleField, true, false);
            formik.validateField(titleField);

            props.onAfterSelect?.(r);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [formik]
    );

    const handleClear = useCallback(() => {
        formik.setFieldValue(idField, '');
        formik.setFieldValue(titleField, '');
        formik.setFieldValue(barField, '');
        formik.setFieldValue(batchField, '');
        formik.setFieldValue(thumbField, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formik]);

    return (
        <PickerInner
            {...props}
            value={value}
            error={error}
            onSelect={handleSelect}
            onClear={handleClear}
        />
    );
}

/* =========================================================
 * Controlled wrapper
 * ======================================================= */
function ControlledPicker(
    props: WholesaleInventoryPickerProps
) {
    return (
        <PickerInner
            {...props}
            value={props.value ?? null}
            error={props.error}
            onSelect={(r) => props.onSelect?.(r)}
            onClear={() => props.onClear?.()}
        />
    );
}

/* =========================================================
 * Inner
 * ======================================================= */
interface PickerInnerProps
    extends WholesaleInventoryPickerProps {
    value: WholesalerReceipt | null;
    error: string | undefined;
    onSelect: (r: WholesalerReceipt) => void;
    onClear: () => void;
}

function PickerInner({
    value,
    error,
    onSelect,
    onClear,

    onSearch,
    productId,
    filter,
    inStockOnly = false,

    placeholder = 'Search inventory…',
    maxDropdownHeight = 360,
    disabled,
    label,
    required,
    testID,
}: PickerInnerProps) {
    const { theme, isDarkMode } = useAuth();
    const { wholesalerReceipts, isSyncing } =
        useWholesalerReceiptsSync();

    const contextCount = wholesalerReceipts?.length ?? 0;

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const thumbBg = isDarkMode ? '#1e293b' : '#e2e8f0';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode
        ? '#334155'
        : '#cbd5e1';
    const hoverBg = isDarkMode ? '#1e293b' : '#f1f5f9';
    const placeholderColor = '#94a3b8';
    const danger = '#ef4444';

    /* -------- State -------- */
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [anchor, setAnchor] = useState({
        x: 0,
        y: 0,
        width: 0,
    });
    const [remoteResults, setRemoteResults] = useState<
        WholesalerReceipt[] | null
    >(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(
        null
    );

    /* -------- Refs -------- */
    const inputRef = useRef<TextInput>(null);
    const triggerRef = useRef<View>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null);
    const rowPressInFlightRef = useRef(false);

    /* ---------------------------------------------------------
     * Base list — scoped by productId, then in-stock, then by
     * the caller's extra filter. No override.
     * ------------------------------------------------------- */
    const baseList = useMemo(() => {
        let list = wholesalerReceipts ?? [];
        const contextTotal = list.length;

        if (productId) {
            const target = String(productId).trim();
            list = list.filter(
                (r) => receiptProductId(r) === target
            );
        }
        const afterProduct = list.length;

        if (inStockOnly) {
            list = list.filter(
                (r) =>
                    Number(r.current_unit_quantity ?? 0) > 0
            );
        }
        const afterStock = list.length;

        if (filter) {
            list = list.filter(filter);
        }

        if (__DEV__) {
            log('baseList computed', {
                productId: productId ?? '(none)',
                contextTotal,
                afterProduct,
                afterStock,
                afterFilter: list.length,
            });
        }

        return list;
    }, [
        wholesalerReceipts,
        productId,
        inStockOnly,
        filter,
    ]);

    /* -------- Sync input with selected value -------- */
    useEffect(() => {
        if (value) {
            setQuery(String(value.title ?? ''));
        } else if (!open) {
            setQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    /* -------- Local text filter -------- */
    const filterLocally = useCallback(
        (q: string) => {
            if (!q) return baseList;
            const needle = q.toLowerCase();
            return baseList.filter((r) => {
                const t = String(r.title ?? '').toLowerCase();
                const b = String(
                    r.bar_code ?? ''
                ).toLowerCase();
                const bt = String(
                    r.batch ?? ''
                ).toLowerCase();
                return (
                    t.includes(needle) ||
                    b.includes(needle) ||
                    bt.includes(needle)
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
                setRemoteResults(res);
            } catch (e: any) {
                setApiError(
                    e?.message ??
                    'Failed to search inventory.'
                );
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [query, open, onSearch]);

    /* -------- Display list -------- */
    const results = useMemo(() => {
        if (remoteResults) return remoteResults;
        return filterLocally(query);
    }, [remoteResults, query, filterLocally]);

    /* ---------------------------------------------------------
     * Diagnostics
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!open) return;
        const all = wholesalerReceipts ?? [];
        const sample = all[0];
        log('dropdown opened', {
            contextTotal: all.length,
            baseList: baseList.length,
            results: results.length,
            productId: productId ?? '(none)',
            inStockOnly,
            isSyncing,
            sample: sample
                ? {
                    remote_id: sample.remote_id,
                    product_id: sample.product_id,
                    product_title: sample.product_title,
                    title: sample.title,
                    qty: sample.current_unit_quantity,
                }
                : '(empty)',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!__DEV__ || !open) return;
        log('filter tick', {
            query,
            contextTotal: contextCount,
            baseList: baseList.length,
            results: results.length,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        open,
        query,
        contextCount,
        baseList.length,
        results.length,
    ]);

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

    /* -------- Handlers -------- */
    const handleSelectInternal = (r: WholesalerReceipt) => {
        onSelect(r);
        rowPressInFlightRef.current = false;
        setOpen(false);
        setApiError(null);
        setRemoteResults(null);
    };

    const handleClearInternal = () => {
        onClear();
        setQuery('');
        setRemoteResults(null);
        inputRef.current?.focus?.();
    };

    const handleClearSearch = useCallback(() => {
        setQuery('');
        inputRef.current?.focus?.();
    }, []);

    /* ---------------------------------------------------------
     * Empty state
     *
     *   No query + empty base list  → "no match for product"
     *   No query + non-empty base   → (never reached; rows show)
     *   Query + empty results       → search miss + Clear search
     * ------------------------------------------------------- */
    const emptyState = useMemo(() => {
        if (loading || apiError) return null;
        if (results.length > 0) return null;

        const hasQuery = query.trim().length > 0;

        if (!hasQuery) {
            if (isSyncing && contextCount === 0) {
                return {
                    message: 'Loading inventory…',
                    showClear: false,
                };
            }
            if (contextCount === 0) {
                return {
                    message: 'No inventory available',
                    showClear: false,
                };
            }
            if (productId && baseList.length === 0) {
                return {
                    message:
                        'No matching inventory for this product.',
                    showClear: false,
                };
            }
            return {
                message: 'Nothing in stock.',
                showClear: false,
            };
        }

        // Search mode — results are empty
        if (baseList.length === 0) {
            return {
                message:
                    productId
                        ? 'No matching inventory for this product.'
                        : 'No inventory in stock.',
                showClear: false,
            };
        }

        return {
            message:
                `No matches for "${query.trim()}" — ` +
                `${baseList.length} item${baseList.length === 1 ? '' : 's'
                } available.`,
            showClear: true,
        };
    }, [
        loading,
        apiError,
        results.length,
        query,
        contextCount,
        baseList.length,
        isSyncing,
        productId,
    ]);

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
            {productId && baseList.length > 0 ? (
                <View
                    className="px-3 py-1.5 border-b"
                    style={{
                        borderBottomColor: borderColor,
                        backgroundColor: isDarkMode
                            ? 'rgba(99,102,241,0.1)'
                            : 'rgba(99,102,241,0.06)',
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: 9,
                            letterSpacing: 0.5,
                        }}
                    >
                        MATCHING THIS PRODUCT · {baseList.length}
                    </Text>
                </View>
            ) : null}

            <FlatList
                data={results}
                keyExtractor={(r, i) =>
                    String(
                        r.remote_id ?? r.draft_id ?? i
                    )
                }
                keyboardShouldPersistTaps="handled"
                style={{
                    flexGrow: 0,
                    backgroundColor: dropdownBg,
                }}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={5}
                removeClippedSubviews
                renderItem={({ item }) => (
                    <InventoryRow
                        receipt={item}
                        borderColor={borderColor}
                        hoverBg={hoverBg}
                        thumbBg={thumbBg}
                        primary={theme.primary}
                        textColor={theme.text}
                        textDarkColor={theme.textDark}
                        boldFont={theme.font.bold}
                        mediumFont={theme.font.medium}
                        onPressIn={() => {
                            rowPressInFlightRef.current = true;
                        }}
                        onPress={() =>
                            handleSelectInternal(item)
                        }
                    />
                )}
                ListEmptyComponent={
                    emptyState ? (
                        <View className="py-5 px-4 items-center">
                            <Text
                                className="text-center"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            >
                                {emptyState.message}
                            </Text>
                            {emptyState.showClear ? (
                                <Pressable
                                    onPress={handleClearSearch}
                                    className="mt-3 px-4 py-2 rounded-lg"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-widest text-white"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 10,
                                        }}
                                    >
                                        Clear search
                                    </Text>
                                </Pressable>
                            ) : null}
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
                                    fontFamily:
                                        theme.font.bold,
                                }}
                            >
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                <Pressable
                    ref={triggerRef as any}
                    onPress={() =>
                        inputRef.current?.focus?.()
                    }
                    className="flex-row items-center rounded-xl border px-3"
                    style={{
                        borderColor: error
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
                        {value?.thumbnail_url ? (
                            <Image
                                source={{
                                    uri: String(
                                        value.thumbnail_url
                                    ),
                                }}
                                className="w-full h-full"
                                resizeMode="cover"
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

                    {loading || isSyncing ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.primary}
                        />
                    ) : showClear ? (
                        <Pressable
                            onPress={handleClearInternal}
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

                {error ? (
                    <Text
                        className="mt-1 text-[11px]"
                        style={{
                            color: danger,
                            fontFamily: theme.font.medium,
                        }}
                    >
                        {error}
                    </Text>
                ) : null}

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

            {portal}
        </>
    );
}

/* =========================================================
 * Row
 * ======================================================= */
function InventoryRow({
    receipt,
    borderColor,
    hoverBg,
    thumbBg,
    primary,
    textColor,
    textDarkColor,
    boldFont,
    mediumFont,
    onPress,
    onPressIn,
}: {
    receipt: WholesalerReceipt;
    borderColor: string;
    hoverBg: string;
    thumbBg: string;
    primary: string;
    textColor: string;
    textDarkColor: string;
    boldFont: string;
    mediumFont: string;
    onPress: () => void;
    onPressIn?: () => void;
}) {
    const title = String(receipt.title ?? '—');
    const barCode = String(receipt.bar_code ?? '').trim();
    const batch = receipt.batch ? String(receipt.batch) : '';
    const qty = Number(receipt.current_unit_quantity ?? 0);
    const unit = String(receipt.unit_of_receipt ?? '');
    const price = Number(
        receipt.final_unit_selling_price ??
        receipt.unit_selling_price ??
        0
    );
    const imageUri = receipt.thumbnail_url as
        | string
        | undefined;

    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    const active = hovered || pressed;

    const lowStock = qty > 0 && qty <= 5;
    const outOfStock = qty <= 0;

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
                backgroundColor: active ? hoverBg : 'transparent',
            }}
        >
            <View
                className="rounded-lg overflow-hidden mr-3"
                style={{
                    width: 40,
                    height: 40,
                    backgroundColor: thumbBg,
                }}
            >
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        className="w-full h-full"
                        resizeMode="cover"
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

                <View className="flex-row items-center gap-2 mt-[2px] flex-wrap">
                    {barCode ? (
                        <Text
                            numberOfLines={1}
                            style={{
                                color: textDarkColor,
                                fontFamily: mediumFont,
                                fontSize: 10,
                            }}
                        >
                            {barCode}
                        </Text>
                    ) : null}

                    {batch ? (
                        <Text
                            numberOfLines={1}
                            style={{
                                color: textDarkColor,
                                fontFamily: mediumFont,
                                fontSize: 10,
                            }}
                        >
                            • Batch {batch}
                        </Text>
                    ) : null}

                    <View
                        className="px-1.5 py-[1px] rounded"
                        style={{
                            backgroundColor: outOfStock
                                ? 'rgba(239,68,68,0.15)'
                                : lowStock
                                    ? 'rgba(251,191,36,0.18)'
                                    : 'rgba(16,185,129,0.15)',
                        }}
                    >
                        <Text
                            style={{
                                color: outOfStock
                                    ? '#ef4444'
                                    : lowStock
                                        ? '#f59e0b'
                                        : '#10b981',
                                fontFamily: boldFont,
                                fontSize: 10,
                            }}
                        >
                            {qty} {unit || 'u'}
                        </Text>
                    </View>

                    <Text
                        style={{
                            color: primary,
                            fontFamily: boldFont,
                            fontSize: 10,
                        }}
                    >
                        KES {price.toFixed(2)}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}