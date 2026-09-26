// context/AuthContext.tsx

import { wipeLocalData } from '@/databases/db';
import { jwtDecode } from 'jwt-decode';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Platform } from 'react-native';

let SecureStore: any = null;
if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

export interface UserRole {
    id: string;
    cluster: string;
    owner: string;
    entity: string;
    entity_title: string;
    entity_type?: string;
    level: string;
    title: string;
    value: string;
}

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    roles: UserRole[];
    /** Some JWT shapes carry these at the top level. */
    entity?: string;
    entity_id?: string;
    entity_type?: string;
}

export interface ThemeShape {
    background: string;
    panel: string;
    surface: string;
    border: string;
    primary: string;
    text: string;
    textDark: string;
    font: {
        light: string;
        regular: string;
        medium: string;
        semibold: string;
        bold: string;
        italic: string;
        mono: string;
    };
    fontSize: {
        xs: number;
        sm: number;
        base: number;
        lg: number;
        xl: number;
        xxl: number;
    };
}

interface AuthContextType {
    user: UserProfile | null;
    token: string;
    isDarkMode: boolean;
    isLoading: boolean;
    theme: ThemeShape;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
    toggleTheme: () => void;
}

const AuthContext = createContext<
    AuthContextType | undefined
>(undefined);

const TOKEN_KEY = 'wazipos_auth_token';

/* =========================================================
 * Fonts
 * ========================================================= */

const FONTS = {
    light:
        Platform.OS === 'web'
            ? 'Inter-Light, system-ui, sans-serif'
            : 'Inter-Light',
    regular:
        Platform.OS === 'web'
            ? 'Inter, system-ui, sans-serif'
            : 'Inter-Regular',
    medium:
        Platform.OS === 'web'
            ? 'Inter-Medium, system-ui, sans-serif'
            : 'Inter-Medium',
    semibold:
        Platform.OS === 'web'
            ? 'Inter-SemiBold, system-ui, sans-serif'
            : 'Inter-SemiBold',
    bold:
        Platform.OS === 'web'
            ? 'Inter-Bold, system-ui, sans-serif'
            : 'Inter-Bold',
    italic:
        Platform.OS === 'web'
            ? 'Inter-Italic, system-ui, sans-serif'
            : 'Inter-Italic',
    mono:
        Platform.OS === 'web'
            ? 'JetBrains Mono, ui-monospace, monospace'
            : 'JetBrainsMono',
};

const FONT_SIZES = {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 21,
    xxl: 26,
};

export function AuthProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, setUser] =
        useState<UserProfile | null>(null);
    const [token, setToken] = useState('');
    const [isDarkMode, setIsDarkMode] =
        useState<boolean>(false);
    const [isLoading, setIsLoading] =
        useState<boolean>(true);

    const theme = useMemo<ThemeShape>(
        () => ({
            background: isDarkMode
                ? '#0f172a'
                : '#f8fafc',
            panel: isDarkMode ? '#1e293b' : '#ffffff',
            surface: isDarkMode ? '#1e293b' : '#ffffff',
            border: isDarkMode ? '#334155' : '#e2e8f0',
            text: isDarkMode ? '#f8fafc' : '#0f172a',
            textDark: isDarkMode
                ? '#94a3b8'
                : '#334155',
            primary: '#0056b3',
            font: FONTS,
            fontSize: FONT_SIZES,
        }),
        [isDarkMode]
    );

    /* -------- Bootstrap from stored token -------- */
    useEffect(() => {
        async function bootstrapAsync() {
            try {
                let stored: string | null = null;

                if (Platform.OS === 'web') {
                    stored =
                        localStorage.getItem(TOKEN_KEY);
                } else if (SecureStore) {
                    stored =
                        await SecureStore.getItemAsync(
                            TOKEN_KEY
                        );
                }

                if (stored) {
                    const decoded: any =
                        jwtDecode(stored);
                    setUser(decoded);
                    setToken(stored);
                }
            } catch (e) {
                console.error(
                    'Failed to restore token from persistent storage:',
                    e
                );
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        }

        bootstrapAsync();
    }, []);

    /* ---------------------------------------------------------
     * Login
     * ------------------------------------------------------- */
    const login = useCallback(
        async (rawToken: string) => {
            try {
                if (!rawToken) {
                    throw new Error(
                        'Invalid string token incoming payload parameter.'
                    );
                }

                const decodedUser =
                    jwtDecode<UserProfile>(rawToken);

                if (Platform.OS === 'web') {
                    localStorage.setItem(
                        TOKEN_KEY,
                        rawToken
                    );
                } else if (SecureStore) {
                    await SecureStore.setItemAsync(
                        TOKEN_KEY,
                        rawToken
                    );
                }

                setUser(decodedUser);
                setToken(rawToken);

                console.log(
                    'Authentication profile session initialized successfully for:',
                    decodedUser.name
                );

                if (
                    Platform.OS === 'web' &&
                    typeof window !== 'undefined'
                ) {
                    window.location.reload();
                }
            } catch (error) {
                console.error(
                    'Login Engine Decode Processing Failure:',
                    error
                );
                throw error;
            }
        },
        []
    );

    /* ---------------------------------------------------------
     * Logout
     * ------------------------------------------------------- */
    const logout = useCallback(async () => {
        try {
            if (Platform.OS === 'web') {
                localStorage.removeItem(TOKEN_KEY);
            } else if (SecureStore) {
                await SecureStore.deleteItemAsync(
                    TOKEN_KEY
                );
            }

            await wipeLocalData();
        } catch (e) {
            console.error(
                'Storage clean up execution error details:',
                e
            );
        } finally {
            setUser(null);
            setToken('');

            if (
                Platform.OS === 'web' &&
                typeof window !== 'undefined'
            ) {
                window.location.reload();
            }
        }
    }, []);

    const toggleTheme = useCallback(() => {
        setIsDarkMode((prev) => !prev);
    }, []);

    const value = useMemo<AuthContextType>(
        () => ({
            user,
            token,
            isDarkMode,
            isLoading,
            theme,
            login,
            logout,
            toggleTheme,
        }),
        [
            user,
            token,
            isDarkMode,
            isLoading,
            theme,
            login,
            logout,
            toggleTheme,
        ]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error(
            'useAuth must be wrapped explicitly inside an <AuthProvider />.'
        );
    }
    return context;
}