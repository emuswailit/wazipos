// components/entities/expensesCategories/EntityExpenseCategoriesList.tsx
//
// Expense categories (rent, transport, salaries…), some recurring. Shared list
// kit, details beside the list on wide screens, kept on the device for offline
// viewing. Add / edit / delete need a connection.

import expensesApi, { type EntityExpenseCategory, type RecurrencePeriod } from '@/api/expensesApi';
import { apiError } from '@/api/deliveriesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, AdminListView, ChoiceChips, ConfigDetailsSheet, DetailsDock, formatDate, FormSection, SheetButton, type AdminListConfig } from '@/components/common/listScreen';
import { SwitchField } from '@/components/common/SwitchField';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import { Formik } from 'formik';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

type Filter = 'ALL' | 'RECURRING' | 'ONE_OFF';

const PERIODS: RecurrencePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
const PERIOD_LABEL: Record<RecurrencePeriod, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' };
const rows = (d: any) => (Array.isArray(d) ? d : d?.results ?? []);
const isOk = (res: any) => !!res?.ok && (res?.data?.response_code == null || String(res.data.response_code) === '0');
const recurs = (c: EntityExpenseCategory) => c.is_recurrent === 'true';

const config: AdminListConfig<EntityExpenseCategory> = {
    title: 'Expense categories',
    noun: ['category', 'categories'],
    icon: 'pricetag-outline',
    searchPlaceholder: 'Search categories…',
    addLabel: 'Add category',
    emptyMessage: 'Group expenses, e.g. Rent (monthly), Transport, Airtime, Salaries (monthly).',
    keyOf: (c) => c.id,
    titleOf: (c) => c.title,
    subtitleOf: (c) => c.description || null,
    avatarOf: () => ({ icon: 'pricetag-outline' }),
    badgesOf: (c) => [recurs(c) ? { label: PERIOD_LABEL[c.recurrence_period as RecurrencePeriod] ?? 'Recurring', tone: 'violet', icon: 'repeat' } : { label: 'One-off', tone: 'neutral' }],
    metaOf: (c) => (c.updated ? `Updated ${formatDate(c.updated)}` : null),
    metaIcon: 'time-outline',
    primaryColumn: { label: 'Category', flex: 1.5 },
    columns: [
        { key: 'desc', label: 'Description', flex: 2, render: (c) => c.description || '—' },
        { key: 'recurs', label: 'Recurs', flex: 1, render: (c) => (recurs(c) ? PERIOD_LABEL[c.recurrence_period as RecurrencePeriod] ?? 'Yes' : 'One-off') },
    ],
};

export default function EntityExpenseCategoriesList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<EntityExpenseCategory>({ key: 'entity_expense_categories', fetch: () => expensesApi.getEntityExpenseCategories({ page: 1, page_size: 500 }), pick: rows });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [viewing, setViewing] = useState<EntityExpenseCategory | null>(null);
    const [editing, setEditing] = useState<EntityExpenseCategory | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((c) => filter === 'ALL' || (filter === 'RECURRING' ? recurs(c) : !recurs(c)))
            .filter((c) => !q || `${c.title} ${c.description ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [list.items, query, filter]);
    const paged = usePaged(filtered, `${query}|${filter}`);
    const recurring = list.items.filter(recurs).length;

    const openForm = (c: EntityExpenseCategory | null) => {
        if (!list.isOnline) return alert('You’re offline', 'Changes need an internet connection.');
        setViewing(null);
        setEditing(c);
        setFormError(null);
        setFormOpen(true);
    };

    const save = async (v: { title: string; description: string; is_recurrent: boolean; recurrence_period: RecurrencePeriod }) => {
        setSaving(true);
        setFormError(null);
        try {
            const payload = {
                title: v.title.trim(),
                description: v.description.trim() || undefined,
                is_recurrent: (v.is_recurrent ? 'true' : 'false') as 'true' | 'false',
                recurrence_period: v.is_recurrent ? v.recurrence_period : null,
            };
            const res: any = editing
                ? await expensesApi.updateEntityExpenseCategory({ entity_expense_category: editing.id, ...payload } as any)
                : await expensesApi.createEntityExpenseCategory(payload as any);
            if (!isOk(res)) return setFormError(apiError(res, 'Could not save the category.'));
            setFormOpen(false);
            setEditing(null);
            await list.refresh();
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const remove = (c: EntityExpenseCategory) =>
        alert('Delete category', `Delete “${c.title}”? Expenses keep their amounts but lose this category.`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const res: any = await expensesApi.deleteEntityExpenseCategory({ entity_expense_category: c.id } as any).catch(() => null);
                    if (isOk(res)) {
                        setViewing(null);
                        list.patch((x) => x.filter((i) => i.id !== c.id));
                    } else alert('Not deleted', apiError(res, 'Could not delete the category.'), undefined, 'danger');
                },
            },
        ], 'danger');

    return (
        <>
            <DetailsDock
                placeholder="Pick a category to see it here."
                pane={
                    <ConfigDetailsSheet
                        config={config}
                        item={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={(c) => openForm(c)}
                        actions={viewing ? <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={() => remove(viewing)} /> : null}
                    />
                }
            >
                <AdminListView<EntityExpenseCategory, Filter>
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
                    onEditItem={openForm}
                    rowActions={(c) => [
                        { icon: 'create-outline', label: 'Edit', onPress: () => openForm(c), tone: 'primary' },
                        { icon: 'trash-outline', label: 'Delete', onPress: () => remove(c), tone: 'danger' },
                    ]}
                    stats={[
                        { label: 'Categories', value: String(list.items.length) },
                        { label: 'Recurring', value: String(recurring) },
                    ]}
                    filters={{
                        options: [
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: list.items.length },
                            { key: 'RECURRING', label: 'Recurring', icon: 'repeat-outline', count: recurring },
                            { key: 'ONE_OFF', label: 'One-off', icon: 'flash-outline', count: list.items.length - recurring },
                        ],
                        value: filter,
                        onChange: setFilter,
                        allKey: 'ALL',
                    }}
                />
            </DetailsDock>

            <Formik
                key={`${formOpen}-${editing?.id ?? 'new'}`}
                initialValues={{
                    title: editing?.title ?? '',
                    description: editing?.description ?? '',
                    is_recurrent: editing ? recurs(editing) : false,
                    recurrence_period: (editing?.recurrence_period ?? 'MONTHLY') as RecurrencePeriod,
                }}
                validationSchema={Yup.object({ title: Yup.string().trim().required('Name the category, e.g. Rent') })}
                onSubmit={save}
            >
                {(f) => (
                    <AdminFormSheet
                        visible={formOpen}
                        onClose={() => !saving && setFormOpen(false)}
                        title={editing ? 'Edit category' : 'New category'}
                        subtitle="Group your expenses"
                        icon="pricetag-outline"
                        submitLabel={editing ? 'Save changes' : 'Add category'}
                        submitting={saving}
                        error={formError}
                        onSubmit={() => f.handleSubmit()}
                    >
                        <FormSection title="Category">
                            <CustomTextField name="title" label="Name" required placeholder="e.g. Rent, Transport, Airtime" autoCapitalize="words" />
                            <CustomTextField name="description" label="Description" placeholder="Optional" multiline />
                        </FormSection>
                        <FormSection title="Recurring" hint="For costs that come back on a schedule, like rent or salaries.">
                            <SwitchField name="is_recurrent" label="Recurs" row />
                            {f.values.is_recurrent ? (
                                <ChoiceChips<RecurrencePeriod>
                                    label="Every"
                                    options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
                                    value={f.values.recurrence_period}
                                    onChange={(p) => f.setFieldValue('recurrence_period', p)}
                                />
                            ) : null}
                        </FormSection>
                    </AdminFormSheet>
                )}
            </Formik>
        </>
    );
}
