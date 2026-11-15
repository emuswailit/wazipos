// components/admin/payoutAccounts/AdminPayoutAccountsList.tsx
//
// Admin: payout accounts of every entity. Table on wide screens, cards on
// phones (shared AdminListView); tap a row to edit, "Add" to create.
// Loaded from the server (AdminGetPayoutAccounts) — the list is small, so
// search, filters and paging run locally.

import { ConfigDetailsSheet, DetailsDock } from '@/components/common/listScreen';
import payoutAccountsApi, { type PayoutAccount, type PayoutAccountDetails, type PayoutAccountType } from '@/api/payoutAccountsApi';
import { AdminListView } from '@/components/admin/kit';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import AdminPayoutAccountEditModal from './AdminPayoutAccountEditModal';
import { ACCOUNT_TYPE_META, isActiveAccount, payoutAccountsConfig } from './payoutAccountsConfig';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'UNVERIFIED' | PayoutAccountType;

const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.problem || fallback;
};

export default function AdminPayoutAccountsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();
    const { user } = useAuth();
    const u = user as any;
    // Mirrors the backend: platform admins see every entity; entity admins
    // only their own entity's accounts, and can't verify them.
    const isPlatformAdmin =
        String(u?.is_staff).toLowerCase() === 'true' || (Array.isArray(u?.roles) && u.roles.some((r: any) => r?.value === 'Admin'));
    const ownEntity = useMemo(
        () => (u?.entity_id ? { id: String(u.entity_id), title: String(u.entity_title || 'Your entity') } : null),
        [u?.entity_id, u?.entity_title],
    );

    const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PayoutAccount | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadingRef = useRef(false);
    const load = useCallback(async () => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setRefreshing(true);
        try {
            const res: any = await payoutAccountsApi.getPayoutAccounts();
            if (res.ok && String(res.data?.response_code) === '0') {
                const list = res.data?.payout_accounts;
                setAccounts(Array.isArray(list) ? list : []);
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(res, 'Could not load payout accounts.'));
            }
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            loadingRef.current = false;
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return accounts.filter((a) => {
            if (filter === 'ACTIVE' && !isActiveAccount(a)) return false;
            if (filter === 'INACTIVE' && isActiveAccount(a)) return false;
            if (filter === 'UNVERIFIED' && a.is_verified) return false;
            if (filter in ACCOUNT_TYPE_META && a.account_type !== filter) return false;
            if (!q) return true;
            return hit(a.entity_title) || hit(a.account_name) || hit(a.account_number) || hit(a.business_number) || hit(a.account_code);
        });
    }, [accounts, query, filter]);

    const counts = useMemo(
        () => ({
            active: accounts.filter(isActiveAccount).length,
            unverified: accounts.filter((a) => !a.is_verified).length,
            entities: new Set(accounts.map((a) => a.entity).filter(Boolean)).size,
        }),
        [accounts],
    );

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    /* ---------------- Form ---------------- */
    const openCreate = useCallback(() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
    }, []);
    // Tap: details (beside the list on wide screens); Edit from there or the row's pencil.
    const [viewing, setViewing] = useState<PayoutAccount | null>(null);
    const openEdit = useCallback((a: PayoutAccount) => {
        setEditing(a);
        setFormError(null);
        setFormOpen(true);
    }, []);
    const closeForm = useCallback(() => {
        if (saving) return;
        setFormOpen(false);
        setEditing(null);
        setFormError(null);
    }, [saving]);

    const submit = useCallback(
        async (details: PayoutAccountDetails) => {
            setSaving(true);
            setFormError(null);
            try {
                const res: any = editing
                    ? await payoutAccountsApi.updatePayoutAccount(editing.id, details)
                    : await payoutAccountsApi.createPayoutAccount(details);
                if (res.ok && String(res.data?.response_code) === '0') {
                    setFormOpen(false);
                    setEditing(null);
                    alert('Saved', `Payout account ${editing ? 'updated' : 'created'}.`, undefined, 'success');
                    void load();
                } else {
                    setFormError(errorText(res, 'Could not save the payout account.'));
                }
            } catch (e: any) {
                setFormError(e?.message || 'Could not reach the server.');
            } finally {
                setSaving(false);
            }
        },
        [editing, alert, load],
    );

    const common = {
        config: payoutAccountsConfig,
        query,
        setQuery,
        onRefresh: load,
        refreshing,
        sourceLabel: loadError ? 'Not loaded' : 'Server',
        sourceTone: (loadError ? 'none' : 'server') as 'none' | 'server',
        lastSyncedTime,
        error: loadError,
        items: paginated,
        allItems: filtered,
        onOpenCreate: openCreate,
        onPressItem: (a: PayoutAccount) => setViewing(a),
        onEditItem: openEdit,
        stats: [
            { label: 'Accounts', value: accounts.length.toLocaleString() },
            { label: 'Active', value: counts.active.toLocaleString(), color: '#10b981' },
            { label: 'Unverified', value: counts.unverified.toLocaleString(), color: counts.unverified ? '#f59e0b' : undefined },
            { label: 'Entities', value: counts.entities.toLocaleString() },
        ],
        filters: {
            options: [
                { key: 'ALL' as Filter, label: 'All', icon: 'apps-outline' as const, count: accounts.length },
                { key: 'ACTIVE' as Filter, label: 'Active', icon: 'ellipse' as const, count: counts.active },
                { key: 'INACTIVE' as Filter, label: 'Inactive', icon: 'pause-circle-outline' as const },
                { key: 'UNVERIFIED' as Filter, label: 'Unverified', icon: 'shield-outline' as const, count: counts.unverified },
                ...(Object.keys(ACCOUNT_TYPE_META) as PayoutAccountType[]).map((t) => ({
                    key: t as Filter,
                    label: ACCOUNT_TYPE_META[t].label,
                    icon: ACCOUNT_TYPE_META[t].icon,
                    count: accounts.filter((a) => a.account_type === t).length,
                })),
            ],
            value: filter,
            onChange: setFilter,
            allKey: 'ALL' as Filter,
        },
        rowActions: (a: PayoutAccount) => [{ icon: 'create-outline' as const, label: 'Edit payout account', onPress: () => openEdit(a), tone: 'primary' as const }],
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
            <DetailsDock
                placeholder="Pick a payout account to see its details here."
                pane={
                    <ConfigDetailsSheet
                        config={payoutAccountsConfig}
                        item={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={(item) => { setViewing(null); openEdit(item); }}
                    />
                }
            >
                <AdminListView<PayoutAccount, Filter> {...common} variant={isLarge ? 'web' : 'mobile'} />
            </DetailsDock>
            <AdminPayoutAccountEditModal lockedEntity={isPlatformAdmin ? null : ownEntity} canVerify={isPlatformAdmin} visible={formOpen} onClose={closeForm} initialData={editing} submitting={saving} error={formError} onSubmit={submit} />
        </>
    );
}
