import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
// 🌟 Import your optimized storage utility service
import { storageService } from '@/hooks/storage';

// Define the shape of your global theme color palette 
interface ThemeProps {
    primary: string;
    surface: string;
    border: string;
    background: string;
}

interface AuthContextType {
    user: any | null;
    isLoading: boolean;
    theme: ThemeProps;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Balanced material design styling guidelines passed to your downstream screens
const lightTheme: ThemeProps = {
    primary: "#2563eb",   // Deep cobalt blue primary action colour
    surface: "#f8fafc",   // Slate card surface white tracking metric
    border: "#e2e8f0",    // Soft separator border framework gray
    background: "#ffffff" // Main display background base
};

const darkTheme: ThemeProps = {
    primary: "#3b82f6",   // Brighter neon cobalt for readability over dark backgrounds
    surface: "#1e293b",   // Slate-800 card background profile
    border: "#334155",    // Slate-700 structural border grids
    background: "#0f172a" // Deep Slate-900 absolute viewport backdrop
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false); // Can tie into device hooks later

    // 🌟 AUTO-LOGIN RESTORATION SYSTEM RUNS ON BOOT
    useEffect(() => {
        async function restoreSession() {
            try {
                // storageService handles extraction and expiration filtering automatically
                const sessionUser = await storageService.getUser();
                if (sessionUser) {
                    setUser(sessionUser);
                    console.log("Session System Trace: Re-anchored valid active account user profile.");
                }
            } catch (error) {
                console.error("Session System Trace: Failed to validate local secure credentials:", error);
            } finally {
                setIsLoading(false);
            }
        }

        restoreSession();
    }, []);

    // 🌟 LOGIN ACTION LIFECYCLE HOOK LAYER
    const login = async (token: string) => {
        try {
            setIsLoading(true);
            await storageService.storeToken(token);
            const authenticatedUser = await storageService.getUser();
            setUser(authenticatedUser);
        } catch (error) {
            console.error("Auth Mutation Error: Execution phase failed to store token configuration:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // 🌟 LOGOUT ACTION LIFECYCLE HOOK LAYER
    const logout = async () => {
        try {
            setIsLoading(true);
            await storageService.removeToken();
            setUser(null);
            console.log("Session System Trace: Local account tokens deleted cleanly.");
        } catch (error) {
            console.error("Auth Mutation Error: Execution phase failed to clean token files:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Select theme configurations dynamically based on layout toggles
    const theme = useMemo(() => (isDarkMode ? darkTheme : lightTheme), [isDarkMode]);

    // Memoize values to prevent downstream component render spikes
    const authPayload = useMemo(() => ({
        user,
        isLoading,
        theme,
        login,
        logout
    }), [user, isLoading, theme]);

    return (
        <AuthContext.Provider value={authPayload}>
            {children}
        </AuthContext.Provider>
    );
}

// 🌟 CONSUMER INTERFACE HOOK FOR INSTANT DOWNSTREAM EXTRACTION
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be executed within an initialized <AuthProvider> tree node.");
    }
    return context;
}
