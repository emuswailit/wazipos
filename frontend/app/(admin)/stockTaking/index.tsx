// app/(admin)/stockTaking/index.tsx — Stocktakers: the stock takes you're booked on; count on the booked days.

import RoleGate from '@/components/agents/RoleGate';
import StocktakerJobs from '@/components/onboarders/StocktakerJobs';
import React from 'react';

export default function StockTakingRoute() {
    return (
        <RoleGate role="onboarder">
            <StocktakerJobs />
        </RoleGate>
    );
}
