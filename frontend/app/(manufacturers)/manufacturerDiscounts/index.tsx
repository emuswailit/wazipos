// app/(manufacturers)/manufacturerDiscounts/index.tsx — Manufacturer: price and quantity discounts. The backend checks who may use it (manufacturers/services/access.py).

import ManufacturerDiscounts from '@/components/manufacturers/ManufacturerDiscounts';
import React from 'react';

export default function Route() {
    return <ManufacturerDiscounts />;
}
