// components/retailers/retailerPrescriptions/FulfilmentChoiceSheet.tsx
//
// Before a pharmacy sends its quotation it says how the patient gets the
// medicines:
//   • The patient chooses — at checkout they pick collection (free) or
//     delivery, and pay the intracity shipping themselves if they want delivery.
//   • Must collect in person — the pharmacy insists (further advice,
//     pharmaceutical care such as guided administration). No shipping is charged
//     and delivery isn't offered.

import { AdminFormSheet, useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export interface FulfilmentChoice {
    pickup_required: boolean;
    pickup_reason: string;
}

interface Props {
    visible: boolean;
    title: string;
    submitLabel: string;
    /** The quotation's current decision, if any. */
    initialPickupRequired?: boolean | null;
    initialReason?: string | null;
    /** False when the prescription has no upload location (delivery can't be priced). */
    canDeliver: boolean;
    submitting: boolean;
    error?: string | null;
    onClose: () => void;
    onConfirm: (choice: FulfilmentChoice) => void;
}

const REASONS = ['Guided administration', 'Counselling on how to use it', 'Further advice from the pharmacist', 'Needs cold-chain handover'];

export function FulfilmentChoiceSheet({ visible, title, submitLabel, initialPickupRequired, initialReason, canDeliver, submitting, error, onClose, onConfirm }: Props) {
    const { theme, chipBg } = useListTokens();
    const [pickupRequired, setPickupRequired] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (!visible) return;
        setPickupRequired(!!initialPickupRequired || !canDeliver);
        setReason(initialReason ?? '');
    }, [visible, initialPickupRequired, initialReason, canDeliver]);

    const options: { key: boolean; title: string; body: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean }[] = [
        {
            key: false,
            title: 'The patient chooses',
            body: canDeliver
                ? 'They pick collection or delivery when paying. If they want delivery, they pay the shipping from your pharmacy to their location.'
                : 'Not available: this prescription was uploaded without a location, so delivery can’t be priced.',
            icon: 'bicycle-outline',
            disabled: !canDeliver,
        },
        {
            key: true,
            title: 'Must collect in person',
            body: 'For medicines that need your advice or pharmaceutical care, e.g. guided administration. No shipping is charged.',
            icon: 'storefront-outline',
        },
    ];

    return (
        <AdminFormSheet
            visible={visible}
            onClose={submitting ? () => { } : onClose}
            title={title}
            subtitle="How does the patient get the medicines?"
            icon="paper-plane-outline"
            submitLabel={submitLabel}
            submitting={submitting}
            onSubmit={() => onConfirm({ pickup_required: pickupRequired, pickup_reason: pickupRequired ? reason.trim() : '' })}
            error={error ?? null}
            width={520}
        >
            <View style={{ gap: 8 }}>
                {options.map((o) => {
                    const on = pickupRequired === o.key;
                    return (
                        <Pressable
                            key={String(o.key)}
                            onPress={() => !o.disabled && setPickupRequired(o.key)}
                            disabled={o.disabled}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on, disabled: !!o.disabled }}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                gap: 12,
                                padding: 14,
                                borderRadius: 14,
                                borderWidth: 1.5,
                                borderColor: on ? theme.primary : 'transparent',
                                backgroundColor: on ? `${theme.primary}10` : chipBg,
                                opacity: o.disabled ? 0.45 : pressed ? 0.85 : 1,
                                ...(o.disabled ? {} : webPointer),
                            })}
                        >
                            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? theme.primary : theme.textDark} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name={o.icon} size={16} color={theme.text} />
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{o.title}</Text>
                                </View>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>{o.body}</Text>
                            </View>
                        </Pressable>
                    );
                })}

                {pickupRequired ? (
                    <View style={{ gap: 8, marginTop: 4 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>Why must they come in? (shown to the patient)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {REASONS.map((r) => {
                                const on = reason === r;
                                return (
                                    <Pressable
                                        key={r}
                                        onPress={() => setReason(on ? '' : r)}
                                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? `${theme.primary}10` : 'transparent', ...webPointer }}
                                    >
                                        <Text style={{ color: on ? theme.primary : theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{r}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <TextInput
                            value={reason}
                            onChangeText={setReason}
                            placeholder="Or type a reason"
                            placeholderTextColor={theme.textSubtle}
                            maxLength={256}
                            style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontFamily: theme.font.medium, fontSize: 14 }}
                        />
                    </View>
                ) : null}
            </View>
        </AdminFormSheet>
    );
}

