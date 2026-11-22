// app/(admin)/deliveryProviders/index.tsx
//
// Delivery providers: the platform's delivery companies and couriers, their riders /
// drivers and vehicles, managed centrally. Platform admins only (the backend enforces it).

import AdminDeliveryProviders from '@/components/admin/deliveryProviders/AdminDeliveryProviders';
import { EmptyState } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { isPlatformAdmin } from '@/utils/platformAdmin';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function AdminDeliveryProvidersRoute() {
    const { user, theme } = useAuth() as any;
    if (!isPlatformAdmin(user)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme?.background }}>
                <EmptyState
                    icon="lock-closed-outline"
                    title="Admins only"
                    message="Only platform administrators manage delivery companies and couriers."
                    actionLabel="Go home"
                    onAction={() => router.replace('/' as any)}
                />
            </View>
        );
    }
    return <AdminDeliveryProviders />;
}
