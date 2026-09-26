// components/admin/preparations/AdminPreparationsList.tsx
//
// Admin preparations list shell.

import drugsApi, {
    type PreparationsRequest,
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

export type { PreparationItem } from "./types";

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

function toArray(val: any): any[] {
    if (Array.isArray(val)) return val;
    if (val == null) return [];
    if (typeof val === "string" && val.trim() === "") return [];
    return [val];
}

export default function AdminPreparationsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

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

    const getPreparationsApi = useApi<any>(
        async (payload: PreparationsRequest) =>
            await drugsApi.preparationsAction(payload)
    );
    const addPreparationApi = useApi<any>(
        async (payload: PreparationsRequest) =>
            await drugsApi.preparationsAction(payload)
    );
    const updatePreparationApi = useApi<any>(
        async (payload: PreparationsRequest) =>
            await drugsApi.preparationsAction(payload)
    );

    const fetchPreparations = () => {
        getPreparationsApi.request({ action: "GetPreparations" });
    };

    useEffect(() => {
        fetchPreparations();
    }, []);

    const preparations: PreparationItem[] = useMemo(() => {
        if (
            getPreparationsApi.data &&
            Array.isArray(getPreparationsApi.data)
        ) {
            return getPreparationsApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        item.key ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    long_title: f?.long_title || "",
                    description: f?.description || "",
                    formulation_id:
                        f?.formulation ||
                        f?.formulation_id ||
                        "",
                    formulation_title:
                        f?.formulation_title || "—",
                    generics_string:
                        f?.generics_string || "—",
                    generics: toArray(f?.generics).filter(
                        (x) => typeof x === "string"
                    ),
                    gen_array: Array.isArray(f?.gen_array)
                        ? f.gen_array
                        : [],
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getPreparationsApi.data]);

    const filteredPreparations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return preparations;
        return preparations.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.long_title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.generics_string.toLowerCase().includes(q) ||
                item.formulation_title.toLowerCase().includes(q)
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
                formulation_id: String(
                    values.formulation_id ?? ""
                ).trim(),
                generics: Array.isArray(values.generics)
                    ? values.generics.filter(Boolean)
                    : [],
            };

            if (editingItem) {
                response =
                    await updatePreparationApi.request({
                        action: "UpdatePreparation",
                        preparation_details: {
                            id: editingItem.id,
                            ...details,
                        },
                    });
            } else {
                response =
                    await addPreparationApi.request({
                        action: "CreatePreparation",
                        preparation_details: details,
                    });
            }

            console.log("PreparationsAction", response);

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
                response?.ok === true ||
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
            fetchPreparations();
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

    if (
        getPreparationsApi.loading &&
        preparations.length === 0
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
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminPreparationsSharedProps = {
        query,
        setQuery,
        onRefresh: fetchPreparations,
        refreshing: getPreparationsApi.loading,
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