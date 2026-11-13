// context/DepartmentsSyncContext.tsx
//
// Departments for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import departmentsService from '@/api/departmentsApi';
import { DepartmentItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface DepartmentsSyncContextValue {
    departmentsList: DepartmentItem[];
    isDepartmentsSyncing: boolean;
    isDepartmentsRefreshing: boolean;
    forceDepartmentsRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const DepartmentsSyncContext = createContext<DepartmentsSyncContextValue | null>(null);

export function DepartmentsSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<DepartmentItem>('DepartmentsSync', () => departmentsService.getDepartments());

    const value = useMemo<DepartmentsSyncContextValue>(
        () => ({
            departmentsList: list,
            isDepartmentsSyncing: isFetching && list.length === 0,
            isDepartmentsRefreshing: isFetching && list.length > 0,
            forceDepartmentsRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <DepartmentsSyncContext.Provider value={value}>{children}</DepartmentsSyncContext.Provider>;
}

export function useDepartmentsSync() {
    const ctx = useContext(DepartmentsSyncContext);
    if (!ctx) throw new Error('useDepartmentsSync must be used within DepartmentsSyncProvider');
    return ctx;
}
