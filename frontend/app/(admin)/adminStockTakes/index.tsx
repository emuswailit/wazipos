// app/(admin)/adminStockTakes/index.tsx — Admin -> Stock takes: all stock takes and stocktakers' dues.

import AdminStockTakes from '@/components/admin/stockTakes/AdminStockTakes';
import RoleGate from '@/components/agents/RoleGate';
import React from 'react';

export default function AdminStockTakesRoute() {
    return (
        <RoleGate role="admin">
            <AdminStockTakes />
        </RoleGate>
    );
}
