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

    /** Top-level entity context fields from JWT */
    entity?: string;
    entity_id?: string;
    entity_type?: string;
    entity_title?: string;
    monthly_subscription?: string | number;
    entity_registration_fee?: string | number;
    entity_trial_done?: string | boolean;
    documents_uploaded?: string | boolean;
    marital_status?: string;

    // Allow any other fields from the JWT
    [key: string]: any;
}

/* =========================================================
 * Brand palette
 * ======================================================= */

export const PALETTE = {
    // WaziPOS cobalt: buttons, links, highlights
    primary: '#2a6ff3',
    primaryDark: '#1d4fd8',
    primaryLight: '#5b9dff',
    primarySoft: 'rgba(42,111,243,0.12)',

    success: '#10b981',
    successDark: '#047857',
    successLight: '#34d399',
    successSoft: 'rgba(16,185,129,0.12)',

    warning: '#f59e0b',
    warningDark: '#b45309',
    warningLight: '#fbbf24',
    warningSoft: 'rgba(245,158,11,0.14)',

    danger: '#ef4444',
    dangerDark: '#b91c1c',
    dangerLight: '#f87171',
    dangerSoft: 'rgba(239,68,68,0.12)',

    // Sky: the second stop of the brand gradient (cobalt -> sky)
    accent: '#22b8f0',
    accentDark: '#0284c7',
    accentLight: '#67d4fb',
    accentSoft: 'rgba(34,184,240,0.14)',

    info: '#2a6ff3',
    infoDark: '#1d4fd8',
    infoLight: '#5b9dff',
    infoSoft: 'rgba(42,111,243,0.12)',

    neutral: '#5b6785',
    neutralStrong: '#33405f',
    neutralMuted: '#7a86a3',
    neutralSubtle: '#9aa5bf',

    // Deep navy: dark bands, dark mode
    navy: '#0b1733',
    navyLight: '#13244d',
} as const;

/** The brand gradient (cobalt -> sky), for headlines, hero tiles and buttons. */
export const BRAND_GRADIENT = [PALETTE.primary, PALETTE.accent] as const;

/* =========================================================
 * Theme
 * ======================================================= */

export interface ThemeColors {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    primarySoft: string;

    success: string;
    successDark: string;
    successLight: string;
    successSoft: string;

    warning: string;
    warningDark: string;
    warningLight: string;
    warningSoft: string;

    danger: string;
    dangerDark: string;
    dangerLight: string;
    dangerSoft: string;

    accent: string;
    accentDark: string;
    accentLight: string;
    accentSoft: string;

    info: string;
    infoDark: string;
    infoLight: string;
    infoSoft: string;

    neutral: string;
    neutralStrong: string;
    neutralMuted: string;
    neutralSubtle: string;

    navy: string;
    navyLight: string;

    background: string;
    panel: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    borderStrong: string;

    text: string;
    textMuted: string;
    textSubtle: string;
    textInverse: string;
}

/**
 * Every palette colour is available both as `theme.colors.x` and directly as
 * `theme.x` (many screens read `theme.surfaceAlt`, `theme.danger`, ...), plus
 * `theme.isDarkMode` for components that only receive the theme.
 */
export interface ThemeShape extends ThemeColors {
    colors: ThemeColors;
    isDarkMode: boolean;
    /** Alias of textSubtle (used by a few older screens). */
    textLight: string;

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
 * ======================================================= */

const FONTS = {
    light: Platform.OS === 'web' ? 'Inter-Light, system-ui, sans-serif' : 'Inter-Light',
    regular: Platform.OS === 'web' ? 'Inter, system-ui, sans-serif' : 'Inter-Regular',
    medium: Platform.OS === 'web' ? 'Inter-Medium, system-ui, sans-serif' : 'Inter-Medium',
    semibold: Platform.OS === 'web' ? 'Inter-SemiBold, system-ui, sans-serif' : 'Inter-SemiBold',
    bold: Platform.OS === 'web' ? 'Inter-Bold, system-ui, sans-serif' : 'Inter-Bold',
    italic: Platform.OS === 'web' ? 'Inter-Italic, system-ui, sans-serif' : 'Inter-Italic',
    mono: Platform.OS === 'web' ? 'JetBrains Mono, ui-monospace, monospace' : 'JetBrainsMono',
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
    const [user, setUser] = useState<UserProfile | null>(null);
    const [token, setToken] = useState('');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const theme = useMemo<ThemeShape>(() => {
        const colors: ThemeColors = {
            primary: PALETTE.primary,
            primaryDark: PALETTE.primaryDark,
            primaryLight: PALETTE.primaryLight,
            primarySoft: PALETTE.primarySoft,

            success: PALETTE.success,
            successDark: PALETTE.successDark,
            successLight: PALETTE.successLight,
            successSoft: PALETTE.successSoft,

            warning: PALETTE.warning,
            warningDark: PALETTE.warningDark,
            warningLight: PALETTE.warningLight,
            warningSoft: PALETTE.warningSoft,

            danger: PALETTE.danger,
            dangerDark: PALETTE.dangerDark,
            dangerLight: PALETTE.dangerLight,
            dangerSoft: PALETTE.dangerSoft,

            accent: PALETTE.accent,
            accentDark: PALETTE.accentDark,
            accentLight: PALETTE.accentLight,
            accentSoft: PALETTE.accentSoft,

            info: PALETTE.info,
            infoDark: PALETTE.infoDark,
            infoLight: PALETTE.infoLight,
            infoSoft: PALETTE.infoSoft,

            neutral: PALETTE.neutral,
            neutralStrong: PALETTE.neutralStrong,
            neutralMuted: PALETTE.neutralMuted,
            neutralSubtle: PALETTE.neutralSubtle,

            navy: PALETTE.navy,
            navyLight: PALETTE.navyLight,

            background: isDarkMode ? '#08122b' : '#f5f8ff',
            panel: isDarkMode ? '#0f1d40' : '#ffffff',
            surface: isDarkMode ? '#0f1d40' : '#ffffff',
            surfaceAlt: isDarkMode ? '#060e22' : '#eef3fd',
            border: isDarkMode ? '#1e2e57' : '#e1e8f5',
            borderStrong: isDarkMode ? '#2c3f70' : '#c9d5ec',

            text: isDarkMode ? '#f3f6ff' : '#0b1733',
            textMuted: isDarkMode ? '#a8b5d6' : '#3c4a6b',
            textSubtle: isDarkMode ? '#7584a8' : '#6b7a99',
            textInverse: isDarkMode ? '#0b1733' : '#ffffff',
        };

        return {
            // Top-level copies of the palette (theme.surfaceAlt, theme.danger, ...)
            ...colors,
            colors,
            isDarkMode,
            textLight: colors.textSubtle,
            background: colors.background,
            panel: colors.panel,
            surface: colors.surface,
            border: colors.border,
            primary: colors.primary,
            text: colors.text,
            textDark: colors.textMuted,
            font: FONTS,
            fontSize: FONT_SIZES,
        };
    }, [isDarkMode]);

    /* -------- Bootstrap from stored token -------- */
    useEffect(() => {
        async function bootstrapAsync() {
            try {
                let stored: string | null = null;

                if (Platform.OS === 'web') {
                    stored = localStorage.getItem(TOKEN_KEY);
                } else if (SecureStore) {
                    stored = await SecureStore.getItemAsync(TOKEN_KEY);
                }

                if (stored) {
                    const decoded: any = jwtDecode(stored);
                    setUser(decoded);
                    setToken(stored);
                }
            } catch (e) {
                console.error('Failed to restore token from persistent storage:', e);
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
    const login = useCallback(async (rawToken: string) => {
        try {
            if (!rawToken) {
                throw new Error('Invalid string token incoming payload parameter.');
            }

            const decodedUser = jwtDecode<UserProfile>(rawToken);

            if (Platform.OS === 'web') {
                localStorage.setItem(TOKEN_KEY, rawToken);
            } else if (SecureStore) {
                await SecureStore.setItemAsync(TOKEN_KEY, rawToken);
            }

            setUser(decodedUser);
            setToken(rawToken);

            console.log('Authentication profile session initialized successfully for:', decodedUser.name);

            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.reload();
            }
        } catch (error) {
            console.error('Login Engine Decode Processing Failure:', error);
            throw error;
        }
    }, []);

    /* ---------------------------------------------------------
     * Logout
     * ------------------------------------------------------- */
    const logout = useCallback(async () => {
        // Native: stop this device getting the account's order / payout notices
        // (best effort, while the session is still valid; hooks/usePushRegistration.ts).
        if (Platform.OS !== 'web') {
            try {
                const usersApi = require('@/api/usersApi').default;
                await Promise.race([usersApi.updateNotificationToken(''), new Promise((r) => setTimeout(r, 3000))]);
            } catch {
                // never block sign-out
            }
        }
        try {
            if (Platform.OS === 'web') {
                localStorage.removeItem(TOKEN_KEY);
            } else if (SecureStore) {
                await SecureStore.deleteItemAsync(TOKEN_KEY);
            }

            await wipeLocalData();
        } catch (e) {
            console.error('Storage clean up execution error details:', e);
        } finally {
            setUser(null);
            setToken('');

            if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
        [user, token, isDarkMode, isLoading, theme, login, logout, toggleTheme]
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
        throw new Error('useAuth must be wrapped explicitly inside an <AuthProvider />.');
    }
    return context;
}