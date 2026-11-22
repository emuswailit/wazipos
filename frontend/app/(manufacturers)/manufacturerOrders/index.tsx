// app/(manufacturers)/manufacturerOrders/index.tsx — Manufacturer: distributors' orders. The backend checks who may use it (manufacturers/services/access.py).

import ManufacturerOrders from '@/components/manufacturers/ManufacturerOrders';
import React from 'react';

export default function Route() {
    return <ManufacturerOrders />;
}
