// context/RolesSyncContext.tsx
//
// Roles for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import rolesService from '@/api/rolesApi';
import { RoleItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface RolesSyncContextValue {
    rolesList: RoleItem[];
    isRolesSyncing: boolean;
    isRolesRefreshing: boolean;
    forceRolesRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const RolesSyncContext = createContext<RolesSyncContextValue | null>(null);

export function RolesSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<RoleItem>('RolesSync', () => rolesService.getRoles());

    const value = useMemo<RolesSyncContextValue>(
        () => ({
            rolesList: list,
            isRolesSyncing: isFetching && list.length === 0,
            isRolesRefreshing: isFetching && list.length > 0,
            forceRolesRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <RolesSyncContext.Provider value={value}>{children}</RolesSyncContext.Provider>;
}

export function useRolesSync() {
    const ctx = useContext(RolesSyncContext);
    if (!ctx) throw new Error('useRolesSync must be used within RolesSyncProvider');
    return ctx;
}
