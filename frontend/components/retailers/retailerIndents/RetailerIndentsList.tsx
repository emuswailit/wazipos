// components/retailers/retailerIndents/RetailerIndentsList.tsx

import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type {
    RetailerIndent,
    RetailerIndentItem,
} from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import { RetailerIndentDetailsModal } from './RetailerIndentDetailsModal';
import { RetailerIndentsMobileView } from './RetailerIndentsMobileView';
import { RetailerIndentsWebView } from './RetailerIndentsWebView';

export {
    PAGE_SIZE_OPTIONS,
    type PageSize
} from '@/components/common/PaginationBar';

import type { PageSize } from '@/components/common/PaginationBar';
import RetailerIndentEditModal from './RetailerIndentEditModal';
import { RetailerIndentItemEditModal } from './RetailerIndentItemEditModal';

const LARGE_SCREEN_MIN_WIDTH = 900;

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

const indentRef = (i: RetailerIndent): string =>
    i.remote_id || String(i.id ?? '');

const isDraftIndent = (i: RetailerIndent): boolean => {
    // Draft indents use `<userId>:<entityId>:<ts>` (see context).
    return (
        typeof i.remote_id === 'string' &&
        i.remote_id.includes(':')
    );
};

function matchesQuery(i: RetailerIndent, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const haystacks = [
        indentRef(i),
        i.entity_title,
        i.indent_number,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    for (const h of haystacks) {
        if (h.includes(needle)) return true;
    }

    for (const item of i.retailer_indent_items ?? []) {
        const t = String(
            item.wholesale_receipt_title || '',
        ).toLowerCase();
        if (t.includes(needle)) return true;

        const w = String(
            item.wholesaler_title || '',
        ).toLowerCase();
        if (w.includes(needle)) return true;
    }

    return false;
}

const RetailerIndentsList: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const {
        retailerIndents,
        openIndents,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        pendingIndentOpCount,
        lastSyncedTime,
        forceManualRefresh,
        flushPendingOps,
    } = useRetailerIndentsSync();

    /* ---------------- Local UI state ---------------- */
    const [query, setQuery] = useState('');
    const [onlyOpen, setOnlyOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    /* ---------------- Modal state ---------------- */
    const [selected, setSelected] =
        useState<RetailerIndent | null>(null);
    const [editing, setEditing] =
        useState<RetailerIndent | null>(null);
    const [editingItem, setEditingItem] =
        useState<RetailerIndentItem | null>(null);

    const closeAllModals = useCallback(() => {
        setSelected(null);
        setEditing(null);
        setEditingItem(null);
    }, []);

    const liveSelected = useMemo<RetailerIndent | null>(() => {
        if (!selected) return null;
        const key = indentRef(selected);
        return (
            retailerIndents.find((i) => indentRef(i) === key) ??
            selected
        );
    }, [selected, retailerIndents]);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        const base = onlyOpen ? openIndents : retailerIndents;
        return base.filter((i) => matchesQuery(i, query));
    }, [retailerIndents, openIndents, onlyOpen, query]);

    const counts = useMemo(
        () => ({
            total: retailerIndents.length,
            visible: filtered.length,
            open: openIndents.length,
            overBudget: retailerIndents.filter((i) =>
                toBool(i.over_budget),
            ).length,
            drafts: retailerIndents.filter(isDraftIndent).length,
        }),
        [
            retailerIndents,
            openIndents.length,
            filtered.length,
        ],
    );

    /* ---------------- Pagination ---------------- */
    const totalItems = filtered.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize),
    );

    useEffect(() => {
        setPage(1);
    }, [query, onlyOpen, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(
        pageStart + pageSize,
        totalItems,
    );

    const paginated = useMemo(
        () => filtered.slice(pageStart, pageEnd),
        [filtered, pageStart, pageEnd],
    );

    const goPrev = useCallback(
        () => setPage((p) => Math.max(1, p - 1)),
        [],
    );
    const goNext = useCallback(
        () => setPage((p) => Math.min(totalPages, p + 1)),
        [totalPages],
    );
    const changePageSize = useCallback((size: PageSize) => {
        setPageSize(size);
        setPage(1);
    }, []);

    /* ---------------- Refresh / modal handlers ---------------- */
    const refreshing = isSyncing || isManualRefreshing;

    const onRefresh = useCallback(async () => {
        forceManualRefresh();
        try {
            await flushPendingOps();
        } catch { }
    }, [forceManualRefresh, flushPendingOps]);

    const onView = useCallback((indent: RetailerIndent) => {
        setSelected(indent);
    }, []);

    const onEdit = useCallback((indent: RetailerIndent) => {
        setEditing(indent);
    }, []);

    const onCloseDetails = useCallback(() => {
        setSelected(null);
    }, []);

    const onOpenEditItem = useCallback(
        (itemId: string) => {
            const item =
                liveSelected?.retailer_indent_items.find((i) => {
                    // Match by remote_id first, then draft_id,
                    // then numeric local id.
                    if (i.remote_id && i.remote_id === itemId)
                        return true;
                    if (i.draft_id && i.draft_id === itemId)
                        return true;
                    return String(i.id) === String(itemId);
                });
            if (item) setEditingItem(item);
        },
        [liveSelected],
    );

    const onUpdateIndent = useCallback(() => {
        if (liveSelected) setEditing(liveSelected);
    }, [liveSelected]);

    const onQueryChange = useCallback((q: string) => {
        setQuery(q);
    }, []);

    const onToggleOnlyOpen = useCallback(() => {
        setOnlyOpen((v) => !v);
    }, []);

    /* ---------------- Shared props for views ------------------ */
    const sharedProps = {
        indents: paginated,
        counts,
        query,
        onQueryChange,
        onlyOpen,
        onToggleOnlyOpen,
        refreshing,
        onRefresh,
        isLiveConnected,
        pendingIndentOpCount,
        lastSyncedTime,
        onView,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,
    };

    /* ---------------- Render ---------------------------------- */
    return (
        <>
            {isLarge ? (
                <RetailerIndentsWebView {...sharedProps} />
            ) : (
                <RetailerIndentsMobileView {...sharedProps} />
            )}

            <RetailerIndentDetailsModal
                visible={!!liveSelected && !editingItem}
                indent={liveSelected}
                onClose={onCloseDetails}
                onOpenEditItem={onOpenEditItem}
                onUpdateIndent={onUpdateIndent}
            />

            {/*
             * No `onSave` prop. The modal now delegates to
             * `updateIndentItem` on the sync context, which is
             * remote-first and patches the local mirror on success.
             */}
            <RetailerIndentItemEditModal
                visible={!!editingItem}
                indentId={liveSelected?.remote_id ?? null}
                item={editingItem}
                onClose={() => setEditingItem(null)}
                onSaved={closeAllModals}
            />

            <RetailerIndentEditModal
                indent={editing}
                onClose={() => setEditing(null)}
                onSaved={() => {
                    closeAllModals();
                    forceManualRefresh();
                }}
            />
        </>
    );
};

export default RetailerIndentsList;