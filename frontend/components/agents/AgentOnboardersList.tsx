// components/agents/AgentOnboardersList.tsx
//
// Agent -> My onboarders: the people who help new retailers, wholesalers, restaurants and hotels
// onboard (e.g. the stock take for their first inventory). An onboarder must be
// one of the agent's own users with a phone, an email, an ID / passport number
// and an uploaded ID document — register or complete them under My users first.
// Backend: authentication/agents/me AgentGetOnboarders / AgentAddOnboarder /
// AgentSetOnboarderActive (the same rule is checked there). Blacklisted onboarders
// (their agent was blacklisted by an admin) can't be switched back on here.

import { agentMeApi, agentUsersApi, onboarderMissing, type Onboarder } from '@/api/agentsApi';
import type { AdminUser } from '@/api/adminUsersApi';
import {
    AdminListView,
    AdminSheet,
    ConfigDetailsSheet,
    DetailsDock,
    formatDate,
    SheetButton,
    textOr,
    useListTokens,
    type AdminBadge,
    type AdminListConfig,
} from '@/components/admin/kit';
import { useAlert } from '@/components/common/AlertProvider';
import type { PageSize } from '@/components/common/PaginationBar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const config: AdminListConfig<Onboarder> = {
    title: 'My onboarders',
    noun: ['onboarder', 'onboarders'],
    icon: 'people-outline',
    searchPlaceholder: 'Search name, phone or email…',
    addLabel: 'Add onboarder',
    emptyTitle: 'No onboarders yet',
    emptyMessage: 'Add people who help shops onboard — e.g. counting stock for their first inventory. They must be your users with phone, email and ID on file.',
    keyOf: (o) => o.id,
    titleOf: (o) => textOr(o.user.name, o.user.email),
    subtitleOf: (o) => [o.user.phone, o.user.email].filter(Boolean).join(' · ') || null,
    avatarOf: (o) => ({ label: o.user.name }),
    badgesOf: (o): AdminBadge[] => [
        o.is_blacklisted
            ? { label: 'Blacklisted', tone: 'danger', icon: 'ban-outline' }
            : o.is_active
                ? { label: 'Active', tone: 'success', icon: 'checkmark-circle' }
                : { label: 'Inactive', tone: 'neutral', icon: 'pause-circle-outline' },
    ],
    metaOf: (o) => (o.created ? `Since ${formatDate(o.created)}` : null),
    metaIcon: 'calendar-outline',
    metricOf: (o) => ({ value: String(o.stock_takes), label: 'stock takes' }),
    primaryColumn: { label: 'Onboarder', flex: 2 },
    columns: [
        { key: 'phone', label: 'Phone', flex: 1.2, render: (o) => textOr(o.user.phone) },
        { key: 'email', label: 'Email', flex: 1.6, render: (o) => textOr(o.user.email) },
        {
            key: 'id',
            label: 'ID / passport',
            flex: 1.2,
            render: (o) => (o.user.identifier_number ? `${o.user.identifier_type === 'Passport' ? 'Passport' : 'ID'} ${o.user.identifier_number}` : '—'),
        },
        { key: 'takes', label: 'Stock takes', flex: 0.8, align: 'right', render: (o) => String(o.stock_takes) },
        { key: 'since', label: 'Since', flex: 1, render: (o) => formatDate(o.created) },
    ],
};

const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join(' ');
    return res?.data?.response_message || res?.data?.detail || res?.problem || fallback;
};
const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

export default function AgentOnboardersList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();

    const [rows, setRows] = useState<Onboarder[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [viewing, setViewing] = useState<Onboarder | null>(null);
    const [picking, setPicking] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [obRes, usersRes]: any[] = await Promise.all([agentMeApi.getOnboarders(), agentUsersApi.getUsers()]);
            if (ok(obRes)) {
                setRows(Array.isArray(obRes.data?.onboarders) ? obRes.data.onboarders : []);
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(obRes, 'Could not load your onboarders.'));
            }
            if (ok(usersRes)) setUsers(Array.isArray(usersRes.data?.users) ? usersRes.data.users : []);
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

    const upsert = (o: Onboarder) => {
        setRows((prev) => {
            const i = prev.findIndex((x) => x.id === o.id);
            if (i < 0) return [o, ...prev];
            const next = [...prev];
            next[i] = o;
            return next;
        });
        setViewing((cur) => (cur && cur.id === o.id ? o : cur));
    };

    const add = async (u: AdminUser) => {
        setBusy(u.id);
        try {
            const res: any = await agentMeApi.addOnboarder(u.id);
            if (ok(res)) {
                upsert(res.data.onboarder);
                setPicking(false);
                alert('Onboarder added', `${u.name} can now be sent to help businesses onboard.`, undefined, 'success');
            } else {
                alert('Not added', errorText(res, 'Could not add the onboarder.'), undefined, 'danger');
            }
        } finally {
            setBusy(null);
        }
    };

    const toggle = async (o: Onboarder) => {
        setBusy(o.id);
        try {
            const res: any = await agentMeApi.setOnboarderActive(o.id, !o.is_active);
            if (ok(res)) upsert(res.data.onboarder);
            else alert('Not saved', errorText(res, 'Could not update the onboarder.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((o) => {
            if (filter === 'ACTIVE' && !o.is_active) return false;
            if (filter === 'INACTIVE' && o.is_active) return false;
            return !q || [o.user.name, o.user.phone, o.user.email].some((v) => String(v || '').toLowerCase().includes(q));
        });
    }, [rows, query, filter]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);
    const active = rows.filter((o) => o.is_active).length;

    const taken = useMemo(() => new Set(rows.map((o) => o.user.id)), [rows]);
    const candidates = useMemo(() => users.filter((u) => u.is_active && !taken.has(u.id)), [users, taken]);

    return (
        <>
            <DetailsDock
                placeholder="Pick an onboarder to see their details here."
                pane={
                    <ConfigDetailsSheet
                        config={config}
                        item={viewing}
                        heading="Onboarder details"
                        onClose={() => setViewing(null)}
                        actions={
                            viewing && !viewing.is_blacklisted ? (
                                <SheetButton
                                    label={viewing.is_active ? 'Deactivate' : 'Reactivate'}
                                    icon={viewing.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                                    variant="secondary"
                                    loading={busy === viewing.id}
                                    loadingLabel="Saving…"
                                    onPress={() => void toggle(viewing)}
                                    grow={!isLarge}
                                />
                            ) : null
                        }
                    />
                }
            >
                <AdminListView<Onboarder, Filter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={config}
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
                    onOpenCreate={() => setPicking(true)}
                    onPressItem={setViewing}
                    stats={[
                        { label: 'Onboarders', value: rows.length.toLocaleString() },
                        { label: 'Active', value: active.toLocaleString(), color: '#10b981' },
                        { label: 'Stock takes', value: rows.reduce((n, o) => n + o.stock_takes, 0).toLocaleString() },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: rows.length },
                            { key: 'ACTIVE', label: 'Active', icon: 'ellipse', count: active },
                            { key: 'INACTIVE', label: 'Inactive', icon: 'pause-circle-outline', count: rows.length - active },
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
            <PickUserSheet visible={picking} onClose={() => setPicking(false)} users={candidates} busy={busy} onPick={(u) => void add(u)} />
        </>
    );
}

/** One of the agent's users; those missing phone / email / ID are shown with what to add. */
function PickUserSheet({
    visible,
    onClose,
    users,
    busy,
    onPick,
}: {
    visible: boolean;
    onClose: () => void;
    users: AdminUser[];
    busy: string | null;
    onPick: (u: AdminUser) => void;
}) {
    const { theme, border, chipBg } = useListTokens();
    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title="Add onboarder"
            subtitle="One of your users with phone, email and ID on file"
            icon="person-add-outline"
            width={560}
            footer={<SheetButton label="Close" variant="ghost" onPress={onClose} />}
        >
            <ScrollView contentContainerStyle={{ gap: 8 }}>
                {users.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        No users to add. Register the person under My users first.
                    </Text>
                ) : null}
                {users.map((u) => {
                    const missing = onboarderMissing(u);
                    const ready = missing.length === 0;
                    return (
                        <Pressable
                            key={u.id}
                            disabled={!ready || !!busy}
                            onPress={() => onPick(u)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: chipBg, opacity: ready ? 1 : 0.7 }}
                        >
                            <Ionicons name={ready ? 'person-add-outline' : 'alert-circle-outline'} size={18} color={ready ? theme.primary : '#f59e0b'} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>{u.name}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {ready ? [u.phone, u.email].filter(Boolean).join(' · ') : `Needs: ${missing.join(', ')} — edit under My users`}
                                </Text>
                            </View>
                            {busy === u.id ? <Ionicons name="hourglass-outline" size={16} color={theme.textDark} /> : null}
                        </Pressable>
                    );
                })}
            </ScrollView>
        </AdminSheet>
    );
}
