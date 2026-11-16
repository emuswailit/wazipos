// components/shopping/plans/ShoppingPlansList.tsx
//
// Planner: shopping plans (wishlists) kept on this phone. Each plan is a basket
// at one real shop, priced with that shop's real prices, checked against a
// budget — e.g. "Back to school · Amani (Grade 4)", KES 15,000. When ready,
// open it in the shop and pay by M-Pesa: it becomes a customer order.
//
// Build flow mirrors a new shopping order: name the plan → choose a nearby
// shop (Adjacent Stores) → add products in the shop front, which saves into
// the plan as you go.

import { useAlert } from '@/components/common/AlertProvider';
import { AdminDetailsSheet, AdminListView, DetailsDock, SheetButton, formatDate, useListTokens, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { usePaged } from '@/hooks/useCachedList';
import { deletePlan, duplicatePlan, lineQty, linePrice, newPlanId, planTotal, planUnits, upsertPlan, useShoppingPlans, type ShoppingPlan } from '@/utils/shoppingPlans';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { PlanFormSheet, type PlanDetails } from './PlanParts';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const daysTo = (d?: string) => (d ? Math.ceil((new Date(`${d}T12:00:00`).getTime() - Date.now()) / 86400000) : null);
const overBy = (p: ShoppingPlan) => (p.budget ? planTotal(p) - p.budget : 0);

function badges(p: ShoppingPlan): AdminBadge[] {
    const out: AdminBadge[] = [];
    if (!p.retailer_id) out.push({ label: 'Choose a shop', tone: 'warning', icon: 'storefront-outline' });
    if (p.budget) {
        const o = overBy(p);
        out.push(o > 0 ? { label: `${kes(o)} over budget`, tone: 'danger', icon: 'alert-circle-outline' } : { label: `${kes(-o)} left`, tone: 'success', icon: 'wallet-outline' });
    }
    const d = daysTo(p.need_by);
    if (d != null) out.push(d < 0 ? { label: 'Date passed', tone: 'neutral' } : { label: d === 0 ? 'Needed today' : `Needed in ${d}d`, tone: d <= 7 ? 'warning' : 'info', icon: 'calendar-outline' });
    return out;
}

const config: AdminListConfig<ShoppingPlan> = {
    title: 'Planner',
    noun: ['plan', 'plans'],
    icon: 'calendar-outline',
    searchPlaceholder: 'Search plans, shops or people…',
    addLabel: 'New plan',
    emptyTitle: 'Plan before you pay',
    emptyMessage: 'Make a list at a real shop with real prices — back to school, monthly groceries — set a budget, and pay by M-Pesa when you’re ready.',
    keyOf: (p) => p.id,
    titleOf: (p) => p.title,
    subtitleOf: (p) => [p.retailer_name || 'No shop yet', p.for_whom].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'calendar-outline', color: '#8b5cf6' }),
    badgesOf: badges,
    metaOf: (p) => `${p.items.length} item${p.items.length === 1 ? '' : 's'} · ${planUnits(p)} units · updated ${formatDate(p.updated)}`,
    metaIcon: 'basket-outline',
    metricOf: (p) => ({ value: kes(planTotal(p)), label: p.budget ? `of ${kes(p.budget)}` : 'planned', color: overBy(p) > 0 ? '#f43f5e' : undefined }),
    primaryColumn: { label: 'Plan', flex: 1.6 },
    columns: [
        { key: 'shop', label: 'Shop', flex: 1.3, render: (p) => p.retailer_name || '—' },
        { key: 'for', label: 'For', flex: 1, render: (p) => p.for_whom || '—' },
        { key: 'need', label: 'Needed by', flex: 0.9, render: (p) => (p.need_by ? formatDate(p.need_by) : '—') },
        { key: 'items', label: 'Items', flex: 0.5, align: 'right', render: (p) => String(p.items.length) },
        { key: 'total', label: 'Total', flex: 0.9, align: 'right', render: (p) => kes(planTotal(p)) },
        { key: 'budget', label: 'Budget', flex: 0.9, align: 'right', render: (p) => (p.budget ? kes(p.budget) : '—') },
    ],
};

type Filter = 'ALL' | 'READY' | 'NO_SHOP' | 'OVER';

/** Opens the plan in its shop (plan mode), or Adjacent Stores to choose one. */
export function openPlan(p: ShoppingPlan) {
    if (!p.retailer_id) {
        router.push({ pathname: '/shopFront', params: { plan: p.id } } as any);
        return;
    }
    router.push({
        pathname: '/shopFront/[id]',
        params: {
            id: p.retailer_id,
            name: p.retailer_name ?? '',
            plan: p.id,
            ...(p.retailer_type ? { type: p.retailer_type } : {}),
            ...(p.retailer_location ? { location: p.retailer_location } : {}),
            ...(p.retailer_lat ? { lat: p.retailer_lat } : {}),
            ...(p.retailer_lng ? { lng: p.retailer_lng } : {}),
        },
    } as any);
}

export default function ShoppingPlansList() {
    const { user } = useAuth() as any;
    const userId = String(user?.id ?? '');
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const { plans, reload } = useShoppingPlans(userId);

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [form, setForm] = useState<{ mode: 'create' | 'edit'; plan?: ShoppingPlan } | null>(null);
    const viewing = plans.find((p) => p.id === viewingId) ?? null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return plans
            .filter((p) => (filter === 'ALL' ? true : filter === 'READY' ? !!p.retailer_id && p.items.length > 0 : filter === 'NO_SHOP' ? !p.retailer_id : overBy(p) > 0))
            .filter((p) => !q || `${p.title} ${p.retailer_name ?? ''} ${p.for_whom ?? ''} ${p.note ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    }, [plans, query, filter]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    const total = plans.reduce((s, p) => s + planTotal(p), 0);
    const budgets = plans.reduce((s, p) => s + (p.budget ?? 0), 0);
    const over = plans.filter((p) => overBy(p) > 0).length;
    const ready = plans.filter((p) => !!p.retailer_id && p.items.length > 0).length;
    const noShop = plans.filter((p) => !p.retailer_id).length;

    const submit = async (d: PlanDetails) => {
        if (form?.mode === 'edit' && form.plan) {
            await upsertPlan(userId, form.plan.id, { ...d, budget: d.budget });
            setForm(null);
            return;
        }
        const p = await upsertPlan(userId, newPlanId(), { ...d, items: [] });
        setForm(null);
        openPlan(p); // → choose a shop, then add products
    };

    const remove = (p: ShoppingPlan) =>
        alert('Delete plan', `Delete “${p.title}” and its ${p.items.length} item${p.items.length === 1 ? '' : 's'} from this phone?`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    await deletePlan(userId, p.id);
                    setViewingId(null);
                },
            },
        ], 'danger');

    const copy = async (p: ShoppingPlan) => {
        const c = await duplicatePlan(userId, p.id);
        if (c) setViewingId(c.id);
    };

    const details = viewing ? <PlanDetailsSheet plan={viewing} onClose={() => setViewingId(null)} onEdit={() => setForm({ mode: 'edit', plan: viewing })} onCopy={() => copy(viewing)} onDelete={() => remove(viewing)} /> : null;

    return (
        <>
            <DetailsDock placeholder="Pick a plan to see its items and budget." pane={details ?? <AdminDetailsSheet visible={false} onClose={() => undefined} heading="" icon="calendar-outline" title="" sections={[]} />}>
                <AdminListView<ShoppingPlan, Filter>
                    variant={width >= 768 ? 'web' : 'mobile'}
                    config={config}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={reload}
                    refreshing={false}
                    sourceLabel="Saved on this phone"
                    sourceTone="cache"
                    {...paged}
                    onOpenCreate={() => setForm({ mode: 'create' })}
                    onPressItem={(p) => setViewingId(p.id)}
                    onEditItem={(p) => setForm({ mode: 'edit', plan: p })}
                    rowActions={(p) => [
                        { icon: 'storefront-outline', label: p.retailer_id ? 'Open in shop' : 'Choose shop', onPress: () => openPlan(p), tone: 'primary' },
                        { icon: 'copy-outline', label: 'Duplicate', onPress: () => copy(p) },
                        { icon: 'trash-outline', label: 'Delete', onPress: () => remove(p), tone: 'danger' },
                    ]}
                    stats={[
                        { label: 'Planned', value: kes(total) },
                        { label: 'Budgets', value: budgets ? kes(budgets) : '—' },
                        { label: 'Over budget', value: String(over), color: over ? '#f43f5e' : undefined },
                        { label: 'Ready to pay', value: String(ready), color: '#10b981' },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: plans.length },
                            { key: 'READY', label: 'Ready to pay', icon: 'card-outline', count: ready },
                            { key: 'OVER', label: 'Over budget', icon: 'alert-circle-outline', count: over },
                            { key: 'NO_SHOP', label: 'No shop yet', icon: 'storefront-outline', count: noShop },
                        ],
                        value: filter,
                        onChange: setFilter,
                        allKey: 'ALL',
                    }}
                />
            </DetailsDock>

            <PlanFormSheet visible={!!form} mode={form?.mode ?? 'create'} initial={form?.plan} onClose={() => setForm(null)} onSubmit={submit} />
        </>
    );
}

function PlanDetailsSheet({ plan, onClose, onEdit, onCopy, onDelete }: { plan: ShoppingPlan; onClose: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
    const total = planTotal(plan);
    const o = overBy(plan);
    return (
        <AdminDetailsSheet
            visible
            onClose={onClose}
            heading="Shopping plan"
            icon="calendar-outline"
            title={plan.title}
            subtitle={[plan.retailer_name || 'No shop yet', plan.for_whom, plan.need_by ? `needed by ${formatDate(plan.need_by)}` : null].filter(Boolean).join(' · ')}
            avatar={{ icon: 'calendar-outline', color: '#8b5cf6' }}
            badges={badges(plan)}
            stats={[
                { label: 'Total', value: kes(total), color: o > 0 ? '#f43f5e' : undefined },
                { label: 'Budget', value: plan.budget ? kes(plan.budget) : '—' },
                { label: o > 0 ? 'Over' : 'Left', value: plan.budget ? kes(Math.abs(o)) : '—', color: plan.budget ? (o > 0 ? '#f43f5e' : '#10b981') : undefined },
            ]}
            sections={[
                { title: `Items (${plan.items.length})`, icon: 'basket-outline', children: <PlanLines plan={plan} /> },
                {
                    title: 'About',
                    icon: 'information-circle-outline',
                    fields: [
                        { label: 'Shop', value: [plan.retailer_name, plan.retailer_location].filter(Boolean).join(' · ') },
                        { label: 'Note', value: plan.note ?? '' },
                        { label: 'Prices', value: `As saved ${formatDate(plan.updated)} · refreshed from the shop when you open it` },
                        { label: 'Kept', value: 'On this phone only' },
                    ],
                },
            ]}
            actions={
                <>
                    <SheetButton label={plan.retailer_id ? (plan.items.length ? 'Open & pay' : 'Add products') : 'Choose shop'} icon="storefront-outline" onPress={() => openPlan(plan)} grow />
                    <SheetButton label="Edit" icon="create-outline" variant="secondary" onPress={onEdit} />
                    <SheetButton label="Copy" icon="copy-outline" variant="secondary" onPress={onCopy} />
                    <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={onDelete} />
                </>
            }
        />
    );
}

function PlanLines({ plan }: { plan: ShoppingPlan }) {
    const { theme, divider } = useListTokens();
    if (!plan.items.length) return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Nothing yet. Open the plan in its shop and add products.</Text>;
    return (
        <View style={{ gap: 8 }}>
            {plan.items.map((it, i) => (
                <View key={`${it.retailer_receipt}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: i ? 8 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: divider }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                            {it.title || it.receipt_details?.product_title || 'Product'}
                        </Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                            {lineQty(it)} × {kes(linePrice(it))}
                        </Text>
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(lineQty(it) * linePrice(it))}</Text>
                </View>
            ))}
        </View>
    );
}
