// app/job/[code].tsx
//
// Public: the page a shared job link opens (/job/<code>). No sign-in — a teaser and
// a call to join; see app/_layout.tsx (the "job" route is open to everyone).

import PublicJobScreen from '@/components/jobs/PublicJobScreen';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function PublicJobRoute() {
    const { code } = useLocalSearchParams<{ code: string }>();
    return (
        <>
            <Stack.Screen options={{ title: 'Job', headerShown: false }} />
            <PublicJobScreen code={String(code || '')} />
        </>
    );
}
