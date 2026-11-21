// app/(admin)/agentOnboarders/index.tsx — Agent -> My onboarders (stock-take helpers).

import AgentOnboardersList from '@/components/agents/AgentOnboardersList';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AgentOnboardersRoute() {
    return (
        <RoleGate role="agent">
            <AgentOnboardersList />
        </RoleGate>
    );
}
