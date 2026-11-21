// app/(admin)/accessLogs/index.tsx
//
// Access logs: every request to the API (IP, signed-in user, action). Platform
// admins only (staff or the Admin role); the backend enforces the same rule.

import AccessLogsList from '@/components/admin/accessLogs/AccessLogsList';
import { EmptyState } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function AdminAccessLogsRoute() {
    const { user, theme } = useAuth() as any;
    if (!isPlatformAdmin(user)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme?.background }}>
                <EmptyState
                    icon="lock-closed-outline"
                    title="Admins only"
                    message="Only platform administrators can see who is using the API."
                    actionLabel="Go home"
                    onAction={() => router.replace('/' as any)}
                />
            </View>
        );
    }
    return <AccessLogsList />;
}
