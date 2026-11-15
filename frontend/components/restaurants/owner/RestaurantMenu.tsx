// components/restaurants/owner/RestaurantMenu.tsx
//
// The restaurant's menu: dishes with price, section, preparation time, photo
// and an "available today" switch (unavailable dishes are hidden from customers).

import diningApi, { errorText, isOk, type MenuItem } from '@/api/diningApi';
import { AdminFormSheet, AdminListView, FormRow, FormSection, SheetButton, type AdminListConfig } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { pickImage, previewUri, type PickedImage } from '@/components/common/imagePicker';
import type { PageSize } from '@/components/common/PaginationBar';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

import { kes } from '../shared';

type Filter = 'ALL' | 'AVAILABLE' | 'HIDDEN';

const config: AdminListConfig<MenuItem> = {
    title: 'Menu',
    noun: ['dish', 'dishes'],
    icon: 'fast-food-outline',
    searchPlaceholder: 'Search dishes or sections…',
    addLabel: 'Add dish',
    emptyMessage: 'Add your dishes with prices so customers can order and book.',
    keyOf: (i) => i.id,
    titleOf: (i) => i.title,
    subtitleOf: (i) => [i.category, i.description].filter(Boolean).join(' · ') || null,
    avatarOf: (i) => ({ uri: i.image_url, icon: 'fast-food-outline' }),
    badgesOf: (i) => [i.is_available ? { label: 'On the menu', tone: 'success' } : { label: 'Hidden', tone: 'neutral' }],
    metricOf: (i) => ({ value: kes(i.price), label: i.preparation_minutes ? `~${i.preparation_minutes} min` : 'each' }),
    primaryColumn: { label: 'Dish', flex: 2.4 },
    columns: [
        { key: 'cat', label: 'Section', flex: 1.2, render: (i) => i.category || '—' },
        { key: 'prep', label: 'Prep time', flex: 0.9, render: (i) => (i.preparation_minutes ? `${i.preparation_minutes} min` : '—') },
        { key: 'avail', label: 'Status', flex: 1, render: (i) => (i.is_available ? 'On the menu' : 'Hidden') },
        { key: 'price', label: 'Price', flex: 1, align: 'right', render: (i) => kes(i.price) },
    ],
};

const schema = Yup.object({
    title: Yup.string().trim().required('Name the dish'),
    price: Yup.number().typeError('Enter a price').positive('Enter a price').required('Enter a price'),
    category: Yup.string().trim().optional(),
    preparation_minutes: Yup.number().typeError('Minutes only').integer().min(0).max(600).optional(),
    description: Yup.string().trim().max(256).optional(),
});

export default function RestaurantMenu() {
    const { width } = useWindowDimensions();
    const [items, setItems] = useState<MenuItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [editing, setEditing] = useState<MenuItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await diningApi.myMenu();
            if (isOk(res)) {
                setItems(res.data.menu.items ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load the menu.'));
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

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter(
            (i) =>
                (filter === 'ALL' || (filter === 'AVAILABLE') === i.is_available) &&
                (!q || `${i.title} ${i.category ?? ''} ${i.description ?? ''}`.toLowerCase().includes(q)),
        );
    }, [items, query, filter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, filtered.length);
    const upsert = (i: MenuItem) => setItems((prev) => (prev.some((x) => x.id === i.id) ? prev.map((x) => (x.id === i.id ? i : x)) : [i, ...prev]));
    const sections = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

    return (
        <>
            <AdminListView<MenuItem, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                error={error}
                items={filtered.slice(start, end)}
                allItems={filtered}
                onOpenCreate={() => {
                    setEditing(null);
                    setFormOpen(true);
                }}
                onPressItem={(i) => {
                    setEditing(i);
                    setFormOpen(true);
                }}
                rowActions={(i) => [
                    {
                        icon: i.is_available ? 'eye-off-outline' : 'eye-outline',
                        label: i.is_available ? 'Hide from menu' : 'Show on menu',
                        onPress: async () => {
                            const res: any = await diningApi.saveMenuItem({ id: i.id, title: i.title, price: i.price, category: i.category ?? '', description: i.description ?? '', preparation_minutes: i.preparation_minutes ?? '', is_available: !i.is_available });
                            if (isOk(res)) upsert(res.data.menu_item);
                        },
                    },
                    { icon: 'create-outline', label: 'Edit dish', onPress: () => { setEditing(i); setFormOpen(true); }, tone: 'primary' },
                ]}
                stats={[
                    { label: 'Dishes', value: String(items.length) },
                    { label: 'On the menu', value: String(items.filter((i) => i.is_available).length), color: '#10b981' },
                    { label: 'Sections', value: String(sections.length) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: items.length },
                        { key: 'AVAILABLE', label: 'On the menu', icon: 'eye-outline', count: items.filter((i) => i.is_available).length },
                        { key: 'HIDDEN', label: 'Hidden', icon: 'eye-off-outline', count: items.filter((i) => !i.is_available).length },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
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
            <DishForm visible={formOpen} dish={editing} sections={sections} onClose={() => setFormOpen(false)} onSaved={(i) => { upsert(i); setFormOpen(false); }} />
        </>
    );
}

function DishForm({ visible, dish, sections, onClose, onSaved }: { visible: boolean; dish: MenuItem | null; sections: string[]; onClose: () => void; onSaved: (i: MenuItem) => void }) {
    const { theme } = useAuth();
    const [image, setImage] = useState<PickedImage | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (visible) {
            setImage(null);
            setError(null);
        }
    }, [visible]);
    const shown = image ? previewUri(image) : dish?.image_url;

    return (
        <Formik
            key={`${visible}-${dish?.id ?? 'new'}`}
            initialValues={{
                title: dish?.title ?? '',
                price: dish ? String(Number(dish.price)) : '',
                category: dish?.category ?? '',
                preparation_minutes: dish?.preparation_minutes ? String(dish.preparation_minutes) : '',
                description: dish?.description ?? '',
                is_available: dish ? dish.is_available : true,
            }}
            validationSchema={schema}
            onSubmit={async (v) => {
                setError(null);
                const res: any = await diningApi.saveMenuItem({ ...(dish ? { id: dish.id } : {}), ...v }, image);
                if (isOk(res)) onSaved(res.data.menu_item);
                else setError(errorText(res, 'The dish could not be saved.'));
            }}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={dish ? 'Edit dish' : 'New dish'}
                    subtitle="What customers see on your menu"
                    icon="fast-food-outline"
                    submitLabel={dish ? 'Save dish' : 'Add to menu'}
                    submitting={f.isSubmitting}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Dish">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Beef pilau" autoCapitalize="words" />
                        <FormRow>
                            <CustomTextField name="price" label="Price (KES)" required placeholder="450" keyboardType="decimal-pad" />
                            <CustomTextField name="preparation_minutes" label="Prep time (min)" placeholder="Optional" keyboardType="number-pad" />
                        </FormRow>
                        <CustomTextField
                            name="category"
                            label="Section"
                            placeholder={sections.length ? `e.g. ${sections.slice(0, 3).join(', ')}` : 'e.g. Breakfast, Mains, Drinks'}
                            autoCapitalize="words"
                        />
                        <CustomTextField name="description" label="Description" placeholder="What's in it — optional" multiline />
                    </FormSection>
                    <FormSection title="Photo" hint="A good photo sells the dish.">
                        <View className="flex-row items-center" style={{ gap: 12 }}>
                            <View style={{ width: 96, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: `${theme.primary}10`, alignItems: 'center', justifyContent: 'center' }}>
                                {shown ? <Image source={{ uri: shown }} style={{ width: 96, height: 72 }} /> : <Text style={{ fontSize: 26 }}>🍽</Text>}
                            </View>
                            <SheetButton label={shown ? 'Change photo' : 'Add photo'} icon="camera-outline" variant="secondary" onPress={async () => { const p = await pickImage({ aspect: [4, 3] }); if (p) setImage(p); }} />
                        </View>
                    </FormSection>
                    <FormSection title="Availability">
                        <SwitchField name="is_available" label="On the menu" hint="Turn off when it's finished for the day." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
