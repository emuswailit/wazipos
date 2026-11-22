// app/(wholesalers)/distributorPurchases/index.tsx — Wholesaler -> Distributor orders: pay, collect, receive into stock.
// The backend checks who may use it (distributors/services/access.py).

import WholesalerPurchases from '@/components/distributors/WholesalerPurchases';
import React from 'react';

export default function Route() {
    return <WholesalerPurchases />;
}
