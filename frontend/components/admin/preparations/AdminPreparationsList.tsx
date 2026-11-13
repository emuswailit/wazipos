// components/admin/preparations/AdminPreparationsList.tsx
//
// Admin preparations list shell.

import drugsApi, {
    type PreparationsRequest,
} from "@/api/drugsApi";
import { useAuth } from "@/context/AuthContext";
import { usePreparationsSync } from "@/context/PreparationsSyncContext";
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

import AdminPreparationDetailsModal from "./AdminPreparationDetailsModal";
import AdminPreparationEditModal from "./AdminPreparationEditModal";
import AdminPreparationsMobileView from "./AdminPreparationsMobileView";
import AdminPreparationsWebView from "./AdminPreparationsWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminPreparationsSharedProps,
    type PageSize,
    type PreparationItem,
} from "./types";

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

export default function AdminPreparationsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    // 🌟 Use the Context for READING data
    const {
        preparationsList,
        isPreparationsSyncing,
        isPreparationsRefreshing,
        forcePreparationsRefresh
    } = usePreparationsSync();

    const [selectedItem, setSelectedItem] =
        useState<PreparationItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<PreparationItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    // Still need the mutation APIs for WRITING data (Create/Update)
    const addPreparationApi = useApi<any>(
        async (payload: PreparationsRequest) =>
            await drugsApi.preparationsAction(payload)
    );
    const updatePreparationApi = useApi<any>(
        async (payload: PreparationsRequest) =>
            await drugsApi.preparationsAction(payload)
    );

    // 🌟 Strictly map the context items to the local PreparationItem type
    const preparations: PreparationItem[] = useMemo(() => {
        return preparationsList.map((item: any, index: number) => {
            // Use local Dexie ID if available, then remote UUID, then stable index
            const stableId = item.id ? String(item.id) : (item.remote_id || `prep-${index}`);

            return {
                id: stableId,
                key: item.remote_id || item.key || undefined,
                title: item.title || "UNSPECIFIED",
                long_title: item.long_title || "",
                description: item.description || "",
                formulation: item.formulation || item.formulation_id || "",
                formulation_id: item.formulation_id || item.formulation || "",
                formulation_title: item.formulation_title || "—",
                generics: Array.isArray(item.generics) ? item.generics : [],
                gen_array: Array.isArray(item.gen_array) ? item.gen_array : [],
                generics_string: item.generics_string || "—",
                created: item.created || "",
                updated: item.updated || "",
            };
        });
    }, [preparationsList]);

    const filteredPreparations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return preparations;
        return preparations.filter(
            (item) =>
                (item.title || "").toLowerCase().includes(q) ||
                (item.long_title || "").toLowerCase().includes(q) ||
                (item.description || "").toLowerCase().includes(q) ||
                (item.generics_string || "").toLowerCase().includes(q) ||
                (item.formulation_title || "").toLowerCase().includes(q)
        );
    }, [preparations, query]);

    const totalItems = filteredPreparations.length;
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
        () => filteredPreparations.slice(pageStart, pageEnd),
        [filteredPreparations, pageStart, pageEnd]
    );

    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            let response: any;

            const details = {
                title: String(values.title ?? "")
                    .toUpperCase()
                    .trim(),
                description: String(
                    values.description ?? ""
                ).trim(),
                // Send formulation_id as expected by the frontend form
                formulation_id: String(
                    values.formulation_id ?? ""
                ).trim(),
                generics: Array.isArray(values.generics)
                    ? values.generics.filter(Boolean)
                    : [],
            };

            if (editingItem) {
                response = await updatePreparationApi.request({
                    action: "UpdatePreparation",
                    preparation_details: {
                        id: editingItem.key || editingItem.id, // Send the remote UUID if possible
                        ...details,
                    },
                });
            } else {
                response = await addPreparationApi.request({
                    action: "CreatePreparation",
                    preparation_details: details,
                });
            }

            console.log("PreparationsAction", response);

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

            // 🌟 Trigger context refresh instead of local fetch
            forcePreparationsRefresh();
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

    const handleOpenEditFlow = (item: PreparationItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: PreparationItem) => {
        setSelectedItem(item);
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    // 🌟 Use context syncing states
    const isRefreshing = isPreparationsSyncing || isPreparationsRefreshing;

    if (isPreparationsSyncing && preparations.length === 0) {
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
                    Loading product preparations ledger...
                </Text>
            </View>
        );
    }

    const sourceTone: "server" | "cache" | "none" =
        preparations.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : "No data";

    const sharedProps: AdminPreparationsSharedProps = {
        query,
        setQuery,
        onRefresh: forcePreparationsRefresh, // 🌟 Context refresh
        refreshing: isRefreshing,            // 🌟 Context loading state
        sourceLabel,
        sourceTone,
        lastSyncedTime: "",
        items: paginated,
        allItems: filteredPreparations,
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
                    title: "Medical Preparations",
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
                <AdminPreparationsWebView {...sharedProps} />
            ) : (
                <AdminPreparationsMobileView {...sharedProps} />
            )}

            <AdminPreparationEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addPreparationApi.loading ||
                    updatePreparationApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addPreparationApi.data?.errors ||
                    updatePreparationApi.data?.errors
                }
            />

            <AdminPreparationDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}