// components/agents/AgentCommissionsList.tsx
//
// Agent -> My commissions: the agent's share of each subscription payment made
// by a business they registered (rate x fee, recorded when the payment
// succeeds), and whether it has been paid out yet.

import { agentMeApi, type AgentCommission, type CommissionStatus, type CommissionSummary } from '@/api/agentsApi';
import { AdminListView, ConfigDetailsSheet, DetailsDock } from '@/components/admin/kit';
import { commissionsConfig, percent } from '@/components/admin/agents/agentsConfig';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

type Filter = 'ALL' | CommissionStatus;
const EMPTY: CommissionSummary = { percentage: '0', earned: '0', pending: '0', paid: '0' };

export default function AgentCommissionsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;

    const [rows, setRows] = useState<AgentCommission[]>([]);
    const [summary, setSummary] = useState<CommissionSummary>(EMPTY);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [viewing, setViewing] = useState<AgentCommission | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await agentMeApi.getCommissions();
            if (res.ok && String(res.data?.response_code) === '0') {
                setRows(Array.isArray(res.data?.data?.commissions) ? res.data.data.commissions : []);
                setSummary({ ...EMPTY, ...(res.data?.data?.summary ?? {}) });
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(res?.data?.errors?.join?.(' ') || res?.data?.response_message || 'Could not load your commissions.');
            }
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((c) => {
            if (filter !== 'ALL' && c.status !== filter) return false;
            return !q || c.entity_title.toLowerCase().includes(q) || c.payment_reference.toLowerCase().includes(q);
        });
    }, [rows, query, filter]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);
    const owed = rows.filter((c) => c.status === 'PENDING').length;

    return (
        <DetailsDock
            placeholder="Pick a payment to see how it was divided."
            pane={<ConfigDetailsSheet config={commissionsConfig} item={viewing} heading="Commission details" onClose={() => setViewing(null)} />}
        >
            <AdminListView<AgentCommission, Filter>
                variant={isLarge ? 'web' : 'mobile'}
                config={commissionsConfig}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                lastSyncedTime={lastSyncedTime}
                error={loadError}
                items={paginated}
                allItems={filtered}
                onPressItem={setViewing}
                stats={[
                    { label: 'Your rate', value: percent(summary.percentage), color: '#8b5cf6' },
                    { label: 'Earned', value: formatKES(summary.earned), color: '#10b981' },
                    { label: 'Owed to you', value: formatKES(summary.pending), color: Number(summary.pending) ? '#f59e0b' : undefined },
                    { label: 'Paid out', value: formatKES(summary.paid) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: rows.length },
                        { key: 'PENDING', label: 'Owed', icon: 'time-outline', count: owed },
                        { key: 'PAID', label: 'Paid out', icon: 'checkmark-circle-outline', count: rows.length - owed },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />
        </DetailsDock>
    );
}
