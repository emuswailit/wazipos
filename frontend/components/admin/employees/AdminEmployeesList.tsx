// components/admin/employees/AdminEmployeesList.tsx
import employeesApi from '@/api/employeesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useEmployeesSync } from '@/context/EmployeesSyncContext';
import { EmployeeItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminEmployeeEditModal from './AdminEmployeeEditModal';
import AdminEmployeesMobileView from './AdminEmployeesMobileView';
import AdminEmployeesWebView from './AdminEmployeesWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminEmployeesSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: EmployeeItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: EmployeeItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: EmployeeItem) => void;
    onEditItem: (item: EmployeeItem) => void;
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
    if (!dateString) return '—';
    const cleanStr = dateString.replace(' ', 'T');
    const dateObj = new Date(cleanStr);
    if (isNaN(dateObj.getTime())) return dateString;
    return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminEmployeesList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        employeesList,
        isEmployeesSyncing,
        isEmployeesRefreshing,
        forceEmployeesRefresh,
        lastSyncedTime,
        sourceTone,
    } = useEmployeesSync();

    useFocusEffect(
        useCallback(() => {
            forceEmployeesRefresh();
        }, [forceEmployeesRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<EmployeeItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateEmployeeApi = useApi<any>(async (payload: any) => {
        return await employeesApi.employeesAction(payload);
    });

    const filteredEmployees = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return employeesList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);

        return employeesList.filter(
            (e) =>
                hit(e.user_title) ||
                hit(e.title) ||
                hit(e.phone) ||
                hit(e.email) ||
                hit(e.designation_title) ||
                hit(e.department_title) ||
                // 🟢 Search through the roles array
                (e.roles ?? []).some((r: any) => hit(r.title))
        );
    }, [employeesList, query]);

    const totalItems = filteredEmployees.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredEmployees.slice(pageStart, pageEnd),
        [filteredEmployees, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            const employee_details: Record<string, any> = {
                advert: values.advert || '',
                department: values.department || null,
                designation: values.designation || '',
                hire_date: values.hire_date || '',
                roles: Array.isArray(values.roles) ? values.roles : [],
                terminal_date: values.terminal_date || null,
                user_id: values.user_id || '',
            };

            if (editingItem) {
                employee_details.id = editingItem.id;
            }

            const payload = {
                action: editingItem ? 'UpdateEmployee' : 'CreateEmployee',
                employee_details,
            };

            console.log("🚀 SUBMITTING EMPLOYEE PAYLOAD:", payload);

            const response = await mutateEmployeeApi.request(payload);

            // 🟢 Check custom success response
            const code = response?.data?.response_code;
            const isSuccess = response?.ok === true && (code === 0 || code === '0' || code === undefined);

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceEmployeesRefresh();
                alert('Success', `Employee ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                const backendErrors = response?.data?.errors || response?.data?.message || response?.data?.response_message;
                let errorMsg = 'Could not save the employee.';

                if (typeof backendErrors === 'string') errorMsg = backendErrors;
                else if (Array.isArray(backendErrors)) errorMsg = backendErrors.join('\n');
                else if (backendErrors && typeof backendErrors === 'object') errorMsg = JSON.stringify(backendErrors);

                alert('Failed', errorMsg, undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error.', undefined, 'danger');
        }
    };

    const sharedProps: AdminEmployeesSharedProps = {
        query, setQuery,
        onRefresh: forceEmployeesRefresh,
        refreshing: isEmployeesSyncing || isEmployeesRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredEmployees,
        onOpenCreate: () => { setEditingItem(null); setIsFormModalOpen(true); },
        onPressItem: (item) => { setEditingItem(item); setIsFormModalOpen(true); },
        onEditItem: (item) => { setEditingItem(item); setIsFormModalOpen(true); },
        formatDateHandler: formatHumanDate,
        page, pageSize, totalItems, totalPages, pageStart, pageEnd,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
    };

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
            {isLargeScreen ? <AdminEmployeesWebView {...sharedProps} /> : <AdminEmployeesMobileView {...sharedProps} />}

            <AdminEmployeeEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={mutateEmployeeApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}