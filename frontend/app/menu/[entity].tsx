// app/menu/[entity].tsx
//
// Public: the page a restaurant's QR code opens (/menu/<restaurant>?table=<table>).
// No sign-in — see app/_layout.tsx (the "menu" route is open to everyone).

import PublicMenuScreen from '@/components/restaurants/walkin/PublicMenuScreen';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function PublicMenuRoute() {
    const { entity, table } = useLocalSearchParams<{ entity: string; table?: string }>();
    return (
        <>
            <Stack.Screen options={{ title: 'Menu', headerShown: false }} />
            <PublicMenuScreen entity={String(entity || '')} table={table ? String(table) : null} />
        </>
    );
}
