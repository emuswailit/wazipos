// app/(admin)/agentStockTakes/index.tsx — Agent -> Stock takes: book, follow and submit paid stock takes.

import AgentStockTakes from '@/components/agents/AgentStockTakes';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AgentStockTakesRoute() {
    return (
        <RoleGate role="agent">
            <AgentStockTakes />
        </RoleGate>
    );
}
