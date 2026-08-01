import { forwardRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface CustomMapViewProps {
    userLocation: { latitude: number; longitude: number };
    filteredShops: any[];
    theme: any;
    isCurrentlyDarkMode: boolean;
}

export const CustomMapView = forwardRef<MapView, CustomMapViewProps>((props, ref) => {
    const { userLocation, filteredShops, theme, isCurrentlyDarkMode } = props;

    return (
        <MapView
            ref={ref}
            // Uses Google Maps on Android and Apple Maps on iOS
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            // 🌟 FORCE ENFORCED ABSOLUTE LAYOUTS: Prevents the map from collapsing to a height of 0 on phone screens
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            }}
            userInterfaceStyle={isCurrentlyDarkMode ? 'dark' : 'light'}
        >
            <Marker coordinate={userLocation} title="Your Location" pinColor="#3b82f6" />
            {filteredShops.map((shop) => (
                <Marker
                    key={shop.id}
                    coordinate={{ latitude: shop.latitude, longitude: shop.longitude }}
                    title={shop.name}
                    pinColor={theme.primary}
                />
            ))}
        </MapView>
    );
});

CustomMapView.displayName = 'CustomMapView';
