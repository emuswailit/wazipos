// components/common/RetailerInventoryPicker.tsx
//
// Universal retailer-inventory picker. Mirrors WholesaleInventoryPicker
// but sources rows from useInventorySync() (RetailerReceipt[]).
//
// - Autocomplete on title / bar_code / batch
// - Formik-aware via `name` (falls back to controlled mode)
// - On select, writes multiple fields into Formik (configurable via fieldMap)
// - Web: portal into document.body
// - Native: inline dropdown
// - NativeWind layout, useAuth() colors
//
// Thumbnails come pre-resolved from the sync context
// (thumbnail_url / image_url), with a fallback to the raw images[]
// shape for callers that pass a fresh server record.
//
// Row shows an expiry badge when the receipt is close to expiry or
// already expired, and a stock badge (out-of-stock / low-stock /
// in-stock) driven by current_unit_quantity.

import { useAuth } from "@/context/AuthContext";
import { useInventorySync } from "@/context/InventorySyncContext";
import { RetailerReceipt } from "@/databases/types";
import { useFormikContext } from "formik";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import * as ReactDOM from "react-dom";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

/* =========================================================
 * Logging
 * ======================================================= */

const LOG_TAG = "[RetailerInventoryPicker]";
const log = (...args: any[]) => {
    if (__DEV__) console.log(LOG_TAG, ...args);
};

/* =========================================================
 * Types
 * ======================================================= */

interface RetailerInventoryFieldMap {
    /** Form field that receives the receipt's UUID. */
    id?: string;
    /** Display title field (usually a "read only" helper field). */
    title?: string;
    bar_code?: string;
    batch?: string;
    thumbnail_url?: string;
    unit_of_receipt?: string;
    current_unit_quantity?: string;
    received_unit_quantity?: string;
    unit_buying_price?: string;
    unit_selling_price?: string;
    final_unit_selling_price?: string;
    manufacture_date?: string;
    expiry_date?: string;
    product?: string;
    entity?: string;
    received_from?: string;
}

interface RetailerInventoryPickerProps {
    /* -------- Formik integration -------- */
    name?: string;
    fieldMap?: RetailerInventoryFieldMap;
    onAfterSelect?: (r: RetailerReceipt) => void;

    /* -------- Controlled mode -------- */
    value?: RetailerReceipt | null;
    onSelect?: (r: RetailerReceipt) => void;
    onClear?: () => void;
    error?: string;

    /* -------- Shared -------- */
    placeholder?: string;
    maxDropdownHeight?: number;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    onSearch?: (query: string) => Promise<RetailerReceipt[]>;

    /**
     * Scope the list to receipts whose `product` matches.
     * When omitted, all in-stock receipts are shown.
     */
    productId?: string | null;

    /**
     * Additional predicate applied on top of productId and
     * in-stock filters.
     */
    filter?: (r: RetailerReceipt) => boolean;

    /**
     * When true, receipts with `current_unit_quantity <= 0` are
     * excluded from the list. Defaults to true — you can't return
     * stock you don't have.
     */
    inStockOnly?: boolean;

    /**
     * When true, receipts whose `days_to_expiry < 0` are excluded.
     * Defaults to false.
     */
    excludeExpired?: boolean;

    testID?: string;
}

/* =========================================================
 * Helpers
 * ======================================================= */

function receiptRemoteId(
    r: RetailerReceipt | null | undefined
): string {
    return String(r?.remote_id ?? "");
}

function receiptProductId(
    r: RetailerReceipt | null | undefined
): string {
    return String(r?.product ?? "");
}

/**
 * Resolve a display thumbnail. The sync context pre-resolves these
 * into `thumbnail_url` / `image_url`; callers that pass a raw
 * server record fall back to the images[] shape.
 */
function receiptThumb(
    r: RetailerReceipt | null | undefined
): string | null {
    if (!r) return null;
    const flat =
        (r as any).thumbnail_url ??
        (r as any).image_url ??
        null;
    if (flat) return String(flat);
    const imgs: any[] = (r as any).images ?? [];
    if (imgs[0]?.thumbnail) return String(imgs[0].thumbnail);
    if (imgs[0]?.image) return String(imgs[0].image);
    return null;
}

function daysToExpiry(
    r: RetailerReceipt | null | undefined
): number | null {
    if (!r) return null;
    if (typeof (r as any).days_to_expiry === "number") {
        return (r as any).days_to_expiry;
    }
    const raw = (r as any).expiry_date;
    if (!raw) return null;

    const parts = String(raw).split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
    ) {
        return null;
    }
    const expiry = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((expiry.getTime() - today.getTime()) / msPerDay);
}

/* =========================================================
 * Public component
 * ======================================================= */

export function RetailerInventoryPicker(
    props: RetailerInventoryPickerProps
) {
    if (!props.name) {
        return <ControlledPicker {...props} />;
    }
    return <FormikPicker {...props} />;
}

/* =========================================================
 * Formik wrapper
 * ======================================================= */

function FormikPicker(props: RetailerInventoryPickerProps) {
    const formik = useFormikContext<any>();

    const fm = props.fieldMap ?? {};
    const idField = fm.id ?? "retailer_receipt";
    const titleField = fm.title ?? "retailer_receipt_title";
    const barField = fm.bar_code ?? "bar_code";
    const batchField = fm.batch ?? "batch";
    const thumbField = fm.thumbnail_url ?? "thumbnail_url";
    const unitField = fm.unit_of_receipt ?? "unit_of_receipt";
    const currentQtyField =
        fm.current_unit_quantity ?? "current_unit_quantity";
    const receivedQtyField =
        fm.received_unit_quantity ?? "received_unit_quantity";
    const buyField = fm.unit_buying_price ?? "unit_buying_price";
    const sellField = fm.unit_selling_price ?? "unit_selling_price";
    const finalSellField =
        fm.final_unit_selling_price ?? "final_unit_selling_price";
    const mfgField = fm.manufacture_date ?? "manufacture_date";
    const expField = fm.expiry_date ?? "expiry_date";
    const productField = fm.product ?? "product";
    const entityField = fm.entity ?? "entity";
    const receivedFromField = fm.received_from ?? "received_from";

    const value: RetailerReceipt | null = formik.values?.[titleField]
        ? ({
            remote_id: String(formik.values?.[idField] ?? ""),
            title: String(formik.values?.[titleField] ?? ""),
            bar_code: String(formik.values?.[barField] ?? ""),
            batch: formik.values?.[batchField] ?? null,
            thumbnail_url: formik.values?.[thumbField] ?? null,
        } as any)
        : null;

    const error: string | undefined =
        formik.touched?.[titleField] && formik.errors?.[titleField]
            ? String(formik.errors[titleField])
            : undefined;

    const handleSelect = useCallback(
        (r: RetailerReceipt) => {
            formik.setFieldValue(idField, receiptRemoteId(r));
            formik.setFieldValue(
                titleField,
                r.title ?? r.product_title ?? ""
            );
            formik.setFieldValue(barField, r.bar_code ?? "");
            formik.setFieldValue(batchField, r.batch ?? "");
            formik.setFieldValue(thumbField, receiptThumb(r) ?? "");
            formik.setFieldValue(unitField, r.unit_of_receipt ?? "");
            formik.setFieldValue(
                currentQtyField,
                Number(r.current_unit_quantity ?? 0)
            );
            formik.setFieldValue(
                receivedQtyField,
                Number(r.received_unit_quantity ?? 0)
            );
            formik.setFieldValue(
                buyField,
                Number(r.unit_buying_price ?? 0)
            );
            formik.setFieldValue(
                sellField,
                Number(r.unit_selling_price ?? 0)
            );
            formik.setFieldValue(
                finalSellField,
                Number(
                    r.final_unit_selling_price ??
                    r.unit_selling_price ??
                    0
                )
            );
            formik.setFieldValue(mfgField, r.manufacture_date ?? "");
            formik.setFieldValue(expField, r.expiry_date ?? "");
            formik.setFieldValue(productField, String(r.product ?? ""));
            formik.setFieldValue(entityField, String(r.entity ?? ""));
            formik.setFieldValue(
                receivedFromField,
                String(r.received_from ?? "")
            );

            formik.setFieldTouched(titleField, true, false);
            formik.validateField(titleField);

            props.onAfterSelect?.(r);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [formik]
    );

    const handleClear = useCallback(() => {
        formik.setFieldValue(idField, "");
        formik.setFieldValue(titleField, "");
        formik.setFieldValue(barField, "");
        formik.setFieldValue(batchField, "");
        formik.setFieldValue(thumbField, "");
        formik.setFieldValue(currentQtyField, 0);
        formik.setFieldValue(receivedQtyField, 0);
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

function ControlledPicker(props: RetailerInventoryPickerProps) {
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

interface PickerInnerProps extends RetailerInventoryPickerProps {
    value: RetailerReceipt | null;
    error: string | undefined;
    onSelect: (r: RetailerReceipt) => void;
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
    inStockOnly = true,
    excludeExpired = false,

    placeholder = "Search your inventory…",
    maxDropdownHeight = 360,
    disabled,
    label,
    required,
    testID,
}: PickerInnerProps) {
    const { theme, isDarkMode } = useAuth();
    const { retailerReceipts, isSyncing } = useInventorySync();

    const contextCount = retailerReceipts?.length ?? 0;

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const inputBg = isDarkMode ? "#0f172a" : "#f1f5f9";
    const thumbBg = isDarkMode ? "#1e293b" : "#e2e8f0";
    const dropdownBg = isDarkMode ? "#0f172a" : "#ffffff";
    const dropdownBorder = isDarkMode ? "#334155" : "#cbd5e1";
    const hoverBg = isDarkMode ? "#1e293b" : "#f1f5f9";
    const placeholderColor = "#94a3b8";
    const danger = "#ef4444";

    /* -------- State -------- */
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0 });
    const [remoteResults, setRemoteResults] = useState<
        RetailerReceipt[] | null
    >(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    /* -------- Refs -------- */
    const inputRef = useRef<TextInput>(null);
    const triggerRef = useRef<View>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rowPressInFlightRef = useRef(false);

    /* ---------------------------------------------------------
     * Base list — scoped by productId, then in-stock, then
     * expired, then by the caller's extra filter.
     * ------------------------------------------------------- */
    const baseList = useMemo(() => {
        let list = retailerReceipts ?? [];
        const contextTotal = list.length;

        if (productId) {
            const target = String(productId).trim();
            list = list.filter((r) => receiptProductId(r) === target);
        }
        const afterProduct = list.length;

        if (inStockOnly) {
            list = list.filter(
                (r) => Number(r.current_unit_quantity ?? 0) > 0
            );
        }
        const afterStock = list.length;

        if (excludeExpired) {
            list = list.filter((r) => {
                const d = daysToExpiry(r);
                return d === null || d >= 0;
            });
        }
        const afterExpiry = list.length;

        if (filter) {
            list = list.filter(filter);
        }

        if (__DEV__) {
            log("baseList computed", {
                productId: productId ?? "(none)",
                contextTotal,
                afterProduct,
                afterStock,
                afterExpiry,
                afterFilter: list.length,
            });
        }

        return list;
    }, [retailerReceipts, productId, inStockOnly, excludeExpired, filter]);

    /* -------- Sync input with selected value -------- */
    useEffect(() => {
        if (value) {
            setQuery(String(value.title ?? ""));
        } else if (!open) {
            setQuery("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    /* -------- Local text filter -------- */
    const filterLocally = useCallback(
        (q: string) => {
            if (!q) return baseList;
            const needle = q.toLowerCase();
            return baseList.filter((r) => {
                const t = String(r.title ?? "").toLowerCase();
                const b = String(r.bar_code ?? "").toLowerCase();
                const bt = String(r.batch ?? "").toLowerCase();
                const w = String(
                    (r as any).received_from_title ?? ""
                ).toLowerCase();
                return (
                    t.includes(needle) ||
                    b.includes(needle) ||
                    bt.includes(needle) ||
                    w.includes(needle)
                );
            });
        },
        [baseList]
    );

    /* -------- Debounced remote search -------- */
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
                setRemoteResults(res);
            } catch (e: any) {
                setApiError(
                    e?.message ?? "Failed to search inventory."
                );
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
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
        const all = retailerReceipts ?? [];
        const sample = all[0];
        log("dropdown opened", {
            contextTotal: all.length,
            baseList: baseList.length,
            results: results.length,
            productId: productId ?? "(none)",
            inStockOnly,
            excludeExpired,
            isSyncing,
            sample: sample
                ? {
                    remote_id: sample.remote_id,
                    product: sample.product,
                    title: sample.title,
                    qty: sample.current_unit_quantity,
                    days: daysToExpiry(sample),
                    thumb: receiptThumb(sample),
                }
                : "(empty)",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!__DEV__ || !open) return;
        log("filter tick", {
            query,
            contextTotal: contextCount,
            baseList: baseList.length,
            results: results.length,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, query, contextCount, baseList.length, results.length]);

    /* -------- Measure trigger (web) -------- */
    const measure = useCallback(() => {
        if (Platform.OS !== "web") return;
        const node: any = triggerRef.current;
        if (!node) return;

        const el: HTMLElement | null =
            (typeof node.getScrollableNode === "function"
                ? node.getScrollableNode()
                : null) ??
            (typeof node.getNode === "function"
                ? node.getNode()
                : null) ??
            (node instanceof HTMLElement ? node : null);

        if (!el || typeof el.getBoundingClientRect !== "function")
            return;

        const r = el.getBoundingClientRect();
        setAnchor({ x: r.left, y: r.bottom, width: r.width });
    }, []);

    const openDropdown = () => {
        if (disabled) return;
        measure();
        setOpen(true);
        if (Platform.OS === "web") {
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
        if (Platform.OS !== "web" || !open) return;
        const handler = () => measure();
        window.addEventListener("scroll", handler, true);
        window.addEventListener("resize", handler);
        return () => {
            window.removeEventListener("scroll", handler, true);
            window.removeEventListener("resize", handler);
        };
    }, [open, measure]);

    /* -------- Click outside closes (web) -------- */
    useEffect(() => {
        if (Platform.OS !== "web" || !open) return;
        if (typeof document === "undefined") return;

        const onDown = (ev: MouseEvent) => {
            const node: any = triggerRef.current;
            const triggerEl: HTMLElement | null =
                (typeof node?.getScrollableNode === "function"
                    ? node.getScrollableNode()
                    : null) ??
                (typeof node?.getNode === "function"
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
        document.addEventListener("mousedown", onDown);
        return () =>
            document.removeEventListener("mousedown", onDown);
    }, [open]);

    /* -------- Handlers -------- */
    const handleSelectInternal = (r: RetailerReceipt) => {
        onSelect(r);
        rowPressInFlightRef.current = false;
        setOpen(false);
        setApiError(null);
        setRemoteResults(null);
    };

    const handleClearInternal = () => {
        onClear();
        setQuery("");
        setRemoteResults(null);
        inputRef.current?.focus?.();
    };

    const handleClearSearch = useCallback(() => {
        setQuery("");
        inputRef.current?.focus?.();
    }, []);

    /* ---------------------------------------------------------
     * Empty state
     * ------------------------------------------------------- */
    const emptyState = useMemo(() => {
        if (loading || apiError) return null;
        if (results.length > 0) return null;

        const hasQuery = query.trim().length > 0;

        if (!hasQuery) {
            if (isSyncing && contextCount === 0) {
                return {
                    message: "Loading inventory…",
                    showClear: false,
                };
            }
            if (contextCount === 0) {
                return {
                    message: "No inventory available",
                    showClear: false,
                };
            }
            if (productId && baseList.length === 0) {
                return {
                    message: "No matching inventory for this product.",
                    showClear: false,
                };
            }
            if (inStockOnly) {
                return { message: "Nothing in stock.", showClear: false };
            }
            return { message: "No inventory to show.", showClear: false };
        }

        if (baseList.length === 0) {
            return {
                message: productId
                    ? "No matching inventory for this product."
                    : inStockOnly
                        ? "No inventory in stock."
                        : "No inventory to show.",
                showClear: false,
            };
        }

        return {
            message:
                `No matches for "${query.trim()}" — ` +
                `${baseList.length} item${baseList.length === 1 ? "" : "s"
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
        inStockOnly,
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
                ...(Platform.OS === "web"
                    ? ({
                        boxShadow:
                            "0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.1)",
                    } as any)
                    : {
                        elevation: 24,
                        shadowColor: "#000",
                        shadowOpacity: 0.25,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 8 },
                    }),
            }}
        >
            {productId && baseList.length > 0 ? (
                <View
                    className="px-3 py-1.5 border-b"
                    style={{
                        borderBottomColor: borderColor,
                        backgroundColor: isDarkMode
                            ? "rgba(99,102,241,0.1)"
                            : "rgba(99,102,241,0.06)",
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
                    String(r.remote_id ?? r.draft_id ?? i)
                }
                keyboardShouldPersistTaps="handled"
                style={{ flexGrow: 0, backgroundColor: dropdownBg }}
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
                        onPress={() => handleSelectInternal(item)}
                    />
                )}
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
                                    style={{ backgroundColor: theme.primary }}
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
        </View>
    );

    /* =========================================================
     * Web portal
     * ======================================================= */
    let portal: any = null;
    if (
        Platform.OS === "web" &&
        showDropdown &&
        typeof document !== "undefined" &&
        anchor.width > 0
    ) {
        portal = ReactDOM.createPortal(
            <div
                ref={(el: HTMLDivElement | null) => {
                    menuRef.current = el;
                    if (el && !(el as any).__waziGuard) {
                        (el as any).__waziGuard = true;
                        el.addEventListener(
                            "mousedown",
                            (ev) => {
                                ev.preventDefault();
                                rowPressInFlightRef.current = true;
                            },
                            true
                        );
                    }
                }}
                style={{
                    position: "fixed",
                    top: anchor.y + 4,
                    left: anchor.x,
                    width: anchor.width,
                    zIndex: 2147483647,
                    isolation: "isolate",
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
    const triggerThumb = receiptThumb(value);

    return (
        <>
            <View
                testID={testID}
                className="w-full relative"
                style={
                    Platform.OS === "web"
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
                        {triggerThumb ? (
                            <Image
                                source={{ uri: triggerThumb }}
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
                            ...(Platform.OS === "web"
                                ? ({ outlineStyle: "none" } as any)
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

                {Platform.OS !== "web" && showDropdown ? (
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
    receipt: RetailerReceipt;
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
    const title = String(receipt.title ?? "—");
    const barCode = String(receipt.bar_code ?? "").trim();
    const batch = receipt.batch ? String(receipt.batch) : "";
    const qty = Number(receipt.current_unit_quantity ?? 0);
    const unit = String(receipt.unit_of_receipt ?? "");
    const price = Number(
        receipt.final_unit_selling_price ??
        receipt.unit_selling_price ??
        0
    );
    const supplierTitle = String(
        (receipt as any).received_from_title ?? ""
    ).trim();
    const imageUri = receiptThumb(receipt);
    const days = daysToExpiry(receipt);

    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    const active = hovered || pressed;

    const lowStock = qty > 0 && qty <= 5;
    const outOfStock = qty <= 0;

    /* Expiry badge — only shown when the receipt actually has an
     * expiry date and it is either expired or within 30 days. */
    const showExpiry = days !== null && days <= 30;
    const expired = days !== null && days < 0;
    const expiringSoon = days !== null && days >= 0 && days <= 7;
    const expiring = days !== null && days > 7 && days <= 30;

    const expiryTint = expired
        ? "#ef4444"
        : expiringSoon
            ? "#f59e0b"
            : expiring
                ? "#eab308"
                : "#10b981";

    const expiryLabel = expired
        ? `EXPIRED`
        : days === 0
            ? `EXPIRES TODAY`
            : `${days}d`;

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => {
                onPressIn?.();
                setPressed(true);
            }}
            onPressOut={() => setPressed(false)}
            onHoverIn={
                Platform.OS === "web"
                    ? () => setHovered(true)
                    : undefined
            }
            onHoverOut={
                Platform.OS === "web"
                    ? () => setHovered(false)
                    : undefined
            }
            className="flex-row items-center px-3 py-2.5 border-b"
            style={{
                borderBottomColor: borderColor,
                backgroundColor: active ? hoverBg : "transparent",
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

                    {supplierTitle ? (
                        <Text
                            numberOfLines={1}
                            style={{
                                color: textDarkColor,
                                fontFamily: mediumFont,
                                fontSize: 10,
                            }}
                        >
                            • {supplierTitle}
                        </Text>
                    ) : null}

                    <View
                        className="px-1.5 py-[1px] rounded"
                        style={{
                            backgroundColor: outOfStock
                                ? "rgba(239,68,68,0.15)"
                                : lowStock
                                    ? "rgba(251,191,36,0.18)"
                                    : "rgba(16,185,129,0.15)",
                        }}
                    >
                        <Text
                            style={{
                                color: outOfStock
                                    ? "#ef4444"
                                    : lowStock
                                        ? "#f59e0b"
                                        : "#10b981",
                                fontFamily: boldFont,
                                fontSize: 10,
                            }}
                        >
                            {qty} {unit || "u"}
                        </Text>
                    </View>

                    {showExpiry ? (
                        <View
                            className="px-1.5 py-[1px] rounded"
                            style={{
                                backgroundColor: `${expiryTint}22`,
                            }}
                        >
                            <Text
                                style={{
                                    color: expiryTint,
                                    fontFamily: boldFont,
                                    fontSize: 10,
                                }}
                            >
                                {expiryLabel}
                            </Text>
                        </View>
                    ) : null}

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