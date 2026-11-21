// app/(admin)/agentUsers/index.tsx — Agent -> My users: only the users this agent registered.

import AdminUsersList from '@/components/admin/users/AdminUsersList';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AgentUsersRoute() {
    return (
        <RoleGate role="agent">
            <AdminUsersList mode="agent" />
        </RoleGate>
    );
}
