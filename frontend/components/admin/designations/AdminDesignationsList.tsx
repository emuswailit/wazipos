// components/admin/designations/AdminDesignationsList.tsx
import designationsService from '@/api/designationsApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useDesignationsSync } from '@/context/DesignationsSyncContext';
import { DesignationItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminDesignationEditModal from './AdminDesignationEditModal';
import AdminDesignationsMobileView from './AdminDesignationsMobileView';
import AdminDesignationsWebView from './AdminDesignationsWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminDesignationsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: DesignationItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: DesignationItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: DesignationItem) => void;
    onEditItem: (item: DesignationItem) => void;
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

export default function AdminDesignationsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        designationsList,
        isDesignationsSyncing,
        isDesignationsRefreshing,
        forceDesignationsRefresh,
        lastSyncedTime,
        sourceTone,
    } = useDesignationsSync();

    useFocusEffect(
        useCallback(() => {
            forceDesignationsRefresh();
        }, [forceDesignationsRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<DesignationItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateDesignationApi = useApi<any>(async (payload: any) => {
        if (payload.action === "UpdateDesignation") {
            return await designationsService.updateDesignation(payload);
        }
        return await designationsService.createDesignation(payload);
    });

    const filteredDesignations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return designationsList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return designationsList.filter(
            (d) => hit(d.title) || hit(d.description) || hit(d.tenure) || hit(d.cadre_title)
        );
    }, [designationsList, query]);

    const totalItems = filteredDesignations.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredDesignations.slice(pageStart, pageEnd),
        [filteredDesignations, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            // 🟢 Exact payload structure matching your Postman request
            const payload = {
                action: editingItem ? "UpdateDesignation" : "CreateDesignation",
                designation_details: {
                    ...(editingItem ? { id: editingItem.id } : {}),
                    title: values.title,
                    cadre: values.cadre,
                    tenure: values.tenure,
                    total_slots: values.total_slots,
                    duration_in_months: values.duration_in_months,
                    description: values.description || "",
                }
            };

            const response = await mutateDesignationApi.request(payload);
            const isSuccess = response?.ok === true;

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceDesignationsRefresh();
                alert('Success', `Designation ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                alert('Failed', 'Could not save the designation.', undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error.', undefined, 'danger');
        }
    };

    const sharedProps: AdminDesignationsSharedProps = {
        query, setQuery,
        onRefresh: forceDesignationsRefresh,
        refreshing: isDesignationsSyncing || isDesignationsRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredDesignations,
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
            {isLargeScreen ? <AdminDesignationsWebView {...sharedProps} /> : <AdminDesignationsMobileView {...sharedProps} />}

            <AdminDesignationEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={mutateDesignationApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}