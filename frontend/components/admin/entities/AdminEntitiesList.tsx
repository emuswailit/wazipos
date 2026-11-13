// components/admin/entities/AdminEntitiesList.tsx
import entitiesApi from '@/api/entitiesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { EntityItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, Text, useWindowDimensions, View } from 'react-native';

import AdminEntitiesMobileView from './AdminEntitiesMobileView';
import AdminEntitiesWebView from './AdminEntitiesWebView';
import AdminEntityDetailsModal from './AdminEntityDetailsModal'; // 🟢 Import Details
import AdminEntityEditModal from './AdminEntityEditModal';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminEntitiesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: "server" | "cache" | "none";
    lastSyncedTime?: string;
    items: EntityItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: EntityItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: EntityItem) => void;
    onEditItem: (item: EntityItem) => void;
    formatDateHandler: (s?: string | null) => string;
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

function formatHumanDate(dateString?: string | null): string {
    if (!dateString) return "—";
    try {
        const cleanStr = dateString.replace(" ", "T");
        const dateObj = new Date(cleanStr);
        if (isNaN(dateObj.getTime())) return dateString;
        return dateObj.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return dateString; }
}

export default function AdminEntitiesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const alert = useAlert();

    const {
        entitiesList,
        isEntitiesSyncing,
        isEntitiesRefreshing,
        forceEntitiesRefresh,
    } = useEntitiesSync();

    // 🟢 Modals state
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<EntityItem | null>(null);

    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [viewingItem, setViewingItem] = useState<EntityItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateEntityApi = useApi<any>(async (payload: any) => {
        return await entitiesApi.entitiesAction(payload);
    });

    const filteredEntities = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entitiesList;
        return entitiesList.filter(
            (item) =>
                (item.title || "").toLowerCase().includes(q) ||
                (item.email || "").toLowerCase().includes(q) ||
                (item.entity_type || "").toLowerCase().includes(q)
        );
    }, [entitiesList, query]);

    const totalItems = filteredEntities.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filteredEntities.slice(pageStart, pageEnd), [filteredEntities, pageStart, pageEnd]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            const entity_details = {
                title: values.title || "",
                entity_type: values.entity_type || "",
                entity_ownership: values.entity_ownership || "PRIVATE",
                country: values.country || "",
                county: values.county || null,
                town: values.town || null,
                road: values.road || null,
                building: values.building || null,
                categories: Array.isArray(values.categories) ? values.categories : [],
                entity_level: values.entity_level || "0",
                expanded: false,
                plan: "",

                bank: values.bank || null,
                account_name: values.account_name || null,
                account_number: values.account_number || null,
                code: values.code || null,
                latitude: values.latitude || null,
                longitude: values.longitude || null,

                ...(editingItem ? { id: editingItem.remote_id } : {}),
            };

            const payload = {
                action: editingItem ? "UpdateEntity" : "CreateLocalEntity",
                entity_details,
            };

            const response = await mutateEntityApi.request(payload);
            const code = response?.data?.response_code;
            const isSuccess = response?.ok === true && (code === 0 || code === '0' || code === undefined);

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                forceEntitiesRefresh();

                alert(
                    "Success",
                    `Entity ${editingItem ? "updated" : "created"} successfully.`,
                    undefined,
                    "success"
                );
            } else {
                const backendErrors = response?.data?.errors;
                let errorMsg = response?.data?.response_message || "Could not save the entity.";

                if (Array.isArray(backendErrors) && backendErrors.length > 0) {
                    errorMsg += "\n\n" + backendErrors.join("\n");
                } else if (typeof backendErrors === "string") {
                    errorMsg += "\n\n" + backendErrors;
                } else if (backendErrors && typeof backendErrors === "object") {
                    errorMsg += "\n\n" + JSON.stringify(backendErrors);
                }

                alert("Failed", errorMsg, undefined, "danger");
            }
        } catch (err: any) {
            alert("Error", err?.message || "An unexpected error occurred.", undefined, "danger");
        }
    };

    if (isEntitiesSyncing && entitiesList.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, marginTop: 12 }}>Loading entities ledger...</Text>
            </View>
        );
    }

    const isRefreshing = isEntitiesSyncing || isEntitiesRefreshing;

    const sharedProps: AdminEntitiesSharedProps = {
        query, setQuery,
        onRefresh: forceEntitiesRefresh,
        refreshing: isRefreshing,
        sourceLabel: "Server", sourceTone: "server", lastSyncedTime: "",
        items: paginated,
        allItems: filteredEntities,

        // 🟢 Route to correct modals
        onOpenCreate: () => { setEditingItem(null); setIsFormModalOpen(true); },
        onPressItem: (item) => { setViewingItem(item); setIsDetailsModalOpen(true); },
        onEditItem: (item) => { setEditingItem(item); setIsFormModalOpen(true); },

        formatDateHandler: formatHumanDate,
        page, pageSize, totalItems, totalPages, pageStart, pageEnd,
        onPrev: () => setPage(p => Math.max(1, p - 1)),
        onNext: () => setPage(p => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
    };

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            {isLargeScreen ? <AdminEntitiesWebView {...sharedProps} /> : <AdminEntitiesMobileView {...sharedProps} />}

            {/* Details Modal */}
            <AdminEntityDetailsModal
                visible={isDetailsModalOpen}
                onClose={() => { setIsDetailsModalOpen(false); setViewingItem(null); }}
                onEdit={() => {
                    setIsDetailsModalOpen(false);
                    setEditingItem(viewingItem);
                    setIsFormModalOpen(true);
                }}
                item={viewingItem}
                formatDateHandler={formatHumanDate}
            />

            {/* Edit Modal */}
            <AdminEntityEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode} theme={theme}
                isSubmittingRemote={mutateEntityApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}