// app/(manufacturers)/manufacturerProducts/index.tsx — Manufacturer: Products, the source of everything sold. The backend checks who may use it (manufacturers/services/access.py).

import ManufacturerProducts from '@/components/manufacturers/ManufacturerProducts';
import React from 'react';

export default function Route() {
    return <ManufacturerProducts />;
}
