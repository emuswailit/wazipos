// components/deliveries/courier/CourierDashboard.tsx
//
// Deliveries -> Courier dashboard: for a courier's / delivery company's own staff.
//   Overview  whitelist status, riders on duty / busy / live, fleet, open jobs,
//             parcels at each stage (couriers), money earned and owed, set-up gaps
//   Parcels   (couriers) incoming to our offices -> receive (waybill) ->
//             in transit -> arrived at the destination office -> buyer collects
//             with the code on their order
//   Riders    our riders / drivers: on / off duty (super admin), busy with what,
//             location live or not; add / edit (employees of the company)
//   Fleet     our vehicles and trips (shared fleet manager)
// WaziPOS admin onboards and whitelists the company; sellers then find our
// on-duty people near them at dispatch. Backend: logistics/utils/courier_console.py.

import courierApi, { type CourierDashboard as Dashboard, type Parcel, type ParcelStage, type Rider } from '@/api/courierApi';
import deliveriesApi, { apiError, isOk, type DeliveryAgent } from '@/api/deliveriesApi';
import { SegmentedControl, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import FleetManager from '@/components/deliveries/fleet/FleetManager';
import { AgentForm } from '@/components/deliveries/settings/DeliverySettings';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';

type Tab = 'OVERVIEW' | 'PARCELS' | 'RIDERS' | 'FLEET';

const STAGES: { key: ParcelStage; label: string; hint: string }[] = [
    { key: 'INCOMING', label: 'Incoming', hint: "On the way to our offices: a seller's person is bringing them. Receive each one with its waybill number." },
    { key: 'IN_TRANSIT', label: 'In transit', hint: 'Received and moving between our offices. Mark them arrived at the destination office.' },
    { key: 'AWAITING', label: 'For collection', hint: 'At the destination office. The buyer collects with the 6-digit code on their order.' },
    { key: 'DONE', label: 'Collected', hint: 'Collected in the last 30 days.' },
];

const RIDER_STATE: Record<Rider['state'], { label: string; color: string }> = {
    ON_DUTY: { label: 'On duty', color: '#10b981' },
    BUSY: { label: 'On a delivery', color: '#3b82f6' },
    OFF_DUTY: { label: 'Off duty', color: '#94a3b8' },
    INACTIVE: { label: 'Inactive', color: '#64748b' },
};

export default function CourierDashboard() {
    const { theme } = useListTokens();
    const { width } = useWindowDimensions();
    const [tab, setTab] = useState<Tab>('OVERVIEW');
    const [data, setData] = useState<Dashboard | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await courierApi.getDashboard();
            if (isOk(res)) {
                setData(res.data.data);
                setError(null);
            } else setError(apiError(res, 'Could not load the dashboard.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const courier = data?.provider.kind === 'COURIER';
    const tabs: { key: Tab; label: string }[] = [
        { key: 'OVERVIEW', label: 'Overview' },
        ...(courier ? [{ key: 'PARCELS' as Tab, label: 'Parcels' }] : []),
        { key: 'RIDERS', label: 'Riders & drivers' },
        { key: 'FLEET', label: 'Fleet' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
                <View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>{data?.provider.title ?? 'Courier dashboard'}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {courier ? 'Long-haul courier' : data ? 'Delivery company' : 'Loading…'}
                    </Text>
                </View>
                <SegmentedControl<Tab> options={tabs} value={tab} onChange={setTab} variant={width < 600 ? 'mobile' : 'web'} />
            </View>
            {error && !data ? <Text style={{ margin: 16, color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {tab === 'OVERVIEW' ? (
                <Overview data={data} refreshing={refreshing} onRefresh={load} goTo={setTab} />
            ) : tab === 'PARCELS' ? (
                <Parcels onChanged={load} />
            ) : tab === 'RIDERS' ? (
                <Riders onChanged={load} />
            ) : (
                <View style={{ flex: 1 }}>
                    <FleetManager />
                </View>
            )}
        </View>
    );
}

/* ------------------------------------------------------------------ overview */

function Tile({ label, value, note, icon, color, onPress }: { label: string; value: string; note?: string; icon: any; color: string; onPress?: () => void }) {
    const { theme, border, cardShadow } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={{ flexGrow: 1, flexBasis: 160, padding: 14, gap: 4, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={icon} size={16} color={color} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11.5, letterSpacing: 0.3 }}>{label.toUpperCase()}</Text>
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{value}</Text>
            {note ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{note}</Text> : null}
        </Pressable>
    );
}

function Overview({ data, refreshing, onRefresh, goTo }: { data: Dashboard | null; refreshing: boolean; onRefresh: () => void; goTo: (t: Tab) => void }) {
    const { theme, border } = useListTokens();
    if (!data) return <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />;
    const { riders, fleet, parcels, money, provider } = data;
    const warnings: { text: string; action?: { label: string; route: string } }[] = [];
    if (provider.status === 'PENDING') warnings.push({ text: "WaziPOS hasn't whitelisted you yet: sellers can't send you deliveries until then." });
    if (provider.status === 'SUSPENDED') warnings.push({ text: 'WaziPOS has suspended you: sellers are not offered your services. Contact WaziPOS support.' });
    if (riders.total === 0) warnings.push({ text: 'Add your riders and drivers (they must be your employees).' });
    else if (riders.on_duty === 0) warnings.push({ text: 'Nobody is on duty: sellers near your riders cannot find them.' });
    if (fleet.papers_due) warnings.push({ text: `${fleet.papers_due} vehicle${fleet.papers_due === 1 ? '' : 's'} with insurance or inspection due within 30 days.` });
    if (provider.kind === 'COURIER' && data.offices === 0) warnings.push({ text: 'Add your offices: buyers pick one to collect from.', action: { label: 'Offices', route: '/deliverySettings?tab=deliverySettings' } });
    if (data.offices_without_location) warnings.push({ text: `${data.offices_without_location} office${data.offices_without_location === 1 ? ' has' : 's have'} no location and won't be offered.`, action: { label: 'Offices', route: '/deliverySettings?tab=deliverySettings' } });

    return (
        <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
            {warnings.map((w, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b66', backgroundColor: '#f59e0b14' }}>
                    <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
                    <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>{w.text}</Text>
                    {w.action ? <SheetButton label={w.action.label} variant="ghost" onPress={() => router.push(w.action!.route as any)} /> : null}
                </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Tile label="On duty" value={`${riders.on_duty}/${riders.total}`} note={`${riders.busy} on a delivery · ${riders.live} sharing location`} icon="bicycle-outline" color="#10b981" onPress={() => goTo('RIDERS')} />
                <Tile label="Fleet" value={`${fleet.available}/${fleet.total}`} note={`available · ${fleet.on_trip} out · ${fleet.maintenance} in maintenance · ${fleet.open_trips} open trips`} icon="car-outline" color="#3b82f6" onPress={() => goTo('FLEET')} />
                <Tile label="Deliveries" value={String(data.jobs.open)} note={`open now · ${data.jobs.done_30_days} done in 30 days`} icon="navigate-outline" color="#8b5cf6" />
                {parcels
                    ? STAGES.map((s) => (
                          <Tile key={s.key} label={s.label} value={String(parcels[s.key])} note={s.key === 'DONE' ? 'last 30 days' : 'parcels'} icon="cube-outline" color="#f97316" onPress={() => goTo('PARCELS')} />
                      ))
                    : null}
                <Tile label="Earned" value={formatKES(money.earned_30_days)} note="last 30 days" icon="cash-outline" color="#10b981" />
                <Tile label="Owed to you" value={formatKES(money.owed)} note={`paid ${formatKES(money.paid_30_days)} in 30 days`} icon="wallet-outline" color="#f59e0b" onPress={() => router.push('/payoutAccounts?tab=payoutAccounts' as any)} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: border }}>
                <SheetButton label="Offices & rates" icon="location-outline" variant="secondary" onPress={() => router.push('/deliverySettings?tab=deliverySettings' as any)} />
                {provider.kind === 'COURIER' ? <SheetButton label="Rate charts" icon="pricetags-outline" variant="secondary" onPress={() => router.push('/courierRates?tab=courierRates' as any)} /> : null}
                <SheetButton label="Payout accounts" icon="wallet-outline" variant="secondary" onPress={() => router.push('/payoutAccounts?tab=payoutAccounts' as any)} />
            </View>
        </ScrollView>
    );
}

/* ------------------------------------------------------------------ parcels */

function Parcels({ onChanged }: { onChanged: () => void }) {
    const { theme, border } = useListTokens();
    const alert = useAlert();
    const [stage, setStage] = useState<ParcelStage>('INCOMING');
    const [rows, setRows] = useState<Parcel[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [input, setInput] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await courierApi.getParcels(stage);
            setRows(isOk(res) ? res.data.parcels ?? [] : []);
        } finally {
            setRefreshing(false);
        }
    }, [stage]);
    useFocusEffect(useCallback(() => { setRows(null); void load(); }, [load]));

    const act = async (p: Parcel) => {
        setBusy(p.leg);
        try {
            const value = (input[p.leg] ?? '').trim();
            const res: any =
                stage === 'INCOMING'
                    ? await courierApi.receiveParcel(p.leg, value)
                    : stage === 'IN_TRANSIT'
                        ? await courierApi.arriveParcel(p.leg)
                        : await courierApi.collectParcel(p.shipment, value);
            if (isOk(res)) {
                setRows((list) => (list ?? []).filter((x) => x.leg !== p.leg));
                onChanged();
            } else alert('Not updated', apiError(res, 'Could not update the parcel.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };
    const current = STAGES.find((s) => s.key === stage)!;

    return (
        <ScrollView
            contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <SegmentedControl<ParcelStage> options={STAGES.map((s) => ({ key: s.key, label: s.label }))} value={stage} onChange={setStage} />
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>{current.hint}</Text>
            {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
            {rows && rows.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No parcels here.</Text> : null}
            {(rows ?? []).map((p) => (
                <View key={p.leg} style={{ padding: 12, gap: 6, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="cube-outline" size={18} color={theme.primary} />
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                            #{p.reference} · {p.from_office ?? '—'} → {p.to_office ?? '—'}
                        </Text>
                        {p.pays_us ? <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{formatKES(p.pays_us)}</Text> : null}
                    </View>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {[
                            p.seller ? `from ${p.seller}` : '',
                            p.buyer ? `for ${p.buyer}` : '',
                            `${Number(p.weight_kg).toLocaleString()} kg`,
                            Number(p.cargo_value) ? `goods ${formatKES(p.cargo_value)}` : '',
                            p.waybill_number ? `waybill ${p.waybill_number}` : '',
                            p.brought_by ? `brought by ${p.brought_by}${p.brought_by_phone ? ` (${p.brought_by_phone})` : ''}` : '',
                            p.since ? new Date(p.since).toLocaleString() : '',
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                    {stage !== 'DONE' ? (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            {stage === 'INCOMING' || stage === 'AWAITING' ? (
                                <TextInput
                                    value={input[p.leg] ?? ''}
                                    onChangeText={(t) => setInput((m) => ({ ...m, [p.leg]: t }))}
                                    placeholder={stage === 'INCOMING' ? 'Waybill number (optional)' : "Buyer's 6-digit code"}
                                    placeholderTextColor={theme.textDark}
                                    keyboardType={stage === 'AWAITING' ? 'number-pad' : 'default'}
                                    maxLength={stage === 'AWAITING' ? 6 : 60}
                                    style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                                />
                            ) : (
                                <View style={{ flex: 1 }} />
                            )}
                            <SheetButton
                                label={stage === 'INCOMING' ? 'Received' : stage === 'IN_TRANSIT' ? 'Arrived' : 'Collected'}
                                icon="checkmark-done"
                                onPress={() => void act(p)}
                                loading={busy === p.leg}
                                disabled={stage === 'AWAITING' && (input[p.leg] ?? '').trim().length < 6}
                            />
                        </View>
                    ) : null}
                </View>
            ))}
        </ScrollView>
    );
}

/* ------------------------------------------------------------------ riders */

function Riders({ onChanged }: { onChanged: () => void }) {
    const { theme, border } = useListTokens();
    const alert = useAlert();
    const [rows, setRows] = useState<Rider[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState<DeliveryAgent | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await courierApi.getRiders();
            setRows(isOk(res) ? res.data.riders ?? [] : []);
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const toggle = async (r: Rider, available: boolean) => {
        setRows((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, is_available: available } : x)));
        const res: any = await courierApi.setRiderAvailability(r.id, available);
        if (isOk(res)) {
            setRows((list) => (list ?? []).map((x) => (x.id === r.id ? res.data.rider : x)));
            onChanged();
        } else {
            setRows((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));
            alert('Not changed', apiError(res, 'Could not change who is on duty.'), undefined, 'danger');
        }
    };

    const open = (r: Rider | null) => {
        setEditing(
            r
                ? { id: r.id, entity: '', entity_title: '', user: r.user, name: r.name, mode: r.mode, max_weight_kg: r.max_weight_kg, vehicle_registration: r.vehicle_registration, phone: r.phone, is_active: r.is_active, is_available: r.is_available }
                : null,
        );
        setFormError(null);
        setFormOpen(true);
    };
    const save = async (details: Record<string, any>) => {
        setSaving(true);
        setFormError(null);
        try {
            const res: any = await deliveriesApi.saveDeliveryAgent(editing ? { ...details, id: editing.id } : details);
            if (isOk(res)) {
                setFormOpen(false);
                void load();
                onChanged();
            } else setFormError(apiError(res, 'Could not save.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        On-duty people are offered to sellers within your service radius. Riders can also switch themselves in My deliveries, which shares their location.
                    </Text>
                    <SheetButton label="Add" icon="add" onPress={() => open(null)} />
                </View>
                {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
                {rows && rows.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No riders or drivers yet. Add your employees who deliver.</Text> : null}
                {(rows ?? []).map((r) => {
                    const st = RIDER_STATE[r.state];
                    return (
                        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, opacity: r.is_active ? 1 : 0.6 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: st.color }} />
                            <Pressable style={{ flex: 1 }} onPress={() => open(r)}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{r.name}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                    {[
                                        st.label,
                                        r.mode_label,
                                        r.max_weight_kg ? `up to ${Number(r.max_weight_kg)} kg` : '',
                                        r.vehicle_registration,
                                        r.phone,
                                        r.current_job ? `${r.current_job.status === 'PICKED_UP' ? 'carrying' : 'assigned'} for ${r.current_job.seller ?? 'a seller'}` : '',
                                        r.live ? 'location live' : r.last_seen_at ? `last seen ${new Date(r.last_seen_at).toLocaleString()}` : 'location never shared',
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </Text>
                            </Pressable>
                            {r.is_active ? <Switch value={r.is_available} onValueChange={(v) => void toggle(r, v)} trackColor={{ true: '#10b981', false: undefined }} /> : null}
                        </View>
                    );
                })}
            </ScrollView>
            <AgentForm visible={formOpen} onClose={() => !saving && setFormOpen(false)} initial={editing} saving={saving} error={formError} onSave={save} />
        </>
    );
}
