// components/agents/AgentStockTakes.tsx
//
// Agent -> Stock takes: stock taking sold to a business you registered. Book it
// (one-off, or repeating every N days) with the agreed fee, the days and your
// stocktakers at a daily rate; send the payment prompt (you earn your commission
// on the fee); follow the count; submit it for the business to review. Days
// worked come from the days each stocktaker counted — correct them if needed.
// Backend: stocktakes/ (agent endpoint).

import { agentMeApi, type Onboarder } from '@/api/agentsApi';
import { agentStockTakesApi, STATUS_META, type CountLine, type StockTake, type StockTakeBooking, type StockTakeKind } from '@/api/stockTakesApi';
import {
    AdminFormSheet,
    AdminListView,
    AdminSheet,
    ChoiceChips,
    DetailsDock,
    formatDate,
    FormRow,
    FormSection,
    SheetButton,
    textOr,
    useListTokens,
    type AdminBadge,
    type AdminListConfig,
} from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import type { PageSize } from '@/components/common/PaginationBar';
import StockTakeReportView from '@/components/stocktakes/StockTakeReportView';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';
import { errorText } from '@/utils/apiFeedback';

const STOCKABLE = ['GeneralRetailer', 'PharmaceuticalRetailer', 'GeneralWholesaler', 'PharmaceuticalWholesaler', 'Restaurant', 'Hotel'];
const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

export const stockTakeBadges = (st: StockTake): AdminBadge[] => [
    { label: STATUS_META[st.status].label, tone: STATUS_META[st.status].tone },
    ...(st.is_paid === undefined ? [] : [st.is_paid ? ({ label: 'Paid', tone: 'success', icon: 'checkmark-circle' } as AdminBadge) : ({ label: 'Unpaid', tone: 'warning' } as AdminBadge)]),
    ...(st.kind === 'RECURRING' ? [{ label: `Every ${st.every_days} days`, tone: 'info', icon: 'repeat' } as AdminBadge] : []),
];

export const stockTakesConfig: AdminListConfig<StockTake> = {
    title: 'Stock takes',
    noun: ['stock take', 'stock takes'],
    icon: 'clipboard-outline',
    searchPlaceholder: 'Search business…',
    addLabel: 'Book stock take',
    emptyTitle: 'No stock takes yet',
    emptyMessage: 'Sell stock taking to the businesses you registered: book the days, the fee and your stocktakers.',
    keyOf: (st) => st.id,
    titleOf: (st) => st.entity_title,
    subtitleOf: (st) => `${formatDate(st.starts_on)} – ${formatDate(st.ends_on)} · ${st.counted_items} counted`,
    avatarOf: (st) => ({ label: st.entity_title }),
    badgesOf: stockTakeBadges,
    metricOf: (st) => (st.fee ? { value: formatKES(st.fee), label: 'fee' } : null),
    primaryColumn: { label: 'Business', flex: 2 },
    columns: [
        { key: 'days', label: 'Days', flex: 1.5, render: (st) => `${formatDate(st.starts_on)} – ${formatDate(st.ends_on)}` },
        { key: 'status', label: 'Status', flex: 1.1, render: (st) => STATUS_META[st.status].label },
        { key: 'fee', label: 'Fee', flex: 1, align: 'right', render: (st) => (st.fee ? formatKES(st.fee) : '—') },
        { key: 'paid', label: 'Paid', flex: 0.7, render: (st) => (st.is_paid ? 'Yes' : 'No') },
        { key: 'counted', label: 'Counted', flex: 0.8, align: 'right', render: (st) => String(st.counted_items) },
        { key: 'who', label: 'Stocktakers', flex: 1.6, render: (st) => textOr(st.stocktakers.map((s) => s.name).join(', ')) },
    ],
};

export default function AgentStockTakes() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();

    const [rows, setRows] = useState<StockTake[]>([]);
    const [entities, setEntities] = useState<{ id: string; title: string }[]>([]);
    const [stocktakers, setStocktakers] = useState<{ id: string; title: string }[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [viewing, setViewing] = useState<StockTake | null>(null);
    const [booking, setBooking] = useState<StockTake | 'new' | null>(null);
    // Opened from a business's own Stock takes screen: book for that business.
    const params = useLocalSearchParams<{ entity?: string }>();
    const [preset, setPreset] = useState<string | null>(null);
    const [presetDone, setPresetDone] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [stRes, entRes, obRes]: any[] = await Promise.all([agentStockTakesApi.list(), agentMeApi.getEntities(), agentMeApi.getOnboarders()]);
            if (ok(stRes)) {
                setRows(stRes.data.stock_takes ?? []);
                setLoadError(null);
            } else setLoadError(errorText(stRes, 'Could not load stock takes.'));
            if (ok(entRes)) {
                setEntities((entRes.data.entities ?? []).filter((e: any) => STOCKABLE.includes(e.entity_type)).map((e: any) => ({ id: String(e.id), title: String(e.title) })));
            }
            if (ok(obRes)) {
                setStocktakers(
                    (obRes.data.onboarders as Onboarder[])
                        .filter((o) => o.is_active && !o.is_blacklisted && o.user.has_payout_account !== false)
                        .map((o) => ({ id: o.id, title: [o.user.name, o.user.phone].filter(Boolean).join(' · ') })),
                );
            }
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    useEffect(() => {
        const wanted = typeof params.entity === 'string' ? params.entity : '';
        if (!wanted || presetDone || refreshing || !entities.length) return;
        setPresetDone(true);
        if (!entities.some((e) => e.id === wanted)) {
            alert('Not available', 'You can book stock takes only for businesses you registered (My entities) — never for a business you own or work at.');
            return;
        }
        if (!stocktakers.length) {
            alert('No stocktakers yet', 'Add onboarders (with payout accounts) under My onboarders first.');
            return;
        }
        setPreset(wanted);
        setBooking('new');
    }, [params.entity, presetDone, refreshing, entities, stocktakers, alert]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((r) => r.entity_title.toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, pageSize]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const upsert = (st: StockTake) => {
        setRows((prev) => {
            const i = prev.findIndex((x) => x.id === st.id);
            if (i < 0) return [st, ...prev];
            const next = [...prev];
            next[i] = st;
            return next;
        });
        setViewing((cur) => (cur && cur.id === st.id ? { ...cur, ...st } : cur));
    };

    return (
        <>
            <DetailsDock
                placeholder="Pick a stock take to follow it here."
                pane={
                    viewing ? (
                        <StockTakeDetails
                            stockTake={viewing}
                            onClose={() => setViewing(null)}
                            onChanged={(st) => { upsert(st); void load(); }}
                            onEdit={(st) => { setViewing(null); setBooking(st); }}
                        />
                    ) : null
                }
            >
                <AdminListView<StockTake, string>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={stockTakesConfig}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={load}
                    refreshing={refreshing}
                    sourceLabel={loadError ? 'Not loaded' : 'Server'}
                    sourceTone={loadError ? 'none' : 'server'}
                    error={loadError}
                    items={filtered.slice(pageStart, pageEnd)}
                    allItems={filtered}
                    onOpenCreate={() => {
                        if (!entities.length) return alert('No business yet', 'Register a retailer, wholesaler, restaurant or hotel under My entities first.');
                        if (!stocktakers.length) return alert('No stocktakers yet', 'Add onboarders (with payout accounts) under My onboarders first.');
                        setBooking('new');
                    }}
                    onPressItem={setViewing}
                    stats={[
                        { label: 'Stock takes', value: rows.length.toLocaleString() },
                        { label: 'Counting', value: rows.filter((r) => r.status === 'COUNTING').length.toLocaleString(), color: '#f59e0b' },
                        { label: 'Unpaid', value: rows.filter((r) => r.status !== 'CANCELLED' && !r.is_paid).length.toLocaleString() },
                        { label: 'Fees booked', value: formatKES(rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.fee || 0), 0)) },
                    ]}
                    page={page}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                    onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
            </DetailsDock>
            <BookingSheet
                booking={booking}
                entities={entities}
                stocktakers={stocktakers}
                presetEntity={preset}
                onClose={() => { setBooking(null); setPreset(null); }}
                onSaved={(st) => { setBooking(null); upsert(st); setViewing(st); void load(); }}
            />
        </>
    );
}

/* ------------------------------------------------------------------ booking */

function BookingSheet({
    booking,
    entities,
    stocktakers,
    presetEntity,
    onClose,
    onSaved,
}: {
    booking: StockTake | 'new' | null;
    entities: { id: string; title: string }[];
    stocktakers: { id: string; title: string }[];
    presetEntity?: string | null;
    onClose: () => void;
    onSaved: (st: StockTake) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const editing = booking && booking !== 'new' ? booking : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => setError(null), [booking]);

    return (
        <Formik
            key={`${booking ? (editing?.id ?? 'new') : 'closed'}`}
            enableReinitialize
            initialValues={{
                entity: editing?.entity ?? presetEntity ?? '',
                kind: (editing?.kind ?? 'ONE_OFF') as StockTakeKind,
                every_days: editing?.every_days ? String(editing.every_days) : '30',
                starts_on: editing?.starts_on ?? '',
                ends_on: editing?.ends_on ?? '',
                fee: editing?.fee ? String(Number(editing.fee)) : '',
                persons: editing ? String(editing.persons) : '1',
                daily_rate: editing ? String(Number(editing.daily_rate)) : '',
                stocktakers: editing ? editing.stocktakers.map((s) => s.onboarder) : ([] as string[]),
                notes: editing?.notes ?? '',
            }}
            validationSchema={Yup.object({
                entity: editing ? Yup.string() : Yup.string().required('Pick the business'),
                starts_on: Yup.string().required('First day'),
                ends_on: Yup.string()
                    .required('Last day')
                    .test('after', 'On or after the first day', function (v) {
                        return !v || !this.parent.starts_on || String(v) >= String(this.parent.starts_on);
                    }),
                fee: Yup.number().typeError('Enter an amount').min(1, 'At least KES 1').required('Agreed fee'),
                persons: Yup.number().typeError('Enter a number').integer().min(1).max(100).required('How many people?'),
                daily_rate: Yup.number().typeError('Enter an amount').min(0).required('Pay per person per day'),
                stocktakers: Yup.array().min(1, 'Pick at least one stocktaker'),
                every_days: Yup.string().when('kind', {
                    is: 'RECURRING',
                    then: (s) => s.required('How often?').test('range', '7 to 366 days', (v) => Number(v) >= 7 && Number(v) <= 366),
                }),
            })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const body: StockTakeBooking = {
                        starts_on: v.starts_on.slice(0, 10),
                        ends_on: v.ends_on.slice(0, 10),
                        fee: String(Number(v.fee)),
                        persons: Number(v.persons),
                        daily_rate: String(Number(v.daily_rate)),
                        stocktakers: v.stocktakers,
                        notes: v.notes,
                        ...(editing ? {} : { entity: v.entity, kind: v.kind, ...(v.kind === 'RECURRING' ? { every_days: Number(v.every_days) } : {}) }),
                    };
                    const res: any = editing ? await agentStockTakesApi.update(editing.id, body) : await agentStockTakesApi.create(body);
                    if (ok(res)) onSaved(res.data.stock_take);
                    else setError(errorText(res, 'Could not save the stock take.'));
                } catch (e: any) {
                    setError(e?.message || 'Could not reach the server.');
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => {
                const v = f.values;
                const cost = Number(v.persons || 0) * Number(v.daily_rate || 0) * (v.starts_on && v.ends_on ? Math.max(1, Math.round((Date.parse(v.ends_on) - Date.parse(v.starts_on)) / 86400000) + 1) : 0);
                return (
                    <AdminFormSheet
                        visible={!!booking}
                        onClose={onClose}
                        title={editing ? 'Edit stock take' : 'Book a stock take'}
                        subtitle={editing ? editing.entity_title : 'A paid count of a business’s stock'}
                        icon="clipboard-outline"
                        submitLabel={editing ? 'Save' : 'Book'}
                        submitting={saving}
                        onSubmit={() => f.handleSubmit()}
                        error={error}
                        width={600}
                    >
                        {!editing ? (
                            <FormSection title="Business" zIndex={40}>
                                <CustomAutocompletePicker name="entity" label="Business" options={entities} theme={theme} isDarkMode={isDarkMode} placeholder="Pick one of your businesses…" />
                                <ChoiceChips<StockTakeKind>
                                    label="How often"
                                    options={[
                                        { value: 'ONE_OFF', label: 'Once', icon: 'flash-outline' },
                                        { value: 'RECURRING', label: 'Repeats', icon: 'repeat' },
                                    ]}
                                    value={v.kind}
                                    onChange={(x) => f.setFieldValue('kind', x)}
                                />
                                {v.kind === 'RECURRING' ? (
                                    <CustomTextField name="every_days" label="Every (days)" required keyboardType="number-pad" hint="e.g. 30 for monthly, 90 for quarterly. The next one is booked when this one is submitted." />
                                ) : null}
                            </FormSection>
                        ) : null}
                        <FormSection title="Days" hint="Stocktakers can count only on these days.">
                            <FormRow>
                                <DateField name="starts_on" label="From" required />
                                <DateField name="ends_on" label="Until" required />
                            </FormRow>
                        </FormSection>
                        <FormSection title="Price" hint={editing?.is_paid ? 'Paid — the fee can no longer change.' : 'Agreed with the business; you earn your commission on it.'}>
                            <CustomTextField name="fee" label="Fee (KES)" required keyboardType="decimal-pad" editable={!editing?.is_paid} />
                        </FormSection>
                        <FormSection title="Stocktakers" hint="Only onboarders with a payout account can be sent." zIndex={30}>
                            <FormRow>
                                <CustomTextField name="persons" label="People" required keyboardType="number-pad" />
                                <CustomTextField name="daily_rate" label="Pay per person per day (KES)" required keyboardType="decimal-pad" />
                            </FormRow>
                            {cost > 0 ? (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    Stocktakers’ pay if every day is worked: {formatKES(cost)}
                                </Text>
                            ) : null}
                            <CustomMultiselectAutocompletePicker
                                name="stocktakers"
                                label="Who goes"
                                options={stocktakers}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                placeholder="Pick stocktakers…"
                                emptyText="No onboarders with payout accounts. Add them under My onboarders."
                            />
                        </FormSection>
                        <FormSection title="Notes">
                            <CustomTextField name="notes" label="Notes" multiline placeholder="Anything agreed with the business" />
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}

/* ------------------------------------------------------------------ details */

function StockTakeDetails({ stockTake, onClose, onChanged, onEdit }: { stockTake: StockTake; onClose: () => void; onChanged: (st: StockTake) => void; onEdit: (st: StockTake) => void }) {
    const { theme, border } = useListTokens();
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const alert = useAlert();
    const [full, setFull] = useState<StockTake | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [days, setDays] = useState<Record<string, string>>({});

    const reload = useCallback(async () => {
        const res: any = await agentStockTakesApi.report(stockTake.id);
        if (ok(res)) setFull(res.data.stock_take);
    }, [stockTake.id]);
    useEffect(() => { setFull(null); void reload(); }, [reload]);

    const st = full ?? stockTake;
    const open = st.status === 'SCHEDULED' || st.status === 'COUNTING';

    const run = async (key: string, fn: () => Promise<any>, done: string) => {
        setBusy(key);
        try {
            const res: any = await fn();
            if (ok(res)) {
                if (res.data?.stock_take) onChanged(res.data.stock_take);
                await reload();
                if (done) alert('Done', done, undefined, 'success');
            } else alert('Not done', errorText(res, 'Something went wrong.'), undefined, 'danger');
        } finally {
            setBusy(null);
        }
    };

    return (
        <AdminSheet
            visible
            onClose={onClose}
            title={st.entity_title}
            subtitle={`${formatDate(st.starts_on)} – ${formatDate(st.ends_on)} · ${STATUS_META[st.status].label}`}
            icon="clipboard-outline"
            width={680}
            footer={
                <>
                    {open ? <SheetButton label="Edit" icon="create-outline" variant="ghost" onPress={() => onEdit(st)} grow={!isLarge} /> : null}
                    {open && !st.is_paid ? (
                        <SheetButton label="Cancel" icon="close-circle-outline" variant="ghost" loading={busy === 'cancel'} onPress={() => void run('cancel', () => agentStockTakesApi.cancel(st.id), 'Stock take cancelled.')} grow={!isLarge} />
                    ) : null}
                    {open ? (
                        <SheetButton label="Submit count" icon="checkmark-done" loading={busy === 'submit'} onPress={() => void run('submit', () => agentStockTakesApi.submit(st.id), 'Submitted. The business can now review it.')} grow={!isLarge} />
                    ) : null}
                </>
            }
        >
            <View style={{ gap: 14 }}>
                <View style={{ gap: 4 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                        Fee {formatKES(st.fee)} · {st.is_paid ? 'paid' : 'not paid yet'}
                        {st.kind === 'RECURRING' ? ` · repeats every ${st.every_days} days` : ''}
                    </Text>
                    {!st.is_paid && st.status !== 'CANCELLED' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Owner's phone (default)"
                                placeholderTextColor={theme.textDark}
                                keyboardType="phone-pad"
                                style={{ flex: 1, height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.medium }}
                            />
                            <SheetButton label="Send payment prompt" icon="phone-portrait-outline" variant="secondary" loading={busy === 'pay'} onPress={() => void run('pay', () => agentStockTakesApi.requestPayment(st.id, phone.trim() || undefined), 'Mobile money prompt sent.')} />
                        </View>
                    ) : null}
                </View>

                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Stocktakers</Text>
                    {st.stocktakers.map((s) => (
                        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: border }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{s.name}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {s.days_worked} day(s) × {formatKES(s.daily_rate)} = {formatKES(s.amount_due)} · {s.payout_status === 'PAID' ? 'paid' : 'owed'}
                                    {s.payout_account ? '' : ' · no payout account'}
                                </Text>
                            </View>
                            {(st.status === 'SUBMITTED' || st.status === 'APPLIED') && s.payout_status !== 'PAID' ? (
                                <>
                                    <TextInput
                                        value={days[s.id] ?? String(s.days_worked)}
                                        onChangeText={(t) => setDays((d) => ({ ...d, [s.id]: t.replace(/[^0-9]/g, '') }))}
                                        keyboardType="number-pad"
                                        style={{ width: 52, height: 34, textAlign: 'center', borderRadius: 8, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.bold }}
                                    />
                                    <SheetButton label="Save" variant="ghost" loading={busy === s.id} onPress={() => void run(s.id, () => agentStockTakesApi.setDaysWorked(s.id, Number(days[s.id] ?? s.days_worked)), '')} />
                                </>
                            ) : null}
                        </View>
                    ))}
                </View>

                <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Count</Text>
                    {full?.report ? (
                        <StockTakeReportView
                            report={full.report}
                            mode="agent"
                            busyLine={busy}
                            onRemove={open ? (l: CountLine) => void run(l.id, () => agentStockTakesApi.removeCount(l.id), '') : undefined}
                        />
                    ) : (
                        <ActivityIndicator color={theme.primary} />
                    )}
                </View>
            </View>
        </AdminSheet>
    );
}
