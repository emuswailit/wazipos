// components/retailers/productRequests/RequestWholesalerPickerModal.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    AutocompleteOption,
    MultiSelectAutocomplete,
} from './MultiSelectAutocomplete';

/* =========================================================
 * Props
 * ======================================================= */

interface Props {
    visible: boolean;
    productId: string | null;
    productTitle: string;
    defaultQuantity: number;
    onClose: () => void;

    /** 'add' (default) or 'update' — only changes the button label. */
    mode?: 'add' | 'update';

    /** Pre-fill when editing an existing draft. */
    initialWholesalerIds?: string[];
    initialQuantity?: number;
    initialUrgency?: 'low' | 'medium' | 'high';
    initialNote?: string;

    onSubmit: (payload: {
        product_id: string;
        requested_quantity: number;
        urgency: 'low' | 'medium' | 'high';
        note?: string;
        target_wholesaler_ids: string[];
        target_wholesaler_titles?: string[];
    }) => void | Promise<void>;
}

const URGENCY_OPTIONS: Array<{
    value: 'low' | 'medium' | 'high';
    label: string;
}> = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
    ];

/* In-memory cache: product → wholesaler options */
const wholesalerCache: Record<string, AutocompleteOption[]> = {};

/* =========================================================
 * Component
 * ======================================================= */

export function RequestWholesalerPickerModal({
    visible,
    productId,
    productTitle,
    defaultQuantity,
    onClose,
    mode = 'add',
    initialWholesalerIds,
    initialQuantity,
    initialUrgency,
    initialNote,
    onSubmit,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [selectedWholesalerIds, setSelectedWholesalerIds] =
        useState<string[]>([]);
    const [quantity, setQuantity] = useState(defaultQuantity);
    const [urgency, setUrgency] = useState<
        'low' | 'medium' | 'high'
    >('medium');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* Reset state on open (or when the pre-fill inputs change) */
    useEffect(() => {
        if (!visible) return;
        setSelectedWholesalerIds(initialWholesalerIds ?? []);
        setQuantity(initialQuantity ?? defaultQuantity);
        setUrgency(initialUrgency ?? 'medium');
        setNote(initialNote ?? '');
        setIsSubmitting(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        visible,
        productId,
        defaultQuantity,
        initialQuantity,
        initialUrgency,
        initialNote,
        JSON.stringify(initialWholesalerIds ?? []),
    ]);

    /* Loader for MultiSelectAutocomplete */
    const loadWholesalers = useCallback(
        async (_query?: string): Promise<AutocompleteOption[]> => {
            if (!productId) return [];
            const cached = wholesalerCache[productId];
            if (cached) return cached;

            const res: any =
                await retailersApi.getEligibleWholesalersAction({
                    product_id: productId,
                });

            const results = res?.data?.wholesalers?.results ?? [];

            const mapped: AutocompleteOption[] = results.map(
                (w: any) => ({
                    id: String(w.id),
                    label: String(w.title ?? 'Unknown'),
                    sublabel: [w.town, w.phone]
                        .filter(Boolean)
                        .join(' · '),
                    search: [w.entity_type, w.email, w.phone]
                        .filter(Boolean)
                        .join(' '),
                    meta: w,
                })
            );

            wholesalerCache[productId] = mapped;
            return mapped;
        },
        [productId]
    );

    /* Quantity stepper handlers */
    const decrement = useCallback(
        () => setQuantity((q) => Math.max(1, q - 1)),
        []
    );
    const increment = useCallback(
        () => setQuantity((q) => q + 1),
        []
    );
    const onChangeQuantity = useCallback((v: string) => {
        const digits = v.replace(/[^0-9]/g, '');
        const n = parseInt(digits, 10);
        setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
    }, []);

    /* Submit */
    const handleSubmit = useCallback(async () => {
        if (!productId || isSubmitting) return;
        if (selectedWholesalerIds.length === 0) return;

        setIsSubmitting(true);
        try {
            // Resolve titles from the loaded wholesaler cache so the
            // draft / request can render them without an extra lookup.
            const cached = wholesalerCache[productId] ?? [];
            const titleById = new Map(
                cached.map((o) => [o.id, o.label])
            );
            const titles = selectedWholesalerIds
                .map((id) => titleById.get(id) ?? '')
                .filter((t) => t.length > 0);

            const payload = {
                product_id: productId,
                requested_quantity: Math.max(
                    1,
                    Math.floor(quantity)
                ),
                urgency,
                note: note.trim() || undefined,
                target_wholesaler_ids: selectedWholesalerIds,
                target_wholesaler_titles: titles,
            };

            if (__DEV__) {
                console.log(
                    '[RequestWholesalerPickerModal] submit',
                    mode,
                    payload
                );
            }

            await onSubmit(payload);
        } finally {
            setIsSubmitting(false);
        }
    }, [
        productId,
        quantity,
        urgency,
        note,
        selectedWholesalerIds,
        onSubmit,
        isSubmitting,
        mode,
    ]);

    if (!visible) return null;

    const canSubmit =
        selectedWholesalerIds.length > 0 && !isSubmitting;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[640px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* ---------------- Header ---------------- */}
                    <View
                        className="p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-row items-center justify-between">
                            <View className="flex-1">
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.lg,
                                    }}
                                    numberOfLines={1}
                                >
                                    Send Request
                                </Text>
                                <Text
                                    className="mt-0.5"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                    numberOfLines={1}
                                >
                                    {productTitle}
                                </Text>
                            </View>
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                className="p-1.5"
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize:
                                            theme.fontSize.base,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* ---------------- Body ---------------- */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {/* Quantity + Urgency */}
                        <View className="flex-row gap-3 mb-4">
                            {/* Quantity */}
                            <View className="flex-1">
                                <Text
                                    className="uppercase tracking-widest mb-2"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Quantity
                                </Text>
                                <View className="flex-row items-center gap-2">
                                    <Pressable
                                        onPress={decrement}
                                        className="px-3 py-2 rounded-lg border"
                                        style={{ borderColor }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 16,
                                            }}
                                        >
                                            −
                                        </Text>
                                    </Pressable>
                                    <TextInput
                                        value={String(quantity)}
                                        onChangeText={
                                            onChangeQuantity
                                        }
                                        keyboardType="number-pad"
                                        className="flex-1 h-10 rounded-lg border px-3 text-center"
                                        style={{
                                            borderColor,
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.base,
                                            backgroundColor: subBg,
                                        }}
                                    />
                                    <Pressable
                                        onPress={increment}
                                        className="px-3 py-2 rounded-lg border"
                                        style={{ borderColor }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 16,
                                            }}
                                        >
                                            +
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Urgency */}
                            <View className="flex-1">
                                <Text
                                    className="uppercase tracking-widest mb-2"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Urgency
                                </Text>
                                <View className="flex-row gap-1.5">
                                    {URGENCY_OPTIONS.map((u) => (
                                        <Pressable
                                            key={u.value}
                                            onPress={() =>
                                                setUrgency(u.value)
                                            }
                                            className="flex-1 py-2 rounded-lg border items-center"
                                            style={{
                                                borderColor:
                                                    urgency ===
                                                        u.value
                                                        ? theme.primary
                                                        : borderColor,
                                                backgroundColor:
                                                    urgency ===
                                                        u.value
                                                        ? `${theme.primary}15`
                                                        : subBg,
                                            }}
                                        >
                                            <Text
                                                className="uppercase tracking-wide"
                                                style={{
                                                    color:
                                                        urgency ===
                                                            u.value
                                                            ? theme.primary
                                                            : theme.textDark,
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                {u.label}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </View>

                        {/* Wholesaler picker */}
                        <MultiSelectAutocomplete
                            label="Send to wholesalers"
                            value={selectedWholesalerIds}
                            onChange={setSelectedWholesalerIds}
                            loadOptions={loadWholesalers}
                            knownLabels={
                                Object.fromEntries(
                                    (wholesalerCache[productId ?? ''] ?? []).map((o) => [
                                        o.id,
                                        o.label,
                                    ])
                                )
                            }
                            placeholder="Search wholesalers by name, town, or phone..."
                            clientFilter
                            emptyText="No wholesalers match your search."
                            loadingText="Loading wholesalers..."
                            errorText="Could not load wholesalers for this product."
                        />

                        {/* Note */}
                        <Text
                            className="uppercase tracking-widest mb-2 mt-4"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Note (optional)
                        </Text>
                        <TextInput
                            value={note}
                            onChangeText={setNote}
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
                            }}
                        />
                    </ScrollView>

                    {/* ---------------- Footer ---------------- */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
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
                            className="px-4 py-2.5 rounded-xl"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: canSubmit ? 1 : 0.5,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                {isSubmitting
                                    ? mode === 'update'
                                        ? 'Updating...'
                                        : 'Adding...'
                                    : mode === 'update'
                                        ? `Update basket (${selectedWholesalerIds.length})`
                                        : `Add to basket (${selectedWholesalerIds.length})`}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}