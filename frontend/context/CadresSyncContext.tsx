// context/CadresSyncContext.tsx
//
// Cadres for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import cadresService from '@/api/cadresApi';
import { CadreItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface CadresSyncContextValue {
    cadresList: CadreItem[];
    isCadresSyncing: boolean;
    isCadresRefreshing: boolean;
    forceCadresRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const CadresSyncContext = createContext<CadresSyncContextValue | null>(null);

export function CadresSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<CadreItem>('CadresSync', () => cadresService.getCadres());

    const value = useMemo<CadresSyncContextValue>(
        () => ({
            cadresList: list,
            isCadresSyncing: isFetching && list.length === 0,
            isCadresRefreshing: isFetching && list.length > 0,
            forceCadresRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <CadresSyncContext.Provider value={value}>{children}</CadresSyncContext.Provider>;
}

export function useCadresSync() {
    const ctx = useContext(CadresSyncContext);
    if (!ctx) throw new Error('useCadresSync must be used within CadresSyncProvider');
    return ctx;
}
