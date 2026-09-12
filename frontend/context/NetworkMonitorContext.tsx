import * as Network from 'expo-network'; // 🚀 Swapped out package dependency
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useAuth } from './AuthContext';

const NetworkMonitorContext = createContext<{ isOnline: boolean }>({ isOnline: true });

export const NetworkMonitorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState<boolean>(true);
    const { theme } = useAuth();

    useEffect(() => {
        if (Platform.OS === 'web') {
            const updateWebStatus = () => setIsOnline(navigator.onLine);
            window.addEventListener('online', updateWebStatus);
            window.addEventListener('offline', updateWebStatus);
            updateWebStatus();
            return () => {
                window.removeEventListener('online', updateWebStatus);
                window.removeEventListener('offline', updateWebStatus);
            };
        } else {
            const checkNativeNet = async () => {
                const state = await Network.getNetworkStateAsync();
                setIsOnline(!!state.isConnected);
            };
            checkNativeNet();
            const nativeIntervalId = setInterval(checkNativeNet, 10000);
            return () => clearInterval(nativeIntervalId);
        }
    }, []);

    return (
        <NetworkMonitorContext.Provider value={{ isOnline }}>
            {children}
            {!isOnline && (
                <View style={{ backgroundColor: '#f43f5e', zIndex: 99999 }} className="absolute bottom-0 left-0 right-0 py-2 items-center justify-center shadow-lg">
                    <Text style={{ fontFamily: theme?.font?.bold || 'System', fontSize: 12 }} className="text-white font-bold tracking-wider uppercase text-center">⚠️ Connection Interrupted. Operating in Offline Mode.</Text>
                </View>
            )}
        </NetworkMonitorContext.Provider>
    );
};

export const useNetworkStatus = () => useContext(NetworkMonitorContext);
