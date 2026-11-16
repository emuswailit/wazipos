// components/admin/users/AdminUsersList.tsx
//
// Admin: every user. Table on wide screens, cards on phones (shared
// AdminListView); tap to edit, "Add user" to create. Loaded from the server
// (AdminGetUsers); search, filters and paging run locally.

import { ConfigDetailsSheet, DetailsDock } from '@/components/common/listScreen';
import adminUsersApi, { type AdminUser, type AdminUserDetails, type ConsentStatus, type PickedDocument } from '@/api/adminUsersApi';
import { AdminListView } from '@/components/admin/kit';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import AdminUserEditModal from './AdminUserEditModal';
import { CONSENT_META, usersConfig } from './usersConfig';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'WITH_ID' | ConsentStatus;

const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.data?.detail || res?.problem || fallback;
};

export default function AdminUsersList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<AdminUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadingRef = useRef(false);
    const load = useCallback(async () => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setRefreshing(true);
        try {
            const res: any = await adminUsersApi.getUsers();
            if (res.ok && String(res.data?.response_code) === '0') {
                setUsers(Array.isArray(res.data?.users) ? res.data.users : []);
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(res, 'Could not load users.'));
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

    /** Put a server copy of one user into the list (and the open form). */
    const upsert = useCallback((u: AdminUser) => {
        setUsers((prev) => {
            const i = prev.findIndex((x) => x.id === u.id);
            if (i < 0) return [u, ...prev];
            const next = [...prev];
            next[i] = u;
            return next;
        });
        setEditing((cur) => (cur && cur.id === u.id ? u : cur));
    }, []);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return users.filter((u) => {
            if (filter === 'ACTIVE' && !u.is_active) return false;
            if (filter === 'INACTIVE' && u.is_active) return false;
            if (filter === 'WITH_ID' && !u.identifier_number) return false;
            if (filter in CONSENT_META && u.consent_status !== filter) return false;
            if (!q) return true;
            return hit(u.name) || hit(u.email) || hit(u.phone) || hit(u.identifier_number) || hit(u.entity_title);
        });
    }, [users, query, filter]);

    const counts = useMemo(() => {
        const by = (s: ConsentStatus) => users.filter((u) => u.consent_status === s).length;
        return {
            active: users.filter((u) => u.is_active).length,
            withId: users.filter((u) => !!u.identifier_number).length,
            confirmed: by('CONFIRMED'),
            pending: by('PENDING'),
            expired: by('EXPIRED'),
            none: by('NONE'),
        };
    }, [users]);

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
    const [viewing, setViewing] = useState<AdminUser | null>(null);
    const openEdit = useCallback((u: AdminUser) => {
        setEditing(u);
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
        async (details: AdminUserDetails, doc: PickedDocument | null): Promise<AdminUser | null> => {
            setSaving(true);
            setFormError(null);
            try {
                const res: any = editing ? await adminUsersApi.updateUser(editing.id, details, doc) : await adminUsersApi.createUser(details, doc);
                if (res.ok && String(res.data?.response_code) === '0') {
                    // The form stays open: next it confirms the phone, then shows where
                    // phone and email stand (AdminUserEditModal steps 3–4).
                    const saved: AdminUser = res.data.user;
                    upsert(saved);
                    return saved;
                }
                setFormError(errorText(res, 'Could not save the user.'));
                return null;
            } catch (e: any) {
                setFormError(e?.message || 'Could not reach the server.');
                return null;
            } finally {
                setSaving(false);
            }
        },
        [editing, upsert],
    );

    return (
        <>
            <DetailsDock
                placeholder="Pick a user to see their details here."
                pane={
                    <ConfigDetailsSheet
                        config={usersConfig}
                        item={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={(item) => { setViewing(null); openEdit(item); }}
                    />
                }
            >
                <AdminListView<AdminUser, Filter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={usersConfig}
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
                    onOpenCreate={openCreate}
                    onPressItem={setViewing}
                    onEditItem={openEdit}
                    rowActions={(u) => [{ icon: 'create-outline', label: 'Edit user', onPress: () => openEdit(u), tone: 'primary' }]}
                    stats={[
                        { label: 'Users', value: users.length.toLocaleString() },
                        { label: 'Active', value: counts.active.toLocaleString(), color: '#10b981' },
                        { label: 'Consented', value: counts.confirmed.toLocaleString(), color: '#10b981' },
                        { label: 'Awaiting code', value: counts.pending.toLocaleString(), color: counts.pending ? '#f59e0b' : undefined },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: users.length },
                            { key: 'ACTIVE', label: 'Active', icon: 'ellipse', count: counts.active },
                            { key: 'INACTIVE', label: 'Inactive', icon: 'pause-circle-outline', count: users.length - counts.active },
                            { key: 'CONFIRMED', label: 'Consent given', icon: 'shield-checkmark-outline', count: counts.confirmed },
                            { key: 'PENDING', label: 'Awaiting code', icon: 'chatbubble-ellipses-outline', count: counts.pending },
                            { key: 'EXPIRED', label: 'Code expired', icon: 'time-outline', count: counts.expired },
                            { key: 'NONE', label: 'No consent', icon: 'call-outline', count: counts.none },
                            { key: 'WITH_ID', label: 'Has ID / passport', icon: 'id-card-outline', count: counts.withId },
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
            <AdminUserEditModal
                visible={formOpen}
                onClose={closeForm}
                initialData={editing}
                submitting={saving}
                error={formError}
                onSubmit={submit}
                onUserChanged={upsert}
            />
        </>
    );
}
