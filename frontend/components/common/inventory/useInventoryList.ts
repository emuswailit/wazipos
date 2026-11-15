// components/common/inventory/useInventoryList.ts
//
// Search, health filter, counts and paging for an inventory list.

import type { PageSize } from '@/components/common/PaginationBar';
import { useEffect, useMemo, useState } from 'react';

import { filterCounts, matchesInventoryFilter, matchesInventoryQuery, stockValue, type InventoryFilter } from './inventoryHelpers';

export function useInventoryList<T>(items: T[]) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<InventoryFilter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);

    const list = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items]);
    const counts = useMemo(() => filterCounts(list), [list]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.filter((r) => matchesInventoryFilter(r, filter) && matchesInventoryQuery(r, q));
    }, [list, filter, query]);

    const stockWorth = useMemo(() => list.reduce((sum, r) => sum + stockValue(r), 0), [list]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const pageItems = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    return {
        query,
        setQuery,
        filter,
        setFilter,
        counts,
        total: list.length,
        stockWorth,
        filtered,
        paging: {
            items: pageItems,
            allItems: filtered,
            page,
            pageSize,
            totalItems,
            totalPages,
            pageStart,
            pageEnd,
            onPrev: () => setPage((p) => Math.max(1, p - 1)),
            onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
            onPageSizeChange: (size: PageSize) => {
                setPageSize(size);
                setPage(1);
            },
        },
    };
}
