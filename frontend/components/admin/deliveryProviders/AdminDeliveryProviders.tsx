// components/admin/deliveryProviders/AdminDeliveryProviders.tsx
//
// Admin Panel -> Delivery providers: the platform's delivery companies (riders /
// drivers with their vehicles) and long-haul couriers, managed centrally.
//   - whitelist / suspend each one, and set how far from a pickup its people are
//     offered (service radius);
//   - add and edit its riders / drivers (registered users) and its vehicles.
// Sellers can't add these themselves: at dispatch they pick an available rider /
// driver of a whitelisted company near them, or use their own people and fleet.
// Backend: logistics/utils/platform_providers.py.

import { apiError, isOk, MODE_LABELS, type DeliveryMode, type FleetVehicle } from '@/api/deliveriesApi';
import adminApi, { type AdminDeliveryProvider, type ProviderAgent, type ProviderKind, type ProviderStatus } from '@/api/deliveryProvidersAdminApi';
import { AdminFormSheet, AdminSheet, ChoiceChips, FormRow, FormSection, SegmentedControl, SheetButton, useListTokens } from '@/components/admin/kit';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { VehicleSheet } from '@/components/deliveries/fleet/FleetManager';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import * as Yup from 'yup';

const STATUS: Record<ProviderStatus, { label: string; color: string }> = {
    PENDING: { label: 'Pending review', color: '#f59e0b' },
    WHITELISTED: { label: 'Whitelisted', color: '#10b981' },
    SUSPENDED: { label: 'Suspended', color: '#f43f5e' },
};
const MODES: DeliveryMode[] = ['FOOT', 'BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK'];

export default function AdminDeliveryProviders() {
    const { theme, border, cardShadow } = useListTokens();
    const alert = useAlert();
    const [kind, setKind] = useState<'ALL' | ProviderKind>('ALL');
    const [status, setStatus] = useState<'ALL' | ProviderStatus>('ALL');
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<AdminDeliveryProvider[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [open, setOpen] = useState<AdminDeliveryProvider | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await adminApi.getProviders({
                ...(kind !== 'ALL' ? { kind } : {}),
                ...(status !== 'ALL' ? { status } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            if (isOk(res)) setRows(res.data.providers ?? []);
            else {
                setRows([]);
                alert('Not loaded', apiError(res, 'Could not load delivery providers.'), undefined, 'danger');
            }
        } finally {
            setRefreshing(false);
        }
    }, [kind, status, search, alert]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const setProviderStatus = async (p: AdminDeliveryProvider, next: ProviderStatus) => {
        setBusyId(p.id);
        try {
            const res: any = await adminApi.setProvider(p.id, { status: next });
            if (isOk(res)) {
                setRows((list) => (list ?? []).map((x) => (x.id === p.id ? res.data.provider : x)));
                if (open?.id === p.id) setOpen(res.data.provider);
            } else alert('Not changed', apiError(res, 'Could not change the status.'), undefined, 'danger');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
            >
                <View style={{ gap: 2 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Delivery providers</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        Delivery companies and couriers on WaziPOS. Whitelisted ones are offered to every seller; their available riders and drivers near a pickup can be picked at dispatch.
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <SegmentedControl<'ALL' | ProviderKind>
                        options={[{ key: 'ALL', label: 'All' }, { key: 'DELIVERY_COMPANY', label: 'Delivery companies' }, { key: 'COURIER', label: 'Couriers' }]}
                        value={kind}
                        onChange={setKind}
                    />
                    <SegmentedControl<'ALL' | ProviderStatus>
                        options={[{ key: 'ALL', label: 'Any status' }, { key: 'PENDING', label: 'Pending' }, { key: 'WHITELISTED', label: 'Whitelisted' }, { key: 'SUSPENDED', label: 'Suspended' }]}
                        value={status}
                        onChange={setStatus}
                    />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        onSubmitEditing={() => void load()}
                        placeholder="Search by name…"
                        placeholderTextColor={theme.textDark}
                        style={{ flexGrow: 1, minWidth: 180, height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                    />
                </View>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    Add a company first as a business of type Delivery or Courier (Admin Panel → Entities), with its location; it then appears here as pending.
                </Text>
                {rows === null ? <ActivityIndicator color={theme.primary} /> : null}
                {rows && rows.length === 0 ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No delivery companies or couriers match.</Text> : null}
                {(rows ?? []).map((p) => {
                    const st = STATUS[p.status];
                    const courier = p.kind === 'COURIER';
                    return (
                        <Pressable key={p.id} onPress={() => setOpen(p)} style={{ padding: 14, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Ionicons name={courier ? 'airplane-outline' : 'bicycle-outline'} size={22} color={theme.primary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{p.title}</Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                        {courier ? 'Long-haul courier' : 'Delivery company'}
                                        {p.town ? ` · ${p.town}` : ''}
                                        {courier
                                            ? ` · ${p.offices} office${p.offices === 1 ? '' : 's'}`
                                            : ` · ${p.agents} rider${p.agents === 1 ? '' : 's'} / driver${p.agents === 1 ? '' : 's'} (${p.agents_on_duty} on duty, ${p.agents_live} live) · ${p.vehicles} vehicle${p.vehicles === 1 ? '' : 's'} · within ${Number(p.service_radius_km)} km`}
                                        {p.has_location ? '' : ' · no location'}
                                    </Text>
                                </View>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${st.color}22` }}>
                                    <Text style={{ color: st.color, fontFamily: theme.font.bold, fontSize: 11 }}>{st.label}</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                {p.status !== 'WHITELISTED' ? (
                                    <SheetButton label="Whitelist" icon="shield-checkmark-outline" onPress={() => void setProviderStatus(p, 'WHITELISTED')} loading={busyId === p.id} loadingLabel="Saving…" />
                                ) : (
                                    <SheetButton label="Suspend" icon="pause-circle-outline" variant="danger" onPress={() => void setProviderStatus(p, 'SUSPENDED')} loading={busyId === p.id} loadingLabel="Saving…" />
                                )}
                                <SheetButton label="Manage" icon="settings-outline" variant="secondary" onPress={() => setOpen(p)} />
                            </View>
                        </Pressable>
                    );
                })}
            </ScrollView>
            <ProviderSheet
                provider={open}
                onClose={() => setOpen(null)}
                onChanged={(p) => {
                    setOpen(p);
                    setRows((list) => (list ?? []).map((x) => (x.id === p.id ? p : x)));
                }}
            />
        </View>
    );
}

/* ------------------------------------------------------------------ one provider */

type Section = 'PEOPLE' | 'FLEET' | 'SETTINGS';

function ProviderSheet({ provider, onClose, onChanged }: { provider: AdminDeliveryProvider | null; onClose: () => void; onChanged: (p: AdminDeliveryProvider) => void }) {
    const { theme, border } = useListTokens();
    const [section, setSection] = useState<Section>('PEOPLE');
    const [agents, setAgents] = useState<ProviderAgent[] | null>(null);
    const [vehicles, setVehicles] = useState<FleetVehicle[] | null>(null);
    const [editAgent, setEditAgent] = useState<ProviderAgent | 'new' | null>(null);
    const [editVehicle, setEditVehicle] = useState<FleetVehicle | 'new' | null>(null);
    const id = provider?.id;

    const load = useCallback(async () => {
        if (!id) return;
        const [a, f]: any[] = await Promise.all([adminApi.getAgents(id), adminApi.getFleet(id)]);
        setAgents(isOk(a) ? a.data.agents ?? [] : []);
        setVehicles(isOk(f) ? f.data.data?.vehicles ?? [] : []);
    }, [id]);
    useEffect(() => {
        setAgents(null);
        setVehicles(null);
        setSection('PEOPLE');
        void load();
    }, [load]);

    const refreshProvider = async () => {
        if (!provider) return;
        const res: any = await adminApi.getProviders({ search: provider.title });
        const p = isOk(res) ? (res.data.providers ?? []).find((x: AdminDeliveryProvider) => x.id === provider.id) : null;
        if (p) onChanged(p);
    };

    const drivers = useMemo(() => (agents ?? []).filter((a) => a.is_active).map((a) => ({ id: a.id, title: `${a.name} · ${a.mode_label}` })), [agents]);
    const row = (key: string, title: string, note: string, onPress: () => void, dim = false) => (
        <Pressable key={key} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: border, opacity: dim ? 0.55 : 1 }}>
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{title}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{note}</Text>
            </View>
            <Ionicons name="create-outline" size={18} color={theme.textDark} />
        </Pressable>
    );

    return (
        <>
            <AdminSheet visible={!!provider} onClose={onClose} title={provider?.title ?? ''} subtitle={provider ? `${provider.kind === 'COURIER' ? 'Long-haul courier' : 'Delivery company'} · ${STATUS[provider.status].label}` : undefined} icon="bicycle-outline" width={720}>
                <View style={{ gap: 12 }}>
                    <SegmentedControl<Section>
                        options={[{ key: 'PEOPLE', label: `Riders & drivers${agents ? ` (${agents.length})` : ''}` }, { key: 'FLEET', label: `Vehicles${vehicles ? ` (${vehicles.length})` : ''}` }, { key: 'SETTINGS', label: 'Settings' }]}
                        value={section}
                        onChange={setSection}
                    />
                    {section === 'PEOPLE' ? (
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    Each is a registered user. Off-duty or inactive people aren't offered to sellers.
                                </Text>
                                <SheetButton label="Add" icon="add" onPress={() => setEditAgent('new')} />
                            </View>
                            {agents === null ? <ActivityIndicator color={theme.primary} /> : null}
                            {(agents ?? []).map((a) =>
                                row(
                                    a.id,
                                    a.name,
                                    [a.mode_label, a.max_weight_kg ? `up to ${Number(a.max_weight_kg)} kg` : '', a.vehicle_registration, a.phone, !a.is_active ? 'inactive' : a.is_available ? 'on duty' : 'off duty', a.last_seen_at ? `seen ${new Date(a.last_seen_at).toLocaleString()}` : 'location never shared']
                                        .filter(Boolean)
                                        .join(' · '),
                                    () => setEditAgent(a),
                                    !a.is_active,
                                ),
                            )}
                        </View>
                    ) : section === 'FLEET' ? (
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    Pair a vehicle with its usual driver: it then goes out only with them.
                                </Text>
                                <SheetButton label="Add" icon="add" onPress={() => setEditVehicle('new')} />
                            </View>
                            {vehicles === null ? <ActivityIndicator color={theme.primary} /> : null}
                            {(vehicles ?? []).map((v: any) =>
                                row(
                                    v.id,
                                    `${v.registration} · ${v.kind_label ?? v.kind}`,
                                    [v.make_model, v.capacity_kg ? `${Number(v.capacity_kg)} kg` : '', v.default_driver_name ? `driver ${v.default_driver_name}` : '', v.status_label ?? v.status].filter(Boolean).join(' · '),
                                    () => setEditVehicle(v),
                                    v.status === 'RETIRED',
                                ),
                            )}
                        </View>
                    ) : provider ? (
                        <SettingsForm provider={provider} onSaved={onChanged} />
                    ) : null}
                </View>
            </AdminSheet>
            {provider ? (
                <AgentSheet
                    provider={provider.id}
                    agent={editAgent}
                    onClose={() => setEditAgent(null)}
                    onSaved={() => {
                        setEditAgent(null);
                        void load();
                        void refreshProvider();
                    }}
                />
            ) : null}
            {provider ? (
                <VehicleSheet
                    vehicle={editVehicle}
                    drivers={drivers}
                    saveFn={(details) => adminApi.saveVehicle(provider.id, details)}
                    onClose={() => setEditVehicle(null)}
                    onSaved={() => {
                        setEditVehicle(null);
                        void load();
                        void refreshProvider();
                    }}
                />
            ) : null}
        </>
    );
}

function SettingsForm({ provider, onSaved }: { provider: AdminDeliveryProvider; onSaved: (p: AdminDeliveryProvider) => void }) {
    const { theme } = useListTokens();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusValue, setStatusValue] = useState<ProviderStatus>(provider.status);
    const [radius, setRadius] = useState(String(Number(provider.service_radius_km)));
    const [notes, setNotes] = useState(provider.notes);
    useEffect(() => {
        setStatusValue(provider.status);
        setRadius(String(Number(provider.service_radius_km)));
        setNotes(provider.notes);
    }, [provider]);
    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res: any = await adminApi.setProvider(provider.id, { status: statusValue, service_radius_km: radius, notes });
            if (isOk(res)) onSaved(res.data.provider);
            else setError(apiError(res, 'Could not save.'));
        } finally {
            setSaving(false);
        }
    };
    const field = { height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: `${theme.textDark}55`, color: theme.text, fontFamily: theme.font.medium } as const;
    return (
        <View style={{ gap: 10 }}>
            <ChoiceChips<ProviderStatus>
                label="Status"
                options={[{ value: 'PENDING', label: 'Pending review' }, { value: 'WHITELISTED', label: 'Whitelisted' }, { value: 'SUSPENDED', label: 'Suspended' }]}
                value={statusValue}
                onChange={setStatusValue}
                hint="Whitelisting needs the company's location and at least one active rider / driver (couriers: an office with a location)."
            />
            {provider.kind === 'DELIVERY_COMPANY' ? (
                <View style={{ gap: 4 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>Service radius (km)</Text>
                    <TextInput value={radius} onChangeText={setRadius} keyboardType="decimal-pad" style={field} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        Its riders / drivers are offered for pickups this close to where they are now (or to the company's base if they haven't shared a location lately).
                    </Text>
                </View>
            ) : (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    The courier keeps its offices and rate charts up to date from its own Deliveries menu.
                </Text>
            )}
            <View style={{ gap: 4 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>Notes</Text>
                <TextInput value={notes} onChangeText={setNotes} multiline style={{ ...field, height: 72, paddingTop: 8 }} />
            </View>
            <SheetButton label="Save" icon="checkmark" onPress={save} loading={saving} />
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
        </View>
    );
}

function AgentSheet({ provider, agent, onClose, onSaved }: { provider: string; agent: ProviderAgent | 'new' | null; onClose: () => void; onSaved: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const a = agent && agent !== 'new' ? agent : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [users, setUsers] = useState<{ id: string; title: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const searchUsers = async (q: string) => {
        setSearching(true);
        try {
            const res: any = await adminApi.searchUsers(q);
            if (isOk(res)) setUsers((res.data.users ?? []).map((u: any) => ({ id: u.id, title: [u.title, u.phone].filter(Boolean).join(' · ') })));
        } finally {
            setSearching(false);
        }
    };
    return (
        <Formik
            key={a?.id ?? (agent ? 'new' : 'closed')}
            initialValues={{
                user: a?.user ?? '',
                mode: (a?.mode ?? 'MOTORBIKE') as DeliveryMode,
                max_weight_kg: a?.max_weight_kg ? String(Number(a.max_weight_kg)) : '',
                vehicle_registration: a?.vehicle_registration ?? '',
                phone: a?.phone ?? '',
                is_active: a ? a.is_active : true,
                is_available: a ? a.is_available : true,
            }}
            validationSchema={Yup.object({
                user: a ? Yup.string() : Yup.string().required('Pick the person'),
                max_weight_kg: Yup.number().typeError('Enter kg').positive().nullable(),
            })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const { user, ...rest } = v;
                    const res: any = await adminApi.saveAgent(provider, { ...(a ? { agent: a.id } : { user }), ...rest });
                    if (isOk(res)) onSaved();
                    else setError(apiError(res, 'Could not save.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet visible={!!agent} onClose={onClose} title={a ? `Edit ${a.name}` : 'Add rider / driver'} icon="person-add-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={560}>
                    <FormSection title="Person" zIndex={30}>
                        {a ? (
                            <CustomTextField label="Name" value={a.name} editable={false} />
                        ) : (
                            <LiveSearchAutocompletePicker
                                name="user"
                                label="Registered user"
                                options={users}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                onSearch={(q) => void searchUsers(q)}
                                loading={searching}
                                placeholder="Type name, phone or email…"
                                loadingPlaceholder="Searching users…"
                                noMatchText="No users found. Register them in Admin Panel → Users first."
                                emptyText="Start typing to search users."
                            />
                        )}
                        <CustomTextField name="phone" label="Work phone" keyboardType="phone-pad" />
                    </FormSection>
                    <FormSection title="How they deliver">
                        <ChoiceChips<DeliveryMode> options={MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))} value={f.values.mode} onChange={(m) => f.setFieldValue('mode', m)} />
                        <FormRow>
                            <CustomTextField name="max_weight_kg" label="Load limit (kg)" keyboardType="decimal-pad" placeholder="mode default" />
                            <CustomTextField name="vehicle_registration" label="Own vehicle reg." autoCapitalize="characters" placeholder="if not a company vehicle" />
                        </FormRow>
                        <SwitchField name="is_available" label="On duty" />
                        <SwitchField name="is_active" label="Active" />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
