// components/admin/clusters/AdminClustersList.tsx
import clustersService from '@/api/clustersApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useClustersSync } from '@/context/ClustersSyncContext';
import { ClusterItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminClusterEditModal from './AdminClusterEditModal';
import AdminClustersMobileView from './AdminClustersMobileView';
import AdminClustersWebView from './AdminClustersWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminClustersSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: ClusterItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: ClusterItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: ClusterItem) => void;
    onEditItem: (item: ClusterItem) => void;
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

export default function AdminClustersList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        clustersList,
        isClustersSyncing,
        isClustersRefreshing,
        forceClustersRefresh,
        lastSyncedTime,
        sourceTone,
    } = useClustersSync();

    useFocusEffect(
        useCallback(() => {
            forceClustersRefresh();
        }, [forceClustersRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ClusterItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateClusterApi = useApi<any>(async (payload: any) => {
        if (payload.action === "UpdateCluster") {
            return await clustersService.updateCluster(payload);
        }
        return await clustersService.createCluster(payload);
    });

    const filteredClusters = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return clustersList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        return clustersList.filter(
            (c) => hit(c.title) || hit(c.value)
        );
    }, [clustersList, query]);

    const totalItems = filteredClusters.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredClusters.slice(pageStart, pageEnd),
        [filteredClusters, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            const payload = {
                action: editingItem ? "UpdateCluster" : "CreateCluster",
                cluster_details: {
                    ...(editingItem ? { id: editingItem.id } : {}),
                    title: values.title,
                }
            };

            console.log("🚀 SENDING CLUSTER:", payload);

            const response = await mutateClusterApi.request(payload);

            console.log("✅ SERVER RESPONSE:", response?.data);

            // 🟢 FIX: Check the custom response_code from your Django wrapper, not just response.ok
            const code = response?.data?.response_code;
            const isSuccess = response?.ok === true && (code === 0 || code === "0" || code === undefined);

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceClustersRefresh();
                alert('Success', `Cluster ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                const backendErrors = response?.data?.errors || response?.data?.message || response?.data?.response_message;
                let errorMsg = 'Could not save the cluster.';

                if (typeof backendErrors === 'string') {
                    errorMsg = backendErrors;
                } else if (backendErrors && typeof backendErrors === 'object') {
                    errorMsg = JSON.stringify(backendErrors);
                }

                alert('Failed', errorMsg, undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error.', undefined, 'danger');
        }
    };

    const sharedProps: AdminClustersSharedProps = {
        query, setQuery,
        onRefresh: forceClustersRefresh,
        refreshing: isClustersSyncing || isClustersRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredClusters,
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
            {isLargeScreen ? <AdminClustersWebView {...sharedProps} /> : <AdminClustersMobileView {...sharedProps} />}

            <AdminClusterEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={mutateClusterApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}