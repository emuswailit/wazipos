// app/(admin)/agents/index.tsx — Admin -> Agents (platform admins only).

import AgentsList from '@/components/admin/agents/AgentsList';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AdminAgentsRoute() {
    return (
        <RoleGate role="admin">
            <AgentsList />
        </RoleGate>
    );
}
