// components/admin/frequencies/AdminFrequenciesList.tsx
//
// Admin frequencies list shell.
//
// Owns the ledger state, API lifecycle, filtering, pagination,
// and the routing between the web table view and the mobile card
// view. Mounts both modals.
//
// Talks straight to `drugsApi.frequenciesAction` — no intermediate
// wrapper file. The shell builds the full request envelope.

import drugsApi, {
    type FrequenciesRequest,
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

import AdminFrequenciesMobileView from "./AdminFrequenciesMobileView";
import AdminFrequenciesWebView from "./AdminFrequenciesWebView";
import AdminFrequencyDetailsModal from "./AdminFrequencyDetailsModal";
import AdminFrequencyEditModal from "./AdminFrequencyEditModal";
import {
    PAGE_SIZE_OPTIONS,
    type AdminFrequenciesSharedProps,
    type FrequencyItem,
    type PageSize,
} from "./types";

export type { FrequencyItem } from "./types";

/* =========================================================
 * Alert helper
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
 * Date formatter
 * ======================================================= */

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

/* =========================================================
 * Component
 * ======================================================= */

export default function AdminFrequenciesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const { tab } = useLocalSearchParams<{ tab?: string }>();
    const isLargeScreen = width >= 768;

    /* ---------------- UI state ---------------- */
    const [selectedItem, setSelectedItem] =
        useState<FrequencyItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<FrequencyItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- API ---------------- */
    const getFrequenciesApi = useApi<any>(
        async (payload: FrequenciesRequest) =>
            await drugsApi.frequenciesAction(payload)
    );
    const addFrequencyApi = useApi<any>(
        async (payload: FrequenciesRequest) =>
            await drugsApi.frequenciesAction(payload)
    );
    const updateFrequencyApi = useApi<any>(
        async (payload: FrequenciesRequest) =>
            await drugsApi.frequenciesAction(payload)
    );

    const fetchFrequencies = () => {
        getFrequenciesApi.request({
            action: "GetFrequencies",
        });
    };

    useEffect(() => {
        fetchFrequencies();
    }, [tab]);

    /* ---------------- Derived data ---------------- */
    const frequencies: FrequencyItem[] = useMemo(() => {
        if (
            getFrequenciesApi.data &&
            Array.isArray(getFrequenciesApi.data)
        ) {
            return getFrequenciesApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    abbreviation: f?.abbreviation || "—",
                    latin: f?.latin || "—",
                    numerical:
                        typeof f?.numerical === "number"
                            ? f.numerical
                            : Number(f?.numerical) || 0,
                    description: f?.description || "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getFrequenciesApi.data]);

    const filteredFrequencies = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return frequencies;
        return frequencies.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.abbreviation.toLowerCase().includes(q) ||
                item.latin.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q)
        );
    }, [frequencies, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filteredFrequencies.length;
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
        () => filteredFrequencies.slice(pageStart, pageEnd),
        [filteredFrequencies, pageStart, pageEnd]
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
                title: String(values.title ?? "")
                    .toUpperCase()
                    .trim(),
                abbreviation: String(
                    values.abbreviation ?? ""
                )
                    .toUpperCase()
                    .trim(),
                latin: String(values.latin ?? "").trim(),
                numerical: String(
                    values.numerical ?? ""
                ).trim(),
                description: String(
                    values.description ?? ""
                ).trim(),
            };

            if (editingItem) {
                response =
                    await updateFrequencyApi.request({
                        action: "UpdateFrequency",
                        frequency_details: {
                            id: editingItem.id,
                            ...details,
                        },
                    });
            } else {
                response = await addFrequencyApi.request({
                    action: "CreateFrequency",
                    frequency_details: details,
                });
            }

            console.log("FrequenciesAction", response);

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
            fetchFrequencies();
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
    const handleOpenEditFlow = (item: FrequencyItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: FrequencyItem) => {
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
    if (
        getFrequenciesApi.loading &&
        frequencies.length === 0
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
                    Loading frequencies ledger...
                </Text>
            </View>
        );
    }

    /* ---------------- Shared view props ---------------- */
    const sourceTone: "server" | "cache" | "none" =
        frequencies.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminFrequenciesSharedProps = {
        query,
        setQuery,
        onRefresh: fetchFrequencies,
        refreshing: getFrequenciesApi.loading,
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
                    title: "Intake Frequencies",
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
                <AdminFrequenciesWebView {...sharedProps} />
            ) : (
                <AdminFrequenciesMobileView {...sharedProps} />
            )}

            <AdminFrequencyEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addFrequencyApi.loading ||
                    updateFrequencyApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addFrequencyApi.data?.errors ||
                    updateFrequencyApi.data?.errors
                }
            />

            <AdminFrequencyDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}