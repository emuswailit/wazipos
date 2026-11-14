// components/entities/entityExpenses/EntityExpensesList.tsx
//
// Shell for the entity expenses screen.

import { useAlert } from '@/components/common/AlertProvider';
import ApiResponseModal, {
    extractEnvelope,
    routeEnvelope,
    type ApiResponseEnvelope,
    type ResponseKind,
} from '@/components/common/ApiResponseModal';
import {
    PAGE_SIZE_OPTIONS,
    type PageSize,
} from '@/components/common/PaginationBar';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import expensesApi, {
    type EntityExpense,
    type EntityExpenseCategory,
} from '@/api/expensesApi';

import {
    EntityExpenseFormModal,
    type FormFieldConfig,
} from './EntityExpenseFormModal';
import { EntityExpensesMobileView } from './EntityExpensesMobileView';
import { EntityExpensesWebView } from './EntityExpensesWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/* =========================================================
 * Local helpers
 * ======================================================= */

function toDayString(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function matchesQuery(
    e: EntityExpense,
    q: string,
    categoryTitle: string,
): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        String(categoryTitle || '').toLowerCase().includes(needle) ||
        String(e.description || '').toLowerCase().includes(needle) ||
        String(e.expense_date || '').toLowerCase().includes(needle) ||
        String(e.amount || '').toLowerCase().includes(needle)
    );
}

function buildFormFields(
    categories: EntityExpenseCategory[],
    editing: EntityExpense | null,
): FormFieldConfig[] {
    return [
        {
            key: 'expense_category',
            label: 'Category',
            type: 'dropdown',
            required: true,
            placeholder: 'Select a category…',
            initialValue: editing?.expense_category ?? '',
            options: categories.map((c) => ({
                label: c.title,
                value: c.id,
            })),
        },
        {
            key: 'expense_date',
            label: 'Expense date',
            type: 'date',
            required: true,
            initialValue: editing?.expense_date ?? toDayString(new Date()),
            placeholder: 'YYYY-MM-DD',
        },
        {
            key: 'amount',
            label: 'Amount',
            type: 'number',
            required: true,
            keyboardType: 'numeric',
            placeholder: '0.00',
            initialValue: editing?.amount ?? '',
        },
        {
            key: 'description',
            label: 'Description',
            type: 'textarea',
            placeholder: 'What was this expense for?',
            initialValue: editing?.description ?? '',
        },
    ];
}

/* =========================================================
 * Component
 * ======================================================= */

const EntityExpensesList: React.FC = () => {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Server data ---------------- */
    const [expenses, setExpenses] = useState<EntityExpense[]>([]);
    const [categories, setCategories] = useState<EntityExpenseCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [expensesRes, categoriesRes] = await Promise.all([
                    expensesApi.getEntityExpenses({
                        page: 1,
                        page_size: FETCH_PAGE_SIZE,
                    }),
                    expensesApi.getEntityExpenseCategories({
                        page: 1,
                        page_size: FETCH_PAGE_SIZE,
                    }),
                ]);
                if (cancelled) return;
                setExpenses(expensesRes.data?.results ?? []);
                setCategories(categoriesRes.data?.results ?? []);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message ?? 'Failed to load expenses');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshTick]);

    const onRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

    /* ---------------- Category lookup ---------------- */
    const categoryTitleById = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of categories) map.set(c.id, c.title);
        return map;
    }, [categories]);

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    /* ---------------- Form modal ---------------- */
    const [formOpen, setFormOpen] = useState(false);
    const [editingExpense, setEditingExpense] =
        useState<EntityExpense | null>(null);
    const [formSubmitting, setFormSubmitting] = useState(false);

    /* ---------------- Response modal ---------------- */
    const [responseOpen, setResponseOpen] = useState(false);
    const [responseKind, setResponseKind] = useState<ResponseKind>('error');
    const [responseTitle, setResponseTitle] = useState<string | undefined>();
    const [responseEnvelope, setResponseEnvelope] =
        useState<ApiResponseEnvelope | null>(null);
    const [responseFallback, setResponseFallback] = useState<string | null>(
        null,
    );
    const [refreshOnClose, setRefreshOnClose] = useState(false);

    const closeResponse = useCallback(() => {
        setResponseOpen(false);
        setResponseEnvelope(null);
        setResponseFallback(null);
        setResponseTitle(undefined);
        if (refreshOnClose) {
            setRefreshOnClose(false);
            setRefreshTick((t) => t + 1);
        }
    }, [refreshOnClose]);

    /* ---------------- Pagination ---------------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    /* ---------------- Filtering ---------------- */
    const visible = useMemo(() => {
        let base = expenses;

        if (categoryFilter) {
            base = base.filter((e) => e.expense_category === categoryFilter);
        }
        if (dateFrom) {
            base = base.filter((e) => (e.expense_date || '') >= dateFrom);
        }
        if (dateTo) {
            base = base.filter((e) => (e.expense_date || '') <= dateTo);
        }

        return base.filter((e) =>
            matchesQuery(
                e,
                query,
                e.expense_category
                    ? categoryTitleById.get(e.expense_category) ?? ''
                    : '',
            ),
        );
    }, [
        expenses,
        categoryFilter,
        dateFrom,
        dateTo,
        query,
        categoryTitleById,
    ]);

    const counts = useMemo(() => {
        let total = 0;
        for (const e of expenses) {
            const n = parseFloat(String(e.amount ?? '0'));
            if (Number.isFinite(n)) total += n;
        }
        return {
            all: expenses.length,
            visible: visible.length,
            totalAmount: total,
        };
    }, [expenses, visible]);

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, categoryFilter, dateFrom, dateTo, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => visible.slice(pageStart, pageEnd),
        [visible, pageStart, pageEnd],
    );

    const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages],
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
    }, []);

    /* ---------------- Handlers ---------------- */
    const onQueryChange = useCallback((q: string) => setQuery(q), []);
    const onCategoryFilterChange = useCallback(
        (id: string | null) => setCategoryFilter(id),
        [],
    );
    const onDateFromChange = useCallback((d: string) => setDateFrom(d), []);
    const onDateToChange = useCallback((d: string) => setDateTo(d), []);
    const onClearFilters = useCallback(() => {
        setCategoryFilter(null);
        setDateFrom('');
        setDateTo('');
    }, []);

    /* ---------------- Form open/close ---------------- */
    const onOpenCreate = useCallback(() => {
        setEditingExpense(null);
        setFormOpen(true);
    }, []);

    const onOpenEdit = useCallback((expense: EntityExpense) => {
        setEditingExpense(expense);
        setFormOpen(true);
    }, []);

    const onCloseForm = useCallback(() => {
        if (formSubmitting) return;
        setFormOpen(false);
        setEditingExpense(null);
    }, [formSubmitting]);

    /* ---------------- Submit (create + update) ---------------- */
    const onSubmitForm = useCallback(
        async (values: Record<string, string>) => {
            setFormSubmitting(true);
            try {
                const isEdit = editingExpense !== null;

                let res;
                if (isEdit) {
                    res = await expensesApi.updateEntityExpense({
                        entity_expense: editingExpense!.id,
                        expense_category: values.expense_category || null,
                        expense_date: values.expense_date || undefined,
                        amount: values.amount,
                        description: values.description || undefined,
                    });
                } else {
                    res = await expensesApi.createEntityExpense({
                        expense_category: values.expense_category || null,
                        expense_date: values.expense_date || undefined,
                        amount: values.amount,
                        description: values.description || undefined,
                    });
                }

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setFormOpen(false);
                    setEditingExpense(null);
                    setRefreshOnClose(true);

                    setResponseKind('success');
                    setResponseTitle(
                        isEdit ? 'Expense updated' : 'Expense created',
                    );
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                // eslint-disable-next-line no-console
                console.warn(
                    '[expense submit] rejected:',
                    JSON.stringify(env, null, 2),
                );

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update expense'
                        : 'Could not create expense',
                );
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                // eslint-disable-next-line no-console
                console.error(
                    '[expense submit] failed:',
                    JSON.stringify(
                        {
                            message: e?.message,
                            status: e?.response?.status,
                            data: e?.response?.data,
                        },
                        null,
                        2,
                    ),
                );

                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);
                const isEdit = editingExpense !== null;

                setResponseKind('error');
                setResponseTitle(
                    isEdit
                        ? 'Could not update expense'
                        : 'Could not create expense',
                );
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            } finally {
                setFormSubmitting(false);
            }
        },
        [editingExpense],
    );

    /* ---------------- Delete ---------------- */
    const performDeleteExpense = useCallback(
        async (expense: EntityExpense) => {
            try {
                const res = await expensesApi.deleteEntityExpense({
                    entity_expense: expense.id,
                });

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setRefreshOnClose(true);
                    setResponseKind('success');
                    setResponseTitle('Expense deleted');
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                // eslint-disable-next-line no-console
                console.warn(
                    '[expense delete] rejected:',
                    JSON.stringify(env, null, 2),
                );

                setResponseKind('error');
                setResponseTitle('Could not delete expense');
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                // eslint-disable-next-line no-console
                console.error(
                    '[expense delete] failed:',
                    JSON.stringify(
                        {
                            message: e?.message,
                            status: e?.response?.status,
                            data: e?.response?.data,
                        },
                        null,
                        2,
                    ),
                );

                const env = e?.response ? extractEnvelope(e.response) : null;
                const hasEnvelope = !!(env?.response_message || env?.errors);

                setResponseKind('error');
                setResponseTitle('Could not delete expense');
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            }
        },
        [],
    );

    const onDeleteExpense = useCallback(
        (expense: EntityExpense) => {
            const categoryTitle = expense.expense_category
                ? categoryTitleById.get(expense.expense_category) ?? 'expense'
                : 'expense';

            alert(
                'Delete expense',
                `Delete this ${categoryTitle} entry of KES ${expense.amount}? This cannot be undone.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            void performDeleteExpense(expense);
                        },
                    },
                ],
                'danger',
            );
        },
        [alert, categoryTitleById, performDeleteExpense],
    );

    /* ---------------- Shared props ---------------- */
    const common = {
        expenses: paginated,
        categories,
        categoryTitleById,
        counts,
        query,
        onQueryChange,
        categoryFilter,
        onCategoryFilterChange,
        dateFrom,
        onDateFromChange,
        dateTo,
        onDateToChange,
        onClearFilters,
        loading,
        error,
        onRefresh,
        onNewExpense: onOpenCreate,
        onEditExpense: onOpenEdit,
        onDeleteExpense,

        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,
    };

    return (
        <>
            {isLarge ? (
                <EntityExpensesWebView {...common} />
            ) : (
                <EntityExpensesMobileView {...common} />
            )}

            <EntityExpenseFormModal
                visible={formOpen}
                title={editingExpense ? 'Edit expense' : 'New expense'}
                subtitle={
                    editingExpense
                        ? 'Update the details of this expense.'
                        : 'Record a new expense against one of your categories.'
                }
                submitLabel={editingExpense ? 'Save' : 'Create'}
                submitting={formSubmitting}
                fields={buildFormFields(categories, editingExpense)}
                onClose={onCloseForm}
                onSubmit={onSubmitForm}
            />

            <ApiResponseModal
                isOpen={responseOpen}
                variant={responseKind}
                title={responseTitle}
                envelope={responseEnvelope}
                fallbackMessage={responseFallback}
                onClose={closeResponse}
            />
        </>
    );
};

export default EntityExpensesList;