// components/admin/generics/AdminGenericsList.tsx
//
// Admin generics list shell.
//
// Owns the ledger state, API lifecycle, filtering, pagination,
// and the routing between the web table view and the mobile card
// view. Mounts both modals.
//
// Parent links (drug_classes, drug_sub_classes) are M2M, sent as
// arrays of UUIDs.

import drugsApi, {
    type GenericsRequest,
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

import AdminGenericDetailsModal from "./AdminGenericDetailsModal";
import AdminGenericEditModal from "./AdminGenericEditModal";
import AdminGenericsMobileView from "./AdminGenericsMobileView";
import AdminGenericsWebView from "./AdminGenericsWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminGenericsSharedProps,
    type GenericItem,
    type PageSize,
} from "./types";

/* =========================================================
 * Helpers
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

function formatHumanDate(dateString: string): string {
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
}

/**
 * Normalize a possibly-single or possibly-array value into an
 * array. Handles null, undefined, and empty strings.
 */
function toArray(val: any): any[] {
    if (Array.isArray(val)) return val;
    if (val == null) return [];
    if (typeof val === "string" && val.trim() === "") return [];
    return [val];
}

/* =========================================================
 * Component
 * ======================================================= */

export default function AdminGenericsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    /* ---------------- UI state ---------------- */
    const [selectedItem, setSelectedItem] =
        useState<GenericItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<GenericItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- API ---------------- */
    const getGenericsApi = useApi<any>(
        async (payload: GenericsRequest) =>
            await drugsApi.genericsAction(payload)
    );
    const addGenericApi = useApi<any>(
        async (payload: GenericsRequest) =>
            await drugsApi.genericsAction(payload)
    );
    const updateGenericApi = useApi<any>(
        async (payload: GenericsRequest) =>
            await drugsApi.genericsAction(payload)
    );

    const fetchGenerics = () => {
        getGenericsApi.request({ action: "GetGenerics" });
    };

    useEffect(() => {
        fetchGenerics();
    }, []);

    /* ---------------- Derived data ---------------- */
    const generics: GenericItem[] = useMemo(() => {
        if (getGenericsApi.data && Array.isArray(getGenericsApi.data)) {
            return getGenericsApi.data.map((item: any) => {
                const f = item.fields ?? item;

                // 1. IDs (Arrays of strings)
                const classIds = toArray(f?.drug_class ?? f?.drug_classes ?? f?.drug_class_ids);
                const subClassIds = toArray(f?.drug_sub_class ?? f?.drug_sub_classes ?? f?.drug_sub_class_ids);

                // 2. Titles (Strictly Strings)
                // The backend sends a string now, but we handle arrays just in case
                const rawClassTitles = f?.drug_class_titles ?? f?.drug_classes_titles ?? f?.drug_class_title ?? "";
                const classTitlesString = Array.isArray(rawClassTitles)
                    ? rawClassTitles.join(', ')
                    : String(rawClassTitles).trim();

                const rawSubClassTitles = f?.drug_sub_class_titles ?? f?.drug_sub_classes_titles ?? f?.drug_sub_class_title ?? "";
                const subClassTitlesString = Array.isArray(rawSubClassTitles)
                    ? rawSubClassTitles.join(', ')
                    : String(rawSubClassTitles).trim();

                return {
                    id: item.pk || item.id || Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    synonym: f?.synonym || null,
                    drug_class: classIds,
                    drug_sub_class: subClassIds,
                    drug_class_titles: classTitlesString,
                    drug_sub_class_titles: subClassTitlesString,
                    owner: f?.owner || "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getGenericsApi.data]);

    const filteredGenerics = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return generics;

        return generics.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.drug_class_titles.toLowerCase().includes(q) ||
                item.drug_sub_class_titles.toLowerCase().includes(q)
        );
    }, [generics, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filteredGenerics.length;
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
        () => filteredGenerics.slice(pageStart, pageEnd),
        [filteredGenerics, pageStart, pageEnd]
    );

    /* ---------------------------------------------------------
     * Form submit
     * ------------------------------------------------------- */
    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            let response: any;

            const details = {
                title: String(values.title ?? "").trim(),
                description: String(
                    values.description ?? ""
                ).trim(),
                drug_classes: Array.isArray(
                    values.drug_classes
                )
                    ? values.drug_classes.filter(Boolean)
                    : [],
                drug_sub_classes: Array.isArray(
                    values.drug_sub_classes
                )
                    ? values.drug_sub_classes.filter(Boolean)
                    : [],
            };

            if (editingItem) {
                response = await updateGenericApi.request({
                    action: "UpdateGeneric",
                    generic_details: {
                        id: editingItem.id,
                        ...details,
                    },
                });
            } else {
                response = await addGenericApi.request({
                    action: "CreateGeneric",
                    generic_details: details,
                });
            }

            console.log("GenericsAction", response);

            console.log(
                `📡 [Admin Inbound API Resolution] ${editingItem ? "Update" : "Create"
                } Request Status: ${response?.status ?? "N/A"
                } | Body:`,
                JSON.stringify(response?.data)
            );

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

            const ok =
                response?.ok === true &&
                String(data?.response_code ?? "") === "0";

            showResultAlert(
                ok ? "✅ Success" : "❌ Failed",
                responseMessage,
                errorsText
            );

            if (!ok) return;

            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchGenerics();
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
    const handleOpenEditFlow = (item: GenericItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: GenericItem) => {
        setSelectedItem(item);
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    /* ---------------- Loading gate ---------------- */
    if (getGenericsApi.loading && generics.length === 0) {
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
                    Loading molecular generics ledger...
                </Text>
            </View>
        );
    }

    /* ---------------- Shared view props ---------------- */
    const sourceTone: "server" | "cache" | "none" =
        generics.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : "No data";

    const sharedProps: AdminGenericsSharedProps = {
        query,
        setQuery,
        onRefresh: fetchGenerics,
        refreshing: getGenericsApi.loading,
        sourceLabel,
        sourceTone,
        lastSyncedTime: "",
        items: paginated,
        allItems: filteredGenerics,
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
                    title: "Generic Medications",
                    headerShown: true,
                    headerTintColor: theme.primary,
                    headerShadowVisible: false,
                    headerTitleStyle: {
                        fontWeight: "900",
                        fontSize: 14,
                    },
                    headerStyle: {
                        backgroundColor: theme.surface,
                    },
                }}
            />

            {isLargeScreen ? (
                <AdminGenericsWebView {...sharedProps} />
            ) : (
                <AdminGenericsMobileView {...sharedProps} />
            )}

            <AdminGenericEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addGenericApi.loading ||
                    updateGenericApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addGenericApi.data?.errors ||
                    updateGenericApi.data?.errors
                }
            />

            <AdminGenericDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}