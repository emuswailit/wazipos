// components/common/LocationPinPicker.web.tsx
//
// Where the goods go: click the map (or drag the pin), or paste "lat, lng" /
// a Google Maps link. Web build (Google Maps JS); native: LocationPinPicker.tsx.

import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { CoordinatesInput, type LatLng, type LocationPinPickerProps } from './locationPinShared';

const LIBRARIES: any[] = [];

export default function LocationPinPicker({ value, onChange, center, height = 220 }: LocationPinPickerProps) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: 'AIzaSyABuQtL8qzxto4rY8DAtSOdPLXOaesiyvo',
        libraries: LIBRARIES,
        preventGoogleFontsLoading: true,
    });
    const start: LatLng = value ?? center ?? { latitude: -1.286389, longitude: 36.817223 };

    return (
        <View style={{ gap: 6 }}>
            <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
                {loadError ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text>Map unavailable — paste the coordinates below.</Text>
                    </View>
                ) : !isLoaded ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator />
                    </View>
                ) : (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={{ lat: start.latitude, lng: start.longitude }}
                        zoom={value ? 15 : 12}
                        options={{ clickableIcons: false, streetViewControl: false, mapTypeControl: false }}
                        onClick={(e) => {
                            if (e.latLng) onChange({ latitude: e.latLng.lat(), longitude: e.latLng.lng() });
                        }}
                    >
                        {value ? (
                            <MarkerF
                                position={{ lat: value.latitude, lng: value.longitude }}
                                draggable
                                onDragEnd={(e) => {
                                    if (e.latLng) onChange({ latitude: e.latLng.lat(), longitude: e.latLng.lng() });
                                }}
                            />
                        ) : null}
                    </GoogleMap>
                )}
            </View>
            <CoordinatesInput value={value} onChange={onChange} />
        </View>
    );
}
