// components/deliveries/settings/DeliverySettings.tsx
//
// A seller's (or delivery company's) delivery setup, three tabs:
//   Delivery persons - own staff who deliver (an employee + mode + capacity)
//   Rates            - price per mode: base + per km + per kg (min fee, limits);
//                      buyers are quoted from these, and each leg is paid by them
//   Partners         - outsourced delivery companies and long-haul couriers used
//   Offices          - a courier's offices / collection points (where parcels are
//                      handed over and collected); delivery options route via the
//                      nearest ones, so each needs its GPS location
// Lists use the shared AdminListView; forms the shared AdminFormSheet.

import deliveriesApi, {
    apiError,
    isOk,
    MODE_LABELS,
    type DeliveryAgent,
    type DeliveryMode,
    type DeliveryPartner,
    type DeliveryRate,
    type Office,
} from '@/api/deliveriesApi';
import {
    AdminFormSheet,
    AdminListView,
    ChoiceChips,
    FormSection,
    type AdminListConfig,
    type IconName,
} from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SwitchField } from '@/components/common/SwitchField';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useEmployeesSync } from '@/context/EmployeesSyncContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { Alert, Platform, useWindowDimensions, View } from 'react-native';
import { SheetButton } from '@/components/common/listScreen';
import * as Yup from 'yup';

type Tab = 'AGENTS' | 'RATES' | 'PARTNERS' | 'OFFICES';

const LOCAL_MODES: DeliveryMode[] = ['FOOT', 'BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK'];
const MODE_ICONS: Record<DeliveryMode, IconName> = {
    FOOT: 'walk-outline',
    BICYCLE: 'bicycle-outline',
    MOTORBIKE: 'speedometer-outline',
    CAR: 'car-outline',
    VAN: 'bus-outline',
    TRUCK: 'cube-outline',
    COURIER: 'airplane-outline',
};
const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

/* ------------------------------------------------------------------ list configs */

const agentsConfig: AdminListConfig<DeliveryAgent> = {
    title: 'Delivery persons',
    noun: ['delivery person', 'delivery persons'],
    icon: 'bicycle-outline',
    searchPlaceholder: 'Search name, phone, vehicle…',
    addLabel: 'Add delivery person',
    emptyMessage: 'Add the staff who deliver orders, with how they travel.',
    keyOf: (a, i) => `${a.id}-${i}`,
    titleOf: (a) => a.name,
    subtitleOf: (a) => [MODE_LABELS[a.mode], a.vehicle_registration, a.phone].filter(Boolean).join(' · '),
    avatarOf: (a) => ({ label: a.name }),
    badgesOf: (a) => [
        { label: MODE_LABELS[a.mode], tone: 'info', icon: MODE_ICONS[a.mode] },
        a.is_active ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' },
    ],
    primaryColumn: { label: 'Delivery person', flex: 2.4 },
    columns: [
        { key: 'mode', label: 'Travels by', flex: 1.3, render: (a) => MODE_LABELS[a.mode] },
        { key: 'cap', label: 'Max load', flex: 1, render: (a) => (a.max_weight_kg ? `${Number(a.max_weight_kg)} kg` : '—') },
        { key: 'phone', label: 'Phone', flex: 1.3, render: (a) => a.phone || '—' },
        { key: 'status', label: 'Status', flex: 1, render: (a) => (a.is_active ? 'Active' : 'Inactive') },
    ],
};

const ratesConfig: AdminListConfig<DeliveryRate> = {
    title: 'Delivery rates',
    noun: ['rate', 'rates'],
    icon: 'pricetags-outline',
    searchPlaceholder: 'Search mode…',
    addLabel: 'Add rate',
    emptyMessage: 'Set a price per way of travel. Buyers are quoted from these.',
    keyOf: (r, i) => `${r.id}-${i}`,
    titleOf: (r) => MODE_LABELS[r.mode],
    subtitleOf: (r) => `${kes(r.base_fee)} + ${kes(r.rate_per_km)}/km + ${kes(r.rate_per_kg)}/kg`,
    avatarOf: (r) => ({ label: MODE_LABELS[r.mode] }),
    badgesOf: (r) => [r.is_active ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' }],
    primaryColumn: { label: 'Way of travel', flex: 1.6 },
    columns: [
        { key: 'base', label: 'Base fee', flex: 1, align: 'right', render: (r) => kes(r.base_fee) },
        { key: 'km', label: 'Per km', flex: 1, align: 'right', render: (r) => kes(r.rate_per_km) },
        { key: 'kg', label: 'Per kg', flex: 1, align: 'right', render: (r) => kes(r.rate_per_kg) },
        { key: 'min', label: 'Minimum', flex: 1, align: 'right', render: (r) => kes(r.min_fee) },
        { key: 'limits', label: 'Limits', flex: 1.3, render: (r) => [r.max_distance_km ? `${Number(r.max_distance_km)} km` : '', r.max_weight_kg ? `${Number(r.max_weight_kg)} kg` : ''].filter(Boolean).join(' · ') || '—' },
    ],
};

const partnersConfig: AdminListConfig<DeliveryPartner> = {
    title: 'Delivery partners',
    noun: ['partner', 'partners'],
    icon: 'business-outline',
    searchPlaceholder: 'Search partners…',
    addLabel: 'Add partner',
    emptyMessage: 'Add the delivery companies and couriers (e.g. Postal Corporation of Kenya) you send orders with.',
    keyOf: (p, i) => `${p.id}-${i}`,
    titleOf: (p) => p.partner_title,
    subtitleOf: (p) => (p.kind === 'COURIER' ? 'Long-haul courier' : 'Delivery company'),
    avatarOf: (p) => ({ label: p.partner_title }),
    badgesOf: (p) => [
        p.kind === 'COURIER' ? { label: 'Courier', tone: 'violet', icon: 'airplane-outline' } : { label: 'Delivery company', tone: 'info', icon: 'bicycle-outline' },
        p.is_active ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' },
    ],
    primaryColumn: { label: 'Partner', flex: 2.4 },
    columns: [
        { key: 'kind', label: 'Type', flex: 1.4, render: (p) => (p.kind === 'COURIER' ? 'Long-haul courier' : 'Delivery company') },
        { key: 'status', label: 'Status', flex: 1, render: (p) => (p.is_active ? 'Active' : 'Inactive') },
    ],
};

const OFFICE_TYPES: { value: Office['point_type']; label: string; icon: IconName }[] = [
    { value: 'POST_OFFICE', label: 'Post office', icon: 'mail-outline' },
    { value: 'COURIER_DEPOT', label: 'Courier depot', icon: 'cube-outline' },
    { value: 'MTAANI_AGENT', label: 'Agent point', icon: 'storefront-outline' },
    { value: 'RETAILER_HUB', label: 'Pickup hub', icon: 'business-outline' },
    { value: 'OTHER', label: 'Other', icon: 'location-outline' },
];
const officeTypeLabel = (t: string) => OFFICE_TYPES.find((o) => o.value === t)?.label ?? t;

const officesConfig: AdminListConfig<Office> = {
    title: 'Offices',
    noun: ['office', 'offices'],
    icon: 'location-outline',
    searchPlaceholder: 'Search offices, county…',
    addLabel: 'Add office',
    emptyMessage: 'Couriers: add each office where parcels are handed over and collected, with its location.',
    keyOf: (o, i) => `${o.id}-${i}`,
    titleOf: (o) => o.title,
    subtitleOf: (o) => [officeTypeLabel(o.point_type), o.county_title, o.physical_address].filter(Boolean).join(' · '),
    avatarOf: (o) => ({ label: o.title }),
    badgesOf: (o) => [
        o.latitude != null ? { label: 'Located', tone: 'success', icon: 'location' } : { label: 'No location', tone: 'warning', icon: 'alert-circle' },
        o.is_active ? { label: 'Active', tone: 'success', icon: 'ellipse' } : { label: 'Inactive', tone: 'neutral' },
    ],
    primaryColumn: { label: 'Office', flex: 2.4 },
    columns: [
        { key: 'type', label: 'Kind', flex: 1.2, render: (o) => officeTypeLabel(o.point_type) },
        { key: 'county', label: 'County', flex: 1.2, render: (o) => o.county_title || '—' },
        { key: 'phone', label: 'Phone', flex: 1.2, render: (o) => o.phone_number || '—' },
        { key: 'status', label: 'Status', flex: 1, render: (o) => (o.is_active ? 'Active' : 'Inactive') },
    ],
};

/* ------------------------------------------------------------------ screen */

export default function DeliverySettings() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();

    const [tab, setTab] = useState<Tab>('AGENTS');
    const [agents, setAgents] = useState<DeliveryAgent[]>([]);
    const [rates, setRates] = useState<DeliveryRate[]>([]);
    const [partners, setPartners] = useState<DeliveryPartner[]>([]);
    const [offices, setOffices] = useState<Office[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [editing, setEditing] = useState<any | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const [a, r, p, o]: any[] = await Promise.all([
                deliveriesApi.getDeliveryAgents(),
                deliveriesApi.getDeliveryRates(),
                deliveriesApi.getDeliveryPartners(),
                deliveriesApi.getMyOffices(),
            ]);
            if (isOk(a)) setAgents(a.data.agents ?? []);
            if (isOk(r)) setRates(r.data.rates ?? []);
            if (isOk(p)) setPartners(p.data.partners ?? []);
            if (isOk(o)) setOffices(o.data.offices ?? []);
            const failed = [a, r, p, o].find((x) => !isOk(x));
            if (failed) setError(apiError(failed, 'Could not load delivery settings.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );
    useEffect(() => {
        setQuery('');
        setPage(1);
    }, [tab]);

    const source: any[] = tab === 'AGENTS' ? agents : tab === 'RATES' ? rates : tab === 'PARTNERS' ? partners : offices;
    const config: AdminListConfig<any> =
        tab === 'AGENTS' ? agentsConfig : tab === 'RATES' ? ratesConfig : tab === 'PARTNERS' ? partnersConfig : officesConfig;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return source;
        return source.filter((x) => [config.titleOf(x), config.subtitleOf?.(x)].filter(Boolean).join(' ').toLowerCase().includes(q));
    }, [source, query, config]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const pageStart = (Math.min(page, totalPages) - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const openForm = (item: any | null) => {
        setEditing(item);
        setFormError(null);
        setFormOpen(true);
    };

    const save = async (details: Record<string, any>) => {
        setSaving(true);
        setFormError(null);
        try {
            const body = editing ? { ...details, id: editing.id } : details;
            const res: any =
                tab === 'AGENTS'
                    ? await deliveriesApi.saveDeliveryAgent(body)
                    : tab === 'RATES'
                        ? await deliveriesApi.saveDeliveryRate(body)
                        : tab === 'PARTNERS'
                            ? await deliveriesApi.saveDeliveryPartner(body)
                            : await deliveriesApi.saveOffice(body);
            if (isOk(res)) {
                setFormOpen(false);
                setEditing(null);
                alert('Saved', 'Delivery settings updated.', undefined, 'success');
                void load();
            } else setFormError(apiError(res, 'Could not save.'));
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const formProps = { visible: formOpen, onClose: () => !saving && setFormOpen(false), initial: editing, saving, error: formError, onSave: save };

    return (
        <View style={{ flex: 1 }}>
            <AdminListView<any, Tab>
                variant={isLarge ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={error ? 'Not loaded' : 'Server'}
                sourceTone={error ? 'none' : 'server'}
                error={error}
                items={filtered.slice(pageStart, pageEnd)}
                allItems={filtered}
                onOpenCreate={() => openForm(null)}
                onPressItem={openForm}
                onEditItem={openForm}
                stats={[
                    { label: 'Delivery persons', value: String(agents.filter((a) => a.is_active).length) },
                    { label: 'Rates', value: String(rates.filter((r) => r.is_active).length) },
                    { label: 'Partners', value: String(partners.filter((p) => p.is_active).length) },
                ]}
                filters={{
                    options: [
                        { key: 'AGENTS', label: 'Delivery persons', icon: 'bicycle-outline', count: agents.length },
                        { key: 'RATES', label: 'Rates', icon: 'pricetags-outline', count: rates.length },
                        { key: 'PARTNERS', label: 'Partners', icon: 'business-outline', count: partners.length },
                        { key: 'OFFICES', label: 'Offices', icon: 'location-outline', count: offices.length },
                    ],
                    value: tab,
                    onChange: setTab,
                    allKey: 'AGENTS',
                }}
                page={Math.min(page, totalPages)}
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
            {tab === 'AGENTS' ? (
                <AgentForm {...formProps} />
            ) : tab === 'RATES' ? (
                <RateForm {...formProps} takenModes={rates.map((r) => r.mode)} />
            ) : tab === 'PARTNERS' ? (
                <PartnerForm {...formProps} />
            ) : (
                <OfficeForm {...formProps} />
            )}
        </View>
    );
}

/* ------------------------------------------------------------------ forms */

interface FormProps<T> {
    visible: boolean;
    onClose: () => void;
    initial: T | null;
    saving: boolean;
    error: string | null;
    onSave: (details: Record<string, any>) => Promise<void>;
}

const modeOptions = (modes: DeliveryMode[]) => modes.map((m) => ({ value: m, label: MODE_LABELS[m], icon: MODE_ICONS[m] }));

function AgentForm({ visible, onClose, initial, saving, error, onSave }: FormProps<DeliveryAgent>) {
    const { theme, isDarkMode } = useAuth();
    const { employeesList, forceEmployeesRefresh } = useEmployeesSync();
    useEffect(() => {
        if (visible && employeesList.length === 0) void forceEmployeesRefresh();
    }, [visible, employeesList.length, forceEmployeesRefresh]);
    const employeeOptions = useMemo(
        () => employeesList.filter((e) => e.user_id).map((e) => ({ id: String(e.user_id), title: e.title || 'Employee' })),
        [employeesList],
    );
    /** The employee's phone on file (pre-fills the delivery person's phone; still editable). */
    const phoneOf = (userId: string) => {
        const e: any = employeesList.find((x) => String(x.user_id) === String(userId));
        const p = String(e?.phone ?? '').trim();
        return p && p !== 'None' ? p : '';
    };

    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                user: initial?.user ?? '',
                mode: (initial?.mode ?? 'MOTORBIKE') as DeliveryMode,
                max_weight_kg: initial?.max_weight_kg ? String(Number(initial.max_weight_kg)) : '',
                vehicle_registration: initial?.vehicle_registration ?? '',
                phone: initial?.phone ?? '',
                is_active: initial?.is_active ?? true,
            }}
            validationSchema={Yup.object({ user: Yup.string().required('Pick the employee who delivers') })}
            onSubmit={(v) =>
                onSave({
                    ...(initial ? {} : { user: v.user }),
                    mode: v.mode,
                    max_weight_kg: num(v.max_weight_kg),
                    vehicle_registration: v.vehicle_registration.trim() || null,
                    phone: v.phone.trim() || null,
                    is_active: v.is_active,
                })
            }
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit delivery person' : 'New delivery person'}
                    subtitle={initial?.name ?? 'One of your employees who delivers'}
                    icon="bicycle-outline"
                    submitLabel={initial ? 'Save changes' : 'Add'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Who" zIndex={20}>
                        {initial ? (
                            <CustomTextField label="Employee" value={initial.name} editable={false} />
                        ) : (
                            <CustomAutocompletePicker
                                name="user"
                                label="Employee"
                                options={employeeOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                placeholder="Search employees…"
                                emptyText="No employees yet. Add the person under Employees first."
                                // The list opens inline so it never covers the Phone field below.
                                inline
                                onAfterSelect={(id) => {
                                    if (!f.values.phone.trim()) f.setFieldValue('phone', phoneOf(id));
                                }}
                            />
                        )}
                        <CustomTextField
                            name="phone"
                            label="Phone"
                            placeholder="e.g. 0712345678"
                            keyboardType="phone-pad"
                            inputMode="tel"
                            autoComplete="tel"
                            editable
                            hint="Customers and your team call this number about deliveries."
                        />
                    </FormSection>
                    <FormSection title="How they travel" hint="Delivery options offer this mode; it is priced by your rate for it.">
                        <ChoiceChips<DeliveryMode> options={modeOptions(LOCAL_MODES)} value={f.values.mode} onChange={(m) => f.setFieldValue('mode', m)} />
                        <CustomTextField name="max_weight_kg" label="Most they can carry (kg)" placeholder="Optional" keyboardType="decimal-pad" />
                        <CustomTextField name="vehicle_registration" label="Vehicle registration" placeholder="Optional" autoCapitalize="characters" />
                        <SwitchField name="is_active" label="Active" hint="Only active delivery persons can be offered and assigned." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

function RateForm({ visible, onClose, initial, saving, error, onSave, takenModes }: FormProps<DeliveryRate> & { takenModes: DeliveryMode[] }) {
    const free = [...LOCAL_MODES, 'COURIER' as DeliveryMode].filter((m) => m === initial?.mode || !takenModes.includes(m));
    const money = Yup.number().typeError('Enter a number').min(0, "Can't be negative");
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                mode: (initial?.mode ?? free[0] ?? 'MOTORBIKE') as DeliveryMode,
                base_fee: initial ? String(Number(initial.base_fee)) : '',
                rate_per_km: initial ? String(Number(initial.rate_per_km)) : '',
                rate_per_kg: initial ? String(Number(initial.rate_per_kg)) : '0',
                min_fee: initial ? String(Number(initial.min_fee)) : '0',
                max_distance_km: initial?.max_distance_km ? String(Number(initial.max_distance_km)) : '',
                max_weight_kg: initial?.max_weight_kg ? String(Number(initial.max_weight_kg)) : '',
                is_active: initial?.is_active ?? true,
            }}
            validationSchema={Yup.object({
                base_fee: money.required('Enter the base fee'),
                rate_per_km: money.required('Enter the price per km'),
                rate_per_kg: money,
                min_fee: money,
            })}
            onSubmit={(v) =>
                onSave({
                    mode: v.mode,
                    base_fee: num(v.base_fee),
                    rate_per_km: num(v.rate_per_km),
                    rate_per_kg: num(v.rate_per_kg) ?? 0,
                    min_fee: num(v.min_fee) ?? 0,
                    max_distance_km: num(v.max_distance_km),
                    max_weight_kg: num(v.max_weight_kg),
                    is_active: v.is_active,
                })
            }
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? `Edit ${MODE_LABELS[initial.mode].toLowerCase()} rate` : 'New delivery rate'}
                    subtitle="cost = base fee + per km × distance + per kg × weight (never below the minimum)"
                    icon="pricetags-outline"
                    submitLabel={initial ? 'Save changes' : 'Add rate'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Way of travel" hint="Courier: what a long-haul leg costs when you are the courier.">
                        <ChoiceChips<DeliveryMode>
                            options={modeOptions(initial ? [initial.mode] : free)}
                            value={f.values.mode}
                            onChange={(m) => f.setFieldValue('mode', m)}
                        />
                    </FormSection>
                    <FormSection title="Price (KES)">
                        <CustomTextField name="base_fee" label="Base fee" required keyboardType="decimal-pad" placeholder="e.g. 100" />
                        <CustomTextField name="rate_per_km" label="Per km" required keyboardType="decimal-pad" placeholder="e.g. 40" />
                        <CustomTextField name="rate_per_kg" label="Per kg" keyboardType="decimal-pad" placeholder="e.g. 20" />
                        <CustomTextField name="min_fee" label="Minimum fee" keyboardType="decimal-pad" placeholder="e.g. 150" />
                    </FormSection>
                    <FormSection title="Limits" hint="Leave blank for no limit. Options beyond a limit aren't offered.">
                        <CustomTextField name="max_distance_km" label="Furthest (km)" keyboardType="decimal-pad" placeholder="Optional" />
                        <CustomTextField name="max_weight_kg" label="Heaviest (kg)" keyboardType="decimal-pad" placeholder="Optional" />
                        <SwitchField name="is_active" label="Active" />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

function PartnerForm({ visible, onClose, initial, saving, error, onSave }: FormProps<DeliveryPartner>) {
    const { theme, isDarkMode } = useAuth();
    const { entitiesList, forceEntitiesRefresh, isEntitiesSyncing } = useEntitiesSync();
    useEffect(() => {
        if (visible && entitiesList.length === 0) void forceEntitiesRefresh();
    }, [visible, entitiesList.length, forceEntitiesRefresh]);
    const optionsFor = useCallback(
        (kind: 'COURIER' | 'DELIVERY_COMPANY') =>
            entitiesList
                .filter((e) => e.remote_id && e.entity_type === (kind === 'COURIER' ? 'Courier' : 'Delivery'))
                .map((e) => ({ id: String(e.remote_id), title: (e as any).title || 'Unnamed' })),
        [entitiesList],
    );

    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                kind: (initial?.kind ?? 'COURIER') as 'COURIER' | 'DELIVERY_COMPANY',
                partner: initial?.partner ?? '',
                is_active: initial?.is_active ?? true,
            }}
            validationSchema={Yup.object({ partner: Yup.string().required('Pick the company') })}
            onSubmit={(v) => onSave({ kind: v.kind, partner: v.partner, is_active: v.is_active })}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit partner' : 'New delivery partner'}
                    subtitle={initial?.partner_title ?? 'An outsourced delivery company or courier'}
                    icon="business-outline"
                    submitLabel={initial ? 'Save changes' : 'Add partner'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Partner" zIndex={20}>
                        <ChoiceChips<'COURIER' | 'DELIVERY_COMPANY'>
                            label="Type"
                            options={[
                                { value: 'COURIER', label: 'Long-haul courier', icon: 'airplane-outline' },
                                { value: 'DELIVERY_COMPANY', label: 'Delivery company', icon: 'bicycle-outline' },
                            ]}
                            value={f.values.kind}
                            onChange={(k) => {
                                f.setFieldValue('kind', k);
                                if (!initial) f.setFieldValue('partner', '');
                            }}
                            disabled={!!initial}
                        />
                        {initial ? (
                            <CustomTextField label="Company" value={initial.partner_title} editable={false} />
                        ) : (
                            <CustomAutocompletePicker
                                key={f.values.kind}
                                name="partner"
                                label={f.values.kind === 'COURIER' ? 'Courier' : 'Delivery company'}
                                options={optionsFor(f.values.kind)}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={isEntitiesSyncing}
                                placeholder="Search…"
                                emptyText={f.values.kind === 'COURIER' ? 'No couriers registered yet.' : 'No delivery companies registered yet.'}
                            />
                        )}
                        <SwitchField name="is_active" label="Active" hint="Active partners appear in buyers' delivery options." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

function OfficeForm({ visible, onClose, initial, saving, error, onSave }: FormProps<Office>) {
    const { theme, isDarkMode } = useAuth();
    const { countiesRaw } = useEntitiesSync();
    const [locating, setLocating] = useState(false);
    const countyOptions = useMemo(() => (countiesRaw ?? []).map((c) => ({ id: String(c.id), title: c.title })), [countiesRaw]);

    const coord = Yup.number().typeError('Enter a number');
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initial?.title ?? '',
                point_type: (initial?.point_type ?? 'POST_OFFICE') as Office['point_type'],
                county: initial?.county ?? '',
                code: initial?.code ?? '',
                physical_address: initial?.physical_address ?? '',
                landmark: initial?.landmark ?? '',
                phone_number: initial?.phone_number ?? '',
                latitude: initial?.latitude != null ? String(initial.latitude) : '',
                longitude: initial?.longitude != null ? String(initial.longitude) : '',
                is_active: initial?.is_active ?? true,
            }}
            validationSchema={Yup.object({
                title: Yup.string().trim().required('Enter the office name'),
                county: Yup.string().required('Pick the county'),
                latitude: coord.required('Set the location').min(-90).max(90),
                longitude: coord.required('Set the location').min(-180).max(180),
            })}
            onSubmit={(v) =>
                onSave({
                    title: v.title.trim(),
                    point_type: v.point_type,
                    county: v.county,
                    code: v.code.trim(),
                    physical_address: v.physical_address.trim(),
                    landmark: v.landmark.trim(),
                    phone_number: v.phone_number.trim(),
                    latitude: Number(v.latitude),
                    longitude: Number(v.longitude),
                    is_active: v.is_active,
                })
            }
        >
            {(f) => {
                // Capture the device's position (stand at the office when you do this).
                const useHere = async () => {
                    setLocating(true);
                    try {
                        if (Platform.OS === 'web') {
                            await new Promise<void>((resolve) =>
                                navigator.geolocation.getCurrentPosition(
                                    (pos) => {
                                        f.setFieldValue('latitude', String(pos.coords.latitude));
                                        f.setFieldValue('longitude', String(pos.coords.longitude));
                                        resolve();
                                    },
                                    () => {
                                        window.alert('Could not get your location. Allow location access and try again.');
                                        resolve();
                                    },
                                    { enableHighAccuracy: true, timeout: 15000 },
                                ),
                            );
                        } else {
                            const { status } = await Location.requestForegroundPermissionsAsync();
                            if (status !== 'granted') {
                                Alert.alert('Location permission needed', 'Allow location access to set the office location.');
                                return;
                            }
                            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                            f.setFieldValue('latitude', String(loc.coords.latitude));
                            f.setFieldValue('longitude', String(loc.coords.longitude));
                        }
                    } catch {
                        Alert.alert('Could not get location', 'Make sure location is turned on and try again.');
                    } finally {
                        setLocating(false);
                    }
                };
                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={initial ? 'Edit office' : 'New office'}
                        subtitle={initial?.title ?? 'Where parcels are handed over and collected'}
                        icon="location-outline"
                        submitLabel={initial ? 'Save changes' : 'Add office'}
                        submitting={saving}
                        error={error}
                        onSubmit={() => f.handleSubmit()}
                    >
                        <FormSection title="Office" zIndex={20}>
                            <CustomTextField name="title" label="Name" required placeholder="e.g. Nakuru Post Office" />
                            <ChoiceChips<Office['point_type']> label="Kind" options={OFFICE_TYPES} value={f.values.point_type} onChange={(t) => f.setFieldValue('point_type', t)} />
                            <CustomAutocompletePicker
                                name="county"
                                label="County"
                                options={countyOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                placeholder="Search counties…"
                                initialTitle={initial?.county_title ?? undefined}
                            />
                            <CustomTextField name="code" label="Postal / office code" placeholder="Optional, e.g. 20100" />
                        </FormSection>
                        <FormSection title="Location" hint="Delivery options route parcels through the nearest offices, so this must be accurate.">
                            <SheetButton label="Use my current location" variant="secondary" icon="locate-outline" onPress={useHere} loading={locating} loadingLabel="Locating…" grow />
                            <CustomTextField name="latitude" label="Latitude" required keyboardType="numbers-and-punctuation" placeholder="-1.2921" />
                            <CustomTextField name="longitude" label="Longitude" required keyboardType="numbers-and-punctuation" placeholder="36.8219" />
                            <CustomTextField name="physical_address" label="Address" placeholder="Optional" />
                            <CustomTextField name="landmark" label="Landmark" placeholder="Optional" />
                            <CustomTextField name="phone_number" label="Phone" keyboardType="phone-pad" placeholder="Optional" />
                            <SwitchField name="is_active" label="Active" hint="Inactive offices aren't used for new deliveries." />
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
