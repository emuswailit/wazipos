// components/auth/SocialPlaceholderButton.tsx
//
// Shown instead of a social sign-in button whose keys aren't set yet
// (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_FACEBOOK_APP_ID in .env), so
// people can see the option is coming. Pressing it explains instead of failing.

import { useAuth } from '@/context/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

type Provider = 'google' | 'facebook';

const META: Record<Provider, { label: string; icon: 'google' | 'facebook'; color: string }> = {
    google: { label: 'Continue with Google', icon: 'google', color: '#ea4335' },
    facebook: { label: 'Continue with Facebook', icon: 'facebook', color: '#1877f2' },
};

export default function SocialPlaceholderButton({ provider, onPress }: { provider: Provider; onPress?: (message: string) => void }) {
    const { theme } = useAuth();
    const m = META[provider];
    return (
        <Pressable
            onPress={() => onPress?.(`${m.label.replace('Continue with ', '')} sign-in is coming soon. Use your email for now.`)}
            accessibilityRole="button"
            accessibilityLabel={`${m.label} (coming soon)`}
            className="flex-row items-center justify-center rounded-xl h-12 px-4"
            style={{ borderWidth: 1, borderColor: theme.border, backgroundColor: 'transparent', gap: 10, opacity: 0.75 }}
        >
            <FontAwesome name={m.icon} size={18} color={m.color} />
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{m.label}</Text>
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${theme.primary}14` }}>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 10 }}>SOON</Text>
            </View>
        </Pressable>
    );
}
