// app/(admin)/agentEntities/index.tsx — Agent -> My entities: only the businesses this agent registered.

import AgentEntitiesList from '@/components/agents/AgentEntitiesList';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AgentEntitiesRoute() {
    return (
        <RoleGate role="agent">
            <AgentEntitiesList />
        </RoleGate>
    );
}
