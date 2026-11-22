// components/deliveries/fleet/FleetManager.tsx
//
// Deliveries -> Fleet: your own delivery vehicles (bicycles, motorbikes, cars,
// vans, lorries) and their trips.
//   Vehicles  type, registration, capacity, default driver, insurance /
//             inspection expiry (warned 30 days ahead; expired = not sent out),
//             status (in maintenance = not sent out), odometer, running costs
//             (fuel, service, repairs, renewals).
//   Trips     at dispatch you send a delivery with a driver and one of your
//             vehicles; deliveries on the same vehicle and driver share a trip.
//             Start it (odometer out), finish it (odometer in, fuel).
// Backend: logistics/utils/fleet.py (GetFleet, SaveVehicle, …, StartTrip, FinishTrip).

import deliveriesApi, { apiError, isOk, type DeliveryAgent, type DeliveryTrip, type FleetSummary, type FleetVehicle, type VehicleKind, type VehicleLogEntry, type VehicleStatus } from '@/api/deliveriesApi';
import { AdminFormSheet, AdminListView, AdminSheet, ChoiceChips, DetailsDock, formatDate, FormRow, FormSection, SegmentedControl, SheetButton, useListTokens, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

type Tab = 'VEHICLES' | 'TRIPS';
const KINDS: { value: VehicleKind; label: string; icon: any }[] = [
    { value: 'BICYCLE', label: 'Bicycle', icon: 'bicycle-outline' },
    { value: 'MOTORBIKE', label: 'Motorbike', icon: 'bicycle' },
    { value: 'CAR', label: 'Car', icon: 'car-outline' },
    { value: 'VAN', label: 'Van / pickup', icon: 'car-sport-outline' },
    { value: 'TRUCK', label: 'Lorry', icon: 'bus-outline' },
];
const STATUS: Record<VehicleStatus, AdminBadge> = {
    AVAILABLE: { label: 'Available', tone: 'success' },
    ON_TRIP: { label: 'On a trip', tone: 'violet' },
    MAINTENANCE: { label: 'In maintenance', tone: 'warning' },
    RETIRED: { label: 'Retired', tone: 'neutral' },
};

const vehiclesConfig: AdminListConfig<FleetVehicle> = {
    title: 'Fleet',
    noun: ['vehicle', 'vehicles'],
    icon: 'car-outline',
    searchPlaceholder: 'Search registration or model…',
    addLabel: 'Add vehicle',
    emptyMessage: 'Add your own delivery vehicles to send deliveries with them — to buyers or to a courier office.',
    keyOf: (v) => v.id,
    titleOf: (v) => v.registration,
    subtitleOf: (v) => [v.kind_label, v.make_model, v.capacity_kg ? `${Number(v.capacity_kg).toLocaleString()} kg` : null, v.default_driver_name].filter(Boolean).join(' · '),
    avatarOf: (v) => ({ label: v.registration }),
    badgesOf: (v) => [
        STATUS[v.status],
        ...v.papers.filter((p) => p.state !== 'OK').map((p) => ({ label: `${p.label} ${p.state === 'EXPIRED' ? 'expired' : 'due'}`, tone: p.state === 'EXPIRED' ? 'danger' : 'warning' } as AdminBadge)),
    ],
    metricOf: (v) => ({ value: `${Number(v.odometer_km).toLocaleString()} km`, label: 'odometer' }),
    primaryColumn: { label: 'Vehicle', flex: 1.4 },
    columns: [
        { key: 'kind', label: 'Type', flex: 1, render: (v) => v.kind_label },
        { key: 'cap', label: 'Capacity', flex: 0.9, align: 'right', render: (v) => (v.capacity_kg ? `${Number(v.capacity_kg).toLocaleString()} kg` : '—') },
        { key: 'driver', label: 'Driver', flex: 1.3, render: (v) => v.default_driver_name ?? '—' },
        { key: 'status', label: 'Status', flex: 1, render: (v) => STATUS[v.status].label },
        { key: 'ins', label: 'Insurance', flex: 1, render: (v) => formatDate(v.insurance_expiry) },
        { key: 'insp', label: 'Inspection', flex: 1, render: (v) => formatDate(v.inspection_expiry) },
        { key: 'cost', label: 'Running cost', flex: 1, align: 'right', render: (v) => formatKES(v.running_cost) },
    ],
};

const ok = (res: any) => isOk(res);

export default function FleetManager() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [tab, setTab] = useState<Tab>('VEHICLES');
    const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
    const [summary, setSummary] = useState<FleetSummary | null>(null);
    const [drivers, setDrivers] = useState<{ id: string; title: string }[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<FleetVehicle | null>(null);
    const [editing, setEditing] = useState<FleetVehicle | 'new' | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [f, a]: any[] = await Promise.all([deliveriesApi.getFleet(), deliveriesApi.getDeliveryAgents()]);
            if (ok(f)) {
                setVehicles(f.data.data.vehicles ?? []);
                setSummary(f.data.data.summary ?? null);
                setLoadError(null);
            } else setLoadError(apiError(f, 'Could not load the fleet.'));
            if (ok(a)) setDrivers((a.data.agents ?? []).filter((x: DeliveryAgent) => x.is_active).map((x: DeliveryAgent) => ({ id: x.id, title: x.name })));
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const q = query.trim().toLowerCase();
    const items = q ? vehicles.filter((v) => `${v.registration} ${v.make_model}`.toLowerCase().includes(q)) : vehicles;
    const header = (
        <View style={{ marginBottom: 8 }}>
            <SegmentedControl<Tab> value={tab} onChange={setTab} options={[{ key: 'VEHICLES', label: 'Vehicles' }, { key: 'TRIPS', label: `Trips${summary?.open_trips ? ` (${summary.open_trips})` : ''}` }]} />
        </View>
    );

    if (tab === 'TRIPS') return <Trips header={header} />;

    return (
        <>
            <DetailsDock placeholder="Pick a vehicle to see its log." pane={viewing ? <VehicleDetails vehicle={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} onChanged={() => void load()} /> : null}>
                <AdminListView<FleetVehicle, string>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={vehiclesConfig}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={load}
                    refreshing={refreshing}
                    sourceLabel={loadError ? 'Not loaded' : 'Server'}
                    sourceTone={loadError ? 'none' : 'server'}
                    error={loadError}
                    header={header}
                    items={items}
                    allItems={items}
                    onOpenCreate={() => setEditing('new')}
                    onPressItem={setViewing}
                    onEditItem={(v) => setEditing(v)}
                    stats={[
                        { label: 'Vehicles', value: String(summary?.vehicles ?? 0) },
                        { label: 'Available', value: String(summary?.available ?? 0), color: '#10b981' },
                        { label: 'On trips', value: String(summary?.on_trip ?? 0), color: '#8b5cf6' },
                        { label: 'In maintenance', value: String(summary?.maintenance ?? 0), color: summary?.maintenance ? '#f59e0b' : undefined },
                        { label: 'Papers due', value: String(summary?.papers_due ?? 0), color: summary?.papers_due ? '#f43f5e' : undefined },
                    ]}
                    page={1}
                    pageSize={100 as any}
                    totalItems={items.length}
                    totalPages={1}
                    pageStart={0}
                    pageEnd={items.length}
                    onPrev={() => {}}
                    onNext={() => {}}
                    onPageSizeChange={() => {}}
                />
            </DetailsDock>
            <VehicleSheet vehicle={editing} drivers={drivers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
        </>
    );
}

/* ------------------------------------------------------------------ vehicle form */

/** Add / edit a vehicle. saveFn: where it is saved (default: our own fleet; admin: a delivery company's). */
export function VehicleSheet({ vehicle, drivers, onClose, onSaved, saveFn = deliveriesApi.saveVehicle }: { vehicle: FleetVehicle | 'new' | null; drivers: { id: string; title: string }[]; onClose: () => void; onSaved: () => void; saveFn?: (details: Record<string, any>) => Promise<any> }) {
    const { theme, isDarkMode } = useAuth();
    const v = vehicle && vehicle !== 'new' ? vehicle : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <Formik
            key={v?.id ?? (vehicle ? 'new' : 'closed')}
            initialValues={{
                kind: (v?.kind ?? 'MOTORBIKE') as VehicleKind,
                registration: v?.registration ?? '',
                make_model: v?.make_model ?? '',
                capacity_kg: v?.capacity_kg ? String(Number(v.capacity_kg)) : '',
                status: (v?.status ?? 'AVAILABLE') as VehicleStatus,
                default_driver: v?.default_driver ?? '',
                insurance_expiry: v?.insurance_expiry ?? '',
                inspection_expiry: v?.inspection_expiry ?? '',
                odometer_km: v ? String(Number(v.odometer_km)) : '',
                notes: v?.notes ?? '',
            }}
            validationSchema={Yup.object({
                registration: Yup.string().when('kind', { is: (k: string) => k !== 'BICYCLE', then: (s) => s.trim().required('Registration number') }),
                capacity_kg: Yup.number().typeError('Enter kg').min(0).nullable(),
            })}
            onSubmit={async (f) => {
                setSaving(true);
                setError(null);
                try {
                    const res: any = await saveFn({
                        ...(v ? { vehicle: v.id } : {}),
                        kind: f.kind,
                        registration: f.registration,
                        make_model: f.make_model,
                        capacity_kg: f.capacity_kg,
                        status: f.status,
                        default_driver: f.default_driver || '',
                        insurance_expiry: f.insurance_expiry ? f.insurance_expiry.slice(0, 10) : '',
                        inspection_expiry: f.inspection_expiry ? f.inspection_expiry.slice(0, 10) : '',
                        odometer_km: f.odometer_km,
                        notes: f.notes,
                    });
                    if (ok(res)) onSaved();
                    else setError(apiError(res, 'Could not save the vehicle.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet visible={!!vehicle} onClose={onClose} title={v ? `Edit ${v.registration}` : 'Add vehicle'} icon="car-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={600}>
                    <FormSection title="Vehicle" zIndex={20}>
                        <ChoiceChips<VehicleKind> label="Type" options={KINDS} value={f.values.kind} onChange={(k) => f.setFieldValue('kind', k)} />
                        <FormRow>
                            <CustomTextField name="registration" label="Registration" placeholder="e.g. KDA 123B" autoCapitalize="characters" required={f.values.kind !== 'BICYCLE'} />
                            <CustomTextField name="make_model" label="Make / model" placeholder="e.g. Isuzu NPR" />
                        </FormRow>
                        <FormRow>
                            <CustomTextField name="capacity_kg" label="Load capacity (kg)" keyboardType="decimal-pad" hint="Deliveries heavier than this won't be offered on it." />
                            <CustomTextField name="odometer_km" label="Odometer (km)" keyboardType="decimal-pad" />
                        </FormRow>
                        <CustomAutocompletePicker name="default_driver" label="Usual driver" options={drivers} theme={theme} isDarkMode={isDarkMode} placeholder="One of your delivery persons…" />
                    </FormSection>
                    <FormSection title="Papers" hint="Warned 30 days ahead; an expired vehicle isn't sent out.">
                        <FormRow>
                            <DateField name="insurance_expiry" label="Insurance expires" />
                            <DateField name="inspection_expiry" label="Inspection expires" />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Status">
                        <ChoiceChips<VehicleStatus>
                            options={[
                                { value: 'AVAILABLE', label: 'Available' },
                                { value: 'MAINTENANCE', label: 'In maintenance' },
                                { value: 'RETIRED', label: 'Retired' },
                            ]}
                            value={f.values.status === 'ON_TRIP' ? 'AVAILABLE' : f.values.status}
                            onChange={(st) => f.setFieldValue('status', st)}
                        />
                        <CustomTextField name="notes" label="Notes" multiline />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

/* ------------------------------------------------------------------ vehicle log */

const LOG_KINDS: { value: VehicleLogEntry['kind']; label: string }[] = [
    { value: 'FUEL', label: 'Fuel' },
    { value: 'SERVICE', label: 'Service' },
    { value: 'REPAIR', label: 'Repair' },
    { value: 'INSPECTION', label: 'Inspection' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'OTHER', label: 'Other' },
];

function VehicleDetails({ vehicle, onClose, onEdit, onChanged }: { vehicle: FleetVehicle; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
    const { theme, border } = useListTokens();
    const alert = useAlert();
    const [logs, setLogs] = useState<VehicleLogEntry[] | null>(null);
    const [kind, setKind] = useState<VehicleLogEntry['kind']>('FUEL');
    const [cost, setCost] = useState('');
    const [odo, setOdo] = useState('');
    const [litres, setLitres] = useState('');
    const [expiry, setExpiry] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const res: any = await deliveriesApi.getVehicleLogs(vehicle.id);
        setLogs(ok(res) ? res.data.logs ?? [] : []);
    }, [vehicle.id]);
    useEffect(() => { void load(); }, [load]);

    const add = async () => {
        setBusy(true);
        try {
            const res: any = await deliveriesApi.addVehicleLog({
                vehicle: vehicle.id, kind, date: new Date().toISOString().slice(0, 10), cost: cost || '0',
                odometer_km: odo, litres, notes, ...(expiry && (kind === 'INSURANCE' || kind === 'INSPECTION') ? { new_expiry: expiry } : {}),
            });
            if (ok(res)) {
                setCost(''); setOdo(''); setLitres(''); setExpiry(''); setNotes('');
                await load();
                onChanged();
            } else alert('Not saved', apiError(res, 'Could not save.'), undefined, 'danger');
        } finally {
            setBusy(false);
        }
    };
    const input = (value: string, onChange: (t: string) => void, placeholder: string, numeric = true) => (
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.textDark} keyboardType={numeric ? 'decimal-pad' : 'default'}
            style={{ flex: 1, minWidth: 110, height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }} />
    );

    return (
        <AdminSheet
            visible
            onClose={onClose}
            title={vehicle.registration}
            subtitle={`${vehicle.kind_label}${vehicle.make_model ? ` · ${vehicle.make_model}` : ''} · ${STATUS[vehicle.status].label} · ${formatKES(vehicle.running_cost)} running cost`}
            icon="car-outline"
            width={640}
            footer={<><SheetButton label="Close" variant="ghost" onPress={onClose} /><SheetButton label="Edit" icon="create-outline" onPress={onEdit} /></>}
        >
            <View style={{ gap: 12 }}>
                {vehicle.papers.map((p) => (
                    <Text key={p.label} style={{ color: p.state === 'OK' ? theme.textDark : p.state === 'DUE' ? '#f59e0b' : '#f43f5e', fontFamily: theme.font.bold, fontSize: 12.5 }}>
                        {p.label}: {formatDate(p.expiry)}{p.state === 'EXPIRED' ? ' — expired, not sent out' : p.state === 'DUE' ? ' — due soon' : ''}
                    </Text>
                ))}
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Add to the log</Text>
                <ChoiceChips<VehicleLogEntry['kind']> options={LOG_KINDS} value={kind} onChange={setKind} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {input(cost, setCost, 'Cost (KES)')}
                    {input(odo, setOdo, 'Odometer (km)')}
                    {kind === 'FUEL' ? input(litres, setLitres, 'Litres') : null}
                    {kind === 'INSURANCE' || kind === 'INSPECTION' ? input(expiry, setExpiry, 'New expiry YYYY-MM-DD', false) : null}
                    {input(notes, setNotes, 'Notes', false)}
                </View>
                <SheetButton label="Save entry" icon="add" variant="secondary" loading={busy} onPress={() => void add()} />
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Log</Text>
                {logs === null ? <ActivityIndicator color={theme.primary} /> : null}
                {(logs ?? []).map((l) => (
                    <View key={l.id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: border }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            {formatDate(l.date)} · {l.kind_label}{l.litres ? ` · ${l.litres} L` : ''}{l.odometer_km ? ` · ${Number(l.odometer_km).toLocaleString()} km` : ''}{l.notes ? ` · ${l.notes}` : ''}
                        </Text>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{formatKES(l.cost)}</Text>
                    </View>
                ))}
            </View>
        </AdminSheet>
    );
}

/* ------------------------------------------------------------------ trips */

function Trips({ header }: { header: React.ReactNode }) {
    const { theme, border, cardShadow } = useListTokens();
    const alert = useAlert();
    const [scope, setScope] = useState<'OPEN' | 'ALL'>('OPEN');
    const [trips, setTrips] = useState<DeliveryTrip[] | null>(null);
    const [odo, setOdo] = useState<Record<string, string>>({});
    const [fuel, setFuel] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res: any = await deliveriesApi.getTrips(scope);
        setTrips(ok(res) ? res.data.trips ?? [] : []);
    }, [scope]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const run = async (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        try {
            const res: any = await fn();
            if (ok(res)) await load();
            else alert('Not done', apiError(res, 'Could not update the trip.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };
    const box = (value: string, onChange: (t: string) => void, placeholder: string) => (
        <TextInput value={value} onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))} placeholder={placeholder} placeholderTextColor={theme.textDark} keyboardType="decimal-pad"
            style={{ width: 130, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }} />
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 10 }}>
            {header}
            <SegmentedControl<'OPEN' | 'ALL'> value={scope} onChange={setScope} options={[{ key: 'OPEN', label: 'Loading & on the road' }, { key: 'ALL', label: 'All trips' }]} />
            {trips === null ? <ActivityIndicator color={theme.primary} /> : null}
            {trips && trips.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No trips. Sending a delivery with one of your vehicles at dispatch starts one.</Text>
            ) : null}
            {(trips ?? []).map((t) => (
                <View key={t.id} style={{ padding: 14, gap: 6, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                        {t.registration} · {t.kind_label} · {t.driver_name ?? 'driver'}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {t.status === 'PLANNED' ? 'Loading' : t.status === 'ON_ROUTE' ? `On the road since ${formatDate(t.started_at)}` : t.status === 'DONE' ? `Done · ${t.distance_km ?? '—'} km · fuel ${formatKES(t.fuel_cost)}` : 'Cancelled'}
                        {' · '}{t.stops.length} stop(s)
                    </Text>
                    {t.stops.map((s) => (
                        <Text key={s.leg} style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5, paddingLeft: 8 }}>
                            • {s.to}{s.tracking_number ? ` (${s.tracking_number})` : ''} · {Number(s.distance_km).toLocaleString()} km · {s.status.toLowerCase().replace('_', ' ')}
                        </Text>
                    ))}
                    {t.status === 'PLANNED' ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            {box(odo[t.id] ?? '', (v) => setOdo((o) => ({ ...o, [t.id]: v })), 'Odometer out')}
                            <SheetButton label="Start trip" icon="play" loading={busy === `s${t.id}`} onPress={() => void run(`s${t.id}`, () => deliveriesApi.startTrip(t.id, odo[t.id]))} />
                            <SheetButton label="Cancel" variant="ghost" loading={busy === `c${t.id}`} onPress={() => void run(`c${t.id}`, () => deliveriesApi.cancelTrip(t.id))} />
                        </View>
                    ) : t.status === 'ON_ROUTE' ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            {box(odo[t.id] ?? '', (v) => setOdo((o) => ({ ...o, [t.id]: v })), 'Odometer in')}
                            {box(fuel[t.id] ?? '', (v) => setFuel((o) => ({ ...o, [t.id]: v })), 'Fuel (KES)')}
                            <SheetButton label="Finish trip" icon="checkmark-done" loading={busy === `f${t.id}`} onPress={() => void run(`f${t.id}`, () => deliveriesApi.finishTrip(t.id, odo[t.id], fuel[t.id]))} />
                        </View>
                    ) : null}
                </View>
            ))}
        </View>
    );
}
