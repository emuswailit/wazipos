// components/manufacturers/ManufacturerProducts.tsx
//
// Manufacturer -> Products: your product master, the source of everything sold on
// WaziPOS. Each product (name, barcode, category, pack size, unit / pack weight and
// size, VAT, and for pharmaceutical manufacturers the drug preparation) is what every
// distributor, wholesaler, retailer, restaurant and hotel stocks. Weights matter:
// deliveries are planned and priced from them. Each row also shows how far the
// product has reached: how many distributors, wholesalers and retailers stock it now.
// Backend: manufacturers/staff GetMyProducts / SaveProduct.

import { manufacturerStaffApi, type ManufacturerProduct, type ProductScope } from '@/api/manufacturersApi';
import { AdminFormSheet, AdminListView, ConfigDetailsSheet, DetailsDock, FormRow, FormSection, textOr, type AdminListConfig } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

import { errorText, ok } from './OrderDetailsSheet';

const kg = (v: string | null | undefined) => (v ? `${Number(v).toLocaleString()} kg` : '—');

export const productsConfig: AdminListConfig<ManufacturerProduct> = {
    title: 'Products',
    noun: ['product', 'products'],
    icon: 'pricetags-outline',
    searchPlaceholder: 'Search name, barcode or packaging…',
    addLabel: 'New product',
    emptyMessage: 'Add the products you make. Every business on WaziPOS stocks them from your master.',
    keyOf: (p) => p.id,
    titleOf: (p) => p.title,
    subtitleOf: (p) => [p.packaging, p.units_per_pack ? `${p.units_per_pack} per pack` : null, p.category_title].filter(Boolean).join(' · ') || null,
    avatarOf: (p) => ({ label: p.title }),
    badgesOf: (p) => [
        p.active ? { label: 'Active', tone: 'success' } : { label: 'Inactive', tone: 'neutral' },
        ...(p.weight_captured ? [] : [{ label: 'Weight missing', tone: 'warning' as const }]),
        ...(p.preparation ? [{ label: 'Medicine', tone: 'violet' as const }] : []),
        ...(p.batches ? [{ label: `${p.batches} batch(es) in stock`, tone: 'info' as const }] : []),
    ],
    metricOf: (p) => ({ value: String(p.reach.distributors + p.reach.wholesalers + p.reach.retailers), label: 'stocking it' }),
    primaryColumn: { label: 'Product', flex: 2.2 },
    columns: [
        { key: 'code', label: 'Barcode', flex: 1, render: (p) => textOr(p.bar_code) },
        { key: 'pack', label: 'Per pack', flex: 0.6, align: 'right', render: (p) => String(p.units_per_pack ?? '—') },
        { key: 'weight', label: 'Unit weight', flex: 0.8, align: 'right', render: (p) => kg(p.weight_kg) },
        { key: 'stock', label: 'In stock', flex: 0.8, align: 'right', render: (p) => p.units_in_stock.toLocaleString() },
        { key: 'dist', label: 'Distributors', flex: 0.8, align: 'right', render: (p) => String(p.reach.distributors) },
        { key: 'whole', label: 'Wholesalers', flex: 0.8, align: 'right', render: (p) => String(p.reach.wholesalers) },
        { key: 'retail', label: 'Retailers', flex: 0.8, align: 'right', render: (p) => String(p.reach.retailers) },
    ],
};

export default function ManufacturerProducts() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;
    const [scope, setScope] = useState<ProductScope>('ALL');
    const [rows, setRows] = useState<ManufacturerProduct[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [viewing, setViewing] = useState<ManufacturerProduct | null>(null);
    const [editing, setEditing] = useState<ManufacturerProduct | 'new' | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await manufacturerStaffApi.products(scope);
            if (ok(res)) {
                setRows(res.data.products ?? []);
                setLoadError(null);
            } else setLoadError(errorText(res, 'Could not load your products.'));
        } finally {
            setRefreshing(false);
        }
    }, [scope]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((p) => `${p.title} ${p.bar_code ?? ''} ${p.packaging}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);

    return (
        <>
            <DetailsDock placeholder="Pick a product to see it." pane={<ConfigDetailsSheet config={productsConfig} item={viewing} heading="Product" onClose={() => setViewing(null)} onEdit={(p) => { setViewing(null); setEditing(p); }} />}>
                <AdminListView<ManufacturerProduct, ProductScope>
                    variant={isLarge ? 'web' : 'mobile'}
                    config={productsConfig}
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
                    onEditItem={(p) => setEditing(p)}
                    stats={[
                        { label: 'Products', value: rows.length.toLocaleString() },
                        { label: 'Weight missing', value: rows.filter((p) => !p.weight_captured).length.toLocaleString(), color: '#f59e0b' },
                        { label: 'Distributors stocking', value: Math.max(0, ...rows.map((p) => p.reach.distributors)).toLocaleString() },
                        { label: 'Retailers stocking', value: Math.max(0, ...rows.map((p) => p.reach.retailers)).toLocaleString(), color: '#10b981' },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline' },
                            { key: 'ACTIVE', label: 'Active', icon: 'checkmark-circle-outline' },
                            { key: 'INACTIVE', label: 'Inactive', icon: 'pause-circle-outline' },
                            { key: 'NO_WEIGHT', label: 'Weight missing', icon: 'scale-outline' },
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
            <ProductSheet product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
        </>
    );
}

function ProductSheet({ product, onClose, onSaved }: { product: ManufacturerProduct | 'new' | null; onClose: () => void; onSaved: () => void }) {
    const { theme, isDarkMode } = useAuth();
    const p = product && product !== 'new' ? product : null;
    const [lookups, setLookups] = useState<{ categories: { id: string; title: string }[]; sub_categories: { id: string; title: string; category: string | null }[]; pharmaceutical: boolean } | null>(null);
    const [preps, setPreps] = useState<{ id: string; title: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!product || lookups) return;
        manufacturerStaffApi.productLookups().then((res: any) => ok(res) && setLookups(res.data.data));
    }, [product, lookups]);
    const searchPreps = useCallback(async (q: string) => {
        if (q.trim().length < 2) return;
        setSearching(true);
        try {
            const res: any = await manufacturerStaffApi.searchPreparations(q.trim());
            if (ok(res)) setPreps(res.data.preparations ?? []);
        } finally {
            setSearching(false);
        }
    }, []);

    return (
        <Formik
            key={p?.id ?? (product ? 'new' : 'closed')}
            initialValues={{
                title: p?.title ?? '',
                packaging: p?.packaging ?? '',
                bar_code: p?.bar_code ?? '',
                category: p?.category ?? '',
                sub_category: p?.sub_category ?? '',
                units_per_pack: p?.units_per_pack ? String(p.units_per_pack) : '1',
                weight_kg: p?.weight_captured ? String(Number(p.weight_kg)) : '',
                pack_weight_kg: p?.pack_weight_kg ? String(Number(p.pack_weight_kg)) : '',
                length_cm: p?.length_cm ? String(Number(p.length_cm)) : '',
                width_cm: p?.width_cm ? String(Number(p.width_cm)) : '',
                height_cm: p?.height_cm ? String(Number(p.height_cm)) : '',
                description: p?.description ?? '',
                preparation: p?.preparation ?? '',
                is_vatable: p ? p.is_vatable : true,
                is_pom: p ? p.is_pom : false,
                active: p ? p.active : true,
            }}
            validationSchema={Yup.object({
                title: Yup.string().trim().required('Name the product'),
                category: Yup.string().required('Pick the category'),
                units_per_pack: Yup.number().typeError('A number').integer().min(1, 'At least 1').required('Units per pack'),
                weight_kg: Yup.number().typeError('Enter kg').moreThan(0, 'Above 0').required('Weight of one unit (kg)'),
                pack_weight_kg: Yup.number().typeError('Enter kg').moreThan(0).nullable(),
            })}
            onSubmit={async (v) => {
                setSaving(true);
                setError(null);
                try {
                    const res: any = await manufacturerStaffApi.saveProduct({
                        ...(p ? { product: p.id } : {}),
                        title: v.title.trim(),
                        packaging: v.packaging.trim(),
                        bar_code: v.bar_code.trim(),
                        category: v.category,
                        sub_category: v.sub_category || '',
                        units_per_pack: v.units_per_pack,
                        weight_kg: v.weight_kg,
                        pack_weight_kg: v.pack_weight_kg,
                        length_cm: v.length_cm,
                        width_cm: v.width_cm,
                        height_cm: v.height_cm,
                        description: v.description,
                        ...(lookups?.pharmaceutical ? { preparation: v.preparation || '', is_pom: v.is_pom } : {}),
                        is_vatable: v.is_vatable,
                        active: v.active,
                    });
                    if (ok(res)) onSaved();
                    else setError(errorText(res, 'Could not save the product.'));
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => {
                const subs = (lookups?.sub_categories ?? []).filter((s) => !f.values.category || s.category === f.values.category);
                return (
                    <AdminFormSheet visible={!!product} onClose={onClose} title={p ? `Edit · ${p.title}` : 'New product'} icon="pricetags-outline" submitLabel="Save" submitting={saving} onSubmit={() => f.handleSubmit()} error={error} width={640}>
                        <FormSection title="Product" zIndex={30}>
                            <CustomTextField name="title" label="Name" required placeholder="e.g. Maize flour 2 kg" />
                            <FormRow>
                                <CustomTextField name="packaging" label="Packaging" placeholder="e.g. Paper bag, 500 ml bottle" />
                                <CustomTextField name="bar_code" label="Barcode" placeholder="Scan or type" />
                            </FormRow>
                            <FormRow zIndex={30}>
                                <CustomAutocompletePicker name="category" label="Category" options={lookups?.categories ?? []} theme={theme} isDarkMode={isDarkMode} placeholder="Pick a category…" loading={!lookups} initialTitle={p?.category_title ?? undefined} />
                                <CustomAutocompletePicker name="sub_category" label="Sub-category (optional)" options={subs} theme={theme} isDarkMode={isDarkMode} placeholder="Pick…" initialTitle={p?.sub_category_title ?? undefined} />
                            </FormRow>
                            <CustomTextField name="description" label="Description" multiline />
                        </FormSection>
                        {lookups?.pharmaceutical ? (
                            <FormSection title="Medicine" hint="Medicines can only be stocked by pharmaceutical businesses, and every batch needs an expiry date." zIndex={20}>
                                <LiveSearchAutocompletePicker name="preparation" label="Drug preparation (leave empty if not a medicine)" options={preps} theme={theme} isDarkMode={isDarkMode} loading={searching} placeholder="Type the preparation…" loadingPlaceholder="Searching…" noMatchText="No preparations found." emptyText="Type at least 2 letters." onSearch={(q) => void searchPreps(q)} initialTitle={p?.preparation_title ?? undefined} />
                                <SwitchField name="is_pom" label="Prescription only (POM)" />
                            </FormSection>
                        ) : null}
                        <FormSection title="Pack and weight" hint="Every order is weighed from these to plan and price its delivery. Weigh one unit as sold loose; the pack weight includes packaging (blank = unit weight × units per pack).">
                            <FormRow>
                                <CustomTextField name="units_per_pack" label="Units per pack" required keyboardType="number-pad" />
                                <CustomTextField name="weight_kg" label="Weight of one unit (kg)" required keyboardType="decimal-pad" placeholder="e.g. 0.25" />
                                <CustomTextField name="pack_weight_kg" label="Pack weight (kg)" keyboardType="decimal-pad" />
                            </FormRow>
                            <FormRow>
                                <CustomTextField name="length_cm" label="Length (cm)" keyboardType="decimal-pad" />
                                <CustomTextField name="width_cm" label="Width (cm)" keyboardType="decimal-pad" />
                                <CustomTextField name="height_cm" label="Height (cm)" keyboardType="decimal-pad" />
                            </FormRow>
                        </FormSection>
                        <FormSection title="Selling">
                            <SwitchField name="is_vatable" label="Charges VAT" />
                            <SwitchField name="active" label="Active" hint="Inactive products can't be sold in new batches or orders." />
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
