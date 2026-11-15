// components/restaurants/shared.tsx — small pieces shared by the dining screens.

import { STATUS_META, type FoodOrder } from '@/api/diningApi';
import { AdminBadgePill } from '@/components/common/listScreen';
import React from 'react';

export const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function FoodStatusPill({ order }: { order: Pick<FoodOrder, 'status'> }) {
    const m = STATUS_META[order.status] ?? { label: order.status, tone: 'neutral' as const };
    return <AdminBadgePill badge={{ label: m.label, tone: m.tone }} />;
}

export function PaidPill({ order }: { order: Pick<FoodOrder, 'is_paid' | 'status'> }) {
    if (order.status === 'CANCELLED') return null;
    return <AdminBadgePill badge={order.is_paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' }} />;
}

export function when(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Cart: menu item id -> quantity. */
export type Cart = Record<string, number>;
