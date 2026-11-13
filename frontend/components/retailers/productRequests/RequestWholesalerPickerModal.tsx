// components/retailers/productRequests/RequestWholesalerPickerModal.tsx
//
// "Request supply" sheet for one product (used from Forecasts when a product
// has no offers): pick wholesalers, quantity, urgency and a note. The result
// goes into the request basket (draft), not straight to the server.

import { CustomTextField } from '@/components/common/CustomTextField';
import { EntitiesMultiselectPicker } from '@/components/common/EntitiesMultiselectPicker';
import { AdminFormSheet, ChoiceChips, FormSection, useListTokens, webNoOutline, webPointer, type ChoiceOption } from '@/components/common/listScreen';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

type Urgency = 'low' | 'medium' | 'high';

interface Props {
    visible: boolean;
    productId: string | null;
    productTitle: string;
    defaultQuantity: number;
    onClose: () => void;
    mode?: 'add' | 'update';
    initialWholesalerIds?: string[];
    initialQuantity?: number;
    initialUrgency?: Urgency;
    initialNote?: string;
    onSubmit: (payload: {
        product_id: string;
        requested_quantity: number;
        urgency: Urgency;
        note?: string;
        target_wholesaler_ids: string[];
        target_wholesaler_titles?: string[];
        wholesalers?: Array<{ id: string; title: string }>;
    }) => void | Promise<void>;
}

const URGENCY_CHOICES: ChoiceOption<Urgency>[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium', color: '#f59e0b' },
    { value: 'high', label: 'High', icon: 'flame-outline', color: '#f43f5e' },
];

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
    const { theme, chipBg } = useListTokens();
    const { allWholesalers } = useEntitiesSync();

    const [selectedWholesalerIds, setSelectedWholesalerIds] = useState<string[]>([]);
    const [quantity, setQuantity] = useState(defaultQuantity);
    const [urgency, setUrgency] = useState<Urgency>('medium');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setSelectedWholesalerIds(initialWholesalerIds ?? []);
        setQuantity(Math.max(1, initialQuantity ?? defaultQuantity ?? 1));
        setUrgency(initialUrgency ?? 'medium');
        setNote(initialNote ?? '');
        setIsSubmitting(false);
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, productId, defaultQuantity, initialQuantity, initialUrgency, initialNote, JSON.stringify(initialWholesalerIds ?? [])]);

    const handleSubmit = useCallback(async () => {
        if (!productId || isSubmitting) return;
        if (selectedWholesalerIds.length === 0) {
            setError('Pick at least one wholesaler.');
            return;
        }
        // Resolve names so the basket can show who the request goes to.
        const byId = new Map((allWholesalers ?? []).map((e: any) => [String(e.id ?? e.remote_id ?? ''), String(e.title ?? '')]));
        const wholesalers = selectedWholesalerIds.map((id) => ({ id, title: byId.get(id) ?? '' }));

        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit({
                product_id: productId,
                requested_quantity: Math.max(1, Math.floor(quantity)),
                urgency,
                note: note.trim() || undefined,
                target_wholesaler_ids: selectedWholesalerIds,
                target_wholesaler_titles: wholesalers.map((w) => w.title).filter(Boolean),
                wholesalers,
            });
        } catch (e: any) {
            setError(e?.message ?? 'Could not add the request to the basket.');
        } finally {
            setIsSubmitting(false);
        }
    }, [productId, isSubmitting, selectedWholesalerIds, allWholesalers, onSubmit, quantity, urgency, note]);

    const Step = ({ icon, onPress, disabled }: { icon: 'add' | 'remove'; onPress: () => void; disabled?: boolean }) => (
        <Pressable
            onPress={onPress}
            disabled={disabled || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={icon === 'add' ? 'Increase quantity' : 'Decrease quantity'}
            style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: chipBg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, ...webPointer })}
        >
            <Ionicons name={icon} size={20} color={theme.text} />
        </Pressable>
    );

    return (
        <AdminFormSheet
            visible={visible}
            onClose={isSubmitting ? () => { } : onClose}
            title={mode === 'update' ? 'Update supply request' : 'Request supply'}
            subtitle={productTitle || null}
            icon="paper-plane-outline"
            submitLabel={mode === 'update' ? 'Update basket' : 'Add to basket'}
            submitting={isSubmitting}
            onSubmit={handleSubmit}
            error={error}
            width={560}
        >
            <FormSection title="Wholesalers" hint="They'll be asked to offer this product." zIndex={20}>
                <EntitiesMultiselectPicker
                    label="Send to wholesalers"
                    value={selectedWholesalerIds}
                    onChange={(ids) => {
                        setSelectedWholesalerIds(ids);
                        if (ids.length) setError(null);
                    }}
                    placeholder="Select wholesalers…"
                    searchPlaceholder="Search wholesalers by name, town, or phone…"
                    required
                    disabled={isSubmitting}
                    emptyText="No wholesalers available"
                    noMatchesText="No wholesalers match your search"
                />
            </FormSection>

            <FormSection title="Quantity" hint={defaultQuantity > 0 ? `The forecast suggests ${defaultQuantity.toLocaleString()}.` : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Step icon="remove" disabled={quantity <= 1} onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
                    <TextInput
                        value={String(quantity)}
                        onChangeText={(v) => {
                            const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                            setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
                        }}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        editable={!isSubmitting}
                        accessibilityLabel="Quantity"
                        style={{ flex: 1, height: 48, borderRadius: 16, textAlign: 'center', backgroundColor: chipBg, color: theme.text, fontFamily: theme.font.bold, fontSize: 18, ...webNoOutline }}
                    />
                    <Step icon="add" onPress={() => setQuantity((q) => q + 1)} />
                </View>
                <ChoiceChips label="Urgency" options={URGENCY_CHOICES} value={urgency} onChange={setUrgency} disabled={isSubmitting} />
            </FormSection>

            <FormSection title="Note">
                <CustomTextField label="Note to wholesalers" value={note} onChangeText={setNote} placeholder="Optional" multiline numberOfLines={3} editable={!isSubmitting} />
            </FormSection>
        </AdminFormSheet>
    );
}

