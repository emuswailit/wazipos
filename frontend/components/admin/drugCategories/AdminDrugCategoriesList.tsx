// app/(admin)/drug-categories/AdminDrugCategoriesList.tsx
//
// Admin drug categories list shell.
//
// Owns the ledger state, API lifecycle, filtering, pagination,
// and the routing between the web table view and the mobile card
// view. Mounts both modals.
//
// Talks straight to `drugsApi.drugCategoriesAction` — no
// intermediate wrapper file. The shell builds the full request
// envelope.

import drugsApi, {
    type DrugCategoriesRequest,
} from "@/api/drugsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    StatusBar,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import AdminDrugCategoriesMobileView from "./AdminDrugCategoriesMobileView";
import AdminDrugCategoriesWebView from "./AdminDrugCategoriesWebView";
import AdminDrugCategoryDetailsModal from "./AdminDrugCategoryDetailsModal";
import AdminDrugCategoryEditModal from "./AdminDrugCategoryEditModal";

/* =========================================================
 * Constants
 * ======================================================= */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/* =========================================================
 * Types
 * ======================================================= */

export interface DrugCategoryItem {
    id: string;
    title: string;
    description: string;
    created: string;
    updated: string;
}

/**
 * Shared prop contract for both view branches. Each view picks
 * the subset it needs via structural typing.
 */
export interface AdminDrugCategoriesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime: string;
    items: DrugCategoryItem[];
    emptyComponent?: React.ReactNode;
    onOpenCreate: () => void;
    onPressItem: (item: DrugCategoryItem) => void;
    onEditItem: (item: DrugCategoryItem) => void;
    formatDateHandler: (dateString: string) => string;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

/* =========================================================
 * Alert helper
 *
 * `Alert.alert` is a no-op on web, so route through
 * `window.alert` there. Both branches carry the same payload.
 * ======================================================= */

function showResultAlert(
    title: string,
    responseMessage: string,
    errorsText: string
) {
    const body = `response_message:\n${responseMessage}\n\nerrors:\n${errorsText}`;

    if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
            window.alert(`${title}\n\n${body}`);
        }
        return;
    }

    Alert.alert(title, body);
}

/* =========================================================
 * Component
 * ======================================================= */

export default function AdminDrugCategoriesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    /* ---------------- UI state ---------------- */
    const [selectedCategory, setSelectedCategory] =
        useState<DrugCategoryItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<DrugCategoryItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- API ---------------- */
    const getDrugCategoriesApi = useApi<any>(
        async (payload: DrugCategoriesRequest) =>
            await drugsApi.categoriesAction(payload)
    );
    const addDrugCategoryApi = useApi<any>(
        async (payload: DrugCategoriesRequest) =>
            await drugsApi.categoriesAction(payload)
    );
    const updateDrugCategoryApi = useApi<any>(
        async (payload: DrugCategoriesRequest) =>
            await drugsApi.categoriesAction(payload)
    );

    const fetchDrugCategories = () => {
        getDrugCategoriesApi.request({
            action: "GetCategories",
        });
    };

    useEffect(() => {
        fetchDrugCategories();
    }, []);

    /* ---------------- Derived data ---------------- */
    const drugCategories: DrugCategoryItem[] = useMemo(() => {
        if (
            getDrugCategoriesApi.data &&
            Array.isArray(getDrugCategoriesApi.data)
        ) {
            return getDrugCategoriesApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getDrugCategoriesApi.data]);

    const filteredCategories = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return drugCategories;
        return drugCategories.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q)
        );
    }, [drugCategories, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filteredCategories.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => filteredCategories.slice(pageStart, pageEnd),
        [filteredCategories, pageStart, pageEnd]
    );

    /* ---------------------------------------------------------
     * Form submit
     *
     * Both branches send the same envelope shape:
     *   { action, drug_category_details: { title, description, id? } }
     * ------------------------------------------------------- */
    /* ---------------------------------------------------------
     * Form submit
     *
     * Both branches send the same envelope shape:
     *   { action, category_details: { title, description, id? } }
     *
     * Title is sent verbatim — backend handles any normalization.
     * ------------------------------------------------------- */
    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            let response: any;

            if (editingItem) {
                response = await updateDrugCategoryApi.request({
                    action: "UpdateCategory",
                    category_details: {
                        id: editingItem.id,
                        title: values.title.trim(),
                        description: values.description.trim(),
                    },
                });
            } else {
                response = await addDrugCategoryApi.request({
                    action: "CreateCategory",
                    category_details: {
                        title: values.title.trim(),
                        description: values.description.trim(),
                    },
                });
            }

            console.log("CategoryAction", response);

            console.log(
                `📡 [Admin Inbound API Resolution] ${editingItem ? "Update" : "Create"
                } Request Status: ${response?.status ?? "N/A"
                } | Body:`,
                JSON.stringify(response?.data)
            );

            /* ---------- Extract alert fields ---------- */
            const data = response?.data ?? {};

            const responseMessage: string =
                typeof data?.response_message === "string" &&
                    data.response_message.trim()
                    ? data.response_message
                    : "—";

            const errorsList: string[] =
                Array.isArray(data?.errors) &&
                    data.errors.length > 0
                    ? data.errors.filter(
                        (e: any) => typeof e === "string"
                    )
                    : [];

            const errorsText =
                errorsList.length > 0
                    ? errorsList.join("\n")
                    : "—";

            /* ---------- Determine success ---------- */
            const ok =
                response?.ok === true ||
                String(data?.response_code ?? "") === "0";

            /* ---------- Alert ---------- */
            showResultAlert(
                ok ? "✅ Success" : "❌ Failed",
                responseMessage,
                errorsText
            );

            /* ---------- Bail on failure ---------- */
            if (!ok) return;

            /* ---------- Success path ---------- */
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchDrugCategories();
        } catch (err) {
            console.error(
                "Admin form workflow operation error:",
                err
            );

            const fallbackMsg =
                (err as any)?.message ??
                "Unexpected error. Check the console.";

            if (Platform.OS === "web") {
                if (typeof window !== "undefined") {
                    window.alert(
                        `❌ Exception\n\n${fallbackMsg}`
                    );
                }
            } else {
                Alert.alert("❌ Exception", fallbackMsg);
            }
        }
    };

    /* ---------------- Handlers ---------------- */
    const handleOpenEditFlow = (item: DrugCategoryItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: DrugCategoryItem) => {
        setSelectedCategory(item);
    };

    const formatHumanDate = (dateString: string) => {
        if (!dateString) return "—";
        try {
            const cleanStr = dateString.replace(" ", "T");
            const dateObj = new Date(cleanStr);
            if (isNaN(dateObj.getTime())) return dateString;
            return dateObj.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
        } catch {
            return dateString;
        }
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    /* ---------------- Loading gate ---------------- */
    if (
        getDrugCategoriesApi.loading &&
        drugCategories.length === 0
    ) {
        return (
            <View
                style={{ backgroundColor: theme.background }}
                className="flex-1 items-center justify-center"
            >
                <ActivityIndicator
                    size="large"
                    color={theme.primary}
                />
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xs,
                        marginTop: 12,
                    }}
                >
                    Loading drug categories ledger...
                </Text>
            </View>
        );
    }

    /* ---------------- Shared view props ---------------- */
    const sourceTone: "server" | "cache" | "none" =
        drugCategories.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminDrugCategoriesSharedProps = {
        query,
        setQuery,
        onRefresh: fetchDrugCategories,
        refreshing: getDrugCategoriesApi.loading,
        sourceLabel,
        sourceTone,
        lastSyncedTime: "",
        items: paginated,
        onOpenCreate: handleOpenCreateFlow,
        onPressItem: handleOpenDetails,
        onEditItem: handleOpenEditFlow,
        formatDateHandler: formatHumanDate,
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

    /* ---------------- Render ---------------- */
    return (
        <View
            className="flex-1"
            style={{ backgroundColor: theme.background }}
        >
            <StatusBar
                barStyle={
                    isDarkMode ? "light-content" : "dark-content"
                }
                backgroundColor={theme.background}
            />

            <Stack.Screen
                options={{
                    title: "Drug Categories",
                    headerShown: true,
                    headerTintColor: theme.primary,
                    headerShadowVisible: false,
                    headerStatusBarHeight: 0,
                    headerTitleStyle: {
                        fontWeight: "900",
                        fontSize: 14,
                    },
                    headerTitleContainerStyle: {
                        margin: 0,
                        padding: 0,
                    },
                    headerStyle: {
                        backgroundColor: theme.surface,
                        height:
                            Platform.OS === "ios" ? 44 : 40,
                    },
                }}
            />

            {isLargeScreen ? (
                <AdminDrugCategoriesWebView {...sharedProps} />
            ) : (
                <AdminDrugCategoriesMobileView {...sharedProps} />
            )}

            <AdminDrugCategoryEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addDrugCategoryApi.loading ||
                    updateDrugCategoryApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addDrugCategoryApi.data?.errors ||
                    updateDrugCategoryApi.data?.errors
                }
            />

            <AdminDrugCategoryDetailsModal
                routeItem={selectedCategory}
                onClose={() => setSelectedCategory(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}