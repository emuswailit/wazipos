// app/(admin)/onboarding/index.tsx — Onboarding (onboarders only): add opening stock
// for the businesses your agent attached you to, on the days they set.

import RoleGate from '@/components/agents/RoleGate';
import OnboarderWork from '@/components/onboarders/OnboarderWork';
import React from 'react';

export default function OnboardingRoute() {
    return (
        <RoleGate role="onboarder">
            <OnboarderWork />
        </RoleGate>
    );
}
