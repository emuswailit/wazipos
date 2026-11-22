// app/(admin)/stockTakes/index.tsx — a business's stock takes (its super admin):
// pay, see counted vs book stock, decide what changes. The backend checks the role.

import VendorStockTakes from '@/components/stocktakes/VendorStockTakes';
import React from 'react';

export default function VendorStockTakesRoute() {
    return <VendorStockTakes />;
}
