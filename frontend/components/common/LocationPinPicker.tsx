// components/common/LocationPinPicker.tsx
//
// Where the goods go: tap the map (or drag the pin), or paste "lat, lng" /
// a Google Maps link. Native build (react-native-maps); web: LocationPinPicker.web.tsx.

import React from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { CoordinatesInput, type LatLng, type LocationPinPickerProps } from './locationPinShared';

export default function LocationPinPicker({ value, onChange, center, height = 220 }: LocationPinPickerProps) {
    const start: LatLng = value ?? center ?? { latitude: -1.286389, longitude: 36.817223 };
    return (
        <View style={{ gap: 6 }}>
            <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
                <MapView
                    provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                    style={{ flex: 1 }}
                    initialRegion={{ latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                    onPress={(e) => onChange(e.nativeEvent.coordinate)}
                >
                    {value ? <Marker coordinate={value} draggable onDragEnd={(e) => onChange(e.nativeEvent.coordinate)} /> : null}
                </MapView>
            </View>
            <CoordinatesInput value={value} onChange={onChange} />
        </View>
    );
}
