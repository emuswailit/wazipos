// app/(admin)/agentCommissions/index.tsx — Agent -> My commissions.

import AgentCommissionsList from '@/components/agents/AgentCommissionsList';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AgentCommissionsRoute() {
    return (
        <RoleGate role="agent">
            <AgentCommissionsList />
        </RoleGate>
    );
}
