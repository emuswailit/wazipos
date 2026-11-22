// app/(distributors)/distributorOrders/index.tsx — Distributor -> Orders: wholesalers' orders; payment, fulfilment, pickup.
// The backend checks who may use it (distributors/services/access.py).

import DistributorOrders from '@/components/distributors/DistributorOrders';
import React from 'react';

export default function Route() {
    return <DistributorOrders />;
}
