// components/retailers/retailerInventory/RetailerInventoryList.tsx
//
// Retailer inventory view — shell.

import type { PageSize } from '@/components/common/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';


import { InventoryDetailsModal } from './InventoryDetailsModal';
import RetailerInventoryAddModal from './RetailerInventoryAddModal';
import { RetailerInventoryMobileView } from './RetailerInventoryMobileView';
import {
    isExpired,
    RetailerInventoryWebView,
    type InventoryCounts,
    type InventoryFilter,
} from './RetailerInventoryWebView';

const LARGE_SCREEN_MIN_WIDTH = 768;
const DEFAULT_PAGE_SIZE: PageSize = 25;

export default function RetailerInventoryList() {
    const {
        retailerReceipts,
        forceManualRefresh,
        isLiveConnected,
        isManualRefreshing,
        lastSyncedTime,
    } = useInventorySync();

    const { isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const [activeFilter, setActiveFilter] =
        useState<InventoryFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const [detailsTarget, setDetailsTarget] =
        useState<any | null>(null);
    const [editTarget, setEditTarget] = useState<any | null>(
        null
    );

    /* -------- Pagination -------- */
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] =
        useState<PageSize>(DEFAULT_PAGE_SIZE);

    /* -------- Filter -------- */
    const filteredReceipts = useMemo(() => {
        if (!Array.isArray(retailerReceipts)) return [];
        const q = searchQuery.trim().toLowerCase();

        return retailerReceipts.filter((receipt: any) => {
            if (!receipt) return false;

            const exp = isExpired(receipt);
            if (activeFilter === 'ACTIVE' && exp) return false;
            if (activeFilter === 'EXPIRED' && !exp) return false;

            if (q) {
                const product = String(
                    receipt.title ??
                    receipt.product_title ??
                    receipt.long_title ??
                    receipt.product_name ??
                    ''
                ).toLowerCase();
                const batch = String(
                    receipt.batch ?? receipt.batch_no ?? ''
                ).toLowerCase();
                const supplier = String(
                    receipt.received_from_title ??
                    receipt.supplier_name ??
                    receipt.received_from ??
                    ''
                ).toLowerCase();
                const bar = String(
                    receipt.bar_code ?? ''
                ).toLowerCase();

                if (
                    !product.includes(q) &&
                    !batch.includes(q) &&
                    !supplier.includes(q) &&
                    !bar.includes(q)
                ) {
                    return false;
                }
            }
            return true;
        });
    }, [retailerReceipts, activeFilter, searchQuery]);

    /* -------- Counts -------- */
    const counts: InventoryCounts = useMemo(() => {
        const list = Array.isArray(retailerReceipts)
            ? retailerReceipts
            : [];
        return {
            total: list.length,
            active: list.filter((i: any) => !isExpired(i)).length,
            expired: list.filter((i: any) => isExpired(i)).length,
            lowStock: list.filter(
                (i: any) =>
                    Number(i?.current_unit_quantity ?? 0) <= 5 &&
                    Number(i?.current_unit_quantity ?? 0) > 0
            ).length,
        };
    }, [retailerReceipts]);

    /* -------- Total value -------- */
    const totalValue = useMemo(() => {
        return filteredReceipts.reduce(
            (sum: number, receipt: any) => {
                if (!receipt) return sum;
                const qty = Number(
                    receipt.current_unit_quantity ?? 0
                );
                if (!Number.isFinite(qty) || qty <= 0)
                    return sum;

                const price = parseFloat(
                    receipt.final_unit_selling_price ??
                    receipt.unit_selling_price ??
                    '0'
                );
                if (!Number.isFinite(price) || price < 0)
                    return sum;
                return sum + qty * price;
            },
            0
        );
    }, [filteredReceipts]);

    /* -------- Pagination slice -------- */
    const totalItems = filteredReceipts.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [activeFilter, searchQuery, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const pagedReceipts = useMemo(
        () => filteredReceipts.slice(pageStart, pageEnd),
        [filteredReceipts, pageStart, pageEnd]
    );

    /* -------- Pagination handlers -------- */
    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        []
    );

    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages]
    );

    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* -------- Other callbacks -------- */
    const refreshing = isManualRefreshing;

    const handleRefresh = useCallback(() => {
        void forceManualRefresh();
    }, [forceManualRefresh]);

    const handleView = useCallback((item: any) => {
        setDetailsTarget(item);
    }, []);

    const handleCloseDetails = useCallback(() => {
        setDetailsTarget(null);
    }, []);

    const handleEditRow = useCallback((item: any) => {
        setDetailsTarget(null);
        setEditTarget(item);
        setIsAddModalOpen(true);
    }, []);

    const handleEditFromDetails = useCallback(
        (item: any) => {
            setDetailsTarget(null);
            setEditTarget(item);
            setIsAddModalOpen(true);
        },
        []
    );

    const handleOpenAdd = useCallback(() => {
        setEditTarget(null);
        setIsAddModalOpen(true);
    }, []);

    const handleCloseAdd = useCallback(() => {
        setIsAddModalOpen(false);
        setEditTarget(null);
    }, []);

    const handleAddSuccess = useCallback(() => {
        void forceManualRefresh();
    }, [forceManualRefresh]);

    /* -------- Shared props -------- */
    const sharedProps = {
        query: searchQuery,
        setQuery: setSearchQuery,
        activeFilter,
        setActiveFilter,
        onOpenCreate: handleOpenAdd,
        onRefresh: handleRefresh,
        refreshing,
        isLiveConnected,
        lastSyncedTime,
        counts,
        totalValue,
        items: pagedReceipts,

        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,

        onView: handleView,
        onEdit: handleEditRow,
    };

    return (
        <>
            {isLarge ? (
                <RetailerInventoryWebView {...sharedProps} />
            ) : (
                <RetailerInventoryMobileView {...sharedProps} />
            )}

            <InventoryDetailsModal
                item={detailsTarget}
                onClose={handleCloseDetails}
                onEdit={handleEditFromDetails}
            />

            <RetailerInventoryAddModal
                isOpen={isAddModalOpen}
                onClose={handleCloseAdd}
                onSuccess={handleAddSuccess}
                isDarkMode={isDarkMode}
                theme={undefined as any}
                inventoryToEdit={editTarget}
            />
        </>
    );
}