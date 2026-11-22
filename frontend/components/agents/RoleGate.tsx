// components/agents/RoleGate.tsx
//
// Refuses a typed-in URL to a screen the user may not see (the menu already
// hides it; the backend enforces the same rule).

import { EmptyState } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { isAgent, isOnboarder, isPlatformAdmin } from '@/utils/platformAdmin';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function RoleGate({ role, children }: { role: 'admin' | 'agent' | 'onboarder'; children: React.ReactNode }) {
    const { user, theme } = useAuth() as any;
    const allowed = role === 'admin' ? isPlatformAdmin(user) : role === 'agent' ? isAgent(user) : isOnboarder(user);
    if (allowed) return <>{children}</>;
    return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme?.background }}>
            <EmptyState
                icon="lock-closed-outline"
                title={role === 'admin' ? 'Admins only' : role === 'agent' ? 'Agents only' : 'Onboarders only'}
                message={
                    role === 'admin'
                        ? 'Only platform administrators can manage agents.'
                        : role === 'agent'
                            ? 'This is for WaziPOS agents. Ask an administrator to make you an agent, then sign in again.'
                            : "This is for an agent's onboarders. Ask your agent to add you, then sign in again."
                }
                actionLabel="Go home"
                onAction={() => router.replace('/' as any)}
            />
        </View>
    );
}
