import { jwtDecode } from "jwt-decode";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

// Dynamically import Expo SecureStore only when running on native platforms to prevent Web bundle crashes
let SecureStore: any = null;
if (Platform.OS !== "web") {
    SecureStore = require("expo-secure-store");
}

export interface UserRole {
    id: string;
    cluster: string;
    owner: string;
    entity: string;
    entity_title: string;
    level: string;
    title: string;
    value: string;
}

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    roles: UserRole[];
}

interface AuthContextType {
    user: UserProfile | null;
    isDarkMode: boolean;
    isLoading: boolean; // Tracks background storage reading state on initial boot
    theme: {
        background: string;
        panel: string;
        primary: string;
        text: string;
        textDark: string;
    };
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
    toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "wazipos_auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const theme = {
        background: isDarkMode ? "#0f172a" : "#f8fafc",
        panel: isDarkMode ? "#1e293b" : "#ffffff",
        text: isDarkMode ? "#f8fafc" : "#0f172a",
        textDark: isDarkMode ? "#94a3b8" : "#334155",
        primary: "#0056b3"
    };

    // ─── RUNTIME APP HYDRATION (STAYS LOGGED IN ON REFRESH/BOOT) ───
    useEffect(() => {
        async function bootstrapAsync() {
            try {
                let token: string | null = null;

                if (Platform.OS === "web") {
                    token = localStorage.getItem(TOKEN_KEY);
                } else if (SecureStore) {
                    token = await SecureStore.getItemAsync(TOKEN_KEY);
                }

                if (token) {
                    // Safe token evaluation decode step
                    const decoded: any = jwtDecode(token);
                    setUser(decoded);
                }
            } catch (e) {
                console.error("Failed to restore token from persistent storage layout layers:", e);
                // Wipe clean if corrupted token found
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        }
        bootstrapAsync();
    }, []);

    // ─── LOGIN ACTION: RECEIVES, SAVES, AND DECODES THE JWT TOKEN ───
    const login = async (token: string) => {
        try {
            if (!token) throw new Error("Invalid string token incoming payload parameter.");

            // 1. Decode token profile content details
            const decodedUser = jwtDecode<UserProfile>(token);

            // 2. Persist token across appropriate hardware sandbox targets
            if (Platform.OS === "web") {
                localStorage.setItem(TOKEN_KEY, token);
            } else if (SecureStore) {
                await SecureStore.setItemAsync(TOKEN_KEY, token);
            }

            // 3. Commit profile structural data arrays straight into reactive states
            setUser(decodedUser);
            console.log("Authentication profile session initialized successfully for:", decodedUser.name);
        } catch (error) {
            console.error("Login Engine Decode Processing Failure:", error);
            throw error; // Propagate up to login view UI form catch states
        }
    };

    // ─── LOGOUT ACTION: WIPES STORES AND STATES CLEAN ───
    const logout = async () => {
        try {
            if (Platform.OS === "web") {
                localStorage.removeItem(TOKEN_KEY);
            } else if (SecureStore) {
                await SecureStore.deleteItemAsync(TOKEN_KEY);
            }
        } catch (e) {
            console.error("Storage clean up execution error details:", e);
        } finally {
            setUser(null);
        }
    };

    const toggleTheme = () => setIsDarkMode((prev) => !prev);

    return (
        <AuthContext.Provider value={{ user, isDarkMode, isLoading, theme, login, logout, toggleTheme }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be wrapped explicitly inside an <AuthProvider />.");
    }
    return context;
}
