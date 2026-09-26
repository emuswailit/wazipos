// components/retailers/productRequests/CreateRequestModal.tsx
//
// Compose a new product request as a list of lines.
//
// Each line must be complete before the request can be sent:
//   - a product is picked
//   - a positive quantity is entered
//   - at least one target wholesaler is selected
//
// On submit, a confirmation alert warns that the quantities are
// manually entered (no forecast basis) and asks the user to
// confirm before the request goes out.
//
// Empty lines (no product AND no wholesalers) are ignored on
// submit; the request needs at least one complete line to send.
//
// Submit shows a spinner and alerts the server's response_message.

import {
    EntitiesMultiselectPicker,
    ProductPickerAutocomplete,
    type EntityPickerOption,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import type {
    EntityItem,
    Product,
    ProductImage,
    ProductItem,
} from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Shapes
 * ======================================================= */

interface PickableProduct {
    id: string;
    title: string;
    bar_code?: string;
    units_per_pack?: number;
    thumbnail_url?: string;
}

interface PickableWholesaler {
    id: string;
    title: string;
}

interface DraftLine {
    product_id: string;
    product_title?: string;
    thumbnail_url?: string;
    bar_code?: string;
    requested_quantity: string;
    urgency?: 'low' | 'medium' | 'high';
    note?: string;
    target_wholesaler_ids: string[];
    target_wholesaler_titles?: string[];
}

interface SubmitLine {
    product_id: string;
    product_title?: string;
    requested_quantity: number;
    urgency?: 'low' | 'medium' | 'high';
    note?: string;
    target_wholesaler_ids: string[];
}

export interface CreateRequestResult {
    ok: boolean;
    message?: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onSubmit: (payload: {
        items: SubmitLine[];
        urgency?: 'low' | 'medium' | 'high';
        note?: string;
    }) => Promise<CreateRequestResult>;
}

interface LineErrors {
    product?: string;
    quantity?: string;
    wholesalers?: string;
}

interface LineTouched {
    product?: boolean;
    quantity?: boolean;
    wholesalers?: boolean;
}

const URGENCY_OPTIONS: Array<{
    value: 'low' | 'medium' | 'high';
    label: string;
}> = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
    ];

const DEFAULT_QUANTITY = '1';

/* =========================================================
 * Alert helpers
 * ======================================================= */

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

/**
 * Cross-platform OK / Cancel confirmation. Resolves `true` when
 * the user picks the affirmative option.
 *
 * Web: blocking `window.confirm` inside a try/catch.
 * Native: `Alert.alert` wrapped in a Promise.
 */
function confirmSubmitWithoutBasis(
    linesCount: number,
    totalUnits: number
): Promise<boolean> {
    const title = 'Quantities are manually entered';
    const body =
        `You entered ${totalUnits} unit${totalUnits === 1 ? '' : 's'
        } across ${linesCount} line${linesCount === 1 ? '' : 's'
        } without a forecast basis.\n\n` +
        'Wholesalers will treat these numbers as your committed request. ' +
        'There is no demand signal, stock-out history, or prediction behind them.\n\n' +
        'Send this request anyway?';

    if (Platform.OS === 'web') {
        if (typeof window === 'undefined') return Promise.resolve(true);
        try {
            return Promise.resolve(
                window.confirm(`${title}\n\n${body}`)
            );
        } catch {
            // Some embedded WebViews disable confirm(). Treat as
            // accepted so the flow doesn't dead-end.
            return Promise.resolve(true);
        }
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (v: boolean) => {
            if (settled) return;
            settled = true;
            resolve(v);
        };

        Alert.alert(
            title,
            body,
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => settle(false),
                },
                {
                    text: 'Send anyway',
                    onPress: () => settle(true),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => settle(false),
            }
        );
    });
}

/* =========================================================
 * Adapters
 * ======================================================= */

function isUsableId(id: unknown): boolean {
    if (id === undefined || id === null) return false;
    const s = String(id).trim().toLowerCase();
    return s !== '' && s !== 'undefined' && s !== 'null';
}

function productId(p: ProductItem): string {
    if (isUsableId(p.remote_id)) return String(p.remote_id);
    if (isUsableId(p.id)) return String(p.id);
    return '';
}

function pickProductImage(p: ProductItem): string | undefined {
    const first: ProductImage | undefined = p.images?.[0];
    if (!first) return undefined;
    const thumb = (first.thumbnail || '').trim();
    if (thumb) return thumb;
    const full = (first.image || '').trim();
    if (full) return full;
    return undefined;
}

function entityId(e: EntityItem): string {
    if (isUsableId(e.remote_id)) return String(e.remote_id);
    if (isUsableId(e.id)) return String(e.id);
    return '';
}

function parseQty(input: string): number {
    const n = Number(String(input).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function isEmptyLine(line: DraftLine): boolean {
    return (
        line.product_id.trim() === '' &&
        (line.target_wholesaler_ids ?? []).length === 0
    );
}

function lineErrors(line: DraftLine): LineErrors {
    const errs: LineErrors = {};
    if (!line.product_id.trim()) {
        errs.product = 'Pick a product';
    }
    if (parseQty(line.requested_quantity) <= 0) {
        errs.quantity = 'Enter a quantity';
    }
    if (
        !line.target_wholesaler_ids ||
        line.target_wholesaler_ids.length === 0
    ) {
        errs.wholesalers = 'Select at least one wholesaler';
    }
    return errs;
}

/* =========================================================
 * Component
 * ======================================================= */

export function CreateRequestModal({
    visible,
    onClose,
    onSubmit,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const { productsList } = useProductsSync();
    const { allWholesalers } = useEntitiesSync();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [lines, setLines] = useState<DraftLine[]>([]);
    const [touched, setTouched] = useState<
        Record<number, LineTouched>
    >({});
    const [overallNote, setOverallNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const preFocusQtyRef = useRef<Record<number, string>>({});

    /* -------- Products adapter -------- */
    const products: PickableProduct[] = useMemo(() => {
        const seen = new Set<string>();
        return (productsList ?? [])
            .filter((p: ProductItem) => p.active !== false)
            .map((p: ProductItem) => ({
                id: productId(p),
                title: String(p.title || p.product_name || '—'),
                bar_code: p.bar_code || undefined,
                units_per_pack:
                    Number(p.units_per_pack) || 1,
                thumbnail_url: pickProductImage(p),
            }))
            .filter((p) => {
                if (!isUsableId(p.id) || !p.title)
                    return false;
                if (seen.has(p.id)) return false;
                seen.add(p.id);
                return true;
            });
    }, [productsList]);

    /* -------- Wholesalers adapter -------- */
    const wholesalers: PickableWholesaler[] = useMemo(() => {
        const seen = new Set<string>();
        return (allWholesalers ?? [])
            .filter((e: EntityItem) => {
                const t = String(
                    e.entity_type ?? ''
                ).toLowerCase();
                return (
                    t.includes('wholesal') ||
                    t.includes('distributor') ||
                    t.includes('manufactur')
                );
            })
            .map((e: EntityItem) => ({
                id: entityId(e),
                title: String(e.title || '—'),
            }))
            .filter((w) => {
                if (!isUsableId(w.id) || !w.title)
                    return false;
                if (seen.has(w.id)) return false;
                seen.add(w.id);
                return true;
            });
    }, [allWholesalers]);

    const wholesalerOptions: EntityPickerOption[] = useMemo(
        () =>
            wholesalers.map((w) => ({
                id: w.id,
                label: w.title,
            })),
        [wholesalers]
    );

    /* -------- Reset on open -------- */
    useEffect(() => {
        if (!visible) return;
        setLines([]);
        setTouched({});
        setOverallNote('');
        setIsSubmitting(false);
        preFocusQtyRef.current = {};
    }, [visible]);

    /* -------- Line mutation -------- */
    const addEmptyLine = useCallback(() => {
        setLines((prev) => [
            ...prev,
            {
                product_id: '',
                product_title: '',
                thumbnail_url: undefined,
                bar_code: undefined,
                requested_quantity: DEFAULT_QUANTITY,
                urgency: 'medium',
                note: '',
                target_wholesaler_ids: [],
                target_wholesaler_titles: [],
            },
        ]);
    }, []);

    const removeLine = useCallback((index: number) => {
        setLines((prev) =>
            prev.filter((_, i) => i !== index)
        );
        setTouched((prev) => {
            const next: Record<number, LineTouched> = {};
            Object.keys(prev).forEach((k) => {
                const i = Number(k);
                if (i < index) next[i] = prev[i];
                else if (i > index) next[i - 1] = prev[i];
            });
            return next;
        });
    }, []);

    const updateLine = useCallback(
        (index: number, patch: Partial<DraftLine>) => {
            setLines((prev) =>
                prev.map((l, i) =>
                    i === index ? { ...l, ...patch } : l
                )
            );
        },
        []
    );

    const markTouched = useCallback(
        (index: number, field: keyof LineTouched) => {
            setTouched((prev) => ({
                ...prev,
                [index]: {
                    ...(prev[index] ?? {}),
                    [field]: true,
                },
            }));
        },
        []
    );

    /* -------- Wholesaler selection -------- */
    const handleWholesalersChange = useCallback(
        (index: number, ids: string[]) => {
            const titles = ids
                .map(
                    (id) =>
                        wholesalers.find((w) => w.id === id)
                            ?.title
                )
                .filter((t): t is string => !!t);
            updateLine(index, {
                target_wholesaler_ids: ids,
                target_wholesaler_titles: titles,
            });
            markTouched(index, 'wholesalers');
        },
        [wholesalers, updateLine, markTouched]
    );

    /* -------- Quantity focus / blur -------- */
    const handleQtyFocus = useCallback(
        (index: number, currentValue: string) => {
            if (currentValue) {
                preFocusQtyRef.current[index] = currentValue;
            }
            updateLine(index, { requested_quantity: '' });
        },
        [updateLine]
    );

    const handleQtyBlur = useCallback(
        (index: number, currentValue: string) => {
            if (currentValue.trim() === '') {
                const restore =
                    preFocusQtyRef.current[index] ??
                    DEFAULT_QUANTITY;
                updateLine(index, {
                    requested_quantity: restore,
                });
            }
            delete preFocusQtyRef.current[index];
            markTouched(index, 'quantity');
        },
        [updateLine, markTouched]
    );

    /* -------- Derived: line validity -------- */
    const perLineErrors = useMemo(
        () => lines.map(lineErrors),
        [lines]
    );

    const allLineIndices = useMemo(
        () => lines.map((_, i) => i),
        [lines.length]
    );

    const requiredLineIndices = useMemo(() => {
        return allLineIndices.filter(
            (i) => !isEmptyLine(lines[i])
        );
    }, [allLineIndices, lines]);

    const invalidRequiredIndices = useMemo(
        () =>
            requiredLineIndices.filter((i) => {
                const e = perLineErrors[i];
                return !!(
                    e &&
                    (e.product || e.quantity || e.wholesalers)
                );
            }),
        [requiredLineIndices, perLineErrors]
    );

    const canSubmit =
        !isSubmitting &&
        requiredLineIndices.length > 0 &&
        invalidRequiredIndices.length === 0;

    /* -------- Footer hint -------- */
    const footerHint = useMemo<string | null>(() => {
        if (requiredLineIndices.length === 0) {
            return 'Add at least one line with a product and a wholesaler.';
        }
        if (invalidRequiredIndices.length === 0) return null;

        let missingProduct = 0;
        let missingQty = 0;
        let missingWholesalers = 0;
        for (const i of invalidRequiredIndices) {
            const e = perLineErrors[i];
            if (e?.product) missingProduct += 1;
            if (e?.quantity) missingQty += 1;
            if (e?.wholesalers) missingWholesalers += 1;
        }

        const parts: string[] = [];
        if (missingWholesalers > 0) {
            parts.push(
                `${missingWholesalers} line${missingWholesalers === 1 ? '' : 's'
                } need a wholesaler`
            );
        }
        if (missingProduct > 0) {
            parts.push(
                `${missingProduct} line${missingProduct === 1 ? '' : 's'
                } need a product`
            );
        }
        if (missingQty > 0) {
            parts.push(
                `${missingQty} line${missingQty === 1 ? '' : 's'
                } need a quantity`
            );
        }
        return parts.join(' · ');
    }, [
        requiredLineIndices.length,
        invalidRequiredIndices,
        perLineErrors,
    ]);

    /* -------- Submit -------- */
    const handleSubmit = useCallback(async () => {
        if (isSubmitting || !canSubmit) return;

        const cleaned: SubmitLine[] = [];
        for (const i of requiredLineIndices) {
            const line = lines[i];
            const errs = perLineErrors[i];
            if (errs.product || errs.quantity || errs.wholesalers) {
                continue;
            }
            cleaned.push({
                product_id: line.product_id,
                product_title: line.product_title,
                requested_quantity: parseQty(
                    line.requested_quantity
                ),
                urgency: line.urgency,
                note: line.note,
                target_wholesaler_ids:
                    line.target_wholesaler_ids,
            });
        }

        if (cleaned.length === 0) return;

        const totalUnits = cleaned.reduce(
            (s, l) => s + l.requested_quantity,
            0
        );

        // ---- Confirmation gate -------------------------------
        // The quantities are user-entered, not derived from any
        // forecast. Make sure that's an explicit choice, not an
        // accidental one.
        const proceed = await confirmSubmitWithoutBasis(
            cleaned.length,
            totalUnits
        );
        if (!proceed) {
            if (__DEV__) {
                console.log(
                    '[CreateRequestModal] submit cancelled at confirmation'
                );
            }
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await onSubmit({
                items: cleaned,
                note: overallNote || undefined,
            });

            if (result?.ok) {
                notify(
                    'Request sent',
                    result.message ||
                    `${cleaned.length} line${cleaned.length === 1 ? '' : 's'
                    } sent to wholesalers.`
                );
                onClose();
            } else {
                notify(
                    'Request rejected',
                    result?.message ||
                    'The server rejected the request.'
                );
            }
        } catch (e: any) {
            notify(
                'Could not send request',
                e?.message ??
                'Unexpected error. Please try again.'
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [
        isSubmitting,
        canSubmit,
        requiredLineIndices,
        lines,
        perLineErrors,
        overallNote,
        onSubmit,
        onClose,
    ]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={isSubmitting ? () => { } : onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[720px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{
                            borderBottomColor: dividerColor,
                        }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                            >
                                New request
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Each line needs a product, a quantity
                                and at least one wholesaler
                            </Text>
                        </View>
                        <Pressable
                            onPress={
                                isSubmitting ? undefined : onClose
                            }
                            disabled={isSubmitting}
                            hitSlop={10}
                            className="p-1.5"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {lines.length === 0 ? (
                            <View
                                className="rounded-xl p-6 items-center"
                                style={{ backgroundColor: subBg }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    No lines yet. Add one below.
                                </Text>
                            </View>
                        ) : (
                            lines.map((line, idx) => {
                                const errs = perLineErrors[idx];
                                const t = touched[idx] ?? {};
                                const productError =
                                    t.product && errs.product
                                        ? errs.product
                                        : undefined;
                                const qtyError =
                                    t.quantity && errs.quantity
                                        ? errs.quantity
                                        : undefined;
                                const wholesalerError =
                                    t.wholesalers &&
                                        errs.wholesalers
                                        ? errs.wholesalers
                                        : undefined;

                                return (
                                    <View
                                        key={idx}
                                        className="rounded-xl border p-3 mb-2"
                                        style={{
                                            backgroundColor: subBg,
                                            borderColor,
                                        }}
                                    >
                                        <View className="flex-row items-center justify-between mb-2">
                                            <Text
                                                className="uppercase tracking-widest"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                Line {idx + 1}
                                            </Text>
                                            <Pressable
                                                onPress={() =>
                                                    removeLine(idx)
                                                }
                                                disabled={
                                                    isSubmitting
                                                }
                                                hitSlop={8}
                                            >
                                                <Text
                                                    style={{
                                                        color:
                                                            isSubmitting
                                                                ? 'rgba(239,68,68,0.5)'
                                                                : '#ef4444',
                                                        fontFamily:
                                                            theme
                                                                .font
                                                                .bold,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    Remove
                                                </Text>
                                            </Pressable>
                                        </View>

                                        {/* Product */}
                                        <View className="mb-2">
                                            <Text
                                                className="uppercase tracking-widest mb-1"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 9,
                                                }}
                                            >
                                                Product *
                                            </Text>
                                            <ProductPickerAutocomplete
                                                products={
                                                    products as unknown as Product[]
                                                }
                                                titleKey="title"
                                                subtitleKey="bar_code"
                                                imageKey="thumbnail_url"
                                                value={
                                                    line.product_id
                                                        ? ({
                                                            id: line.product_id,
                                                            title:
                                                                line.product_title ??
                                                                '',
                                                            bar_code:
                                                                line.bar_code,
                                                            thumbnail_url:
                                                                line.thumbnail_url,
                                                        } as unknown as Product)
                                                        : null
                                                }
                                                onSelect={(p: any) => {
                                                    updateLine(idx, {
                                                        product_id: String(
                                                            p?.id ?? ''
                                                        ),
                                                        product_title: String(
                                                            p?.title ?? ''
                                                        ),
                                                        bar_code: p?.bar_code
                                                            ? String(
                                                                p.bar_code
                                                            )
                                                            : undefined,
                                                        thumbnail_url:
                                                            p?.thumbnail_url
                                                                ? String(
                                                                    p.thumbnail_url
                                                                )
                                                                : undefined,
                                                    });
                                                    markTouched(
                                                        idx,
                                                        'product'
                                                    );
                                                }}
                                                onClear={() => {
                                                    updateLine(idx, {
                                                        product_id: '',
                                                        product_title: '',
                                                        bar_code: undefined,
                                                        thumbnail_url:
                                                            undefined,
                                                    });
                                                    markTouched(
                                                        idx,
                                                        'product'
                                                    );
                                                }}
                                                error={productError}
                                                placeholder="Select a product…"
                                            />
                                        </View>

                                        {/* Quantity */}
                                        <View className="mb-2">
                                            <Text
                                                className="uppercase tracking-widest mb-1"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 9,
                                                }}
                                            >
                                                Quantity *
                                            </Text>
                                            <TextInput
                                                value={
                                                    line.requested_quantity
                                                }
                                                onChangeText={(v) => {
                                                    const digits =
                                                        v.replace(
                                                            /[^0-9]/g,
                                                            ''
                                                        );
                                                    updateLine(idx, {
                                                        requested_quantity:
                                                            digits,
                                                    });
                                                }}
                                                onFocus={() =>
                                                    handleQtyFocus(
                                                        idx,
                                                        line.requested_quantity
                                                    )
                                                }
                                                onBlur={() =>
                                                    handleQtyBlur(
                                                        idx,
                                                        line.requested_quantity
                                                    )
                                                }
                                                editable={!isSubmitting}
                                                keyboardType="number-pad"
                                                inputMode="numeric"
                                                placeholder={
                                                    DEFAULT_QUANTITY
                                                }
                                                placeholderTextColor="#94a3b8"
                                                className="h-10 rounded-lg border px-3 text-center"
                                                style={{
                                                    borderColor:
                                                        qtyError
                                                            ? '#ef4444'
                                                            : borderColor,
                                                    color: theme.text,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize:
                                                        theme.fontSize
                                                            .base,
                                                    backgroundColor:
                                                        isDarkMode
                                                            ? '#0f172a'
                                                            : '#ffffff',
                                                }}
                                            />
                                            {qtyError ? (
                                                <Text
                                                    className="mt-1 text-[10px]"
                                                    style={{
                                                        color: '#ef4444',
                                                        fontFamily:
                                                            theme
                                                                .font
                                                                .medium,
                                                    }}
                                                >
                                                    {qtyError}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Urgency */}
                                        <View className="mb-2">
                                            <Text
                                                className="uppercase tracking-widest mb-1"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 9,
                                                }}
                                            >
                                                Urgency
                                            </Text>
                                            <View className="flex-row gap-1.5">
                                                {URGENCY_OPTIONS.map(
                                                    (u) => (
                                                        <Pressable
                                                            key={
                                                                u.value
                                                            }
                                                            onPress={() =>
                                                                updateLine(
                                                                    idx,
                                                                    {
                                                                        urgency:
                                                                            u.value,
                                                                    }
                                                                )
                                                            }
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                            className="flex-1 py-2 rounded-lg border items-center"
                                                            style={{
                                                                borderColor:
                                                                    line.urgency ===
                                                                        u.value
                                                                        ? theme.primary
                                                                        : borderColor,
                                                                backgroundColor:
                                                                    line.urgency ===
                                                                        u.value
                                                                        ? `${theme.primary}15`
                                                                        : isDarkMode
                                                                            ? '#0f172a'
                                                                            : '#ffffff',
                                                                opacity:
                                                                    isSubmitting
                                                                        ? 0.6
                                                                        : 1,
                                                            }}
                                                        >
                                                            <Text
                                                                className="uppercase tracking-wide"
                                                                style={{
                                                                    color:
                                                                        line.urgency ===
                                                                            u.value
                                                                            ? theme.primary
                                                                            : theme.textDark,
                                                                    fontFamily:
                                                                        theme
                                                                            .font
                                                                            .bold,
                                                                    fontSize: 10,
                                                                }}
                                                            >
                                                                {
                                                                    u.label
                                                                }
                                                            </Text>
                                                        </Pressable>
                                                    )
                                                )}
                                            </View>
                                        </View>

                                        {/* Target wholesalers (required) */}
                                        <View>
                                            <Text
                                                className="uppercase tracking-widest mb-1"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 9,
                                                }}
                                            >
                                                Wholesalers *
                                            </Text>
                                            <EntitiesMultiselectPicker
                                                options={
                                                    wholesalerOptions
                                                }
                                                value={
                                                    line.target_wholesaler_ids
                                                }
                                                onChange={(ids) =>
                                                    handleWholesalersChange(
                                                        idx,
                                                        ids
                                                    )
                                                }
                                                disabled={
                                                    isSubmitting
                                                }
                                                required
                                                error={
                                                    wholesalerError
                                                }
                                                placeholder="Select at least one wholesaler…"
                                                searchPlaceholder="Search wholesalers…"
                                                emptyText="No wholesalers available"
                                            />
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        <Pressable
                            onPress={addEmptyLine}
                            disabled={isSubmitting}
                            className="py-3 rounded-xl border items-center mt-1"
                            style={{
                                borderColor: theme.primary,
                                borderStyle: 'dashed',
                                opacity: isSubmitting ? 0.5 : 1,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                + Add line
                            </Text>
                        </Pressable>

                        {/* Overall note */}
                        <Text
                            className="uppercase tracking-widest mb-2 mt-4"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Overall note (optional)
                        </Text>
                        <TextInput
                            value={overallNote}
                            onChangeText={setOverallNote}
                            editable={!isSubmitting}
                            placeholder="Anything you want wholesalers to know"
                            placeholderTextColor="#94a3b8"
                            multiline
                            numberOfLines={2}
                            className="rounded-xl border px-3 py-2 min-h-[60px]"
                            style={{
                                borderColor,
                                backgroundColor: subBg,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                textAlignVertical: 'top',
                            }}
                        />
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        {footerHint ? (
                            <View
                                className="px-4 pt-2.5"
                                style={{
                                    backgroundColor:
                                        'rgba(251,191,36,0.08)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#b45309',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 11,
                                    }}
                                >
                                    {footerHint}
                                </Text>
                            </View>
                        ) : null}

                        <View className="flex-row justify-end gap-2 p-4">
                            <Pressable
                                onPress={onClose}
                                disabled={isSubmitting}
                                className="px-4 py-2.5 rounded-xl border"
                                style={{
                                    borderColor,
                                    opacity: isSubmitting ? 0.5 : 1,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Cancel
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleSubmit}
                                disabled={!canSubmit}
                                className="px-4 py-2.5 rounded-xl flex-row items-center justify-center gap-2"
                                style={{
                                    backgroundColor: theme.primary,
                                    opacity: canSubmit ? 1 : 0.5,
                                    minWidth: 130,
                                }}
                            >
                                {isSubmitting ? (
                                    <>
                                        <ActivityIndicator
                                            size="small"
                                            color="#ffffff"
                                        />
                                        <Text
                                            className="uppercase tracking-wide text-white"
                                            style={{
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 12,
                                            }}
                                        >
                                            Sending…
                                        </Text>
                                    </>
                                ) : (
                                    <Text
                                        className="uppercase tracking-wide text-white"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Send request
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}