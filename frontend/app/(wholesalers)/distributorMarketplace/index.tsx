// app/(wholesalers)/distributorMarketplace/index.tsx — Wholesaler -> Buy from distributors: find, browse, order remotely.
// The backend checks who may use it (distributors/services/access.py).

import DistributorMarketplace from '@/components/distributors/DistributorMarketplace';
import React from 'react';

export default function Route() {
    return <DistributorMarketplace />;
}
