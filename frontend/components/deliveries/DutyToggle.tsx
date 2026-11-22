// components/deliveries/DutyToggle.tsx
//
// A rider / driver goes on or off duty. While on duty (and this screen is open) the
// app shares where they are every couple of minutes, so sellers dispatching nearby
// can find them (SetMyAvailability; sellers see people within the company's
// service radius, measured from a location seen in the last 30 minutes).

import deliveriesApi, { isOk } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const SHARE_EVERY_MS = 2 * 60 * 1000;

export default function DutyToggle() {
    const { theme, border } = useListTokens();
    // null: not a delivery person (or not loaded yet) -> hidden.
    const [onDuty, setOnDuty] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const position = async (): Promise<{ latitude: number; longitude: number } | null> => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setNote('Allow location so sellers near you can find you.');
                return null;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setNote(null);
            return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        } catch {
            setNote('Could not read your location.');
            return null;
        }
    };

    const share = useCallback(async () => {
        const at = await position();
        if (at) await deliveriesApi.setMyAvailability(at);
    }, []);

    useFocusEffect(
        useCallback(() => {
            let alive = true;
            deliveriesApi.setMyAvailability({}).then((res: any) => {
                if (alive) setOnDuty(isOk(res) ? !!res.data?.data?.available : null);
            });
            return () => {
                alive = false;
            };
        }, []),
    );

    useFocusEffect(
        useCallback(() => {
            if (!onDuty) return;
            void share();
            timer.current = setInterval(() => void share(), SHARE_EVERY_MS);
            return () => {
                if (timer.current) clearInterval(timer.current);
                timer.current = null;
            };
        }, [onDuty, share]),
    );

    if (onDuty === null) return null;

    const toggle = async () => {
        setBusy(true);
        try {
            const next = !onDuty;
            const at = next ? await position() : null;
            const res: any = await deliveriesApi.setMyAvailability({ available: next, ...(at ?? {}) });
            if (isOk(res)) setOnDuty(!!res.data?.data?.available);
        } finally {
            setBusy(false);
        }
    };

    const color = onDuty ? '#10b981' : theme.textDark;
    return (
        <Pressable
            onPress={toggle}
            disabled={busy}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: onDuty ? color : border, backgroundColor: onDuty ? `${color}14` : 'transparent', opacity: busy ? 0.6 : 1 }}
        >
            <Ionicons name={onDuty ? 'radio-button-on' : 'radio-button-off'} size={22} color={color} />
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{onDuty ? 'On duty' : 'Off duty'}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {note ?? (onDuty ? 'Sellers near you can send you deliveries. Tap to go off duty.' : 'Tap to go on duty and get deliveries from sellers near you.')}
                </Text>
            </View>
        </Pressable>
    );
}
