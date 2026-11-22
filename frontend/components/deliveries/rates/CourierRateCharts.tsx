// components/deliveries/rates/CourierRateCharts.tsx
//
// Couriers -> Rate charts: publish what your long-haul legs cost, e.g.
//   "Nairobi GPO -> any office in Kisumu county, 0-2 kg: KES 300"
//   "anywhere -> anywhere, 20 kg and above: KES 1,200 + KES 40 per extra kg"
// The most specific matching line prices the leg from your dispatch office to the
// buyer's collection office (office beats county beats anywhere), plus the card's
// % of the goods' value (insurance). Without a matching line, your courier rate
// in Delivery settings applies. Backend: logistics/utils/rate_charts.py.

import deliveriesApi, { apiError, isOk, type Office, type RateCard, type RateCardLine } from '@/api/deliveriesApi';
import { AdminFormSheet, ChoiceChips, FormRow, FormSection, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';

const KENYA_COUNTRY_ID = 'b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f';
type Where = 'ANY' | 'OFFICE' | 'COUNTY';

const place = (office: string | null, county: string | null) => office || (county ? `${county} county` : 'Anywhere');
const band = (l: RateCardLine) => `${Number(l.min_kg).toLocaleString()}${l.max_kg ? `–${Number(l.max_kg).toLocaleString()}` : '+'} kg`;

export default function CourierRateCharts() {
    const { theme, border, cardShadow } = useListTokens();
    const alert = useAlert();
    const [cards, setCards] = useState<RateCard[] | null>(null);
    const [offices, setOffices] = useState<Office[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [editingCard, setEditingCard] = useState<RateCard | 'new' | null>(null);
    const [editingLine, setEditingLine] = useState<{ card: RateCard; line: RateCardLine | null } | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [c, o]: any[] = await Promise.all([deliveriesApi.getRateCards(), deliveriesApi.getMyOffices()]);
            setCards(isOk(c) ? c.data.cards ?? [] : []);
            if (isOk(o)) setOffices(o.data.offices ?? []);
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const remove = async (line: RateCardLine) => {
        const res: any = await deliveriesApi.deleteRateCardLine(line.id);
        if (isOk(res)) void load();
        else alert('Not deleted', apiError(res, 'Could not delete the line.'), undefined, 'danger');
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 980, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Rate charts</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                            What your long-haul deliveries cost, by route and weight. Sellers' quotes use the most specific line.
                        </Text>
                    </View>
                    <SheetButton label="New rate card" icon="add" onPress={() => setEditingCard('new')} />
                </View>
                {cards === null ? <ActivityIndicator color={theme.primary} /> : null}
                {cards && cards.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium }}>No rate charts yet: your courier rate in Delivery settings is used.</Text>
                ) : null}
                {(cards ?? []).map((c) => (
                    <View key={c.id} style={{ padding: 14, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, ...cardShadow }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{c.title}{c.is_active ? '' : ' (off)'}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {Number(c.value_percent) ? `+${Number(c.value_percent)}% of goods' value · ` : ''}{c.effective_from ? `from ${c.effective_from} · ` : ''}{c.lines.length} line(s)
                                </Text>
                            </View>
                            <SheetButton label="Edit" variant="ghost" onPress={() => setEditingCard(c)} />
                            <SheetButton label="Add line" icon="add" variant="secondary" onPress={() => setEditingLine({ card: c, line: null })} />
                        </View>
                        {c.lines.map((l) => (
                            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: border }}>
                                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                    {place(l.origin_office_title, l.origin_county_title)} → {place(l.destination_office_title, l.destination_county_title)} · {band(l)}
                                    {l.lead_time_days != null ? ` · ${l.lead_time_days} day(s)` : ''}
                                </Text>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>
                                    {formatKES(l.price)}{!l.max_kg && Number(l.extra_per_kg) ? ` + ${formatKES(l.extra_per_kg)}/kg` : ''}
                                </Text>
                                <SheetButton label="" icon="create-outline" variant="ghost" onPress={() => setEditingLine({ card: c, line: l })} />
                                <SheetButton label="" icon="trash-outline" variant="ghost" onPress={() => void remove(l)} />
                            </View>
                        ))}
                    </View>
                ))}
            </ScrollView>
            <CardSheet card={editingCard} onClose={() => setEditingCard(null)} onSaved={() => { setEditingCard(null); void load(); }} />
            <LineSheet target={editingLine} offices={offices} onClose={() => setEditingLine(null)} onSaved={() => { setEditingLine(null); void load(); }} />
        </View>
    );
}

function CardSheet({ card, onClose, onSaved }: { card: RateCard | 'new' | null; onClose: () => void; onSaved: () => void }) {
    const c = card && card !== 'new' ? card : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <Formik
            key={c?.id ?? (card ? 'new' : 'closed')}
            initialValues={{ title: c?.title ?? '', value_percent: c ? String(Number(c.value_percent)) : '0', effective_from: c?.effective_from ?? '', is_active: c ? c.is_active : true, notes: c?.notes ?? '' }}
            validationSchema={Yup.object({ title: Yup.string().trim().required('Title'), value_percent: Yup.number().typeError('A number').min(0).max(100) })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const res: any = await deliveriesApi.saveRateCard({ ...(c ? { card: c.id } : {}), ...v, effective_from: v.effective_from ? v.effective_from.slice(0, 10) : '' });
                    if (isOk(res)) onSaved();
                    else setError(apiError(res, 'Could not save the rate card.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet visible={!!card} onClose={onClose} title={c ? 'Edit rate card' : 'New rate card'} icon="pricetags-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={520}>
                    <FormSection title="Rate card">
                        <CustomTextField name="title" label="Title" required placeholder="e.g. Parcels 2026" />
                        <FormRow>
                            <CustomTextField name="value_percent" label="% of goods' value (insurance)" keyboardType="decimal-pad" />
                            <DateField name="effective_from" label="Applies from" />
                        </FormRow>
                        <SwitchField name="is_active" label="In use" />
                        <CustomTextField name="notes" label="Notes" multiline />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

function LineSheet({ target, offices, onClose, onSaved }: { target: { card: RateCard; line: RateCardLine | null } | null; offices: Office[]; onClose: () => void; onSaved: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const { getCountiesByCountry } = useEntitiesSync();
    const counties = useMemo(() => getCountiesByCountry(KENYA_COUNTRY_ID).map((c) => ({ id: c.value, title: c.label })), [getCountiesByCountry]);
    const officeOptions = useMemo(() => offices.filter((o) => o.is_active).map((o) => ({ id: o.id, title: `${o.title}${o.county_title ? ` · ${o.county_title}` : ''}` })), [offices]);
    const l = target?.line ?? null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const whereOf = (office: string | null, county: string | null): Where => (office ? 'OFFICE' : county ? 'COUNTY' : 'ANY');

    return (
        <Formik
            key={`${target?.card.id ?? 'closed'}-${l?.id ?? 'new'}`}
            initialValues={{
                from: whereOf(l?.origin_office ?? null, l?.origin_county ?? null),
                origin_office: l?.origin_office ?? '',
                origin_county: l?.origin_county ?? '',
                to: whereOf(l?.destination_office ?? null, l?.destination_county ?? null),
                destination_office: l?.destination_office ?? '',
                destination_county: l?.destination_county ?? '',
                min_kg: l ? String(Number(l.min_kg)) : '0',
                max_kg: l?.max_kg ? String(Number(l.max_kg)) : '',
                price: l ? String(Number(l.price)) : '',
                extra_per_kg: l ? String(Number(l.extra_per_kg)) : '0',
                lead_time_days: l?.lead_time_days != null ? String(l.lead_time_days) : '',
            }}
            validationSchema={Yup.object({
                price: Yup.number().typeError('An amount').min(0).required('Price'),
                min_kg: Yup.number().typeError('kg').min(0),
            })}
            onSubmit={async (v) => {
                if (!target) return;
                setSaving(true);
                setError(null);
                try {
                    const res: any = await deliveriesApi.saveRateCardLine({
                        card: target.card.id,
                        ...(l ? { line: l.id } : {}),
                        origin_office: v.from === 'OFFICE' ? v.origin_office : '',
                        origin_county: v.from === 'COUNTY' ? v.origin_county : '',
                        destination_office: v.to === 'OFFICE' ? v.destination_office : '',
                        destination_county: v.to === 'COUNTY' ? v.destination_county : '',
                        min_kg: v.min_kg || 0,
                        max_kg: v.max_kg,
                        price: v.price,
                        extra_per_kg: v.extra_per_kg || 0,
                        lead_time_days: v.lead_time_days,
                    });
                    if (isOk(res)) onSaved();
                    else setError(apiError(res, 'Could not save the line.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => {
                const v = f.values;
                const whereChips = (name: 'from' | 'to') => (
                    <ChoiceChips<Where>
                        options={[{ value: 'ANY', label: 'Anywhere' }, { value: 'OFFICE', label: 'An office' }, { value: 'COUNTY', label: 'A county' }]}
                        value={v[name]}
                        onChange={(x) => f.setFieldValue(name, x)}
                    />
                );
                return (
                    <AdminFormSheet visible={!!target} onClose={onClose} title={l ? 'Edit line' : 'New line'} subtitle={target?.card.title} icon="pricetag-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={600}>
                        <FormSection title="From" hint="Your dispatch office where sellers drop the goods." zIndex={30}>
                            {whereChips('from')}
                            {v.from === 'OFFICE' ? <CustomAutocompletePicker name="origin_office" label="Office" options={officeOptions} theme={theme} isDarkMode={isDarkMode} placeholder="Pick an office…" /> : null}
                            {v.from === 'COUNTY' ? <CustomAutocompletePicker name="origin_county" label="County" options={counties} theme={theme} isDarkMode={isDarkMode} placeholder="Pick a county…" /> : null}
                        </FormSection>
                        <FormSection title="To" hint="Where the buyer collects." zIndex={20}>
                            {whereChips('to')}
                            {v.to === 'OFFICE' ? <CustomAutocompletePicker name="destination_office" label="Office" options={officeOptions} theme={theme} isDarkMode={isDarkMode} placeholder="Pick an office…" /> : null}
                            {v.to === 'COUNTY' ? <CustomAutocompletePicker name="destination_county" label="County" options={counties} theme={theme} isDarkMode={isDarkMode} placeholder="Pick a county…" /> : null}
                        </FormSection>
                        <FormSection title="Weight and price" hint="Chargeable weight: the greater of actual and packaging-volume weight. Leave the maximum blank for 'and above'.">
                            <FormRow>
                                <CustomTextField name="min_kg" label="From (kg)" keyboardType="decimal-pad" />
                                <CustomTextField name="max_kg" label="Up to (kg)" keyboardType="decimal-pad" placeholder="and above" />
                            </FormRow>
                            <FormRow>
                                <CustomTextField name="price" label="Price (KES)" required keyboardType="decimal-pad" />
                                <CustomTextField name="extra_per_kg" label="Per extra kg (open band)" keyboardType="decimal-pad" />
                                <CustomTextField name="lead_time_days" label="Days" keyboardType="number-pad" />
                            </FormRow>
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
