// components/agents/AgentEntitiesList.tsx
//
// Agent -> My entities: the businesses this agent registered (authentication/
// agents/me AgentGetEntities). Create one for a user the agent registered (the
// owner is picked from "My users") with the deal agreed with them: the monthly
// subscription (the agent earns their commission on it), a one-month free trial
// or paying right away (a mobile money prompt to the owner's phone on save), and
// optional stock-take help by the agent's onboarders. Retailers, wholesalers,
// restaurants and hotels only (AGENT_ENTITY_TYPES). Same list, details and form as Admin -> Entities.

import { agentMeApi, agentUsersApi, type EntityOnboarding, type Onboarder } from '@/api/agentsApi';
import { AdminListView, DetailsDock, formatDate, SheetButton, textOr } from '@/components/admin/kit';
import { percent } from '@/components/admin/agents/agentsConfig';
import AdminEntityDetailsModal from '@/components/admin/entities/AdminEntityDetailsModal';
import AdminEntityEditModal, { AGENT_ENTITY_TYPES, toEntityDetails } from '@/components/admin/entities/AdminEntityEditModal';
import { entitiesConfig } from '@/components/admin/entities/entitiesConfig';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import type { PageSize } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { normalizeEntity } from '@/context/EntitiesSyncContext';
import type { EntityItem } from '@/databases/types';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import AgentPayoutAccountSheet, { type PayoutTarget } from './AgentPayoutAccountSheet';
import OnboardingTermsSection, { termsInitialValues, termsSchema, toTerms } from './OnboardingTermsSection';

const START_LABEL = { TRIAL: 'One month free trial', PAY_NOW: 'Paid right away' } as const;
const STATUS_LABEL = { NOT_NEEDED: 'Not needed', PLANNED: 'Planned', IN_PROGRESS: 'In progress', DONE: 'Done' } as const;

const errorText = (res: any, fallback: string) => {
    const errs = res?.data?.errors;
    if (Array.isArray(errs) && errs.length) return errs.join('\n');
    if (errs && typeof errs === 'object') return Object.values(errs).flat().join('\n');
    return res?.data?.response_message || res?.data?.detail || res?.problem || fallback;
};
const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

export default function AgentEntitiesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();

    const [entities, setEntities] = useState<EntityItem[]>([]);
    const [onboardings, setOnboardings] = useState<Record<string, EntityOnboarding | null>>({});
    const [owners, setOwners] = useState<{ id: string; title: string }[]>([]);
    const [onboarders, setOnboarders] = useState<{ id: string; title: string }[]>([]);
    const [rate, setRate] = useState('0');
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);

    const [viewing, setViewing] = useState<EntityItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<EntityItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [prompting, setPrompting] = useState(false);
    const [payoutFor, setPayoutFor] = useState<PayoutTarget | null>(null);

    const config = useMemo(
        () => ({
            ...entitiesConfig,
            title: 'My entities',
            emptyTitle: 'No entities yet',
            emptyMessage: 'Register the owner under My users, then add their business here.',
            columns: [
                ...entitiesConfig.columns.filter((c) => c.key !== 'created'),
                {
                    key: 'fee',
                    label: 'Monthly fee',
                    flex: 1.1,
                    align: 'right' as const,
                    render: (e: EntityItem) => {
                        const o = onboardings[String(e.remote_id)];
                        return o ? formatKES(o.monthly_subscription) : '—';
                    },
                },
                {
                    key: 'start',
                    label: 'Start',
                    flex: 1.1,
                    render: (e: EntityItem) => {
                        const o = onboardings[String(e.remote_id)];
                        return o ? (o.subscription_start === 'TRIAL' ? 'Free trial' : 'Pay now') : '—';
                    },
                },
            ],
        }),
        [onboardings],
    );

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [entRes, usersRes, obRes, meRes]: any[] = await Promise.all([
                agentMeApi.getEntities(),
                agentUsersApi.getUsers(),
                agentMeApi.getOnboarders(),
                agentMeApi.getProfile(),
            ]);
            if (ok(entRes)) {
                const rows: any[] = Array.isArray(entRes.data?.entities) ? entRes.data.entities : [];
                setEntities(rows.map(normalizeEntity));
                setOnboardings(Object.fromEntries(rows.map((r) => [String(r.id), r.onboarding ?? null])));
                setLoadError(null);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(entRes, 'Could not load your entities.'));
            }
            if (ok(usersRes) && Array.isArray(usersRes.data?.users)) {
                setOwners(
                    usersRes.data.users
                        .filter((u: any) => u.is_active)
                        .map((u: any) => ({ id: String(u.id), title: [u.name, u.phone].filter(Boolean).join(' · ') || u.email })),
                );
            }
            if (ok(obRes) && Array.isArray(obRes.data?.onboarders)) {
                setOnboarders(
                    (obRes.data.onboarders as Onboarder[])
                        .filter((o) => o.is_active)
                        .map((o) => ({ id: o.id, title: [o.user.name, o.user.phone].filter(Boolean).join(' · ') })),
                );
            }
            if (ok(meRes)) setRate(String(meRes.data?.agent?.commission_percentage ?? '0'));
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
        if (!q) return entities;
        return entities.filter((e) =>
            [e.title, e.entity_type, e.town, e.phone, e.owner_details].some((v) => String(v || '').toLowerCase().includes(q)),
        );
    }, [entities, query]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    const editingOnboarding = editing ? onboardings[String(editing.remote_id)] ?? null : null;
    const creating = !editing;

    const openCreate = () => {
        if (!owners.length) {
            alert('Register the owner first', 'Add the business owner under My users, then create their entity here.');
            return;
        }
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (e: EntityItem) => {
        setEditing(e);
        setFormOpen(true);
    };

    const paymentNote = (p: any) =>
        p?.sent
            ? "A mobile money prompt for the first month was sent to the owner's phone."
            : `The payment prompt was not sent${p?.errors?.length ? `: ${p.errors.join(' ')}` : p?.message ? `: ${p.message}` : ''}. Send it again from the business details.`;

    const submit = async (values: any, { resetForm }: any) => {
        setSaving(true);
        try {
            const details = toEntityDetails(values, editing?.remote_id);
            const terms = toTerms(values, creating);
            if (creating) {
                const res: any = await agentMeApi.createEntity(details, terms);
                if (!ok(res)) {
                    alert('Not saved', errorText(res, 'Could not save the entity.'), undefined, 'danger');
                    return;
                }
                const payment = res.data?.entity?.payment;
                // Set-up continues with where the business is paid.
                if (res.data?.entity?.id) setPayoutFor({ entity: String(res.data.entity.id), title: String(res.data.entity.title || values.title || 'the business') });
                alert(
                    'Entity created',
                    terms.subscription_start === 'TRIAL'
                        ? 'It starts on a one-month free trial. Its owner opens it the next time they sign in.'
                        : paymentNote(payment),
                    undefined,
                    terms.subscription_start === 'TRIAL' || payment?.sent ? 'success' : 'danger',
                );
            } else {
                const res: any = await agentMeApi.updateEntity(details);
                if (!ok(res)) {
                    alert('Not saved', errorText(res, 'Could not save the entity.'), undefined, 'danger');
                    return;
                }
                const obRes: any = await agentMeApi.updateOnboarding(String(editing!.remote_id), terms);
                if (!ok(obRes)) {
                    alert('Details saved, terms not saved', errorText(obRes, 'Could not save the onboarding terms.'), undefined, 'danger');
                    void load();
                    return;
                }
                alert('Saved', 'Entity and onboarding terms updated.', undefined, 'success');
            }
            resetForm();
            setFormOpen(false);
            setEditing(null);
            void load();
        } catch (e: any) {
            alert('Error', e?.message || 'Could not reach the server.', undefined, 'danger');
        } finally {
            setSaving(false);
        }
    };

    const sendPrompt = async (e: EntityItem) => {
        setPrompting(true);
        try {
            const res: any = await agentMeApi.requestPayment(String(e.remote_id));
            if (ok(res)) {
                alert('Prompt sent', `A mobile money prompt for ${formatKES(res.data?.payment?.amount)} was sent to the owner's phone.`, undefined, 'success');
            } else {
                alert('Prompt not sent', errorText(res, 'Could not send the payment prompt.'), undefined, 'danger');
            }
        } finally {
            setPrompting(false);
        }
    };

    const viewingOnboarding = viewing ? onboardings[String(viewing.remote_id)] ?? null : null;
    const onboardingSections = viewingOnboarding
        ? [
            {
                title: 'Subscription',
                icon: 'card-outline' as const,
                fields: [
                    { label: 'Monthly fee', value: formatKES(viewingOnboarding.monthly_subscription) },
                    { label: `Your commission (${percent(rate)})`, value: formatKES((Number(viewingOnboarding.monthly_subscription) * Number(rate)) / 100) },
                    { label: 'Start', value: START_LABEL[viewingOnboarding.subscription_start] },
                    { label: 'Has paid', value: viewingOnboarding.has_paid ? 'Yes' : 'Not yet' },
                ],
            },
            {
                title: 'Stock-take help',
                icon: 'clipboard-outline' as const,
                fields: viewingOnboarding.stock_take_help
                    ? [
                        { label: 'People', value: String(viewingOnboarding.stock_take_persons) },
                        { label: 'Pay per person per day', value: formatKES(viewingOnboarding.stock_take_daily_rate) },
                        { label: 'Days', value: String(viewingOnboarding.stock_take_days) },
                        { label: 'Agreed cost', value: formatKES(viewingOnboarding.stock_take_total) },
                        { label: 'Progress', value: STATUS_LABEL[viewingOnboarding.stock_take_status] },
                        {
                            label: 'Onboarder access',
                            value: viewingOnboarding.onboarder_access_from
                                ? `${formatDate(viewingOnboarding.onboarder_access_from)} – ${formatDate(viewingOnboarding.onboarder_access_to)} · ${viewingOnboarding.onboarder_access_open ? 'open today' : 'closed'}`
                                : 'No dates set',
                        },
                        { label: 'Onboarders', value: textOr(viewingOnboarding.onboarder_names.join(', '), 'None picked yet'), full: true },
                    ]
                    : [{ label: 'Help', value: 'Not offered', full: true }],
            },
        ]
        : [];

    return (
        <>
            <DetailsDock
                placeholder="Pick a business to see its details here."
                pane={
                    <AdminEntityDetailsModal
                        visible={!!viewing}
                        onClose={() => setViewing(null)}
                        onEdit={() => {
                            const e = viewing;
                            setViewing(null);
                            if (e) openEdit(e);
                        }}
                        item={viewing}
                        formatDateHandler={(s?: string | null) => formatDate(s)}
                        extraSections={onboardingSections}
                        actions={
                            viewing ? (
                                <>
                                    <SheetButton
                                        label="Payout account"
                                        icon="wallet-outline"
                                        variant="secondary"
                                        onPress={() => setPayoutFor({ entity: String(viewing.remote_id), title: viewing.title })}
                                        grow={!isLarge}
                                    />
                                    {!String(viewing.is_subscribed).match(/^true$/i) ? (
                                        <SheetButton
                                            label="Send payment prompt"
                                            icon="phone-portrait-outline"
                                            variant="secondary"
                                            loading={prompting}
                                            loadingLabel="Sending…"
                                            onPress={() => void sendPrompt(viewing)}
                                            grow={!isLarge}
                                        />
                                    ) : null}
                                </>
                            ) : null
                        }
                    />
                }
            >
                <AdminListView<EntityItem, string>
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
                    onOpenCreate={openCreate}
                    onPressItem={setViewing}
                    onEditItem={openEdit}
                    stats={[
                        { label: 'Entities', value: entities.length.toLocaleString() },
                        { label: 'Subscribed', value: entities.filter((e) => String(e.is_subscribed).toLowerCase() === 'true').length.toLocaleString(), color: '#8b5cf6' },
                        { label: 'Your users', value: owners.length.toLocaleString() },
                        { label: 'Your rate', value: percent(rate) },
                    ]}
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
            <AdminEntityEditModal
                visible={formOpen}
                onClose={() => {
                    if (saving) return;
                    setFormOpen(false);
                    setEditing(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={saving}
                onSubmitTrigger={submit}
                initialData={editing}
                ownerOptions={owners}
                allowedTypes={AGENT_ENTITY_TYPES}
                extraInitialValues={termsInitialValues(editingOnboarding)}
                extraSchema={termsSchema(creating)}
                renderExtra={(f) => (
                    <OnboardingTermsSection
                        f={f}
                        creating={creating}
                        commissionPercentage={rate}
                        onboarderOptions={onboarders}
                        feeLocked={!!editingOnboarding?.has_paid}
                    />
                )}
            />
            <AgentPayoutAccountSheet target={payoutFor} onClose={() => setPayoutFor(null)} />
        </>
    );
}
