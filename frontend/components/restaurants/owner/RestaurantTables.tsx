// components/restaurants/owner/RestaurantTables.tsx
//
// The restaurant's tables (name + seats): used when seating table bookings.

import diningApi, { errorText, isOk, type RestaurantTable } from '@/api/diningApi';
import { AdminFormSheet, AdminListView, FormRow, FormSection, type AdminListConfig } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import type { PageSize } from '@/components/common/PaginationBar';
import { SwitchField } from '@/components/common/SwitchField';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

const config: AdminListConfig<RestaurantTable> = {
    title: 'Tables',
    noun: ['table', 'tables'],
    icon: 'grid-outline',
    searchPlaceholder: 'Search tables…',
    addLabel: 'Add table',
    emptyMessage: 'Add your tables so you can seat table bookings.',
    keyOf: (t) => t.id,
    titleOf: (t) => t.title,
    subtitleOf: (t) => t.description,
    avatarOf: (t) => ({ label: t.title }),
    badgesOf: (t) => [t.is_available ? { label: 'In use', tone: 'success' } : { label: 'Out of use', tone: 'neutral' }],
    metricOf: (t) => ({ value: String(t.seats), label: 'seats' }),
    primaryColumn: { label: 'Table', flex: 2 },
    columns: [
        { key: 'seats', label: 'Seats', flex: 1, render: (t) => String(t.seats) },
        { key: 'desc', label: 'Notes', flex: 2, render: (t) => t.description || '—' },
        { key: 'avail', label: 'Status', flex: 1, render: (t) => (t.is_available ? 'In use' : 'Out of use') },
    ],
};

const schema = Yup.object({
    title: Yup.string().trim().required('Name the table, e.g. T1'),
    seats: Yup.number().typeError('Enter a number').integer().min(1).max(100).required('How many seats?'),
    description: Yup.string().trim().max(48, 'Keep it short').optional(),
});

export default function RestaurantTables() {
    const { width } = useWindowDimensions();
    const [tables, setTables] = useState<RestaurantTable[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [editing, setEditing] = useState<RestaurantTable | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await diningApi.myMenu();
            if (isOk(res)) {
                setTables(res.data.menu.tables ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load tables.'));
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
    const filtered = tables.filter((t) => !q || `${t.title} ${t.description ?? ''}`.toLowerCase().includes(q));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, filtered.length);
    const open = (t: RestaurantTable | null) => {
        setEditing(t);
        setFormError(null);
        setFormOpen(true);
    };

    return (
        <>
            <AdminListView<RestaurantTable>
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
                    { label: 'Tables', value: String(tables.length) },
                    { label: 'Seats', value: String(tables.filter((t) => t.is_available).reduce((s, t) => s + t.seats, 0)) },
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
                initialValues={{ title: editing?.title ?? '', seats: editing ? String(editing.seats) : '4', description: editing?.description ?? '', is_available: editing ? editing.is_available : true }}
                validationSchema={schema}
                onSubmit={async (v) => {
                    setFormError(null);
                    const res: any = await diningApi.saveTable({ ...(editing ? { id: editing.id } : {}), ...v });
                    if (isOk(res)) {
                        const t: RestaurantTable = res.data.table;
                        setTables((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t]));
                        setFormOpen(false);
                    } else setFormError(errorText(res, 'The table could not be saved.'));
                }}
            >
                {(f) => (
                    <AdminFormSheet
                        visible={formOpen}
                        onClose={() => setFormOpen(false)}
                        title={editing ? 'Edit table' : 'New table'}
                        icon="grid-outline"
                        submitLabel={editing ? 'Save table' : 'Add table'}
                        submitting={f.isSubmitting}
                        error={formError}
                        onSubmit={() => f.handleSubmit()}
                    >
                        <FormSection title="Table">
                            <FormRow>
                                <CustomTextField name="title" label="Name" required placeholder="e.g. T1, Terrace 2" autoCapitalize="characters" />
                                <CustomTextField name="seats" label="Seats" required keyboardType="number-pad" />
                            </FormRow>
                            <CustomTextField name="description" label="Notes" placeholder="e.g. By the window" />
                            <SwitchField name="is_available" label="In use" />
                        </FormSection>
                    </AdminFormSheet>
                )}
            </Formik>
        </>
    );
}
