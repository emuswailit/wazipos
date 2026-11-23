// components/wholesalers/newWholesaleOrder/OrderManifestFooter.tsx

import { FieldLabel, money, PrimaryCTA, TotalsCard } from '@/components/ui/pos';
import { Platform, TextInput, View } from 'react-native';

interface OrderManifestFooterProps {
    theme: any;
    notes: string;
    onNotesChange: (text: string) => void;
    grandTotalCost: number;
    /** Delivery fee of the chosen option (0 for pickup). */
    deliveryFee?: number;
    /** Button text (default: create and take payment). */
    submitLabel?: string;
    isButtonLoading: boolean;
    onSubmit: () => void;
}

export default function OrderManifestFooter({
    theme,
    notes,
    onNotesChange,
    grandTotalCost,
    deliveryFee = 0,
    submitLabel,
    isButtonLoading,
    onSubmit,
}: OrderManifestFooterProps) {
    const items = Number(grandTotalCost) || 0;
    const fee = Number(deliveryFee) || 0;
    const total = items + fee;

    return (
        <View style={{ width: '100%', gap: 14 }}>
            <View>
                <FieldLabel>Order notes</FieldLabel>
                <TextInput
                    style={{
                        minHeight: 72, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                        backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font?.medium, fontSize: 15,
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                    }}
                    placeholder="Delivery instructions, gate, contact person…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    textAlignVertical="top"
                    value={notes}
                    onChangeText={onNotesChange}
                />
            </View>

            <TotalsCard
                rows={[
                    { label: 'Items', value: `KES ${money(items)}` },
                    ...(fee > 0 ? [{ label: 'Delivery', value: `KES ${money(fee)}` }] : []),
                ]}
                total={total}
            />

            <PrimaryCTA label={submitLabel ?? `Create order · KES ${money(total)}`} onPress={onSubmit} loading={isButtonLoading} />
        </View>
    );
}
