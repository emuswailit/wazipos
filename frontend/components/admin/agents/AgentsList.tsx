// components/admin/agents/AgentsList.tsx
//
// Admin -> Agents: who signs up users and businesses, their commission rate,
// how many users / entities they brought in, and what they have earned and are
// still owed. "Add agent" makes an existing user an agent; from the details,
// edit the rate or mark the owed commission as paid out. Blacklisting an agent
// (with a reason) blocks them and blacklists all their onboarders too.

import { agentsAdminApi, type Agent } from '@/api/agentsApi';
import { AdminFormSheet, AdminListView, ConfigDetailsSheet, DetailsDock, FormSection, SheetButton } from '@/components/admin/kit';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import { useAuth } from '@/context/AuthContext';

import AgentFormSheet, { type AgentFormValues } from './AgentFormSheet';
import { agentDetailsConfig, agentsConfig } from './agentsConfig';
import { errorText } from '@/utils/apiFeedback';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'OWED' | 'BLACKLISTED';

const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

export default function AgentsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();

    const [agents, setAgents] = useState<Agent[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);

    const [viewing, setViewing] = useState<Agent | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Agent | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [paying, setPaying] = useState(false);
    const [blacklisting, setBlacklisting] = useState<Agent | null>(null);
    const [blacklistBusy, setBlacklistBusy] = useState(false);
    const [blacklistError, setBlacklistError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await agentsAdminApi.getAgents();
            if (ok(res)) {
                setAgents(Array.isArray(res.data?.agents) ? res.data.agents : []);
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(res, 'Could not load agents.'));
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

    const upsert = useCallback((a: Agent) => {
        setAgents((prev) => {
            const i = prev.findIndex((x) => x.id === a.id);
            if (i < 0) return [a, ...prev];
            const next = [...prev];
            next[i] = a;
            return next;
        });
        setViewing((cur) => (cur && cur.id === a.id ? a : cur));
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return agents.filter((a) => {
            if (filter === 'ACTIVE' && !a.is_active) return false;
            if (filter === 'INACTIVE' && a.is_active) return false;
            if (filter === 'OWED' && !(Number(a.commission_pending) > 0)) return false;
            if (filter === 'BLACKLISTED' && !a.is_blacklisted) return false;
            return !q || hit(a.name) || hit(a.email) || hit(a.phone);
        });
    }, [agents, query, filter]);

    const totals = useMemo(
        () => ({
            active: agents.filter((a) => a.is_active).length,
            owed: agents.filter((a) => Number(a.commission_pending) > 0).length,
            blacklisted: agents.filter((a) => a.is_blacklisted).length,
            users: agents.reduce((n, a) => n + a.users_count, 0),
            entities: agents.reduce((n, a) => n + a.entities_count, 0),
            pending: agents.reduce((n, a) => n + Number(a.commission_pending || 0), 0),
        }),
        [agents],
    );

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    const openCreate = () => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
    };
    const openEdit = (a: Agent) => {
        setEditing(a);
        setFormError(null);
        setFormOpen(true);
    };

    const submit = async (v: AgentFormValues) => {
        setSaving(true);
        setFormError(null);
        try {
            const res: any = editing
                ? await agentsAdminApi.updateAgent(editing.id, { commission_percentage: v.commission_percentage, is_active: v.is_active })
                : await agentsAdminApi.createAgent(v.user, v.commission_percentage);
            if (ok(res)) {
                upsert(res.data.agent);
                setFormOpen(false);
                setEditing(null);
                alert('Saved', editing ? 'Agent updated.' : 'Agent created. They get the Agent panel the next time they sign in.', undefined, 'success');
            } else {
                setFormError(errorText(res, 'Could not save the agent.'));
            }
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const markPaid = async (a: Agent) => {
        setPaying(true);
        try {
            const res: any = await agentsAdminApi.markPaid(a.id);
            if (ok(res)) {
                alert('Marked paid', `${formatKES(a.commission_pending)} to ${a.name || a.email} is recorded as paid out.`, undefined, 'success');
                void load();
            } else {
                alert('Not marked paid', errorText(res, 'Could not update the commissions.'), undefined, 'danger');
            }
        } finally {
            setPaying(false);
        }
    };

    const blacklist = async (a: Agent, reason: string) => {
        setBlacklistBusy(true);
        setBlacklistError(null);
        try {
            const res: any = await agentsAdminApi.blacklist(a.id, reason);
            if (ok(res)) {
                upsert(res.data.agent);
                setBlacklisting(null);
                const n = Number(res.data.agent?.onboarders_changed ?? 0);
                alert('Agent blacklisted', `${a.name || a.email} is blocked${n ? ` and ${n} onboarder${n === 1 ? '' : 's'} blacklisted with them` : ''}.`, undefined, 'success');
            } else {
                setBlacklistError(errorText(res, 'Could not blacklist the agent.'));
            }
        } catch (e: any) {
            setBlacklistError(e?.message || 'Could not reach the server.');
        } finally {
            setBlacklistBusy(false);
        }
    };

    const lift = async (a: Agent) => {
        setBlacklistBusy(true);
        try {
            const res: any = await agentsAdminApi.liftBlacklist(a.id);
            if (ok(res)) {
                upsert(res.data.agent);
                alert('Blacklist lifted', `${a.name || a.email} is an active agent again. Their onboarders are cleared but stay off until the agent switches them back on.`, undefined, 'success');
            } else {
                alert('Not lifted', errorText(res, 'Could not lift the blacklist.'), undefined, 'danger');
            }
        } finally {
            setBlacklistBusy(false);
        }
    };

    return (
        <>
            <DetailsDock
                placeholder="Pick an agent to see their details here."
                pane={
                    <ConfigDetailsSheet
                        config={agentDetailsConfig}
                        item={viewing}
                        heading="Agent details"
                        onClose={() => setViewing(null)}
                        onEdit={(a) => {
                            setViewing(null);
                            openEdit(a);
                        }}
                        actions={
                            viewing ? (
                                <>
                                    {viewing.is_blacklisted ? (
                                        <SheetButton
                                            label="Lift blacklist"
                                            icon="refresh-outline"
                                            variant="secondary"
                                            loading={blacklistBusy}
                                            loadingLabel="Lifting…"
                                            onPress={() => void lift(viewing)}
                                            grow={!isLarge}
                                        />
                                    ) : (
                                        <SheetButton
                                            label="Blacklist"
                                            icon="ban-outline"
                                            variant="secondary"
                                            onPress={() => {
                                                setBlacklistError(null);
                                                setBlacklisting(viewing);
                                            }}
                                            grow={!isLarge}
                                        />
                                    )}
                                    {Number(viewing.commission_pending) > 0 ? (
                                        <SheetButton
                                            label={`Mark ${formatKES(viewing.commission_pending)} paid`}
                                            icon="cash-outline"
                                            loading={paying}
                                            loadingLabel="Updating…"
                                            onPress={() => void markPaid(viewing)}
                                            grow={!isLarge}
                                        />
                                    ) : null}
                                </>
                            ) : null
                        }
                    />
                }
            >
                <AdminListView<Agent, Filter>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={agentsConfig}
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
                    rowActions={(a) => [{ icon: 'create-outline', label: 'Edit agent', onPress: () => openEdit(a), tone: 'primary' }]}
                    stats={[
                        { label: 'Agents', value: agents.length.toLocaleString() },
                        { label: 'Active', value: totals.active.toLocaleString(), color: '#10b981' },
                        { label: 'Users registered', value: totals.users.toLocaleString() },
                        { label: 'Entities registered', value: totals.entities.toLocaleString() },
                        { label: 'Commission owed', value: formatKES(totals.pending), color: totals.pending ? '#f59e0b' : undefined },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: agents.length },
                            { key: 'ACTIVE', label: 'Active', icon: 'ellipse', count: totals.active },
                            { key: 'INACTIVE', label: 'Inactive', icon: 'pause-circle-outline', count: agents.length - totals.active },
                            { key: 'OWED', label: 'Owed commission', icon: 'cash-outline', count: totals.owed },
                            { key: 'BLACKLISTED', label: 'Blacklisted', icon: 'ban-outline', count: totals.blacklisted },
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
            <AgentFormSheet
                visible={formOpen}
                onClose={() => {
                    if (saving) return;
                    setFormOpen(false);
                    setEditing(null);
                }}
                agent={editing}
                submitting={saving}
                error={formError}
                onSubmit={(v) => void submit(v)}
            />
            <BlacklistSheet
                agent={blacklisting}
                submitting={blacklistBusy}
                error={blacklistError}
                onClose={() => {
                    if (!blacklistBusy) setBlacklisting(null);
                }}
                onSubmit={(reason) => blacklisting && void blacklist(blacklisting, reason)}
            />
        </>
    );
}

/** Why the agent is blacklisted; warns that their onboarders go with them. */
function BlacklistSheet({
    agent,
    submitting,
    error,
    onClose,
    onSubmit,
}: {
    agent: Agent | null;
    submitting: boolean;
    error: string | null;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}) {
    const { theme } = useAuth();
    const n = agent?.onboarders_count ?? 0;
    return (
        <Formik
            key={agent?.id ?? 'none'}
            initialValues={{ reason: '' }}
            validationSchema={Yup.object({ reason: Yup.string().trim().min(5, 'Say a little more').required('Say why') })}
            onSubmit={(v) => onSubmit(v.reason.trim())}
        >
            {(f) => (
                <AdminFormSheet
                    visible={!!agent}
                    onClose={onClose}
                    title="Blacklist agent"
                    subtitle={agent?.name || agent?.email}
                    icon="ban-outline"
                    submitLabel="Blacklist"
                    submitIcon="ban-outline"
                    submitting={submitting}
                    onSubmit={() => f.handleSubmit()}
                    error={error}
                    width={520}
                >
                    <FormSection title="What happens">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                            {`The agent loses the Agent panel at their next sign-in and earns no new commission. ${
                                n ? `All ${n} of their onboarder${n === 1 ? ' is' : 's are'} blacklisted too and taken off stock takes that aren't done.` : 'They have no onboarders.'
                            } Users and businesses they registered are not affected. Commission already owed stays owed.`}
                        </Text>
                    </FormSection>
                    <FormSection title="Reason">
                        <CustomTextField name="reason" label="Why" required placeholder="e.g. Took payments outside WaziPOS" multiline />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
