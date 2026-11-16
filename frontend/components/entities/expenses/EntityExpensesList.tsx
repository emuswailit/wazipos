// components/entities/expenses/EntityExpensesList.tsx
//
// The business's expenses: rent, transport, airtime, salaries… Shared list kit
// (cards on phones, table on wide screens), details beside the list on wide
// screens, kept on the device for offline viewing. Add / edit / delete need a
// connection.

import expensesApi, { type EntityExpense, type EntityExpenseCategory } from '@/api/expensesApi';
import { apiError } from '@/api/deliveriesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, AdminListView, ConfigDetailsSheet, DetailsDock, formatDate, FormRow, FormSection, SheetButton, type AdminListConfig } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import { Formik } from 'formik';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Yup from 'yup';

type Range = 'ALL' | 'MONTH' | 'WEEK' | 'TODAY';

const kes = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const rows = (d: any) => (Array.isArray(d) ? d : d?.results ?? []);
const isOk = (res: any) => !!res?.ok && (res?.data?.response_code == null || String(res.data.response_code) === '0');
const dayOf = (e: EntityExpense) => String(e.expense_date || e.created || '').slice(0, 10);
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function inRange(e: EntityExpense, r: Range) {
    if (r === 'ALL') return true;
    const d = new Date(`${dayOf(e)}T12:00:00`);
    const now = new Date();
    if (r === 'TODAY') return dayOf(e) === todayIso();
    if (r === 'WEEK') return now.getTime() - d.getTime() <= 7 * 86400000;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

const config: AdminListConfig<EntityExpense> = {
    title: 'Expenses',
    noun: ['expense', 'expenses'],
    icon: 'receipt-outline',
    searchPlaceholder: 'Search category or note…',
    addLabel: 'Add expense',
    emptyMessage: 'Record what the business spends — rent, transport, airtime, salaries.',
    keyOf: (e) => e.id,
    titleOf: (e) => e.expense_category_title || 'Uncategorised',
    subtitleOf: (e) => e.description || null,
    avatarOf: () => ({ icon: 'receipt-outline' }),
    metaOf: (e) => (dayOf(e) ? formatDate(dayOf(e)) : null),
    metaIcon: 'calendar-outline',
    metricOf: (e) => ({ value: kes(e.amount), label: 'spent', color: '#f43f5e' }),
    primaryColumn: { label: 'Category', flex: 1.4 },
    columns: [
        { key: 'note', label: 'Note', flex: 2, render: (e) => e.description || '—' },
        { key: 'date', label: 'Date', flex: 1, render: (e) => (dayOf(e) ? formatDate(dayOf(e)) : '—') },
        { key: 'amount', label: 'Amount', flex: 1, align: 'right', render: (e) => kes(e.amount) },
    ],
};

export default function EntityExpensesList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const list = useCachedList<EntityExpense>({ key: 'entity_expenses', fetch: () => expensesApi.getEntityExpenses({ page: 1, page_size: 1000 }), pick: rows });
    const cats = useCachedList<EntityExpenseCategory>({ key: 'entity_expense_categories', fetch: () => expensesApi.getEntityExpenseCategories({ page: 1, page_size: 500 }), pick: rows });

    const [query, setQuery] = useState('');
    const [range, setRange] = useState<Range>('MONTH');
    const [viewing, setViewing] = useState<EntityExpense | null>(null);
    const [editing, setEditing] = useState<EntityExpense | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((e) => inRange(e, range))
            .filter((e) => !q || `${e.expense_category_title ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || String(b.created).localeCompare(String(a.created)));
    }, [list.items, query, range]);
    const paged = usePaged(filtered, `${query}|${range}`);
    const sum = (r: Range) => list.items.filter((e) => inRange(e, r)).reduce((s, e) => s + Number(e.amount || 0), 0);
    const count = (r: Range) => list.items.filter((e) => inRange(e, r)).length;

    const openForm = (e: EntityExpense | null) => {
        if (!list.isOnline) return alert('You’re offline', 'Changes need an internet connection.');
        setViewing(null);
        setEditing(e);
        setFormError(null);
        setFormOpen(true);
    };

    const save = async (v: { expense_category: string; expense_date: string; amount: string; description: string }) => {
        setSaving(true);
        setFormError(null);
        try {
            const body = { expense_category: v.expense_category || null, expense_date: v.expense_date || undefined, amount: v.amount, description: v.description.trim() || undefined };
            const res: any = editing ? await expensesApi.updateEntityExpense({ entity_expense: editing.id, ...body } as any) : await expensesApi.createEntityExpense(body as any);
            if (!isOk(res)) return setFormError(apiError(res, 'Could not save the expense.'));
            setFormOpen(false);
            setEditing(null);
            await list.refresh();
        } catch (e: any) {
            setFormError(e?.message || 'Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const remove = (e: EntityExpense) =>
        alert('Delete expense', `Delete this ${kes(e.amount)} expense?`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const res: any = await expensesApi.deleteEntityExpense({ entity_expense: e.id } as any).catch(() => null);
                    if (isOk(res)) {
                        setViewing(null);
                        list.patch((x) => x.filter((i) => i.id !== e.id));
                    } else alert('Not deleted', apiError(res, 'Could not delete the expense.'), undefined, 'danger');
                },
            },
        ], 'danger');

    return (
        <>
            <DetailsDock
                placeholder="Pick an expense to see it here."
                pane={
                    <ConfigDetailsSheet
                        config={config}
                        item={viewing}
                        onClose={() => setViewing(null)}
                        onEdit={(e) => openForm(e)}
                        actions={viewing ? <SheetButton label="Delete" icon="trash-outline" variant="danger" onPress={() => remove(viewing)} /> : null}
                    />
                }
            >
                <AdminListView<EntityExpense, Range>
                    variant={width >= 768 ? 'web' : 'mobile'}
                    config={config}
                    query={query}
                    setQuery={setQuery}
                    onRefresh={() => {
                        void list.refresh();
                        void cats.refresh();
                    }}
                    refreshing={list.refreshing}
                    sourceLabel={list.sourceLabel}
                    sourceTone={list.source}
                    lastSyncedTime={list.lastSynced}
                    error={list.error}
                    {...paged}
                    onOpenCreate={() => openForm(null)}
                    onPressItem={setViewing}
                    onEditItem={openForm}
                    rowActions={(e) => [
                        { icon: 'create-outline', label: 'Edit', onPress: () => openForm(e), tone: 'primary' },
                        { icon: 'trash-outline', label: 'Delete', onPress: () => remove(e), tone: 'danger' },
                    ]}
                    stats={[
                        { label: 'Today', value: kes(sum('TODAY')) },
                        { label: 'This month', value: kes(sum('MONTH')), color: '#f43f5e' },
                        { label: 'All time', value: kes(sum('ALL')) },
                    ]}
                    filters={{
                        options: [
                            { key: 'MONTH', label: 'This month', icon: 'calendar-outline', count: count('MONTH') },
                            { key: 'WEEK', label: 'Last 7 days', icon: 'time-outline', count: count('WEEK') },
                            { key: 'TODAY', label: 'Today', icon: 'today-outline', count: count('TODAY') },
                            { key: 'ALL', label: 'All', icon: 'apps-outline', count: count('ALL') },
                        ],
                        value: range,
                        onChange: setRange,
                        allKey: 'ALL',
                    }}
                />
            </DetailsDock>

            <Formik
                key={`${formOpen}-${editing?.id ?? 'new'}`}
                initialValues={{
                    expense_category: editing?.expense_category ?? '',
                    expense_date: editing?.expense_date ? String(editing.expense_date).slice(0, 10) : todayIso(),
                    amount: editing ? String(Number(editing.amount)) : '',
                    description: editing?.description ?? '',
                }}
                validationSchema={Yup.object({
                    amount: Yup.number().typeError('Enter the amount').moreThan(0, 'Enter the amount').required('Enter the amount'),
                    expense_date: Yup.string().required('When was it spent?'),
                })}
                onSubmit={save}
            >
                {(f) => (
                    <AdminFormSheet
                        visible={formOpen}
                        onClose={() => !saving && setFormOpen(false)}
                        title={editing ? 'Edit expense' : 'New expense'}
                        subtitle="What the business spent"
                        icon="receipt-outline"
                        submitLabel={editing ? 'Save changes' : 'Add expense'}
                        submitting={saving}
                        error={formError}
                        onSubmit={() => f.handleSubmit()}
                    >
                        <FormSection title="Expense" zIndex={30}>
                            <SelectDropdown
                                name="expense_category"
                                label="Category"
                                options={cats.items.map((c) => ({ value: c.id, label: c.title, description: c.is_recurrent === 'true' ? `Recurs ${String(c.recurrence_period || '').toLowerCase()}` : undefined }))}
                                placeholder={cats.items.length ? 'Select a category…' : 'No categories yet'}
                                helperText={cats.items.length ? undefined : 'Add categories under Finance → Expense Categories.'}
                            />
                            <FormRow>
                                <CustomTextField name="amount" label="Amount (KES)" required placeholder="0" keyboardType="decimal-pad" />
                                <DateField name="expense_date" label="Date" required />
                            </FormRow>
                            <CustomTextField name="description" label="Note" placeholder="What was it for? (optional)" multiline />
                        </FormSection>
                    </AdminFormSheet>
                )}
            </Formik>
        </>
    );
}
