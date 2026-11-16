// components/wifi/WifiManager.tsx
//
// Wi-Fi hotspot business (entity type InternetServiceProvider). One component, one
// route per model (app/(hotspots)/wifiRouters, wifiTarrifs, wifiSubscriptions,
// wifiPayments), each with full CRUD:
//   Routers        hotspots (IP, NAS id, brand / model, contact) — add / edit / switch off
//   Packages       what customers buy: price for a length of time on a router
//   Subscriptions  who is connected, until when
//   Payments       M-Pesa payments for packages
// Shared list kit (cards on phones, table on wide screens), details beside the
// list on wide screens, each list kept on the device for offline viewing.

import { apiError, isOk } from '@/api/deliveriesApi';
import wifiApi, { DURATION_LABELS, isManualPayment, lengthLabel, type Duration, type WifiPayment, type WifiRouter, type WifiSubscription, type WifiTariff } from '@/api/wifiApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import {
    AdminFormSheet,
    AdminListView,
    ChoiceChips,
    ConfigDetailsSheet,
    DetailsDock,
    formatDateTime,
    FormRow,
    FormSection,
    SheetButton,
    type AdminListConfig,
    type BadgeTone,
} from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { SwitchField } from '@/components/common/SwitchField';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import { Formik } from 'formik';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

export type WifiTab = 'ROUTERS' | 'PACKAGES' | 'SUBSCRIPTIONS' | 'PAYMENTS';
type Tab = WifiTab;

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const on = (v?: string) => String(v ?? 'true').toLowerCase() === 'true';
const when = (v?: string | null) => (v ? formatDateTime(v) : '—');
const rows = (d: any) => (Array.isArray(d) ? d : d?.results ?? []);

const PAY_TONE: Record<string, BadgeTone> = { SUCCESS: 'success', PENDING: 'warning', FAILED: 'danger', CANCELLED: 'neutral' };
const PAY_LABEL: Record<string, string> = { SUCCESS: 'Received', PENDING: 'Pending', FAILED: 'Failed', CANCELLED: 'Cancelled' };

const routersConfig: AdminListConfig<WifiRouter> = {
    title: 'Routers',
    noun: ['router', 'routers'],
    icon: 'wifi-outline',
    searchPlaceholder: 'Search name, IP, NAS id…',
    addLabel: 'Add router',
    emptyMessage: 'Add the routers (hotspots) customers connect to.',
    keyOf: (r) => r.id,
    titleOf: (r) => r.title,
    subtitleOf: (r) => [r.router_ip, r.brand && `${r.brand} ${r.model ?? ''}`.trim()].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'wifi-outline' }),
    badgesOf: (r) => [on(r.is_active) ? { label: 'Online', tone: 'success' } : { label: 'Off', tone: 'neutral' }],
    metaOf: (r) => (r.nas_id ? `NAS ${r.nas_id}` : null),
    metaIcon: 'hardware-chip-outline',
    primaryColumn: { label: 'Router', flex: 1.8 },
    columns: [
        { key: 'ip', label: 'IP address', flex: 1.1, render: (r) => r.router_ip || '—' },
        { key: 'nas', label: 'NAS id', flex: 1, render: (r) => r.nas_id || '—' },
        { key: 'device', label: 'Device', flex: 1.3, render: (r) => `${r.brand ?? ''} ${r.model ?? ''}`.trim() || '—' },
        { key: 'contact', label: 'Contact', flex: 1, render: (r) => r.contact || '—' },
        { key: 'status', label: 'Status', flex: 0.7, render: (r) => (on(r.is_active) ? 'Online' : 'Off') },
    ],
};

const packagesConfig: AdminListConfig<WifiTariff> = {
    title: 'Packages',
    noun: ['package', 'packages'],
    icon: 'pricetags-outline',
    searchPlaceholder: 'Search packages…',
    addLabel: 'Add package',
    emptyMessage: 'Add what customers can buy, e.g. 1 hour for KES 20 or 1 day for KES 50.',
    keyOf: (t) => t.id,
    titleOf: (t) => t.title,
    subtitleOf: (t) => [lengthLabel(t), t.router_title].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'time-outline' }),
    badgesOf: (t) => [on(t.is_active) ? { label: 'On sale', tone: 'success' } : { label: 'Off', tone: 'neutral' }],
    metricOf: (t) => ({ value: kes(t.price), label: `for ${lengthLabel(t)}` }),
    primaryColumn: { label: 'Package', flex: 1.6 },
    columns: [
        { key: 'length', label: 'Time', flex: 1, render: lengthLabel },
        { key: 'router', label: 'Router', flex: 1.3, render: (t) => t.router_title || 'Any' },
        { key: 'status', label: 'Status', flex: 0.8, render: (t) => (on(t.is_active) ? 'On sale' : 'Off') },
        { key: 'price', label: 'Price', flex: 0.9, align: 'right', render: (t) => kes(t.price) },
    ],
};

const subsConfig: AdminListConfig<WifiSubscription> = {
    title: 'Subscriptions',
    noun: ['subscription', 'subscriptions'],
    icon: 'people-outline',
    searchPlaceholder: 'Search device, username…',
    addLabel: 'Add subscription',
    emptyMessage: 'Customers who buy a package appear here. You can also connect a device by hand.',
    keyOf: (s) => s.id,
    titleOf: (s) => s.username || s.mac_address || 'Device',
    subtitleOf: (s) => [s.mac_address, `until ${when(s.valid_to)}`].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'phone-portrait-outline' }),
    badgesOf: (s) => [on(s.is_active) ? { label: 'Connected', tone: 'success' } : { label: 'Expired', tone: 'neutral' }],
    metaOf: (s) => `From ${when(s.valid_from)}`,
    metaIcon: 'time-outline',
    primaryColumn: { label: 'Customer', flex: 1.6 },
    columns: [
        { key: 'mac', label: 'Device (MAC)', flex: 1.4, render: (s) => s.mac_address || '—' },
        { key: 'from', label: 'From', flex: 1.2, render: (s) => when(s.valid_from) },
        { key: 'to', label: 'Until', flex: 1.2, render: (s) => when(s.valid_to) },
        { key: 'status', label: 'Status', flex: 0.8, render: (s) => (on(s.is_active) ? 'Connected' : 'Expired') },
    ],
};

const paymentsConfig: AdminListConfig<WifiPayment> = {
    title: 'Payments',
    noun: ['payment', 'payments'],
    icon: 'wallet-outline',
    searchPlaceholder: 'Search package, account, M-Pesa code…',
    addLabel: 'Record payment',
    emptyMessage: 'M-Pesa package payments appear here. Record cash payments by hand.',
    keyOf: (p) => p.id,
    titleOf: (p) => p.tariff_title || 'Package',
    subtitleOf: (p) => [p.account, p.provider_reference_number || p.reference_number].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'phone-portrait-outline' }),
    badgesOf: (p) => [{ label: PAY_LABEL[p.status] ?? p.status, tone: PAY_TONE[p.status] ?? 'neutral' }],
    metaOf: (p) => when(p.created),
    metaIcon: 'time-outline',
    metricOf: (p) => ({ value: kes(p.amount), label: p.telco || 'M-Pesa', color: p.status === 'SUCCESS' ? '#10b981' : undefined }),
    primaryColumn: { label: 'Package', flex: 1.4 },
    columns: [
        { key: 'account', label: 'Paid from', flex: 1.1, render: (p) => p.account || '—' },
        { key: 'ref', label: 'Reference', flex: 1.3, render: (p) => p.provider_reference_number || p.reference_number || '—' },
        { key: 'status', label: 'Status', flex: 0.8, render: (p) => PAY_LABEL[p.status] ?? p.status },
        { key: 'when', label: 'When', flex: 1.2, render: (p) => when(p.created) },
        { key: 'amount', label: 'Amount', flex: 0.9, align: 'right', render: (p) => kes(p.amount) },
    ],
};

export default function WifiManager({ tab }: { tab: Tab }) {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<any | null>(null);
    const [editing, setEditing] = useState<any | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Only what this screen needs: its own list, plus routers (for packages) or packages (for subscriptions / payments).
    const routers = useCachedList<WifiRouter>({ key: 'wifi_routers', fetch: wifiApi.routers, pick: rows, enabled: tab === 'ROUTERS' || tab === 'PACKAGES' });
    const tariffs = useCachedList<WifiTariff>({ key: 'wifi_tariffs', fetch: wifiApi.tariffs, pick: rows, enabled: tab !== 'ROUTERS' });
    const subs = useCachedList<WifiSubscription>({ key: 'wifi_subscriptions', fetch: wifiApi.subscriptions, pick: rows, pollMs: 60000, enabled: tab === 'SUBSCRIPTIONS' });
    const pays = useCachedList<WifiPayment>({ key: 'wifi_payments', fetch: wifiApi.payments, pick: rows, pollMs: 60000, enabled: tab === 'PAYMENTS' });

    const list: any = tab === 'ROUTERS' ? routers : tab === 'PACKAGES' ? tariffs : tab === 'SUBSCRIPTIONS' ? subs : pays;
    const config: AdminListConfig<any> = tab === 'ROUTERS' ? routersConfig : tab === 'PACKAGES' ? packagesConfig : tab === 'SUBSCRIPTIONS' ? subsConfig : paymentsConfig;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const items: any[] = list.items;
        return q ? items.filter((x) => [config.titleOf(x), config.subtitleOf?.(x)].filter(Boolean).join(' ').toLowerCase().includes(q)) : items;
    }, [list.items, query, config]);
    const paged = usePaged(filtered, `${tab}|${query}`);

    const editable = (x: any | null) => tab !== 'PAYMENTS' || !x || isManualPayment(x);
    const openForm = (item: any | null) => {
        if (!list.isOnline) return alert('You’re offline', 'Changes need an internet connection.');
        setViewing(null);
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
                tab === 'ROUTERS'
                    ? await (editing ? wifiApi.updateRouter(body) : wifiApi.createRouter(body))
                    : tab === 'PACKAGES'
                      ? await (editing ? wifiApi.updateTariff(body) : wifiApi.createTariff(body))
                      : tab === 'SUBSCRIPTIONS'
                        ? await (editing ? wifiApi.updateSubscription(body) : wifiApi.createSubscription(body))
                        : await (editing ? wifiApi.updatePayment(body) : wifiApi.createPayment(body));
            if (!isOk(res)) return setFormError(apiError(res, 'Could not save.'));
            setFormOpen(false);
            setEditing(null);
            await list.refresh();
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    /** Delete the open record (after confirming). */
    const remove = (x: any) => {
        const noun = config.noun[0];
        const what = config.titleOf(x);
        const warn: Record<Tab, string> = {
            ROUTERS: 'Packages on it must be deleted first.',
            PACKAGES: 'Customers can no longer buy it.',
            SUBSCRIPTIONS: 'The device loses its connection record.',
            PAYMENTS: 'Only payments you recorded can be deleted.',
        };
        alert(`Delete ${noun}`, `Delete “${what}”? ${warn[tab]}`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const fn = tab === 'ROUTERS' ? wifiApi.deleteRouter : tab === 'PACKAGES' ? wifiApi.deleteTariff : tab === 'SUBSCRIPTIONS' ? wifiApi.deleteSubscription : wifiApi.deletePayment;
                    const res: any = await fn(x.id).catch(() => null);
                    if (isOk(res)) {
                        setViewing(null);
                        list.patch((items: any[]) => items.filter((i) => i.id !== x.id));
                    } else alert('Not deleted', apiError(res, `Could not delete the ${noun}.`), undefined, 'danger');
                },
            },
        ], 'danger');
    };

    const live = (s: WifiSubscription) => on(s.is_active);
    const today = new Date().toDateString();
    const received = pays.items.filter((p) => p.status === 'SUCCESS');
    const stats =
        tab === 'ROUTERS'
            ? [{ label: 'Online', value: String(routers.items.filter((r) => on(r.is_active)).length) }, { label: 'Routers', value: String(routers.items.length) }]
            : tab === 'PACKAGES'
              ? [{ label: 'On sale', value: String(tariffs.items.filter((t) => on(t.is_active)).length) }, { label: 'Packages', value: String(tariffs.items.length) }]
              : tab === 'SUBSCRIPTIONS'
                ? [{ label: 'Connected', value: String(subs.items.filter(live).length), color: '#10b981' }, { label: 'All time', value: String(subs.items.length) }]
                : [
                      { label: 'Today', value: kes(received.filter((p) => new Date(p.created).toDateString() === today).reduce((s, p) => s + Number(p.amount || 0), 0)), color: '#10b981' },
                      { label: 'All received', value: kes(received.reduce((s, p) => s + Number(p.amount || 0), 0)) },
                  ];

    return (
        <View style={{ flex: 1 }}>
            <DetailsDock
                placeholder="Pick an item to see its details here."
                pane={
                    <ConfigDetailsSheet
                        config={config}
                        item={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={viewing && editable(viewing) ? (x) => openForm(x) : undefined}
                        actions={viewing && editable(viewing) ? <DeleteButton onPress={() => remove(viewing)} /> : null}
                    />
                }
            >
                <AdminListView<any, Tab>
                    variant={width >= 768 ? 'web' : 'mobile'}
                    config={config}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={list.refresh}
                    refreshing={list.refreshing}
                    sourceLabel={list.sourceLabel}
                    sourceTone={list.source}
                    lastSyncedTime={list.lastSynced}
                    error={list.error}
                    {...paged}
                    onOpenCreate={() => openForm(null)}
                    onPressItem={setViewing}
                    onEditItem={(x) => (editable(x) ? openForm(x) : setViewing(x))}
                    rowActions={(x) => [
                        { icon: 'eye-outline', label: 'View', onPress: () => setViewing(x) },
                        ...(editable(x)
                            ? [
                                  { icon: 'create-outline' as const, label: 'Edit', onPress: () => openForm(x), tone: 'primary' as const },
                                  { icon: 'trash-outline' as const, label: 'Delete', onPress: () => remove(x), tone: 'danger' as const },
                              ]
                            : []),
                    ]}
                    stats={stats}
                />
            </DetailsDock>
            {tab === 'ROUTERS' ? (
                <RouterForm visible={formOpen} initial={editing} saving={saving} error={formError} onClose={() => !saving && setFormOpen(false)} onSave={save} />
            ) : tab === 'PACKAGES' ? (
                <PackageForm visible={formOpen} initial={editing} routers={routers.items} saving={saving} error={formError} onClose={() => !saving && setFormOpen(false)} onSave={save} />
            ) : tab === 'SUBSCRIPTIONS' ? (
                <SubscriptionForm visible={formOpen} initial={editing} tariffs={tariffs.items} saving={saving} error={formError} onClose={() => !saving && setFormOpen(false)} onSave={save} />
            ) : (
                <PaymentForm visible={formOpen} initial={editing} tariffs={tariffs.items} saving={saving} error={formError} onClose={() => !saving && setFormOpen(false)} onSave={save} />
            )}
        </View>
    );
}

function DeleteButton({ onPress }: { onPress: () => void }) {
    return <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={onPress} />;
}

interface FormProps<T> {
    visible: boolean;
    initial: T | null;
    saving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: (d: Record<string, any>) => void;
}

function RouterForm({ visible, initial, saving, error, onClose, onSave }: FormProps<WifiRouter>) {
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            initialValues={{
                title: initial?.title ?? '',
                router_ip: initial?.router_ip ?? '',
                nas_id: initial?.nas_id ?? '',
                brand: initial?.brand ?? '',
                model: initial?.model ?? '',
                contact: initial?.contact ?? '',
                description: initial?.description ?? '',
                is_active: initial ? on(initial.is_active) : true,
            }}
            validationSchema={Yup.object({
                title: Yup.string().trim().required('Name the router, e.g. Shop front'),
                router_ip: Yup.string().trim().required('Enter its IP address'),
                brand: Yup.string().trim().required('Enter the brand, e.g. MikroTik'),
                model: Yup.string().trim().required('Enter the model'),
                contact: Yup.string().trim().required('A phone number for this hotspot'),
            })}
            onSubmit={(v) => onSave({ ...v, is_active: v.is_active ? 'true' : 'false' })}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit router' : 'New router'}
                    subtitle={initial?.title ?? 'A hotspot customers connect to'}
                    icon="wifi-outline"
                    submitLabel={initial ? 'Save changes' : 'Add router'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Router">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Shop front" autoCapitalize="words" />
                        <FormRow>
                            <CustomTextField name="router_ip" label="IP address" required placeholder="e.g. 192.168.88.1" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                            <CustomTextField name="nas_id" label="NAS id" placeholder="RADIUS NAS identifier" autoCapitalize="none" />
                        </FormRow>
                        <FormRow>
                            <CustomTextField name="brand" label="Brand" required placeholder="e.g. MikroTik" autoCapitalize="words" />
                            <CustomTextField name="model" label="Model" required placeholder="e.g. hAP ac2" />
                        </FormRow>
                        <CustomTextField name="contact" label="Contact phone" required placeholder="07…" keyboardType="phone-pad" inputMode="tel" />
                        <CustomTextField name="description" label="Notes" placeholder="Where it is, coverage… (optional)" multiline />
                    </FormSection>
                    {initial ? (
                        <FormSection title="Status">
                            <SwitchField name="is_active" label="Online" hint="Switch off while the router is down or moved." />
                        </FormSection>
                    ) : null}
                </AdminFormSheet>
            )}
        </Formik>
    );
}

const DURATIONS = Object.keys(DURATION_LABELS) as Duration[];

function PackageForm({ visible, initial, routers, saving, error, onClose, onSave }: FormProps<WifiTariff> & { routers: WifiRouter[] }) {
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            initialValues={{
                title: initial?.title ?? '',
                price: initial ? String(Number(initial.price)) : '',
                length: initial ? String(initial.length) : '1',
                duration: (initial?.duration ?? 'HOUR') as Duration,
                router_id: initial?.router ?? (routers[0]?.id ?? ''),
                is_active: initial ? on(initial.is_active) : true,
            }}
            validationSchema={Yup.object({
                title: Yup.string().trim().required('Name the package, e.g. 1 hour'),
                price: Yup.number().typeError('Enter a price').moreThan(0, 'Enter a price').required('Enter a price'),
                length: Yup.number().typeError('Enter a number').integer().min(1, 'At least 1').required('How long?'),
                router_id: initial ? Yup.string() : Yup.string().required('Pick the router'),
            })}
            onSubmit={(v) =>
                onSave({
                    title: v.title.trim(),
                    price: Number(v.price),
                    length: Number(v.length),
                    duration: v.duration,
                    router_id: v.router_id,
                    is_active: v.is_active ? 'true' : 'false',
                })
            }
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit package' : 'New package'}
                    subtitle={initial?.title ?? 'What customers buy'}
                    icon="pricetags-outline"
                    submitLabel={initial ? 'Save changes' : 'Add package'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Package">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. 1 hour, Daily, Weekly" autoCapitalize="words" />
                        <FormRow>
                            <CustomTextField name="price" label="Price (KES)" required placeholder="20" keyboardType="decimal-pad" />
                            <CustomTextField name="length" label="How long" required placeholder="1" keyboardType="number-pad" />
                        </FormRow>
                        <ChoiceChips<Duration>
                            label="Per"
                            options={DURATIONS.map((d) => ({ value: d, label: DURATION_LABELS[d][Number(f.values.length) === 1 ? 0 : 1] }))}
                            value={f.values.duration}
                            onChange={(d) => f.setFieldValue('duration', d)}
                        />
                    </FormSection>
                    {!initial ? (
                        <FormSection title="Router" zIndex={30}>
                            <SelectDropdown
                                name="router_id"
                                label="Sold on"
                                required
                                options={routers.map((r) => ({ value: r.id, label: r.title, description: r.router_ip }))}
                                placeholder={routers.length ? 'Select a router…' : 'No routers yet'}
                                helperText={routers.length ? undefined : 'Add a router first under Wi-Fi Hotspots → Routers.'}
                                disabled={!routers.length}
                            />
                        </FormSection>
                    ) : null}
                    <FormSection title="Status">
                        <SwitchField name="is_active" label="On sale" hint="Switch off to stop selling it without deleting it." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

/** "2026-11-16T14:05" for a date-time text box (local time). */
const localInput = (iso?: string | null) => {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toIso = (v: string) => {
    const d = new Date(v.trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? undefined : d.toISOString();
};

function SubscriptionForm({ visible, initial, tariffs, saving, error, onClose, onSave }: FormProps<WifiSubscription> & { tariffs: WifiTariff[] }) {
    const onSale = tariffs.filter((t) => on(t.is_active));
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            initialValues={{
                tariff_selected: initial?.tariff_selected ?? onSale[0]?.id ?? '',
                mac_address: initial?.mac_address ?? '',
                username: initial?.username ?? '',
                password: '',
                valid_from: localInput(initial?.valid_from),
                valid_to: initial ? localInput(initial.valid_to) : '',
                is_active: initial ? on(initial.is_active) : true,
            }}
            validationSchema={Yup.object({
                mac_address: Yup.string().trim().required("Enter the device's MAC address"),
                tariff_selected: initial ? Yup.string() : Yup.string().required('Pick the package'),
            })}
            onSubmit={(v) =>
                onSave({
                    tariff_selected: v.tariff_selected || undefined,
                    mac_address: v.mac_address.trim().toUpperCase(),
                    username: v.username.trim() || undefined,
                    password: v.password.trim() || undefined,
                    valid_from: toIso(v.valid_from),
                    // Blank: the package's length from the start time.
                    valid_to: v.valid_to.trim() ? toIso(v.valid_to) : undefined,
                    is_active: v.is_active ? 'true' : 'false',
                })
            }
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit subscription' : 'New subscription'}
                    subtitle={initial?.username ?? 'Connect a device by hand'}
                    icon="people-outline"
                    submitLabel={initial ? 'Save changes' : 'Connect device'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Package" zIndex={30}>
                        <SelectDropdown
                            name="tariff_selected"
                            label="Package"
                            required={!initial}
                            options={onSale.map((t) => ({ value: t.id, label: `${t.title} · ${kes(t.price)}`, description: lengthLabel(t) }))}
                            placeholder={onSale.length ? 'Select a package…' : 'No packages on sale'}
                            helperText={onSale.length ? undefined : 'Add a package first under Wi-Fi Hotspots → Packages.'}
                            disabled={!onSale.length}
                        />
                    </FormSection>
                    <FormSection title="Device">
                        <CustomTextField name="mac_address" label="MAC address" required placeholder="e.g. A4:5E:60:12:34:56" autoCapitalize="characters" />
                        <FormRow>
                            <CustomTextField name="username" label="Username" placeholder="Made up if blank" autoCapitalize="none" />
                            <CustomTextField name="password" label={initial ? 'New password' : 'Password'} placeholder={initial ? 'Leave blank to keep' : 'Made up if blank'} autoCapitalize="none" />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Time" hint="Leave the end blank to use the package's length.">
                        <FormRow>
                            <CustomTextField name="valid_from" label="From" placeholder="YYYY-MM-DD HH:MM" autoCapitalize="none" />
                            <CustomTextField name="valid_to" label="Until" placeholder="From + package length" autoCapitalize="none" />
                        </FormRow>
                        {initial ? <SwitchField name="is_active" label="Active" hint="Switch off to cut the device off early." /> : null}
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

const PAY_STATUSES = ['SUCCESS', 'PENDING', 'FAILED', 'CANCELLED'] as const;

function PaymentForm({ visible, initial, tariffs, saving, error, onClose, onSave }: FormProps<WifiPayment> & { tariffs: WifiTariff[] }) {
    return (
        <Formik
            key={`${visible}-${initial?.id ?? 'new'}`}
            initialValues={{
                tariff: initial?.tariff ?? tariffs[0]?.id ?? '',
                amount: initial ? String(Number(initial.amount)) : tariffs[0] ? String(Number(tariffs[0].price)) : '',
                telco: initial?.telco ?? 'CASH',
                status: (initial?.status ?? 'SUCCESS') as string,
                description: initial?.description ?? '',
            }}
            validationSchema={Yup.object({
                tariff: Yup.string().required('Pick the package paid for'),
                amount: Yup.number().typeError('Enter the amount').moreThan(0, 'Enter the amount').required('Enter the amount'),
            })}
            onSubmit={(v) => onSave({ tariff: v.tariff, amount: Number(v.amount), telco: v.telco, status: v.status, description: v.description.trim() })}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={initial ? 'Edit payment' : 'Record payment'}
                    subtitle={initial?.reference_number ?? 'Cash or other payment taken by staff'}
                    icon="wallet-outline"
                    submitLabel={initial ? 'Save changes' : 'Record payment'}
                    submitting={saving}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Package" zIndex={30}>
                        <SelectDropdown
                            label="Package"
                            required
                            options={tariffs.map((t) => ({ value: t.id, label: `${t.title} · ${kes(t.price)}`, description: lengthLabel(t) }))}
                            value={f.values.tariff}
                            onChange={(id) => {
                                f.setFieldValue('tariff', id);
                                const t = tariffs.find((x) => x.id === id);
                                if (t) f.setFieldValue('amount', String(Number(t.price)));
                            }}
                            error={f.touched.tariff && typeof f.errors.tariff === 'string' ? f.errors.tariff : undefined}
                            placeholder={tariffs.length ? 'Select a package…' : 'No packages yet'}
                            helperText={tariffs.length ? undefined : 'Add a package first under Wi-Fi Hotspots → Packages.'}
                            disabled={!tariffs.length}
                        />
                    </FormSection>
                    <FormSection title="Payment">
                        <FormRow>
                            <CustomTextField name="amount" label="Amount (KES)" required keyboardType="decimal-pad" />
                            <CustomTextField name="telco" label="Paid by" placeholder="CASH, card…" autoCapitalize="characters" />
                        </FormRow>
                        <ChoiceChips<string>
                            label="Status"
                            options={PAY_STATUSES.map((st) => ({ value: st, label: PAY_LABEL[st] }))}
                            value={f.values.status}
                            onChange={(st) => f.setFieldValue('status', st)}
                        />
                        <CustomTextField name="description" label="Note" placeholder="Optional" />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
