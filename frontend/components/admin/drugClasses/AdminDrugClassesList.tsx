// components/admin/drugClasses/AdminDrugClassesList.tsx
//
// Admin drug classes list shell.

import drugsApi, {
    type DrugClassesRequest,
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

import AdminDrugClassDetailsModal from "./AdminDrugClassDetailsModal";
import AdminDrugClassEditModal from "./AdminDrugClassEditModal";
import AdminDrugClassesMobileView from "./AdminDrugClassesMobileView";
import AdminDrugClassesWebView from "./AdminDrugClassesWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminDrugClassesSharedProps,
    type DrugClassItem,
    type PageSize,
} from "./types";

export type { DrugClassItem } from "./types";

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

export default function AdminDrugClassesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedItem, setSelectedItem] =
        useState<DrugClassItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<DrugClassItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    const getDrugClassesApi = useApi<any>(
        async (payload: DrugClassesRequest) =>
            await drugsApi.drugClassesAction(payload)
    );
    const addDrugClassApi = useApi<any>(
        async (payload: DrugClassesRequest) =>
            await drugsApi.drugClassesAction(payload)
    );
    const updateDrugClassApi = useApi<any>(
        async (payload: DrugClassesRequest) =>
            await drugsApi.drugClassesAction(payload)
    );

    const fetchDrugClasses = () => {
        getDrugClassesApi.request({ action: "GetDrugClasses" });
    };

    useEffect(() => {
        fetchDrugClasses();
    }, []);

    const classifications: DrugClassItem[] = useMemo(() => {
        if (
            getDrugClassesApi.data &&
            Array.isArray(getDrugClassesApi.data)
        ) {
            return getDrugClassesApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    category: f?.category || "",
                    category_title:
                        f?.category_title ||
                        f?.category_name ||
                        "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getDrugClassesApi.data]);

    const filteredClassifications = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return classifications;
        return classifications.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.category_title
                    .toLowerCase()
                    .includes(q)
        );
    }, [classifications, query]);

    const totalItems = filteredClassifications.length;
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
        () => filteredClassifications.slice(pageStart, pageEnd),
        [filteredClassifications, pageStart, pageEnd]
    );

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
                category: String(values.category ?? "").trim(),
            };

            if (editingItem) {
                response = await updateDrugClassApi.request({
                    action: "UpdateDrugClass",
                    drug_class_details: {
                        id: editingItem.id,
                        ...details,
                    },
                });
            } else {
                response = await addDrugClassApi.request({
                    action: "CreateDrugClass",
                    drug_class_details: details,
                });
            }

            console.log("DrugClassesAction", response);

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
            fetchDrugClasses();
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

    const handleOpenEditFlow = (item: DrugClassItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: DrugClassItem) => {
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
        getDrugClassesApi.loading &&
        classifications.length === 0
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
                    Loading drug classes ledger...
                </Text>
            </View>
        );
    }

    const sourceTone: "server" | "cache" | "none" =
        classifications.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminDrugClassesSharedProps = {
        query,
        setQuery,
        onRefresh: fetchDrugClasses,
        refreshing: getDrugClassesApi.loading,
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
                    title: "Drug Classes Manager",
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: theme.surface,
                    },
                    headerTintColor: theme.primary,
                    headerTitleStyle: {
                        fontWeight: "800",
                        fontSize:
                            Platform.OS === "ios" ? 17 : 19,
                    },
                    headerShadowVisible: false,
                }}
            />

            {isLargeScreen ? (
                <AdminDrugClassesWebView {...sharedProps} />
            ) : (
                <AdminDrugClassesMobileView {...sharedProps} />
            )}

            <AdminDrugClassEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addDrugClassApi.loading ||
                    updateDrugClassApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addDrugClassApi.data?.errors ||
                    updateDrugClassApi.data?.errors
                }
            />

            <AdminDrugClassDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}