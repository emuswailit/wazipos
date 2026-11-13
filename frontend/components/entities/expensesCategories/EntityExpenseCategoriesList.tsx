// components/entities/entityExpenseCategories/EntityExpenseCategoriesList.tsx
//
// Shell for the entity expense categories screen.

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
    type EntityExpenseCategory,
    type RecurrencePeriod,
} from '@/api/expensesApi';

import { EntityExpenseCategoriesMobileView } from './EntityExpenseCategoriesMobileView';
import { EntityExpenseCategoriesWebView } from './EntityExpenseCategoriesWebView';
import {
    EntityExpenseCategoryFormModal,
    type FormFieldConfig,
} from './EntityExpenseCategoryFormModal';

const LARGE_SCREEN_MIN_WIDTH = 900;
const FETCH_PAGE_SIZE = 500;

/* =========================================================
 * Local helpers
 * ======================================================= */

const RECURRENCE_PERIODS: RecurrencePeriod[] = [
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'YEARLY',
];

function matchesQuery(c: EntityExpenseCategory, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        String(c.title || '').toLowerCase().includes(needle) ||
        String(c.description || '').toLowerCase().includes(needle)
    );
}

function buildFormFields(
    category: EntityExpenseCategory | null,
): FormFieldConfig[] {
    return [
        {
            key: 'title',
            label: 'Title',
            type: 'text',
            required: true,
            placeholder: 'e.g. Rent, Utilities, Software',
            initialValue: category?.title ?? '',
        },
        {
            key: 'description',
            label: 'Description',
            type: 'textarea',
            placeholder: 'Optional notes about this category…',
            initialValue: category?.description ?? '',
        },
        {
            key: 'is_recurrent',
            label: 'Recurrent',
            type: 'select',
            required: true,
            initialValue: category?.is_recurrent ?? 'false',
            options: [
                { label: 'No', value: 'false' },
                { label: 'Yes', value: 'true' },
            ],
        },
        {
            key: 'recurrence_period',
            label: 'Recurrence period',
            type: 'select',
            required: true,
            initialValue: category?.recurrence_period ?? '',
            visibleWhen: (values) => values.is_recurrent === 'true',
            options: RECURRENCE_PERIODS.map((p) => ({
                label: p.charAt(0) + p.slice(1).toLowerCase(),
                value: p,
            })),
        },
    ];
}

/* =========================================================
 * Component
 * ======================================================= */

const EntityExpenseCategoriesList: React.FC = () => {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Server data ---------------- */
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
                const res = await expensesApi.getEntityExpenseCategories({
                    page: 1,
                    page_size: FETCH_PAGE_SIZE,
                });
                if (cancelled) return;
                setCategories(res.data?.results ?? []);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message ?? 'Failed to load categories');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshTick]);

    const onRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [onlyRecurrent, setOnlyRecurrent] = useState(false);

    /* ---------------- Form modal ---------------- */
    const [formOpen, setFormOpen] = useState(false);
    const [editingCategory, setEditingCategory] =
        useState<EntityExpenseCategory | null>(null);
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
        const base = onlyRecurrent
            ? categories.filter((c) => c.is_recurrent === 'true')
            : categories;
        return base.filter((c) => matchesQuery(c, query));
    }, [categories, onlyRecurrent, query]);

    const counts = useMemo(() => {
        let recurrent = 0;
        for (const c of categories) {
            if (c.is_recurrent === 'true') recurrent++;
        }
        return {
            total: categories.length,
            visible: visible.length,
            recurrent,
        };
    }, [categories, visible]);

    /* ---------------- Pagination math ---------------- */
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage(1);
    }, [query, onlyRecurrent, pageSize]);

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
    const onToggleOnlyRecurrent = useCallback(
        () => setOnlyRecurrent((v) => !v),
        [],
    );

    const onOpenCreate = useCallback(() => {
        setEditingCategory(null);
        setFormOpen(true);
    }, []);

    const onOpenEdit = useCallback((c: EntityExpenseCategory) => {
        setEditingCategory(c);
        setFormOpen(true);
    }, []);

    const onCloseForm = useCallback(() => {
        if (formSubmitting) return;
        setFormOpen(false);
        setEditingCategory(null);
    }, [formSubmitting]);

    /* ---------------- Submit ---------------- */
    const onSubmitForm = useCallback(
        async (values: Record<string, string>) => {
            setFormSubmitting(true);
            try {
                const payload = {
                    title: values.title,
                    description: values.description || undefined,
                    is_recurrent: (values.is_recurrent || 'false') as
                        | 'true'
                        | 'false',
                    recurrence_period:
                        values.is_recurrent === 'true'
                            ? (values.recurrence_period as RecurrencePeriod)
                            : null,
                };

                let res;
                if (editingCategory) {
                    res = await expensesApi.updateEntityExpenseCategory({
                        entity_expense_category: editingCategory.id,
                        ...payload,
                    });
                } else {
                    res = await expensesApi.createEntityExpenseCategory(
                        payload,
                    );
                }

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setFormOpen(false);
                    setEditingCategory(null);
                    setRefreshOnClose(true);

                    setResponseKind('success');
                    setResponseTitle(
                        editingCategory
                            ? 'Category updated'
                            : 'Category created',
                    );
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                // eslint-disable-next-line no-console
                console.warn(
                    '[category submit] rejected:',
                    JSON.stringify(env, null, 2),
                );

                setResponseKind('error');
                setResponseTitle(
                    editingCategory
                        ? 'Could not update category'
                        : 'Could not create category',
                );
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                // eslint-disable-next-line no-console
                console.error(
                    '[category submit] failed:',
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
                setResponseTitle('Could not save category');
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            } finally {
                setFormSubmitting(false);
            }
        },
        [editingCategory],
    );

    /* ---------------- Delete ---------------- */
    const performDeleteCategory = useCallback(
        async (category: EntityExpenseCategory) => {
            try {
                const res =
                    await expensesApi.deleteEntityExpenseCategory({
                        entity_expense_category: category.id,
                    });

                const env = extractEnvelope(res);
                const kind = routeEnvelope(env);

                if (kind === 'success') {
                    setRefreshOnClose(true);
                    setResponseKind('success');
                    setResponseTitle('Category deleted');
                    setResponseEnvelope(env);
                    setResponseFallback(null);
                    setResponseOpen(true);
                    return;
                }

                // eslint-disable-next-line no-console
                console.warn(
                    '[category delete] rejected:',
                    JSON.stringify(env, null, 2),
                );

                setResponseKind('error');
                setResponseTitle('Could not delete category');
                setResponseEnvelope(env);
                setResponseFallback(null);
                setResponseOpen(true);
            } catch (e: any) {
                // eslint-disable-next-line no-console
                console.error(
                    '[category delete] failed:',
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
                setResponseTitle('Could not delete category');
                setResponseEnvelope(hasEnvelope ? env : null);
                setResponseFallback(
                    hasEnvelope ? null : e?.message ?? 'Network error.',
                );
                setResponseOpen(true);
            }
        },
        [],
    );

    const onDeleteCategory = useCallback(
        (category: EntityExpenseCategory) => {
            alert(
                'Delete category',
                `Delete "${category.title}"? This cannot be undone.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            void performDeleteCategory(category);
                        },
                    },
                ],
                'danger',
            );
        },
        [alert, performDeleteCategory],
    );

    /* ---------------- Shared props ---------------- */
    const common = {
        categories: paginated,
        counts,
        query,
        onQueryChange,
        onlyRecurrent,
        onToggleOnlyRecurrent,
        loading,
        error,
        onRefresh,
        onNewCategory: onOpenCreate,
        onEditCategory: onOpenEdit,
        onDeleteCategory,

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
                <EntityExpenseCategoriesWebView {...common} />
            ) : (
                <EntityExpenseCategoriesMobileView {...common} />
            )}

            <EntityExpenseCategoryFormModal
                visible={formOpen}
                title={editingCategory ? 'Edit category' : 'New category'}
                subtitle={
                    editingCategory
                        ? 'Update the details of this expense category.'
                        : 'Add a new expense category for your entity.'
                }
                submitLabel={editingCategory ? 'Save' : 'Create'}
                submitting={formSubmitting}
                fields={buildFormFields(editingCategory)}
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

export default EntityExpenseCategoriesList;