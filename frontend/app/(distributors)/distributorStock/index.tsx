// app/(distributors)/distributorStock/index.tsx — Distributor -> Stock: the lots sold to wholesalers.
// The backend checks who may use it (distributors/services/access.py).

import DistributorStock from '@/components/distributors/DistributorStock';
import React from 'react';

export default function Route() {
    return <DistributorStock />;
}
