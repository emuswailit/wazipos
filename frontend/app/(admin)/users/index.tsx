// app/(admin)/users/index.tsx
//
// Users (list / create / update): platform admins only (staff or the Admin role). The menu
// hides it for everyone else, this screen refuses a typed-in URL, and the
// backend (users/admin, AdminRoleOnly) enforces the same rule.

import AdminUsersList from '@/components/admin/users/AdminUsersList';
import { EmptyState } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function AdminUsersRoute() {
    const { user, theme } = useAuth() as any;
    const isAdmin = isPlatformAdmin(user);
    if (!isAdmin) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme?.background }}>
                <EmptyState
                    icon="lock-closed-outline"
                    title="Admins only"
                    message="Only platform administrators can view and edit users."
                    actionLabel="Go home"
                    onAction={() => router.replace('/' as any)}
                />
            </View>
        );
    }
    return <AdminUsersList />;
}
