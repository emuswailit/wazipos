// context/ClustersSyncContext.tsx
//
// Clusters for the signed-in entity. Loads only while logged in and clears on
// logout (see hooks/useAuthedList).

import clustersService from '@/api/clustersApi';
import { ClusterItem } from '@/databases/types';
import { useAuthedList } from '@/hooks/useAuthedList';
import React, { createContext, useContext, useMemo } from 'react';

interface ClustersSyncContextValue {
    clustersList: ClusterItem[];
    isClustersSyncing: boolean;
    isClustersRefreshing: boolean;
    forceClustersRefresh: () => Promise<void>;
    lastSyncedTime?: string;
    sourceTone: 'server' | 'cache' | 'none';
}

const ClustersSyncContext = createContext<ClustersSyncContextValue | null>(null);

export function ClustersSyncProvider({ children }: { children: React.ReactNode }) {
    const { list, isFetching, lastSyncedTime, refresh } = useAuthedList<ClusterItem>('ClustersSync', () => clustersService.getClusters());

    const value = useMemo<ClustersSyncContextValue>(
        () => ({
            clustersList: list,
            isClustersSyncing: isFetching && list.length === 0,
            isClustersRefreshing: isFetching && list.length > 0,
            forceClustersRefresh: refresh,
            lastSyncedTime,
            sourceTone: list.length > 0 ? 'server' : 'none',
        }),
        [list, isFetching, lastSyncedTime, refresh]
    );

    return <ClustersSyncContext.Provider value={value}>{children}</ClustersSyncContext.Provider>;
}

export function useClustersSync() {
    const ctx = useContext(ClustersSyncContext);
    if (!ctx) throw new Error('useClustersSync must be used within ClustersSyncProvider');
    return ctx;
}
