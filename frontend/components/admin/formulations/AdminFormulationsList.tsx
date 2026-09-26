// components/admin/formulations/AdminFormulationsList.tsx
//
// Admin formulations list shell.
//
// Owns the ledger state, API lifecycle, filtering, pagination,
// and the routing between the web table view and the mobile card
// view. Mounts both modals.
//
// Talks straight to `drugsApi.formulationsAction` — no
// intermediate wrapper file. The shell builds the full request
// envelope.

import drugsApi, {
    type FormulationsRequest,
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

import AdminFormulationDetailsModal from "./AdminFormulationDetailsModal";
import AdminFormulationEditModal from "./AdminFormulationEditModal";
import AdminFormulationsMobileView from "./AdminFormulationsMobileView";
import AdminFormulationsWebView from "./AdminFormulationsWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminFormulationsSharedProps,
    type FormulationItem,
    type PageSize,
} from "./types";

export type { FormulationItem } from "./types";

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

export default function AdminFormulationsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    /* ---------------- UI state ---------------- */
    const [selectedItem, setSelectedItem] =
        useState<FormulationItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<FormulationItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- API ---------------- */
    const getFormulationsApi = useApi<any>(
        async (payload: FormulationsRequest) =>
            await drugsApi.formulationsAction(payload)
    );
    const addFormulationApi = useApi<any>(
        async (payload: FormulationsRequest) =>
            await drugsApi.formulationsAction(payload)
    );
    const updateFormulationApi = useApi<any>(
        async (payload: FormulationsRequest) =>
            await drugsApi.formulationsAction(payload)
    );

    const fetchFormulations = () => {
        getFormulationsApi.request({
            action: "GetFormulations",
        });
    };

    useEffect(() => {
        fetchFormulations();
    }, []);

    /* ---------------- Derived data ---------------- */
    const formulations: FormulationItem[] = useMemo(() => {
        if (
            getFormulationsApi.data &&
            Array.isArray(getFormulationsApi.data)
        ) {
            return getFormulationsApi.data.map((item: any) => {
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
    }, [getFormulationsApi.data]);

    const filteredFormulations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return formulations;
        return formulations.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q)
        );
    }, [formulations, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filteredFormulations.length;
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
        () => filteredFormulations.slice(pageStart, pageEnd),
        [filteredFormulations, pageStart, pageEnd]
    );

    /* ---------------------------------------------------------
     * Form submit
     *
     * Both branches send the same envelope shape:
     *   { action, formulation_details: { title, description, id? } }
     * ------------------------------------------------------- */
    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            let response: any;

            if (editingItem) {
                response =
                    await updateFormulationApi.request({
                        action: "UpdateFormulation",
                        formulation_details: {
                            id: editingItem.id,
                            title: values.title.trim(),
                            description:
                                values.description.trim(),
                        },
                    });
            } else {
                response = await addFormulationApi.request({
                    action: "CreateFormulation",
                    formulation_details: {
                        title: values.title.trim(),
                        description: values.description.trim(),
                    },
                });
            }

            console.log("FormulationsAction", response);

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
            fetchFormulations();
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
    const handleOpenEditFlow = (item: FormulationItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: FormulationItem) => {
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
        getFormulationsApi.loading &&
        formulations.length === 0
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
                    Loading drug formulations ledger...
                </Text>
            </View>
        );
    }

    /* ---------------- Shared view props ---------------- */
    const sourceTone: "server" | "cache" | "none" =
        formulations.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminFormulationsSharedProps = {
        query,
        setQuery,
        onRefresh: fetchFormulations,
        refreshing: getFormulationsApi.loading,
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
                    title: "Formulations",
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
                <AdminFormulationsWebView {...sharedProps} />
            ) : (
                <AdminFormulationsMobileView {...sharedProps} />
            )}

            <AdminFormulationEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addFormulationApi.loading ||
                    updateFormulationApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addFormulationApi.data?.errors ||
                    updateFormulationApi.data?.errors
                }
            />

            <AdminFormulationDetailsModal
                routeItem={selectedItem}
                onClose={() => setSelectedItem(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}