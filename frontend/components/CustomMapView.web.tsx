import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

interface CustomMapViewProps {
    userLocation: { latitude: number; longitude: number };
    filteredShops: any[];
    theme: any;
    isCurrentlyDarkMode: boolean;
}

const mapContainerStyle = { width: '100%', height: '100%' };
const STATIC_MAP_LIBRARIES: any[] = [];

export const CustomMapView = forwardRef<any, CustomMapViewProps>((props, ref) => {
    const { userLocation, filteredShops, isCurrentlyDarkMode, theme } = props;
    const [map, setMap] = useState<google.maps.Map | null>(null);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: 'AIzaSyABuQtL8qzxto4rY8DAtSOdPLXOaesiyvo',
        libraries: STATIC_MAP_LIBRARIES
    });

    const onLoad = useCallback((mapInstance: google.maps.Map) => {
        setMap(mapInstance);
    }, []);

    const onUnmount = useCallback(() => {
        setMap(null);
    }, []);

    useImperativeHandle(ref, () => ({
        animateToRegion: (region: { latitude: number; longitude: number }, duration?: number) => {
            if (map) {
                map.panTo({ lat: region.latitude, lng: region.longitude });
                map.setZoom(15);
            }
        }
    }), [map]);

    // 🚀 FIXED: Simple and clean textual failure message
    if (loadError) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: isCurrentlyDarkMode ? '#f1f5f9' : '#0f172a',
                    textAlign: 'center',
                    marginBottom: 4
                }}>
                    Map loading failed.
                </Text>
                <Text style={{
                    fontSize: 14,
                    color: isCurrentlyDarkMode ? '#94a3b8' : '#64748b',
                    textAlign: 'center'
                }}>
                    Please use a mobile phone for a better experience.
                </Text>
            </View>
        );
    }

    if (!isLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={{ width: '100%', height: '100%' }}>
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={{ lat: userLocation.latitude, lng: userLocation.longitude }}
                zoom={13}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    styles: isCurrentlyDarkMode ? darkMapStyles : lightMapStyles,
                    disableDefaultUI: false,
                    zoomControl: true,
                    clickableIcons: false,
                    preventGoogleFontsLoading: true
                }}
            >
                <MarkerF
                    position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
                    options={{
                        icon: {
                            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                            fillColor: "#3b82f6",
                            fillOpacity: 1,
                            strokeColor: "#ffffff",
                            strokeWeight: 2,
                            scale: 1.4,
                            anchor: map ? new google.maps.Point(12, 24) : undefined
                        }
                    }}
                />

                {filteredShops.map((shop) => (
                    <MarkerF
                        key={shop.id}
                        position={{ lat: shop.latitude, lng: shop.longitude }}
                        title={shop.name}
                    />
                ))}
            </GoogleMap>
        </View>
    );
});

CustomMapView.displayName = 'CustomMapView';

const lightMapStyles: google.maps.MapTypeStyle[] = [];
const darkMapStyles: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
];
