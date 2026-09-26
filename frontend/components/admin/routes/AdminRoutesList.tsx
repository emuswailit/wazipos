// components/admin/routes/AdminRoutesList.tsx
//
// Admin routes list shell.

import drugsApi, {
    type RoutesRequest,
} from "@/api/drugsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack, useLocalSearchParams } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

import AdminRouteDetailsModal from "./AdminRouteDetailsModal";
import AdminRouteEditModal from "./AdminRouteEditModal";
import AdminRoutesMobileView from "./AdminRoutesMobileView";
import AdminRoutesWebView from "./AdminRoutesWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminRoutesSharedProps,
    type DrugRouteItem,
    type PageSize,
} from "./types";

export type { DrugRouteItem } from "./types";

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

export default function AdminRoutesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const { tab } = useLocalSearchParams<{ tab?: string }>();
    const isLargeScreen = width >= 768;

    const [selectedItem, setSelectedItem] =
        useState<DrugRouteItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<DrugRouteItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    const getRoutesApi = useApi<any>(
        async (payload: RoutesRequest) =>
            await drugsApi.routesAction(payload)
    );
    const addRouteApi = useApi<any>(
        async (payload: RoutesRequest) =>
            await drugsApi.routesAction(payload)
    );
    const updateRouteApi = useApi<any>(
        async (payload: RoutesRequest) =>
            await drugsApi.routesAction(payload)
    );

    const fetchRoutes = () => {
        getRoutesApi.request({ action: "GetRoutes" });
    };

    useEffect(() => {
        fetchRoutes();
    }, [tab]);

    const drugRoutes: DrugRouteItem[] = useMemo(() => {
        if (
            getRoutesApi.data &&
            Array.isArray(getRoutesApi.data)
        ) {
            return getRoutesApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    owner: f?.owner || "—",
                    entity: f?.entity || "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getRoutesApi.data]);

    const filteredRoutes = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return drugRoutes;
        return drugRoutes.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q)
        );
    }, [drugRoutes, query]);

    const totalItems = filteredRoutes.length;
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
        () => filteredRoutes.slice(pageStart, pageEnd),
        [filteredRoutes, pageStart, pageEnd]
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
            };

            if (editingItem) {
                response = await updateRouteApi.request({
                    action: "UpdateRoute",
                    route_details: {
                        id: editingItem.id,
                        ...details,
                    },
                });
            } else {
                response = await addRouteApi.request({
                    action: "CreateRoute",
                    route_details: details,
                });
            }

            console.log("RoutesAction", response);

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
            fetchRoutes();
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

    const handleOpenEditFlow = (item: DrugRouteItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: DrugRouteItem) => {
        setSelectedItem(item);
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    if (getRoutesApi.loading && drugRoutes.length === 0) {
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
                    Loading routes from remote ledger...
                </Text>
            </View>
        );
    }

    const sourceTone: "server" | "cache" | "none" =
        drugRoutes.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminRoutesSharedProps = {
        query,
        setQuery,
        onRefresh: fetchRoutes,
        refreshing: getRoutesApi.loading,
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
        <SafeAreaView
            className="flex-1"
            edges={["left", "right", "bottom"]}
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
                    title: "Administration Routes",
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: theme.surface,
                    },
                    headerTintColor: theme.primary,
                    headerTitleStyle: {
                        fontWeight: "800",
                    },
                    headerShadowVisible: false,
                }}
            />

            {isLargeScreen ? (
                <AdminRoutesWebView {...sharedProps} />
            ) : (
                <AdminRoutesMobileView {...sharedProps} />
            )}

            <AdminRouteEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addRouteApi.loading || updateRouteApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />

            <AdminRouteDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </SafeAreaView>
    );
}