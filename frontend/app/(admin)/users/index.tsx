// app/(admin)/users/index.tsx
//
// Users (list / create / update): users with the Admin role only. The menu
// hides it for everyone else, this screen refuses a typed-in URL, and the
// backend (users/admin, AdminRoleOnly) enforces the same rule.

import AdminUsersList from '@/components/admin/users/AdminUsersList';
import { EmptyState } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function AdminUsersRoute() {
    const { user, theme } = useAuth() as any;
    const isAdmin = (user?.roles ?? []).some((r: any) => r?.value === 'Admin');
    if (!isAdmin) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme?.background }}>
                <EmptyState
                    icon="lock-closed-outline"
                    title="Admins only"
                    message="Only users with the Admin role can view and edit users."
                    actionLabel="Go home"
                    onAction={() => router.replace('/' as any)}
                />
            </View>
        );
    }
    return <AdminUsersList />;
}
