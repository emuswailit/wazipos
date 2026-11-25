// components/common/ClearInputButton.tsx
//
// The small "x" shown at the end of a search box while it has text; tapping it empties
// the box. CustomTextField and SearchField have it built in; hand-made search rows
// (an icon + a bare TextInput) put this right after their TextInput.

import { useAuth } from '@/context/AuthContext';
import { X } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable } from 'react-native';

export default function ClearInputButton({ value, onClear, size = 14, disabled }: { value?: string | null; onClear: () => void; size?: number; disabled?: boolean }) {
    const { theme, isDarkMode } = useAuth();
    if (!value || disabled) return null;
    return (
        <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={[
                { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2, alignItems: 'center', justifyContent: 'center', marginLeft: 6, backgroundColor: isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.07)' },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
        >
            <X size={size} color={theme.textDark} strokeWidth={2.4} />
        </Pressable>
    );
}
