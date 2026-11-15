// components/payouts/MyPayoutAccounts.tsx
//
// A person's own payout accounts (payments.UserPayoutAccounts): where their
// delivery earnings are paid. One is active at a time; a WaziPOS admin
// verifies them, and changing a verified account's details needs re-verifying.
// Reuses the payout-account form in "forUser" mode.

import payoutAccountsApi, { type PayoutAccount, type PayoutAccountDetails } from '@/api/payoutAccountsApi';
import { apiError, isOk } from '@/api/deliveriesApi';
import AdminPayoutAccountEditModal from '@/components/admin/payoutAccounts/AdminPayoutAccountEditModal';
import { destinationOf, isActiveAccount, payoutBadges } from '@/components/admin/payoutAccounts/payoutAccountsConfig';
import { AdminListView, type AdminListConfig } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import { useAlert } from '@/components/common/AlertProvider';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

const config: AdminListConfig<PayoutAccount> = {
    title: 'My payout accounts',
    noun: ['account', 'accounts'],
    icon: 'wallet-outline',
    searchPlaceholder: 'Search accounts…',
    addLabel: 'Add payout account',
    emptyTitle: 'No payout account yet',
    emptyMessage: 'Add the M-Pesa, bank or other account your delivery earnings should be paid to.',
    keyOf: (a, i) => `${a.id}-${i}`,
    titleOf: (a) => a.account_name,
    subtitleOf: (a) => destinationOf(a),
    avatarOf: (a) => ({ label: a.account_name }),
    badgesOf: payoutBadges,
    primaryColumn: { label: 'Account', flex: 2.4 },
    columns: [
        { key: 'dest', label: 'Account / number', flex: 2.4, render: (a) => destinationOf(a) },
        { key: 'status', label: 'Status', flex: 1, render: (a) => (isActiveAccount(a) ? 'Active' : 'Inactive') },
        { key: 'verified', label: 'Verified', flex: 1, render: (a) => (a.is_verified ? 'Yes' : 'Pending') },
    ],
};

export default function MyPayoutAccounts() {
    const { width } = useWindowDimensions();
    const alert = useAlert();
    const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);
    const [editing, setEditing] = useState<PayoutAccount | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await payoutAccountsApi.getMyPayoutAccounts();
            if (isOk(res)) {
                setAccounts(res.data.payout_accounts ?? []);
                setLoadError(null);
            } else setLoadError(apiError(res, 'Could not load your payout accounts.'));
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
        return q ? accounts.filter((a) => `${a.account_name} ${destinationOf(a)}`.toLowerCase().includes(q)) : accounts;
    }, [accounts, query]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const pageStart = (Math.min(page, totalPages) - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, filtered.length);

    const open = (a: PayoutAccount | null) => {
        setEditing(a);
        setFormError(null);
        setFormOpen(true);
    };

    const save = async (details: PayoutAccountDetails) => {
        setSaving(true);
        setFormError(null);
        try {
            const { entity: _entity, is_verified: _verified, ...rest } = details;
            const res: any = await payoutAccountsApi.saveMyPayoutAccount(rest, editing?.id);
            if (isOk(res)) {
                setFormOpen(false);
                setEditing(null);
                alert('Saved', 'Your payout account was saved.', undefined, 'success');
                void load();
            } else setFormError(apiError(res, 'Could not save the payout account.'));
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <AdminListView<PayoutAccount>
                variant={width >= 768 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                error={loadError}
                items={filtered.slice(pageStart, pageEnd)}
                allItems={filtered}
                onOpenCreate={() => open(null)}
                onPressItem={open}
                onEditItem={open}
                stats={[
                    { label: 'Accounts', value: String(accounts.length) },
                    { label: 'Active', value: String(accounts.filter(isActiveAccount).length), color: '#10b981' },
                ]}
                page={Math.min(page, totalPages)}
                pageSize={pageSize}
                totalItems={filtered.length}
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
            <AdminPayoutAccountEditModal
                visible={formOpen}
                onClose={() => !saving && setFormOpen(false)}
                initialData={editing}
                submitting={saving}
                error={formError}
                onSubmit={save}
                canVerify={false}
                forUser
            />
        </>
    );
}
