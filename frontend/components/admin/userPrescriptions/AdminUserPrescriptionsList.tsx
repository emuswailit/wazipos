// components/admin/userPrescriptions/AdminUserPrescriptionsList.tsx
//
// Admin: every prescription customers upload. Admins (and the system AI)
// digitize them — preparation and/or product per medicine, the prescribed
// quantity and whether partial purchase is allowed. Only the prescription's
// owner can then send it to a pharmacy (exactly one). Admins have no
// inventory, so they never quote. Uses the admin endpoint
// (/retailers/prescriptions/admin/).

import { adminRxClient } from '@/api/retailerPrescriptionsApi';
import { AdminListView, type AdminListViewProps } from '@/components/admin/kit';
import type { PageSize } from '@/components/common/PaginationBar';
import { DigitizePrescriptionModal } from '@/components/retailers/retailerPrescriptions/DigitizePrescriptionModal';
import { makePrescriptionsConfig, quotationsOf } from '@/components/retailers/retailerPrescriptions/prescriptionsConfig';
import { RetailerPrescriptionDetailsModal } from '@/components/retailers/retailerPrescriptions/RetailerPrescriptionDetailsModal';
import type { PrescriptionNormalized } from '@/components/retailers/retailerPrescriptions/RetailerPrescriptionsList';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

type Filter = 'ALL' | 'QUEUING' | 'DIGITIZED' | 'NOT_FORWARDED' | 'QUOTED';

const config = makePrescriptionsConfig('admin');

export default function AdminUserPrescriptionsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const [prescriptions, setPrescriptions] = useState<PrescriptionNormalized[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSynced, setLastSynced] = useState('');

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [detailsTarget, setDetailsTarget] = useState<PrescriptionNormalized | null>(null);
    const [digitizeTarget, setDigitizeTarget] = useState<PrescriptionNormalized | null>(null);

    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        setError(null);
        try {
            const res = await adminRxClient.post({ action: 'RetrieveAllPrescriptions' });
            const results = res.data?.results ?? (Array.isArray(res.data) ? res.data : null);
            if (res.ok && Array.isArray(results)) {
                setPrescriptions(results);
                setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setError(res.status === 403 ? 'Only admins can view user prescriptions.' : "Couldn't load prescriptions.");
            }
        } catch {
            setError("Couldn't reach the server. Check your connection.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    /** Swap a fresh prescription in everywhere it is shown. */
    const upsert = useCallback((fresh: PrescriptionNormalized) => {
        if (!fresh?.id) return;
        const same = (p: PrescriptionNormalized | null) => !!p && String(p.id) === String(fresh.id);
        setPrescriptions((list) => list.map((p) => (String(p.id) === String(fresh.id) ? { ...p, ...fresh } : p)));
        setDetailsTarget((p) => (same(p) ? { ...p!, ...fresh } : p));
        setDigitizeTarget((p) => (same(p) ? { ...p!, ...fresh } : p));
    }, []);

    // Open the digitize workspace only after the details sheet has closed:
    // native drops a Modal presented while another is still animating out.
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);
    const openDigitize = (item: PrescriptionNormalized) => {
        const fromSheet = !!detailsTarget;
        setDetailsTarget(null);
        if (timer.current) clearTimeout(timer.current);
        if (fromSheet && Platform.OS !== 'web') timer.current = setTimeout(() => setDigitizeTarget(item), 350);
        else setDigitizeTarget(item);
    };

    const counts = useMemo(() => {
        const notForwarded = prescriptions.filter((p) => p.status === 'DIGITIZED' && !p.entity && quotationsOf(p).length === 0).length;
        return {
            all: prescriptions.length,
            queuing: prescriptions.filter((p) => p.status === 'QUEUING').length,
            digitized: prescriptions.filter((p) => p.status === 'DIGITIZED').length,
            notForwarded,
            quoted: prescriptions.filter((p) => quotationsOf(p).some((q) => q.status !== 'REQUESTED')).length,
        };
    }, [prescriptions]);

    const filtered = useMemo(() => {
        let base = prescriptions;
        if (filter === 'QUEUING') base = base.filter((p) => p.status === 'QUEUING');
        else if (filter === 'DIGITIZED') base = base.filter((p) => p.status === 'DIGITIZED');
        else if (filter === 'NOT_FORWARDED') base = base.filter((p) => p.status === 'DIGITIZED' && !p.entity && quotationsOf(p).length === 0);
        else if (filter === 'QUOTED') base = base.filter((p) => quotationsOf(p).some((q) => q.status !== 'REQUESTED'));
        const q = query.trim().toLowerCase();
        return q ? base.filter((p) => String(p.patient_name || '').toLowerCase().includes(q)) : base;
    }, [prescriptions, filter, query]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    const listProps: AdminListViewProps<PrescriptionNormalized, Filter> = {
        variant: isLarge ? 'web' : 'mobile',
        config,
        query,
        setQuery,
        onRefresh: () => void fetchData(true),
        refreshing: refreshing || loading,
        sourceLabel: error ? 'Not loaded' : 'Server',
        sourceTone: error ? 'none' : 'server',
        lastSyncedTime: lastSynced,
        error,
        items: paginated,
        allItems: filtered,
        onPressItem: setDetailsTarget,
        rowActions: (p) => [
            { icon: 'scan-outline', label: p.status === 'QUEUING' ? 'Digitize' : 'Edit medicines', onPress: () => openDigitize(p), tone: 'primary' },
        ],
        filters: {
            options: [
                { key: 'ALL', label: 'All', icon: 'apps-outline', count: counts.all },
                { key: 'QUEUING', label: 'To digitize', icon: 'time-outline', count: counts.queuing },
                { key: 'NOT_FORWARDED', label: 'Not forwarded', icon: 'return-up-forward-outline', count: counts.notForwarded },
                { key: 'DIGITIZED', label: 'Digitized', icon: 'checkmark-done-outline', count: counts.digitized },
                { key: 'QUOTED', label: 'Quoted', icon: 'pricetags-outline', count: counts.quoted },
            ],
            value: filter,
            onChange: setFilter,
            allKey: 'ALL',
        },
        stats: [
            { label: 'To digitize', value: counts.queuing.toLocaleString(), color: counts.queuing ? '#f59e0b' : undefined },
            { label: 'Not forwarded', value: counts.notForwarded.toLocaleString(), color: counts.notForwarded ? '#f43f5e' : undefined },
            { label: 'Quoted', value: counts.quoted.toLocaleString(), color: counts.quoted ? '#10b981' : undefined },
        ],
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => {
            setPageSize(size);
            setPage(1);
        },
    };

    return (
        <>
            <AdminListView {...listProps} />

            <RetailerPrescriptionDetailsModal item={detailsTarget} scope="admin" onClose={() => setDetailsTarget(null)} onDigitize={openDigitize} />

            <DigitizePrescriptionModal
                visible={!!digitizeTarget}
                prescription={digitizeTarget}
                client={adminRxClient}
                onPrescriptionUpdated={upsert}
                onClose={() => {
                    setDigitizeTarget(null);
                    void fetchData();
                }}
            />
        </>
    );
}
