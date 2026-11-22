// components/distributors/DistributorStock.tsx
//
// Distributor -> Stock: the lots you sell to wholesalers — quantity, cost (never
// shown to buyers), list price, the price after a running discount, and whether
// it's listed for wholesalers. Receive a new lot or edit one (a count sets the
// quantity in stock). Backend: distributors/staff GetStock / SaveStockLot.

import { distributorStaffApi, type DistributorLot, type StockScope } from '@/api/distributorsApi';
import { AdminFormSheet, AdminListView, ChoiceChips, DetailsDock, ConfigDetailsSheet, formatDate, FormRow, FormSection, textOr, type AdminListConfig } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

import { errorText, ok } from './OrderDetailsSheet';

const UNITS = ['Pack', 'Piece', 'Box', 'Carton', 'Strip', 'Bottle', 'Tube', 'Sachet'];

export const stockConfig: AdminListConfig<DistributorLot> = {
    title: 'Stock',
    noun: ['lot', 'lots'],
    icon: 'cube-outline',
    searchPlaceholder: 'Search product, barcode or batch…',
    addLabel: 'Receive stock',
    emptyMessage: 'Receive the stock you sell to wholesalers.',
    keyOf: (l) => l.id,
    titleOf: (l) => l.title,
    subtitleOf: (l) => [l.batch ? `Batch ${l.batch}` : null, l.expiry_date ? `Expires ${formatDate(l.expiry_date)}` : null].filter(Boolean).join(' · ') || null,
    avatarOf: (l) => ({ label: l.title }),
    badgesOf: (l) => [
        l.current_unit_quantity > 0 ? { label: `${l.current_unit_quantity} ${l.unit_of_receipt}`, tone: 'success' } : { label: 'Out of stock', tone: 'danger' },
        ...(l.is_listed === false ? [{ label: 'Not listed', tone: 'neutral' as const }] : []),
        ...(Number(l.discount_unit_selling_price) > 0 ? [{ label: 'On offer', tone: 'violet' as const }] : []),
        ...(l.quantity_discount ? [{ label: `Buy ${l.quantity_discount.limit_quantity} get ${l.quantity_discount.awarded_quantity}`, tone: 'info' as const }] : []),
    ],
    metricOf: (l) => ({ value: formatKES(l.final_unit_selling_price), label: `per ${l.unit_of_receipt.toLowerCase()}` }),
    primaryColumn: { label: 'Product', flex: 2.2 },
    columns: [
        { key: 'qty', label: 'In stock', flex: 0.9, align: 'right', render: (l) => `${l.current_unit_quantity} ${l.unit_of_receipt}` },
        { key: 'cost', label: 'Cost', flex: 0.9, align: 'right', render: (l) => formatKES(l.unit_buying_price) },
        { key: 'price', label: 'Price', flex: 0.9, align: 'right', render: (l) => formatKES(l.unit_selling_price) },
        { key: 'final', label: 'Sells at', flex: 0.9, align: 'right', render: (l) => formatKES(l.final_unit_selling_price) },
        { key: 'batch', label: 'Batch', flex: 0.9, render: (l) => textOr(l.batch) },
        { key: 'exp', label: 'Expires', flex: 0.9, render: (l) => formatDate(l.expiry_date) },
        { key: 'listed', label: 'Listed', flex: 0.6, render: (l) => (l.is_listed === false ? 'No' : 'Yes') },
    ],
};

export default function DistributorStock() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [scope, setScope] = useState<StockScope>('ALL');
    const [rows, setRows] = useState<DistributorLot[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<DistributorLot | null>(null);
    const [editing, setEditing] = useState<DistributorLot | 'new' | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await distributorStaffApi.stock(scope);
            if (ok(res)) {
                setRows(res.data.stock ?? []);
                setLoadError(null);
            } else setLoadError(errorText(res, 'Could not load stock.'));
        } finally {
            setRefreshing(false);
        }
    }, [scope]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((l) => `${l.title} ${l.bar_code ?? ''} ${l.batch ?? ''}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const value = rows.reduce((s, l) => s + Number(l.unit_buying_price || 0) * l.current_unit_quantity, 0);

    return (
        <>
            <DetailsDock placeholder="Pick a lot to see it." pane={<ConfigDetailsSheet config={stockConfig} item={viewing} heading="Stock lot" onClose={() => setViewing(null)} onEdit={(l) => { setViewing(null); setEditing(l); }} />}>
                <AdminListView<DistributorLot, StockScope>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={stockConfig}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={load}
                    refreshing={refreshing}
                    sourceLabel={loadError ? 'Not loaded' : 'Server'}
                    sourceTone={loadError ? 'none' : 'server'}
                    error={loadError}
                    items={items}
                    allItems={items}
                    onOpenCreate={() => setEditing('new')}
                    onPressItem={setViewing}
                    onEditItem={(l) => setEditing(l)}
                    stats={[
                        { label: 'Lots', value: rows.length.toLocaleString() },
                        { label: 'In stock', value: rows.filter((l) => l.current_unit_quantity > 0).length.toLocaleString(), color: '#10b981' },
                        { label: 'Out of stock', value: rows.filter((l) => l.current_unit_quantity <= 0).length.toLocaleString(), color: '#f43f5e' },
                        { label: 'Stock value (cost)', value: formatKES(value) },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline' },
                            { key: 'IN_STOCK', label: 'In stock', icon: 'checkmark-circle-outline' },
                            { key: 'OUT_OF_STOCK', label: 'Out of stock', icon: 'alert-circle-outline' },
                            { key: 'UNLISTED', label: 'Not listed', icon: 'eye-off-outline' },
                        ],
                        value: scope,
                        onChange: setScope,
                        allKey: 'ALL',
                    }}
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
            <LotSheet lot={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
        </>
    );
}

function LotSheet({ lot, onClose, onSaved }: { lot: DistributorLot | 'new' | null; onClose: () => void; onSaved: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const existing = lot && lot !== 'new' ? lot : null;
    const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const draft = useRef(`lot-${Date.now()}`);

    const onSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) return;
        setSearching(true);
        try {
            const res: any = await distributorStaffApi.searchProducts(q.trim());
            if (ok(res)) setProducts((res.data.products ?? []).map((p: any) => ({ id: p.id, title: p.bar_code ? `${p.title} · ${p.bar_code}` : p.title })));
        } finally {
            setSearching(false);
        }
    }, []);

    return (
        <Formik
            key={existing?.id ?? (lot ? 'new' : 'closed')}
            initialValues={{
                product: existing?.product ?? '',
                received: '',
                current: existing ? String(existing.current_unit_quantity) : '',
                unit: existing?.unit_of_receipt ?? 'Pack',
                buying: existing ? String(Number(existing.unit_buying_price)) : '',
                selling: existing ? String(Number(existing.unit_selling_price)) : '',
                batch: existing?.batch ?? '',
                manufactured: existing?.manufacture_date ?? '',
                expiry: existing?.expiry_date ?? '',
                listed: existing ? existing.is_listed !== false : true,
            }}
            validationSchema={Yup.object({
                product: existing ? Yup.string() : Yup.string().required('Pick the product'),
                received: existing ? Yup.string() : Yup.number().typeError('Enter a number').integer().min(1, 'At least 1').required('How many came in?'),
                buying: Yup.number().typeError('Enter an amount').min(0).required('Cost per unit'),
                selling: Yup.number().typeError('Enter an amount').moreThan(0, 'Above 0').required('Price per unit'),
            })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const res: any = await distributorStaffApi.saveLot({
                        ...(existing ? { lot: existing.id, current_unit_quantity: v.current } : { product: v.product, received_unit_quantity: v.received, draft_id: draft.current }),
                        unit_of_receipt: v.unit,
                        unit_buying_price: v.buying,
                        unit_selling_price: v.selling,
                        batch: v.batch.trim(),
                        manufacture_date: v.manufactured ? v.manufactured.slice(0, 10) : '',
                        expiry_date: v.expiry ? v.expiry.slice(0, 10) : '',
                        is_listed: v.listed,
                    });
                    if (ok(res)) {
                        draft.current = `lot-${Date.now()}`;
                        onSaved();
                    } else setError(errorText(res, 'Could not save the stock.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet visible={!!lot} onClose={onClose} title={existing ? `Edit · ${existing.title}` : 'Receive stock'} icon="cube-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={600}>
                    {!existing ? (
                        <FormSection title="Product" zIndex={20}>
                            <LiveSearchAutocompletePicker name="product" label="Product" options={products} theme={theme} isDarkMode={isDarkMode} loading={searching} placeholder="Type the product name or barcode…" loadingPlaceholder="Searching…" noMatchText="No products found." emptyText="Type at least 2 letters." onSearch={(q) => void onSearch(q)} />
                        </FormSection>
                    ) : null}
                    <FormSection title="Quantity">
                        <FormRow>
                            {existing ? <CustomTextField name="current" label="In stock now (count)" keyboardType="number-pad" /> : <CustomTextField name="received" label="Quantity received" required keyboardType="number-pad" />}
                        </FormRow>
                        <ChoiceChips<string> label="Unit" options={UNITS.map((u) => ({ value: u, label: u }))} value={f.values.unit} onChange={(u) => f.setFieldValue('unit', u)} />
                    </FormSection>
                    <FormSection title="Prices (per unit)" hint="Cost is never shown to wholesalers. Price discounts lower the selling price for a period.">
                        <FormRow>
                            <CustomTextField name="buying" label="Cost (KES)" required keyboardType="decimal-pad" />
                            <CustomTextField name="selling" label="Selling price (KES)" required keyboardType="decimal-pad" />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Batch" hint="Medicines need an expiry date.">
                        <CustomTextField name="batch" label="Batch number" autoCapitalize="characters" />
                        <FormRow>
                            <DateField name="manufactured" label="Manufactured" />
                            <DateField name="expiry" label="Expires" />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Listing">
                        <SwitchField name="listed" label="Listed for wholesalers" hint="Unlisted lots are kept out of wholesalers' catalogues." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
