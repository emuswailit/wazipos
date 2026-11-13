// context/EmployeesSyncContext.tsx
//
// Employees for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import employeesService from '@/api/employeesApi';
import { EmployeeItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface EmployeesSyncContextValue {
    employeesList: EmployeeItem[];
    isEmployeesSyncing: boolean;
    isEmployeesRefreshing: boolean;
    forceEmployeesRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const EmployeesSyncContext = createContext<EmployeesSyncContextValue | null>(null);

export function EmployeesSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<EmployeeItem>('EmployeesSync', () => employeesService.getAllEmployees(), (d) => d?.results || d?.data || (Array.isArray(d) ? d : []));

    const value = useMemo<EmployeesSyncContextValue>(
        () => ({
            employeesList: list,
            isEmployeesSyncing: isFetching && list.length === 0,
            isEmployeesRefreshing: isFetching && list.length > 0,
            forceEmployeesRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <EmployeesSyncContext.Provider value={value}>{children}</EmployeesSyncContext.Provider>;
}

export function useEmployeesSync() {
    const ctx = useContext(EmployeesSyncContext);
    if (!ctx) throw new Error('useEmployeesSync must be used within EmployeesSyncProvider');
    return ctx;
}
