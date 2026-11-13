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

const PALETTE = {
    primary: '#1a73e8',
    primaryDark: '#1557b0',
    primaryLight: '#4285f4',
    primarySoft: 'rgba(26,115,232,0.12)',

    success: '#2e7d32',
    successDark: '#1b5e20',
    successLight: '#4caf50',
    successSoft: 'rgba(46,125,50,0.12)',

    warning: '#f57c00',
    warningDark: '#e65100',
    warningLight: '#ff9800',
    warningSoft: 'rgba(245,124,0,0.12)',

    danger: '#d93025',
    dangerDark: '#b31412',
    dangerLight: '#f28b82',
    dangerSoft: 'rgba(217,48,37,0.12)',

    accent: '#8e24aa',
    accentDark: '#6a1b9a',
    accentLight: '#ab47bc',
    accentSoft: 'rgba(142,36,170,0.12)',

    info: '#1a73e8',
    infoDark: '#1557b0',
    infoLight: '#4285f4',
    infoSoft: 'rgba(26,115,232,0.12)',

    neutral: '#5f6368',
    neutralStrong: '#3c4043',
    neutralMuted: '#80868b',
    neutralSubtle: '#9aa0a6',
} as const;

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

            background: isDarkMode ? '#0f172a' : '#f8fafc',
            panel: isDarkMode ? '#1e293b' : '#ffffff',
            surface: isDarkMode ? '#1e293b' : '#ffffff',
            surfaceAlt: isDarkMode ? '#0b1220' : '#f1f5f9',
            border: isDarkMode ? '#334155' : '#e2e8f0',
            borderStrong: isDarkMode ? '#475569' : '#cbd5e1',

            text: isDarkMode ? '#f8fafc' : '#0f172a',
            textMuted: isDarkMode ? '#94a3b8' : '#334155',
            textSubtle: isDarkMode ? '#64748b' : '#64748b',
            textInverse: isDarkMode ? '#0f172a' : '#ffffff',
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