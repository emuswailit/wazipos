// components/admin/roles/AdminRolesList.tsx
import rolesService from '@/api/rolesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useRolesSync } from '@/context/RolesSyncContext';
import { RoleItem } from '@/databases/types';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminRoleEditModal from './AdminRoleEditModal';
import AdminRolesMobileView from './AdminRolesMobileView';
import AdminRolesWebView from './AdminRolesWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminRolesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: RoleItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: RoleItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: RoleItem) => void;
    onEditItem: (item: RoleItem) => void;
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

export default function AdminRolesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        rolesList,
        isRolesSyncing,
        isRolesRefreshing,
        forceRolesRefresh,
        lastSyncedTime,
        sourceTone,
    } = useRolesSync();

    useFocusEffect(
        useCallback(() => {
            forceRolesRefresh();
        }, [forceRolesRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RoleItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    // 🟢 Local loading state for form submission
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredRoles = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rolesList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return rolesList.filter(
            (r) =>
                hit(r.title) ||
                hit(r.value) ||
                hit(r.cluster_title) ||
                hit(r.entity_title) ||
                hit(r.description)
        );
    }, [rolesList, query]);

    const totalItems = filteredRoles.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredRoles.slice(pageStart, pageEnd),
        [filteredRoles, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        setIsSubmitting(true);
        try {
            let response;

            if (editingItem) {
                // 🟢 Update Payload (Matches Postman)
                response = await rolesService.updateRole({
                    id: editingItem.id,
                    title: values.title,
                    description: values.description || "",
                    // cluster omitted as per your UpdateRole Postman
                });
            } else {
                // 🟢 Create Payload (Matches Postman)
                response = await rolesService.createRole({
                    title: values.title,
                    cluster: values.cluster,
                    description: values.description || "",
                });
            }

            const code = response?.data?.response_code;
            const isSuccess = response?.ok === true && (code === 0 || code === '0' || code === undefined);

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceRolesRefresh();
                alert('Success', `Role ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                // Extract error message from backend
                const backendErrors = response?.data?.errors || response?.data?.message || response?.data?.response_message;
                let errorMsg = 'Could not save the role.';

                if (typeof backendErrors === 'string') {
                    errorMsg = backendErrors;
                } else if (Array.isArray(backendErrors)) {
                    errorMsg = backendErrors.join('\n');
                } else if (backendErrors && typeof backendErrors === 'object') {
                    errorMsg = JSON.stringify(backendErrors);
                }

                alert('Failed', errorMsg, undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error occurred.', undefined, 'danger');
        } finally {
            setIsSubmitting(false);
        }
    };

    const sharedProps: AdminRolesSharedProps = {
        query, setQuery,
        onRefresh: forceRolesRefresh,
        refreshing: isRolesSyncing || isRolesRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredRoles,
        onOpenCreate: () => { setEditingItem(null); setIsFormModalOpen(true); },
        onPressItem: (item) => { setEditingItem(item); setIsFormModalOpen(true); },
        onEditItem: (item) => { setEditingItem(item); setIsFormModalOpen(true); },
        page, pageSize, totalItems, totalPages, pageStart, pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
    };

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

            {isLargeScreen ? (
                <AdminRolesWebView {...sharedProps} />
            ) : (
                <AdminRolesMobileView {...sharedProps} />
            )}

            <AdminRoleEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={isSubmitting} // 🟢 Use local state
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}