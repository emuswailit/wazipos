// components/admin/cadres/AdminCadresList.tsx
import cadresService from '@/api/cadresApi';
import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';
import { useCadresSync } from '@/context/CadresSyncContext';
import { CadreItem } from '@/databases/types';
import useApi from '@/hooks/useApi';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';

import AdminCadreEditModal from './AdminCadreEditModal';
import AdminCadresMobileView from './AdminCadresMobileView';
import AdminCadresWebView from './AdminCadresWebView';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface AdminCadresSharedProps {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel: string;
    sourceTone: 'server' | 'cache' | 'none';
    lastSyncedTime?: string;
    items: CadreItem[];
    /** Whole filtered list; the mobile view shows all of it. */
    allItems?: CadreItem[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate: () => void;
    onPressItem: (item: CadreItem) => void;
    onEditItem: (item: CadreItem) => void;
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

export default function AdminCadresList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const alert = useAlert();

    const {
        cadresList,
        isCadresSyncing,
        isCadresRefreshing,
        forceCadresRefresh,
        lastSyncedTime,
        sourceTone,
    } = useCadresSync();

    useFocusEffect(
        useCallback(() => {
            forceCadresRefresh();
        }, [forceCadresRefresh])
    );

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<CadreItem | null>(null);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const mutateCadreApi = useApi<any>(async (payload: any) => {
        if (payload.action === "UpdateCadre") {
            return await cadresService.updateCadre(payload);
        }
        return await cadresService.createCadre(payload);
    });

    const filteredCadres = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return cadresList;
        const hit = (v?: string | null) => (v || '').toLowerCase().includes(q);
        // Search by title or cluster name
        return cadresList.filter(
            (c) => hit(c.title) || hit(c.cluster_title) || hit(c.cluster)
        );
    }, [cadresList, query]);

    const totalItems = filteredCadres.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, pageSize]);
    useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(
        () => filteredCadres.slice(pageStart, pageEnd),
        [filteredCadres, pageStart, pageEnd],
    );

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            // 🟢 Matches your exact Postman payload
            const payload = {
                action: editingItem ? "UpdateCadre" : "CreateCadre",
                cadre_details: {
                    ...(editingItem ? { id: editingItem.id } : {}),
                    title: values.title,
                    cluster: values.cluster,
                }
            };

            const response = await mutateCadreApi.request(payload);
            const isSuccess = response?.ok === true;

            if (isSuccess) {
                resetForm();
                setIsFormModalOpen(false);
                setEditingItem(null);
                await forceCadresRefresh();
                alert('Success', `Cadre ${editingItem ? 'updated' : 'created'} successfully.`, undefined, 'success');
            } else {
                alert('Failed', 'Could not save the cadre.', undefined, 'danger');
            }
        } catch (err: any) {
            alert('Error', err?.message || 'Unexpected error.', undefined, 'danger');
        }
    };

    const sharedProps: AdminCadresSharedProps = {
        query, setQuery,
        onRefresh: forceCadresRefresh,
        refreshing: isCadresSyncing || isCadresRefreshing,
        sourceLabel: sourceTone === 'server' ? 'Server' : 'Offline',
        sourceTone,
        lastSyncedTime,
        items: paginated,
        allItems: filteredCadres,
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
            {isLargeScreen ? <AdminCadresWebView {...sharedProps} /> : <AdminCadresMobileView {...sharedProps} />}

            <AdminCadreEditModal
                visible={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={mutateCadreApi.loading}
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
            />
        </View>
    );
}