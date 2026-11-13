// api/expensesApi.ts
import client from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurrencePeriod =
    | "DAILY"
    | "WEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "YEARLY";

export interface EntityExpenseCategory {
    id: string;
    title: string;
    description?: string | null;
    is_recurrent: "true" | "false";
    recurrence_period?: RecurrencePeriod | null;
    created_by?: string | null;
    updated_by?: string | null;
    created: string;
    updated: string;
}

export interface EntityExpense {
    id: string;
    draft_id?: string | null;
    expense_category?: string | null;
    expense_category_title?: string | null;
    expense_date?: string | null;
    amount: string;
    description?: string | null;
    owner?: string | null;
    created: string;
    updated: string;
}

interface CreateEntityExpenseCategoryPayload {
    title: string;
    description?: string;
    is_recurrent?: "true" | "false";
    recurrence_period?: RecurrencePeriod | null;
}

interface UpdateEntityExpenseCategoryPayload
    extends Partial<CreateEntityExpenseCategoryPayload> {
    entity_expense_category: string;
}

interface DeleteEntityExpenseCategoryPayload {
    entity_expense_category: string;
}

interface CreateEntityExpensePayload {
    expense_category?: string | null;
    expense_date?: string;
    amount: string | number;
    description?: string;
    draft_id?: string;
}

interface UpdateEntityExpensePayload {
    entity_expense: string;
    expense_category?: string | null;
    expense_date?: string;
    amount?: string | number;
    description?: string;
}

interface DeleteEntityExpensePayload {
    entity_expense: string;
}

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

interface ActionResponse<T = unknown> {
    response_code: number;
    response_message: string;
    errors?: string[] | Record<string, unknown>;
    [key: string]: any;
}

// ---------------------------------------------------------------------------
// Internal dispatcher — logs every request and response as JSON
// ---------------------------------------------------------------------------

const EXPENSES_ENDPOINT = "/expenses/entity";

const dispatch = async <T = unknown>(
    payload: Record<string, unknown>,
): Promise<{ data: ActionResponse<T> }> => {
    console.log(
        "[expensesApi] →",
        EXPENSES_ENDPOINT,
        JSON.stringify(payload, null, 2),
    );

    try {
        const res = await client.post<ActionResponse<T>>(
            EXPENSES_ENDPOINT,
            payload,
        );
        console.log(
            "[expensesApi] ←",
            EXPENSES_ENDPOINT,
            JSON.stringify(res.data, null, 2),
        );
        return res as unknown as { data: ActionResponse<T> };
    } catch (e: any) {
        console.log(
            "[expensesApi] ✕",
            EXPENSES_ENDPOINT,
            JSON.stringify(
                {
                    message: e?.message,
                    code: e?.code,
                    status: e?.response?.status,
                    statusText: e?.response?.statusText,
                    responseData: e?.response?.data,
                    requestPayload: payload,
                },
                null,
                2,
            ),
        );
        throw e;
    }
};

// ---------------------------------------------------------------------------
// Category actions
// ---------------------------------------------------------------------------

const createEntityExpenseCategory = (
    data: CreateEntityExpenseCategoryPayload,
) =>
    dispatch<EntityExpenseCategory>({
        action: "CreateEntityExpenseCategory",
        ...data,
    });

const updateEntityExpenseCategory = (
    data: UpdateEntityExpenseCategoryPayload,
) =>
    dispatch<EntityExpenseCategory>({
        action: "UpdateEntityExpenseCategory",
        ...data,
    });

const deleteEntityExpenseCategory = (
    data: DeleteEntityExpenseCategoryPayload,
) =>
    dispatch<EntityExpenseCategory>({
        action: "DeleteEntityExpenseCategory",
        ...data,
    });

const getEntityExpenseCategories = (params?: {
    page?: number;
    page_size?: number;
}) =>
    client.post<PaginatedResponse<EntityExpenseCategory>>(
        EXPENSES_ENDPOINT,
        { action: "GetEntityExpenseCategories" },
        { params },
    );

// ---------------------------------------------------------------------------
// Expense actions
// ---------------------------------------------------------------------------

const createEntityExpense = (data: CreateEntityExpensePayload) =>
    dispatch<EntityExpense>({ action: "CreateEntityExpense", ...data });

const updateEntityExpense = (data: UpdateEntityExpensePayload) =>
    dispatch<EntityExpense>({ action: "UpdateEntityExpense", ...data });

const deleteEntityExpense = (data: DeleteEntityExpensePayload) =>
    dispatch<EntityExpense>({ action: "DeleteEntityExpense", ...data });

const getEntityExpenses = (params?: { page?: number; page_size?: number }) =>
    client.post<PaginatedResponse<EntityExpense>>(
        EXPENSES_ENDPOINT,
        { action: "GetEntityExpenses" },
        { params },
    );

// ---------------------------------------------------------------------------

export default {
    createEntityExpenseCategory,
    updateEntityExpenseCategory,
    deleteEntityExpenseCategory,
    getEntityExpenseCategories,
    createEntityExpense,
    updateEntityExpense,
    deleteEntityExpense,
    getEntityExpenses,
};