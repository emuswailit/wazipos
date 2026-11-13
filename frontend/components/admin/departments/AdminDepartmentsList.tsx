// components/admin/departments/AdminDepartmentsList.tsx
import departmentsService from '@/api/departmentsApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useDepartmentsSync } from '@/context/DepartmentsSyncContext';
import { DepartmentItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminDepartmentEditModal from './AdminDepartmentEditModal';
import AdminDepartmentsMobileView from './AdminDepartmentsMobileView';
import AdminDepartmentsWebView from './AdminDepartmentsWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminDepartmentsSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: DepartmentItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: DepartmentItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: DepartmentItem) => void;
    onEditItem: (item: DepartmentItem) => void;
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

export default function AdminDepartmentsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        departmentsList,
        isDepartmentsSyncing,
        isDepartmentsRefreshing,
        forceDepartmentsRefresh,
        lastSyncedTime,
        sourceTone,
    } = useDepartmentsSync();

    useFocusEffect(
        useCallback(() => {
            forceDepartmentsRefresh();
        }, [forceDepartmentsRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<DepartmentItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateDepartmentApi = useApi<any>(async (payload: any) => {
        if (payload.action === "UpdateDepartment") {
            return await departmentsService.updateDepartment(payload);
        }
        return await departmentsService.createDepartment(payload);
    });

    const filteredDepartments = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return departmentsList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return departmentsList.filter(
            (d) => hit(d.title) || hit(d.description) || hit(d.department_type)
        );
    }, [departmentsList, query]);

    const totalItems = filteredDepartments.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredDepartments.slice(pageStart, pageEnd),
        [filteredDepartments, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            // 🟢 Constructing the exact flat payload from Postman
            const payload: any = {
                action: editingItem ? "UpdateDepartment" : "CreateDepartment",
                title: values.title,
                department_type: values.department_type || "",
                description: values.description || "",
            };

            // 🟢 Send "department" key for updates
            if (editingItem) {
                payload.department = editingItem.id;
            }

            console.log("🚀 SENDING DEPARTMENT PAYLOAD:", payload);

            const response = await mutateDepartmentApi.request(payload);
            const code = response?.data?.response_code;
            const isSuccess = response?.ok === true && (code === 0 || code === '0' || code === undefined);

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceDepartmentsRefresh();
                alert('Success', `Department ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                const backendErrors = response?.data?.errors || response?.data?.message || response?.data?.response_message;
                let errorMsg = 'Could not save the department.';
                if (typeof backendErrors === 'string') errorMsg = backendErrors;
                else if (Array.isArray(backendErrors)) errorMsg = backendErrors.join('\n');
                else if (backendErrors && typeof backendErrors === 'object') errorMsg = JSON.stringify(backendErrors);

                alert('Failed', errorMsg, undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error.', undefined, 'danger');
        }
    };

    const sharedProps: AdminDepartmentsSharedProps = {
        query, setQuery,
        onRefresh: forceDepartmentsRefresh,
        refreshing: isDepartmentsSyncing || isDepartmentsRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredDepartments,
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
            {isLargeScreen ? <AdminDepartmentsWebView {...sharedProps} /> : <AdminDepartmentsMobileView {...sharedProps} />}

            <AdminDepartmentEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={mutateDepartmentApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}