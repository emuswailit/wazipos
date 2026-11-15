// components/deliveries/LegActions.tsx
//
// Move one shipment leg on (UpdateShipmentLeg). Used by delivery persons
// (My deliveries), courier staff and the seller's staff.
//   ASSIGNED / PENDING -> "Picked up"
//   PICKED_UP:
//     HANDOVER  -> "Handed to courier"
//     TRANSIT   -> "Arrived at office" (+ waybill); the buyer then collects there
//     LOCAL / LAST_MILE -> "Delivered" (+ the buyer's delivery code)
//   any open state -> "Failed"

import deliveriesApi, { apiError, isOk, type LegStatus, type ShipmentLeg } from '@/api/deliveriesApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

const OPEN: LegStatus[] = ['PENDING', 'ASSIGNED', 'PICKED_UP'];

interface Props {
    leg: Pick<ShipmentLeg, 'id' | 'kind' | 'status'>;
    /** Called with the updated shipment (or nothing) after a change. */
    onChanged: (shipment?: any) => void;
}

export function LegActions({ leg, onChanged }: Props) {
    const { theme, border } = useListTokens();
    const [busy, setBusy] = useState<LegStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [waybill, setWaybill] = useState('');

    if (!OPEN.includes(leg.status)) return null;

    const run = async (status: LegStatus, extra: { delivery_code?: string; waybill_number?: string } = {}) => {
        setBusy(status);
        setError(null);
        try {
            const res: any = await deliveriesApi.updateShipmentLeg(leg.id, status, extra);
            if (isOk(res)) onChanged(res.data?.shipment);
            else setError(apiError(res, 'Could not update the delivery.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    const input = (value: string, onChange: (v: string) => void, placeholder: string, numeric = false) => (
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={theme.textDark}
            keyboardType={numeric ? 'number-pad' : 'default'}
            maxLength={numeric ? 6 : 60}
            className="rounded-xl px-3"
            style={{ height: 42, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.bold, fontSize: 14, letterSpacing: numeric ? 4 : 0 }}
        />
    );

    const picked = leg.status === 'PICKED_UP';
    return (
        <View style={{ gap: 8 }}>
            {!picked ? (
                <SheetButton label={leg.kind === 'TRANSIT' ? 'Received at origin office' : 'Picked up'} icon="cube-outline" onPress={() => run('PICKED_UP')} loading={busy === 'PICKED_UP'} grow />
            ) : leg.kind === 'HANDOVER' ? (
                <SheetButton label="Handed to the courier" icon="swap-horizontal" onPress={() => run('HANDED_OVER')} loading={busy === 'HANDED_OVER'} grow />
            ) : leg.kind === 'TRANSIT' ? (
                <>
                    {input(waybill, setWaybill, 'Waybill number (optional)')}
                    <SheetButton label="Arrived at the destination office" icon="business-outline" onPress={() => run('HANDED_OVER', { waybill_number: waybill.trim() })} loading={busy === 'HANDED_OVER'} grow />
                </>
            ) : (
                <>
                    {input(code, setCode, "Recipient's 6-digit code", true)}
                    <SheetButton
                        label="Delivered"
                        icon="checkmark-done"
                        onPress={() => run('DELIVERED', { delivery_code: code.trim() })}
                        loading={busy === 'DELIVERED'}
                        disabled={code.trim().length < 6}
                        grow
                    />
                </>
            )}
            <SheetButton label="Report a failed delivery" variant="ghost" icon="alert-circle-outline" onPress={() => run('FAILED')} loading={busy === 'FAILED'} grow />
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
        </View>
    );
}
