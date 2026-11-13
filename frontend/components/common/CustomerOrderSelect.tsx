// components/common/CustomerOrderSelect.tsx
//
// Server-backed customer-order picker with local-first search.
//
// On every keystroke:
//   1. The local context array (useCustomerOrdersSync) is filtered
//      synchronously. If any match, those are shown immediately.
//   2. If nothing matches locally, a debounced
//      SearchCustomerOrders request fires against the backend.
//
// Both sources are normalized to `CustomerOrderOption`
// (@/databases/types) so the dropdown renders identically
// regardless of source.

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useCustomerOrdersSync } from '@/context/CustomerOrdersSyncContext';
import type { CustomerOrderOption } from '@/databases/types';
import { useFormikContext } from 'formik';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import * as ReactDOM from 'react-dom';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Constants
 * ======================================================= */

const DEBOUNCE_MS = 300;
const DEFAULT_MIN_CHARS = 2;
const LOCAL_RESULT_CAP = 25;
const REMOTE_PAGE_SIZE = 25;

/* =========================================================
 * Props
 * ======================================================= */

interface CustomerOrderSelectProps {
    /* -------- Formik integration -------- */
    name?: string;
    onAfterSelect?: (o: CustomerOrderOption) => void;

    /* -------- Controlled mode -------- */
    value?: string;
    onChange?: (orderId: string) => void;
    onClear?: () => void;
    error?: string;

    /** Display label for the currently selected value. */
    selectedLabel?: string;

    /* -------- Shared -------- */
    label?: string;
    placeholder?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    maxDropdownHeight?: number;
    minSearchLength?: number;

    /**
     * Restrict search to orders that contain this retailer receipt
     * (by UUID). Applied to both the local filter and the backend
     * request.
     */
    receiptId?: string | null;

    /**
     * When true, local search also covers `localCustomerOrders`
     * (unsynced). Defaults to false — pending orders have no server
     * UUID and can't be submitted to CreateSalesReturn.
     */
    includePending?: boolean;

    testID?: string;
}

/* =========================================================
 * Normalization — collapse both shapes into CustomerOrderOption
 *
 *   Field             WS context        Serializer
 *   ---------------   ---------------   -----------------------
 *   UUID              remote_id         id
 *   Total             total_amount      order_price_total
 *   Fulfillment       fulfillment_      status
 *                     status
 * ======================================================= */

function formatKES(v: number | string | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function normalizeOrder(raw: any): CustomerOrderOption {
    const id = String(
        raw?.remote_id ?? raw?.id ?? raw?.remote_key ?? '',
    );

    const num = raw?.order_number;
    const label =
        num && num !== '---'
            ? String(num)
            : String(
                raw?.customer_name ??
                raw?.customerName ??
                'Unnumbered order',
            );

    const parts: string[] = [];

    const name = raw?.customer_name ?? raw?.customerName;
    if (name) parts.push(String(name));

    const total =
        raw?.total_amount ??
        raw?.order_price_total ??
        raw?.order_net_price_total;
    if (total !== '' && total !== null && total !== undefined) {
        parts.push(`KES ${formatKES(total)}`);
    }

    const status = raw?.fulfillment_status ?? raw?.status;
    if (status) parts.push(String(status).toUpperCase());

    return {
        id,
        label,
        description: parts.join(' · '),
        raw,
    };
}

/* =========================================================
 * Local match helpers
 * ======================================================= */

function localMatchesQuery(order: any, needle: string): boolean {
    const lower = needle.toLowerCase();
    const fields = [
        order?.order_number,
        order?.customer_name,
        order?.customerName,
        order?.customer_phone,
        order?.customerPhone,
        order?.reference_number,
        order?.psp_reference_number,
        order?.provider_reference_number,
    ];
    return fields.some((f) =>
        String(f ?? '').toLowerCase().includes(lower),
    );
}

function itemReceiptIds(item: any): string[] {
    if (!item) return [];
    const out: string[] = [];
    const push = (v: any) => {
        if (v === undefined || v === null) return;
        const s = String(v).trim();
        if (s) out.push(s);
    };

    push(item.retailer_receipt);
    push(item.retailer_receipt_id);
    push(item.receipt);
    push(item.receipt_id);

    const details = item.receipt_details;
    if (details && typeof details === 'object') {
        push(details.id);
        push(details.remote_id);
        push(details.retailer_receipt);
    }
    return out;
}

function orderContainsReceipt(order: any, receiptId: string): boolean {
    const items = order?.order_items ?? [];
    if (!Array.isArray(items)) return false;
    const target = String(receiptId).trim();
    return items.some((it: any) =>
        itemReceiptIds(it).includes(target),
    );
}

/* =========================================================
 * Public component
 * ======================================================= */

export function CustomerOrderSelect(props: CustomerOrderSelectProps) {
    if (props.name) return <FormikWrapper {...props} />;
    return <ControlledWrapper {...props} />;
}

/* =========================================================
 * Formik wrapper
 * ======================================================= */

function FormikWrapper(props: CustomerOrderSelectProps) {
    const formik = useFormikContext<any>();

    const value = (formik.values?.[props.name!] as string) ?? '';

    const error: string | undefined =
        formik.touched?.[props.name!] && formik.errors?.[props.name!]
            ? String(formik.errors[props.name!])
            : undefined;

    const handleChange = useCallback(
        (id: string) => {
            formik.setFieldValue(props.name!, id);
            formik.setFieldTouched(props.name!, true, false);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [formik, props.name],
    );

    return (
        <Inner
            {...props}
            value={value}
            error={error}
            onChange={handleChange}
        />
    );
}

/* =========================================================
 * Controlled wrapper
 * ======================================================= */

function ControlledWrapper(props: CustomerOrderSelectProps) {
    return (
        <Inner
            {...props}
            value={props.value ?? ''}
            error={props.error}
            onChange={(v) => props.onChange?.(v)}
        />
    );
}

/* =========================================================
 * Inner
 * ======================================================= */

interface InnerProps extends CustomerOrderSelectProps {
    value: string;
    error?: string;
    onChange: (id: string) => void;
}

function Inner({
    value,
    error: fieldError,
    onChange,
    onClear,
    onAfterSelect,

    selectedLabel,

    label,
    placeholder = 'Type order #, name or phone…',
    helperText,
    required,
    disabled,
    maxDropdownHeight = 320,
    minSearchLength = DEFAULT_MIN_CHARS,
    receiptId,
    includePending = false,
    testID,
}: InnerProps) {
    const { theme, isDarkMode } = useAuth();
    const { customerOrders, localCustomerOrders } = useCustomerOrdersSync();

    /* -------- Theme -------- */
    const borderColor = fieldError
        ? '#ef4444'
        : isDarkMode
            ? '#334155'
            : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode ? '#334155' : '#cbd5e1';
    const placeholderColor = '#94a3b8';
    const danger = '#ef4444';

    /* -------- State -------- */
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [results, setResults] = useState<CustomerOrderOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0 });

    /* -------- Refs -------- */
    const inputRef = useRef<TextInput>(null);
    const triggerRef = useRef<View>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rowPressInFlightRef = useRef(false);

    /* -------- Local source (raw records, still un-normalized) -------- */
    const localSource = useMemo<any[]>(() => {
        const base = customerOrders ?? [];
        if (!includePending) return base;

        const seen = new Set(
            base.map((o) => String(o.remote_id ?? '')).filter(Boolean),
        );
        const extras = (localCustomerOrders ?? []).filter((o) => {
            const rid = String(o.remote_id ?? '');
            return !rid || !seen.has(rid);
        });
        return [...base, ...extras];
    }, [customerOrders, localCustomerOrders, includePending]);

    /* -------- Sync input text with selected value -------- */
    // Only when the input is not focused — while the user is typing,
    // their keystrokes own the field.
    useEffect(() => {
        if (focused || open) return;
        if (!value) {
            setQuery('');
            return;
        }
        setQuery(selectedLabel ?? '');
    }, [value, selectedLabel, focused, open]);

    /* -------- Local-first search, remote fallback -------- */
    useEffect(() => {
        if (!open) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }

        const trimmed = query.trim();

        // Idle / below threshold / showing the current label → clear.
        if (
            trimmed.length < minSearchLength ||
            trimmed === (selectedLabel ?? '').trim()
        ) {
            setResults([]);
            setApiError(null);
            setLoading(false);
            return;
        }

        /* ---------- 1. Local ---------- */
        const localFiltered = localSource
            .filter((o) =>
                !receiptId || orderContainsReceipt(o, receiptId),
            )
            .filter((o) => localMatchesQuery(o, trimmed))
            .slice(0, LOCAL_RESULT_CAP);

        if (localFiltered.length > 0) {
            setResults(localFiltered.map(normalizeOrder));
            setApiError(null);
            setLoading(false);
            return;
        }

        /* ---------- 2. Remote (debounced) ---------- */
        setLoading(true);

        debounceRef.current = setTimeout(async () => {
            try {
                setApiError(null);
                const res = await retailersApi.searchCustomerOrdersAction({
                    search_param: trimmed,
                    receipt_id: receiptId ?? undefined,
                    page: 1,
                    page_size: REMOTE_PAGE_SIZE,
                });
                const body = res.data as any;
                const rawResults: any[] = body?.results ?? [];
                setResults(rawResults.map(normalizeOrder));
            } catch (e: any) {
                setApiError(
                    e?.response?.data?.detail ||
                    e?.message ||
                    'Search failed.',
                );
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
        };
    }, [
        query,
        open,
        minSearchLength,
        receiptId,
        selectedLabel,
        localSource,
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
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        const r = el.getBoundingClientRect();
        setAnchor({ x: r.left, y: r.bottom, width: r.width });
    }, []);

    const openDropdown = () => {
        if (disabled) return;
        measure();
        setOpen(true);
        if (Platform.OS === 'web') requestAnimationFrame(measure);
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

    /* -------- Re-measure on scroll / resize (web) -------- */
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
    const handleSelect = (o: CustomerOrderOption) => {
        onChange(o.id);
        setQuery(o.label);
        rowPressInFlightRef.current = false;
        setOpen(false);
        setResults([]);
        setApiError(null);
        onAfterSelect?.(o);
    };

    const handleClear = () => {
        onChange('');
        onClear?.();
        setQuery('');
        setResults([]);
        setApiError(null);
        inputRef.current?.focus?.();
    };

    const handleClearSearch = () => {
        setQuery('');
        setResults([]);
        inputRef.current?.focus?.();
    };

    /* -------- Empty state -------- */
    const trimmed = query.trim();
    const hasSelected = !!value;
    const isSelectedLabel =
        !!selectedLabel && trimmed === selectedLabel.trim();
    const searchActive =
        trimmed.length >= minSearchLength && !isSelectedLabel;

    const emptyState = useMemo(() => {
        if (loading || apiError) return null;
        if (results.length > 0) return null;

        if (!searchActive) {
            if (isSelectedLabel || (hasSelected && !trimmed)) {
                return {
                    message: 'Type to search for a different order.',
                    showClear: false,
                };
            }
            return {
                message: `Type at least ${minSearchLength} character${minSearchLength === 1 ? '' : 's'
                    } to search.`,
                showClear: false,
            };
        }

        return {
            message: `No orders match "${trimmed}".`,
            showClear: true,
        };
    }, [
        loading,
        apiError,
        results.length,
        searchActive,
        isSelectedLabel,
        hasSelected,
        trimmed,
        minSearchLength,
    ]);

    const showDropdown = open && !disabled;
    const showClearButton =
        (!!query && !loading && !isSelectedLabel) || !!value;

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
                        shadowOffset: { width: 0, height: 8 },
                    }),
            }}
        >
            {apiError ? (
                <View className="py-5 px-4 items-center">
                    <Text
                        className="text-center"
                        style={{
                            color: danger,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.sm,
                        }}
                    >
                        {apiError}
                    </Text>
                    <Pressable
                        onPress={handleClearSearch}
                        className="mt-3 px-4 py-2 rounded-lg"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text
                            className="uppercase tracking-widest text-white"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Clear
                        </Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={(o, i) => o.id || String(i)}
                    keyboardShouldPersistTaps="handled"
                    style={{ flexGrow: 0, backgroundColor: dropdownBg }}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={5}
                    removeClippedSubviews
                    renderItem={({ item }) => {
                        const active = item.id === value;
                        return (
                            <Pressable
                                onPressIn={() => {
                                    rowPressInFlightRef.current = true;
                                }}
                                onPress={() => handleSelect(item)}
                                className="px-3 py-2.5 border-b flex-row items-center justify-between"
                                style={{
                                    borderBottomColor: dropdownBorder,
                                    backgroundColor: active
                                        ? theme.primary
                                        : 'transparent',
                                }}
                            >
                                <View className="flex-1 min-w-0">
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            color: active
                                                ? '#ffffff'
                                                : theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                        }}
                                    >
                                        {item.label}
                                    </Text>
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            color: active
                                                ? 'rgba(255,255,255,0.85)'
                                                : theme.textDark,
                                            fontFamily: theme.font.medium,
                                            fontSize: 10,
                                            marginTop: 1,
                                        }}
                                    >
                                        {item.description}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    }}
                    ListEmptyComponent={
                        emptyState ? (
                            <View className="py-5 px-4 items-center">
                                <Text
                                    className="text-center"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                        fontSize: theme.fontSize.sm,
                                    }}
                                >
                                    {emptyState.message}
                                </Text>
                                {emptyState.showClear ? (
                                    <Pressable
                                        onPress={handleClearSearch}
                                        className="mt-3 px-4 py-2 rounded-lg"
                                        style={{
                                            backgroundColor: theme.primary,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-widest text-white"
                                            style={{
                                                fontFamily: theme.font.bold,
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
            )}
        </View>
    );

    /* =========================================================
     * Web portal
     * ======================================================= */
    let portal: any = null;
    if (
        Platform.OS === 'web' &&
        showDropdown &&
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
                            true,
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
            document.body,
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
                    <View className="flex-row items-center mb-1.5">
                        <Text
                            className="uppercase tracking-wider text-[10px] font-bold"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {label}
                        </Text>
                        {required ? (
                            <Text
                                className="text-[10px] ml-1 font-bold"
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

                <Pressable
                    ref={triggerRef as any}
                    onPress={() => inputRef.current?.focus?.()}
                    className="flex-row items-center rounded-xl border px-3"
                    style={{
                        borderColor: focused ? theme.primary : borderColor,
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
                            // On web, select the current text so the
                            // first keystroke replaces the label.
                            if (Platform.OS === 'web') {
                                const node: any = inputRef.current as any;
                                if (node?.select) node.select();
                            }
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
                                ? ({ outlineStyle: 'none' } as any)
                                : null),
                        }}
                    />

                    {loading ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.primary}
                        />
                    ) : showClearButton ? (
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

                {fieldError ? (
                    <Text
                        className="mt-1 text-[11px]"
                        style={{
                            color: danger,
                            fontFamily: theme.font.medium,
                        }}
                    >
                        {fieldError}
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