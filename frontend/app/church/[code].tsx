// app/church/[code].tsx
//
// Public: the page a shared church link opens (/church/<code>). No sign-in — public
// notices, the weekly programme and public events; see app/_layout.tsx (open route).

import PublicChurchScreen from '@/components/church/PublicChurchScreen';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function PublicChurchRoute() {
    const { code } = useLocalSearchParams<{ code: string }>();
    return (
        <>
            <Stack.Screen options={{ title: 'Church', headerShown: false }} />
            <PublicChurchScreen code={String(code || '')} />
        </>
    );
}
