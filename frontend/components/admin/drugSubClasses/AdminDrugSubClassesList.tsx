// components/admin/drugSubClasses/AdminDrugSubClassesList.tsx
//
// Admin drug sub classes list shell.
//
// Owns the ledger state, API lifecycle, filtering, pagination,
// and the routing between the web table view and the mobile card
// view. Mounts both modals.

import drugsApi, {
    type DrugSubClassesRequest,
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

import AdminDrugSubClassDetailsModal from "./AdminDrugSubClassDetailsModal";
import AdminDrugSubClassEditModal from "./AdminDrugSubClassEditModal";
import AdminDrugSubClassesMobileView from "./AdminDrugSubClassesMobileView";
import AdminDrugSubClassesWebView from "./AdminDrugSubClassesWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminDrugSubClassesSharedProps,
    type DrugSubClassItem,
    type PageSize,
} from "./types";

export type { DrugSubClassItem } from "./types";

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

export default function AdminDrugSubClassesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    /* ---------------- UI state ---------------- */
    const [selectedSubClass, setSelectedSubClass] =
        useState<DrugSubClassItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<DrugSubClassItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    /* ---------------- API ---------------- */
    const getDrugSubClassesApi = useApi<any>(
        async (payload: DrugSubClassesRequest) =>
            await drugsApi.drugSubClassesAction(payload)
    );
    const addDrugSubClassApi = useApi<any>(
        async (payload: DrugSubClassesRequest) =>
            await drugsApi.drugSubClassesAction(payload)
    );
    const updateDrugSubClassApi = useApi<any>(
        async (payload: DrugSubClassesRequest) =>
            await drugsApi.drugSubClassesAction(payload)
    );

    const fetchDrugSubClasses = () => {
        getDrugSubClassesApi.request({
            action: "GetDrugSubClasses",
        });
    };

    useEffect(() => {
        fetchDrugSubClasses();
    }, []);

    /* ---------------- Derived data ---------------- */
    const subclasses: DrugSubClassItem[] = useMemo(() => {
        if (
            getDrugSubClassesApi.data &&
            Array.isArray(getDrugSubClassesApi.data)
        ) {
            return getDrugSubClassesApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    drug_class: f?.drug_class || "",
                    drug_class_title:
                        f?.drug_class_title ||
                        f?.drug_class_name ||
                        "",
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getDrugSubClassesApi.data]);

    const filteredSubClasses = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return subclasses;
        return subclasses.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.drug_class_title
                    .toLowerCase()
                    .includes(q)
        );
    }, [subclasses, query]);

    /* ---------------- Pagination ---------------- */
    const totalItems = filteredSubClasses.length;
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
        () => filteredSubClasses.slice(pageStart, pageEnd),
        [filteredSubClasses, pageStart, pageEnd]
    );

    /* ---------------------------------------------------------
     * Form submit
     *
     * Both branches send the same envelope shape:
     *   {
     *       action,
     *       drug_sub_class_details: {
     *           title, description, drug_class, id?
     *       }
     *   }
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
                description: String(
                    values.description ?? ""
                ).trim(),
                drug_class: String(
                    values.drug_class ?? ""
                ).trim(),
            };

            if (editingItem) {
                response =
                    await updateDrugSubClassApi.request({
                        action: "UpdateDrugSubClass",
                        drug_sub_class_details: {
                            id: editingItem.id,
                            ...details,
                        },
                    });
            } else {
                response =
                    await addDrugSubClassApi.request({
                        action: "CreateDrugSubClass",
                        drug_sub_class_details: details,
                    });
            }

            console.log("DrugSubClassesAction", response);

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
            fetchDrugSubClasses();
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
    const handleOpenEditFlow = (item: DrugSubClassItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: DrugSubClassItem) => {
        setSelectedSubClass(item);
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
        getDrugSubClassesApi.loading &&
        subclasses.length === 0
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
                    Loading drug subclasses ledger...
                </Text>
            </View>
        );
    }

    /* ---------------- Shared view props ---------------- */
    const sourceTone: "server" | "cache" | "none" =
        subclasses.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminDrugSubClassesSharedProps = {
        query,
        setQuery,
        onRefresh: fetchDrugSubClasses,
        refreshing: getDrugSubClassesApi.loading,
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
                    title: "Drug Subclasses",
                    headerShown: true,
                    headerTintColor: theme.primary,
                    headerShadowVisible: false,
                    headerStatusBarHeight: 0,
                    headerTitleStyle: {
                        fontWeight: "900",
                        fontSize: 18,
                    },
                    headerTitleContainerStyle: {
                        margin: 0,
                        padding: 0,
                    },
                    headerStyle: {
                        backgroundColor: theme.surface,
                        height:
                            Platform.OS === "android" ? 44 : 40,
                    },
                }}
            />

            {isLargeScreen ? (
                <AdminDrugSubClassesWebView {...sharedProps} />
            ) : (
                <AdminDrugSubClassesMobileView {...sharedProps} />
            )}

            <AdminDrugSubClassEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addDrugSubClassApi.loading ||
                    updateDrugSubClassApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addDrugSubClassApi.data?.errors ||
                    updateDrugSubClassApi.data?.errors
                }
            />

            <AdminDrugSubClassDetailsModal
                routeItem={selectedSubClass}
                onClose={() => setSelectedSubClass(null)}
                theme={theme}
                formatDateHandler={formatHumanDate}
                onOpenEditTrigger={handleOpenEditFlow}
            />
        </View>
    );
}