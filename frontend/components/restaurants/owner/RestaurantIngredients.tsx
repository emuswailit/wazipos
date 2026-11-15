// components/restaurants/owner/RestaurantIngredients.tsx
//
// What customers can build custom dishes from: name, section (e.g. Proteins,
// Starches, Vegetables, Sauces), unit and an indicative price per unit. You
// still price every custom request yourself.

import diningApi, { errorText, isOk, type Ingredient } from '@/api/diningApi';
import { AdminFormSheet, AdminListView, FormRow, FormSection, type AdminListConfig } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import type { PageSize } from '@/components/common/PaginationBar';
import { SwitchField } from '@/components/common/SwitchField';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

import { kes } from '../shared';

const config: AdminListConfig<Ingredient> = {
    title: 'Ingredients',
    noun: ['ingredient', 'ingredients'],
    icon: 'leaf-outline',
    searchPlaceholder: 'Search ingredients…',
    addLabel: 'Add ingredient',
    emptyMessage: 'List what customers can pick for custom dishes — proteins, starches, vegetables, sauces.',
    keyOf: (i) => i.id,
    titleOf: (i) => i.name,
    subtitleOf: (i) => i.category,
    avatarOf: () => ({ icon: 'leaf-outline' }),
    badgesOf: (i) => [i.is_available ? { label: 'Available', tone: 'success' } : { label: 'Out', tone: 'neutral' }],
    metricOf: (i) => ({ value: kes(i.price), label: `per ${i.unit_label}` }),
    primaryColumn: { label: 'Ingredient', flex: 2 },
    columns: [
        { key: 'cat', label: 'Section', flex: 1.4, render: (i) => i.category || '—' },
        { key: 'unit', label: 'Unit', flex: 1, render: (i) => i.unit_label },
        { key: 'price', label: 'Price', flex: 1, align: 'right', render: (i) => kes(i.price) },
        { key: 'avail', label: 'Status', flex: 1, render: (i) => (i.is_available ? 'Available' : 'Out') },
    ],
};

const schema = Yup.object({
    name: Yup.string().trim().required('Name the ingredient'),
    price: Yup.number().typeError('Enter a price').min(0).required('Enter a price (0 if included)'),
    category: Yup.string().trim().optional(),
    unit_label: Yup.string().trim().optional(),
});

export default function RestaurantIngredients() {
    const { width } = useWindowDimensions();
    const [items, setItems] = useState<Ingredient[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [editing, setEditing] = useState<Ingredient | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await diningApi.myIngredients();
            if (isOk(res)) {
                setItems(res.data.ingredients ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load ingredients.'));
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

    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => !q || `${i.name} ${i.category ?? ''}`.toLowerCase().includes(q));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, filtered.length);
    const sections = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];
    const open = (i: Ingredient | null) => {
        setEditing(i);
        setFormError(null);
        setFormOpen(true);
    };

    return (
        <>
            <AdminListView<Ingredient>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                error={error}
                items={filtered.slice(start, end)}
                allItems={filtered}
                onOpenCreate={() => open(null)}
                onPressItem={open}
                stats={[
                    { label: 'Ingredients', value: String(items.length) },
                    { label: 'Available', value: String(items.filter((i) => i.is_available).length), color: '#10b981' },
                ]}
                page={page}
                pageSize={pageSize}
                totalItems={filtered.length}
                totalPages={totalPages}
                pageStart={start}
                pageEnd={end}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                }}
            />
            <Formik
                key={`${formOpen}-${editing?.id ?? 'new'}`}
                initialValues={{
                    name: editing?.name ?? '',
                    category: editing?.category ?? '',
                    unit_label: editing?.unit_label ?? 'portion',
                    price: editing ? String(Number(editing.price)) : '',
                    is_available: editing ? editing.is_available : true,
                }}
                validationSchema={schema}
                onSubmit={async (v) => {
                    setFormError(null);
                    const res: any = await diningApi.saveIngredient({ ...(editing ? { id: editing.id } : {}), ...v });
                    if (isOk(res)) {
                        const it: Ingredient = res.data.ingredient;
                        setItems((prev) => (prev.some((x) => x.id === it.id) ? prev.map((x) => (x.id === it.id ? it : x)) : [...prev, it]));
                        setFormOpen(false);
                    } else setFormError(errorText(res, 'The ingredient could not be saved.'));
                }}
            >
                {(f) => (
                    <AdminFormSheet
                        visible={formOpen}
                        onClose={() => setFormOpen(false)}
                        title={editing ? 'Edit ingredient' : 'New ingredient'}
                        subtitle="Customers pick these when they design a dish"
                        icon="leaf-outline"
                        submitLabel={editing ? 'Save' : 'Add ingredient'}
                        submitting={f.isSubmitting}
                        error={formError}
                        onSubmit={() => f.handleSubmit()}
                    >
                        <FormSection title="Ingredient">
                            <CustomTextField name="name" label="Name" required placeholder="e.g. Kienyeji chicken" autoCapitalize="words" />
                            <CustomTextField
                                name="category"
                                label="Section"
                                placeholder={sections.length ? `e.g. ${sections.slice(0, 3).join(', ')}` : 'e.g. Proteins, Starches, Vegetables'}
                                autoCapitalize="words"
                            />
                            <FormRow>
                                <CustomTextField name="price" label="Price (KES)" required keyboardType="decimal-pad" placeholder="e.g. 250" />
                                <CustomTextField name="unit_label" label="Per" placeholder="portion" />
                            </FormRow>
                            <SwitchField name="is_available" label="Available" hint="Turn off when you've run out." />
                        </FormSection>
                    </AdminFormSheet>
                )}
            </Formik>
        </>
    );
}
