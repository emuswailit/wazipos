// components/manufacturers/ManufacturerDiscounts.tsx
//
// Manufacturer -> Discounts for distributors:
//   Price   a lower price on a lot for a period (offer price, or percent off; never below cost)
//   Quantity buy N, get M free (repeats: buy 2N, get 2M)
// Running discounts are applied by the server when distributors order.
// Backend: manufacturers/staff GetDiscounts / SavePriceDiscount / SaveQuantityDiscount.

import { manufacturerStaffApi, type Discount, type ManufacturerLot } from '@/api/manufacturersApi';
import { AdminFormSheet, AdminListView, formatDate, FormRow, FormSection, SegmentedControl, type AdminListConfig } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

import { errorText, ok } from './OrderDetailsSheet';

type Kind = 'PRICE' | 'QUANTITY';

const config = (kind: Kind): AdminListConfig<Discount> => ({
    title: kind === 'PRICE' ? 'Price discounts' : 'Quantity discounts',
    noun: ['discount', 'discounts'],
    icon: 'pricetag-outline',
    searchPlaceholder: 'Search title or product…',
    addLabel: 'Add discount',
    emptyMessage: kind === 'PRICE' ? 'Offer a lower price on a lot for a period.' : 'Give free units when distributors buy a set quantity.',
    keyOf: (d) => d.id,
    titleOf: (d) => d.title,
    subtitleOf: (d) => `${d.product_title} · ${formatDate(d.start)} – ${formatDate(d.end)}`,
    avatarOf: (d) => ({ label: d.product_title }),
    badgesOf: (d) => [d.running ? { label: 'Running', tone: 'success' } : d.is_active ? { label: 'Scheduled / ended', tone: 'neutral' } : { label: 'Off', tone: 'neutral' }],
    metricOf: (d) => (kind === 'PRICE' ? { value: formatKES(d.offer_price), label: `was ${formatKES(d.normal_price)}` } : { value: `${d.limit_quantity}+${d.awarded_quantity}`, label: 'buy + free' }),
    primaryColumn: { label: 'Discount', flex: 1.6 },
    columns: [
        { key: 'product', label: 'Product', flex: 1.8, render: (d) => d.product_title },
        kind === 'PRICE'
            ? { key: 'offer', label: 'Offer', flex: 1.2, render: (d) => `${formatKES(d.offer_price)} (was ${formatKES(d.normal_price)})` }
            : { key: 'deal', label: 'Deal', flex: 1.2, render: (d) => `Buy ${d.limit_quantity}, get ${d.awarded_quantity} free` },
        { key: 'dates', label: 'Runs', flex: 1.5, render: (d) => `${formatDate(d.start)} – ${formatDate(d.end)}` },
        { key: 'state', label: 'State', flex: 0.8, render: (d) => (d.running ? 'Running' : d.is_active ? 'Not now' : 'Off') },
    ],
});

export default function ManufacturerDiscounts() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [kind, setKind] = useState<Kind>('PRICE');
    const [rows, setRows] = useState<Discount[]>([]);
    const [lots, setLots] = useState<ManufacturerLot[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState<Discount | 'new' | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [d, s]: any[] = await Promise.all([manufacturerStaffApi.discounts(kind), manufacturerStaffApi.stock('ALL')]);
            if (ok(d)) {
                setRows(d.data.discounts ?? []);
                setLoadError(null);
            } else setLoadError(errorText(d, 'Could not load discounts.'));
            if (ok(s)) setLots(s.data.stock ?? []);
        } finally {
            setRefreshing(false);
        }
    }, [kind]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((d) => `${d.title} ${d.product_title}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);

    return (
        <>
            <AdminListView<Discount, string>
                variant={isLarge ? 'web' : 'mobile'}
                config={config(kind)}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                error={loadError}
                header={<View style={{ marginBottom: 8 }}><SegmentedControl<Kind> value={kind} onChange={setKind} options={[{ key: 'PRICE', label: 'Price' }, { key: 'QUANTITY', label: 'Quantity (free units)' }]} /></View>}
                items={items}
                allItems={items}
                onOpenCreate={() => setEditing('new')}
                onPressItem={(d) => setEditing(d)}
                onEditItem={(d) => setEditing(d)}
                stats={[
                    { label: 'Discounts', value: rows.length.toLocaleString() },
                    { label: 'Running', value: rows.filter((d) => d.running).length.toLocaleString(), color: '#10b981' },
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
            <DiscountSheet kind={kind} discount={editing} lots={lots} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
        </>
    );
}

function DiscountSheet({ kind, discount, lots, onClose, onSaved }: { kind: Kind; discount: Discount | 'new' | null; lots: ManufacturerLot[]; onClose: () => void; onSaved: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const existing = discount && discount !== 'new' ? discount : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lotOptions = lots.map((l) => ({ id: l.id, title: `${l.title}${l.batch ? ` · ${l.batch}` : ''} · ${formatKES(l.unit_price)}` }));

    return (
        <Formik
            key={`${kind}-${existing?.id ?? (discount ? 'new' : 'closed')}`}
            initialValues={{
                lot: existing?.lot ?? '',
                title: existing?.title ?? '',
                offer_price: existing?.offer_price ? String(Number(existing.offer_price)) : '',
                percent: existing?.percent && Number(existing.percent) ? String(Number(existing.percent)) : '',
                limit_quantity: existing?.limit_quantity ? String(existing.limit_quantity) : '',
                awarded_quantity: existing?.awarded_quantity ? String(existing.awarded_quantity) : '',
                start: existing?.start ?? '',
                end: existing?.end ?? '',
                is_active: existing ? existing.is_active : true,
            }}
            validationSchema={Yup.object({
                lot: existing ? Yup.string() : Yup.string().required('Pick the stock lot'),
                title: Yup.string().trim().required('Give it a title'),
                start: Yup.string().required('Start date'),
                end: Yup.string().required('End date'),
                ...(kind === 'QUANTITY'
                    ? {
                        limit_quantity: Yup.number().typeError('Enter a number').integer().min(1).required('Buy how many?'),
                        awarded_quantity: Yup.number().typeError('Enter a number').integer().min(1).required('How many free?'),
                    }
                    : {}),
            })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const base = { ...(existing ? { discount: existing.id } : { lot: v.lot }), title: v.title.trim(), start: v.start.slice(0, 10), end: v.end.slice(0, 10), is_active: v.is_active };
                    const res: any = kind === 'PRICE'
                        ? await manufacturerStaffApi.savePriceDiscount({ ...base, offer_price: v.offer_price || 0, percent: v.percent || 0 })
                        : await manufacturerStaffApi.saveQuantityDiscount({ ...base, limit_quantity: v.limit_quantity, awarded_quantity: v.awarded_quantity });
                    if (ok(res)) onSaved();
                    else setError(errorText(res, 'Could not save the discount.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet visible={!!discount} onClose={onClose} title={existing ? 'Edit discount' : kind === 'PRICE' ? 'New price discount' : 'New quantity discount'} icon="pricetag-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={560}>
                    <FormSection title="Discount" zIndex={20}>
                        {!existing ? <CustomAutocompletePicker name="lot" label="Stock lot" options={lotOptions} theme={theme} isDarkMode={isDarkMode} placeholder="Pick a lot…" /> : null}
                        <CustomTextField name="title" label="Title" required placeholder={kind === 'PRICE' ? 'e.g. December offer' : 'e.g. Buy 10 get 1'} />
                    </FormSection>
                    {kind === 'PRICE' ? (
                        <FormSection title="Offer" hint="Enter an offer price, or a percent off the list price. Never below the lot's cost.">
                            <FormRow>
                                <CustomTextField name="offer_price" label="Offer price (KES)" keyboardType="decimal-pad" />
                                <CustomTextField name="percent" label="Or percent off" keyboardType="decimal-pad" />
                            </FormRow>
                        </FormSection>
                    ) : (
                        <FormSection title="Deal" hint="Repeats: buying twice the quantity gives twice the free units.">
                            <FormRow>
                                <CustomTextField name="limit_quantity" label="Buy" required keyboardType="number-pad" />
                                <CustomTextField name="awarded_quantity" label="Get free" required keyboardType="number-pad" />
                            </FormRow>
                        </FormSection>
                    )}
                    <FormSection title="Runs">
                        <FormRow>
                            <DateField name="start" label="From" required />
                            <DateField name="end" label="Until" required />
                        </FormRow>
                        <SwitchField name="is_active" label="On" />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
