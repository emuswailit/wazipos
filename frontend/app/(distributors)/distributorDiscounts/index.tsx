// app/(distributors)/distributorDiscounts/index.tsx — Distributor -> Discounts: price offers and free units for wholesalers.
// The backend checks who may use it (distributors/services/access.py).

import DistributorDiscounts from '@/components/distributors/DistributorDiscounts';
import React from 'react';

export default function Route() {
    return <DistributorDiscounts />;
}
