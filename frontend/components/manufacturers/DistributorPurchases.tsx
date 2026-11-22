// components/manufacturers/DistributorPurchases.tsx
//
// Distributor -> Manufacturer orders: what you ordered from manufacturers. Open one
// to pay (mobile money), see your pickup code, cancel while unpaid, and receive the
// goods into your stock once collected. Backend: manufacturers/buy.

import { distributorBuyApi, type DistributorOrder } from '@/api/manufacturersApi';
import { AdminListView, DetailsDock, SegmentedControl } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ordersConfig } from './ManufacturerOrders';
import OrderDetailsSheet, { errorText, ok } from './OrderDetailsSheet';

type Scope = 'OPEN' | 'DONE';

export default function DistributorPurchases() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [scope, setScope] = useState<Scope>('OPEN');
    const [rows, setRows] = useState<DistributorOrder[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<DistributorOrder | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await distributorBuyApi.orders(scope);
            if (ok(res)) {
                setRows(res.data.orders ?? []);
                setLoadError(null);
            } else setLoadError(errorText(res, 'Could not load your orders.'));
        } finally {
            setRefreshing(false);
        }
    }, [scope]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((o) => `${o.reference_number} ${o.manufacturer_title}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const upsert = (o: DistributorOrder) => setRows((prev) => prev.map((x) => (x.id === o.id ? o : x)));
    const due = rows.filter((o) => o.status === 'SUBMITTED').reduce((s, o) => s + Number(o.amount_due || 0), 0);

    return (
        <DetailsDock placeholder="Pick an order to follow it." pane={viewing ? <OrderDetailsSheet order={viewing} role="buyer" onClose={() => setViewing(null)} onChanged={upsert} /> : null}>
            <AdminListView<DistributorOrder, string>
                variant={isLarge ? 'web' : 'mobile'}
                config={ordersConfig('buyer')}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                error={loadError}
                header={<View style={{ marginBottom: 8 }}><SegmentedControl<Scope> value={scope} onChange={setScope} options={[{ key: 'OPEN', label: 'Open' }, { key: 'DONE', label: 'Done' }]} /></View>}
                items={items}
                allItems={items}
                onPressItem={setViewing}
                stats={[
                    { label: 'Orders', value: rows.length.toLocaleString() },
                    { label: 'To pay', value: formatKES(due), color: due ? '#f59e0b' : undefined },
                    { label: 'Ready to collect', value: rows.filter((o) => o.status === 'READY').length.toLocaleString(), color: '#8b5cf6' },
                    { label: 'To receive', value: rows.filter((o) => o.status === 'COLLECTED').length.toLocaleString(), color: '#10b981' },
                ]}
                page={1}
                pageSize={100 as any}
                totalItems={items.length}
                totalPages={1}
                pageStart={0}
                pageEnd={items.length}
                onPrev={() => {}}
                onNext={() => {}}
                onPageSizeChange={() => {}}
            />
        </DetailsDock>
    );
}
