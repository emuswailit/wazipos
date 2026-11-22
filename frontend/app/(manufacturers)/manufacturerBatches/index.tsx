// app/(manufacturers)/manufacturerBatches/index.tsx — Manufacturer: production batches sold to distributors. The backend checks who may use it (manufacturers/services/access.py).

import ManufacturerStock from '@/components/manufacturers/ManufacturerStock';
import React from 'react';

export default function Route() {
    return <ManufacturerStock />;
}
