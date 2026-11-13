// context/DesignationsSyncContext.tsx
//
// Designations for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import designationsService from '@/api/designationsApi';
import { DesignationItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface DesignationsSyncContextValue {
    designationsList: DesignationItem[];
    isDesignationsSyncing: boolean;
    isDesignationsRefreshing: boolean;
    forceDesignationsRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const DesignationsSyncContext = createContext<DesignationsSyncContextValue | null>(null);

export function DesignationsSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<DesignationItem>('DesignationsSync', () => designationsService.getDesignations());

    const value = useMemo<DesignationsSyncContextValue>(
        () => ({
            designationsList: list,
            isDesignationsSyncing: isFetching && list.length === 0,
            isDesignationsRefreshing: isFetching && list.length > 0,
            forceDesignationsRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <DesignationsSyncContext.Provider value={value}>{children}</DesignationsSyncContext.Provider>;
}

export function useDesignationsSync() {
    const ctx = useContext(DesignationsSyncContext);
    if (!ctx) throw new Error('useDesignationsSync must be used within DesignationsSyncProvider');
    return ctx;
}
