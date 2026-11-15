// components/common/locationPinShared.tsx — shared by LocationPinPicker (web + native).

import { useListTokens } from '@/components/common/listScreen';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export interface LocationPinPickerProps {
    value: LatLng | null;
    onChange: (v: LatLng) => void;
    /** Where the map opens when nothing is picked yet (e.g. the shop). */
    center?: LatLng | null;
    height?: number;
}

/** "lat, lng", or a Google Maps link containing "@lat,lng" / "q=lat,lng". */
export function parseCoordinates(text: string): LatLng | null {
    const m = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (!m) return null;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    if (latitude === 0 && longitude === 0) return null;
    return { latitude, longitude };
}

export function CoordinatesInput({ value, onChange }: { value: LatLng | null; onChange: (v: LatLng) => void }) {
    const { theme, border, inputBg } = useListTokens();
    const [text, setText] = useState('');
    const [bad, setBad] = useState(false);
    useEffect(() => {
        if (value) setText(`${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`);
    }, [value]);
    return (
        <View style={{ gap: 3 }}>
            <TextInput
                value={text}
                onChangeText={(t) => {
                    setText(t);
                    const v = parseCoordinates(t);
                    setBad(!!t.trim() && !v);
                    if (v) onChange(v);
                }}
                placeholder="Tap the map, or paste coordinates / a Google Maps link"
                placeholderTextColor={theme.textDark}
                className="rounded-lg px-3 h-9"
                style={{ borderWidth: 1, borderColor: bad ? '#f43f5e' : border, backgroundColor: inputBg, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}
            />
            {bad ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 11 }}>Couldn't read a location from that.</Text> : null}
        </View>
    );
}
