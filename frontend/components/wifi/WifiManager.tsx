// components/wifi/WifiManager.tsx
//
// Wi-Fi hotspot business (entity type InternetServiceProvider). One component, one
// route per model (app/(hotspots)/wifiRouters, wifiTarrifs, wifiSubscriptions,
// wifiPayments). Routers and packages: add / edit / delete. Subscriptions and
// payments come from customers paying for packages: view only.
//   Routers        hotspots (IP, NAS id, brand / model, contact) — add / edit / switch off
//   Packages       what customers buy: price for a length of time on a router
//   Subscriptions  who is connected, until when
//   Payments       M-Pesa payments for packages
// Shared list kit (cards on phones, table on wide screens), details beside the
// list on wide screens, each list kept on the device for offline viewing.

import { apiError, isOk } from '@/api/deliveriesApi';
import wifiApi, { DURATION_LABELS, lengthLabel, type Duration, type WifiPayment, type WifiRouter, type WifiSubscription, type WifiTariff } from '@/api/wifiApi';
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
    emptyMessage: 'Customers appear here when they pay for a package.',
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
    emptyMessage: 'Customers’ package payments appear here.',
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

    // Payments and the subscriptions they create come from customers: view only.
    const readOnly = tab === 'SUBSCRIPTIONS' || tab === 'PAYMENTS';
    const editable = (_x?: any | null) => !readOnly;
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
                    : await (editing ? wifiApi.updateTariff(body) : wifiApi.createTariff(body));
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
            SUBSCRIPTIONS: '',
            PAYMENTS: '',
        };
        alert(`Delete ${noun}`, `Delete “${what}”? ${warn[tab]}`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const fn = tab === 'ROUTERS' ? wifiApi.deleteRouter : wifiApi.deleteTariff;
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
                    onOpenCreate={readOnly ? undefined : () => openForm(null)}
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
            ) : null}
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
