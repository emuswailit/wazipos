// components/common/listScreen/tokens.ts
//
// Shared layout rules and colours for list screens (web + native).

import { useAuth } from '@/context/AuthContext';
import { Platform } from 'react-native';

/** Wide web screens get the paginated table; native apps and narrow web get cards. */
export const LIST_MAX_WIDTH = 1600;

export const isWeb = Platform.OS === 'web';
export const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
export const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};

/** True on web when the window is at least WIDE_WEB_MIN_WIDTH wide (never on native). */

/** Theme-aware surface colours used across the list kit. */
export function useListTokens() {
    const { theme, isDarkMode } = useAuth();
    return {
        theme,
        isDarkMode,
        border: isDarkMode ? '#1e293b' : '#e2e8f0',
        rowBorder: isDarkMode ? '#1e293b' : '#f1f5f9',
        headerBg: isDarkMode ? '#0b1220' : '#f8fafc',
        inputBg: isDarkMode ? '#0f172a' : '#f1f5f9',
        chipBg: isDarkMode ? '#0f172a' : '#f1f5f9',
        hoverBg: isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.025)',
        divider: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
        cardBorder: isDarkMode ? '#1e293b' : '#eef2f7',
        tableShadow: isWeb ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)' } as any) : {},
        cardShadow: isWeb
            ? ({ boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.05)' } as any)
            : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    };
}
