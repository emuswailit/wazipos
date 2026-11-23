import * as Network from 'expo-network'; // 🚀 Swapped out package dependency
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const NetworkMonitorContext = createContext<{ isOnline: boolean }>({ isOnline: true });

export const NetworkMonitorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOnline, setIsOnline] = useState<boolean>(true);

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
            // Instant updates where the listener exists; the poll is a safety net.
            const sub = typeof (Network as any).addNetworkStateListener === 'function'
                ? (Network as any).addNetworkStateListener((st: any) => setIsOnline(!!st?.isConnected))
                : null;
            const nativeIntervalId = setInterval(checkNativeNet, 10000);
            return () => {
                clearInterval(nativeIntervalId);
                sub?.remove?.();
            };
        }
    }, []);

    return (
        <NetworkMonitorContext.Provider value={{ isOnline }}>
            {children}
        </NetworkMonitorContext.Provider>
    );
};

export const useNetworkStatus = () => useContext(NetworkMonitorContext);
