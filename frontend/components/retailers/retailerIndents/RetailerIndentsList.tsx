// components/retailers/retailerIndents/RetailerIndentsList.tsx
//
// Indents screen.
//   ≥ 1100 px: two panes — the cart (IndentCart) on the left showing the open
//              indent (or the one picked from the list), the list on the right.
//   narrower : the list (cards on phones, table from 900 px), with the open
//              indent card on top; opening an indent shows the cart full screen.
// The cart's ⓘ button opens the full details sheet (parameters, edit indent).

import { useListTokens } from '@/components/common/listScreen';
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
import { useRouter } from 'expo-router';
import { Modal, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IndentCart } from './IndentCart';
import { indentKey as indentRef, isDraftIndent, isOverBudget, toBool, type IndentFilter } from './indentsConfig';
import { RetailerIndentDetailsModal } from './RetailerIndentDetailsModal';
import { RetailerIndentsMobileView } from './RetailerIndentsMobileView';
import { RetailerIndentsWebView } from './RetailerIndentsWebView';

import type { PageSize } from '@/components/common/PaginationBar';
import RetailerIndentEditModal from './RetailerIndentEditModal';
import { RetailerIndentItemEditModal } from './RetailerIndentItemEditModal';

const LARGE_SCREEN_MIN_WIDTH = 900;
/** From here the cart sits beside the list instead of opening full screen. */
const TWO_PANE_MIN_WIDTH = 1100;
const CART_PANE_WIDTH = 420;

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
    const twoPane = width >= TWO_PANE_MIN_WIDTH;
    const { theme, border } = useListTokens();
    const insets = useSafeAreaInsets();

    const router = useRouter();
    const {
        retailerIndents,
        openIndents,
        currentOpenIndent,
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
    const [filter, setFilter] = useState<IndentFilter>('ALL');
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

    /* ---------------- Cart ---------------- */
    // The indent shown in the cart: the one picked from the list, else the open one.
    const [cartKey, setCartKey] = useState<string | null>(null);
    const [cartScreenOpen, setCartScreenOpen] = useState(false);
    const cartIndent = useMemo<RetailerIndent | null>(() => {
        const picked = cartKey ? retailerIndents.find((i) => indentRef(i) === cartKey) : undefined;
        return picked ?? currentOpenIndent ?? null;
    }, [cartKey, retailerIndents, currentOpenIndent]);
    const openCart = useCallback(
        (indent: RetailerIndent) => {
            setCartKey(indentRef(indent));
            if (!twoPane) setCartScreenOpen(true);
        },
        [twoPane],
    );
    const goToMarketplace = useCallback(() => {
        setCartScreenOpen(false);
        router.push('/wholesaleMarketplace?tab=wholesaleMarketplace' as any);
    }, [router]);

    /* ---------------- Filtering ---------------- */
    const filtered = useMemo(() => {
        const base =
            filter === 'OPEN'
                ? retailerIndents.filter((i) => toBool(i.is_open))
                : filter === 'OVER_BUDGET'
                    ? retailerIndents.filter(isOverBudget)
                    : filter === 'DRAFTS'
                        ? retailerIndents.filter(isDraftIndent)
                        : retailerIndents;
        return base.filter((i) => matchesQuery(i, query));
    }, [retailerIndents, filter, query]);

    const counts = useMemo(
        () => ({
            total: retailerIndents.length,
            visible: filtered.length,
            open: openIndents.length,
            overBudget: retailerIndents.filter(isOverBudget).length,
            drafts: retailerIndents.filter(isDraftIndent).length,
            openValue: retailerIndents
                .filter((i) => toBool(i.is_open))
                .reduce((sum, i) => sum + (Number(i.total_cost) || 0), 0),
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
    }, [query, filter, pageSize]);

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

    // Opening an indent shows it in the cart (side pane, or full screen on phones).
    const onView = openCart;

    // Full details sheet (parameters, edit indent). On phones the cart screen
    // closes first: iOS can't present a second modal over the first.
    const onShowDetails = useCallback((indent: RetailerIndent) => {
        setCartScreenOpen(false);
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

    /* ---------------- Shared props for views ------------------ */
    const sharedProps = {
        indents: paginated,
        allIndents: filtered,
        counts,
        query,
        onQueryChange,
        filter,
        onFilterChange: setFilter,
        refreshing,
        onRefresh,
        isLiveConnected,
        pendingIndentOpCount,
        lastSyncedTime,
        onView,
        onEdit,
        openIndent: currentOpenIndent,
        onAddProducts: goToMarketplace,
        showOpenIndentCard: !twoPane,
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
    const list = isLarge ? <RetailerIndentsWebView {...sharedProps} /> : <RetailerIndentsMobileView {...sharedProps} />;

    return (
        <>
            {twoPane ? (
                <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
                    {/* Cart pane: scrolls on its own, footer pinned */}
                    <View style={{ width: CART_PANE_WIDTH, borderRightWidth: 1, borderRightColor: border, backgroundColor: theme.panel }}>
                        <IndentCart indent={cartIndent} onShowDetails={onShowDetails} onAddProducts={goToMarketplace} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>{list}</View>
                </View>
            ) : (
                list
            )}

            {/* Phones / narrow web: the cart full screen */}
            {!twoPane ? (
                <Modal visible={cartScreenOpen} animationType="slide" onRequestClose={() => setCartScreenOpen(false)} presentationStyle="fullScreen">
                    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.panel }}>
                        <IndentCart
                            indent={cartIndent}
                            onShowDetails={onShowDetails}
                            onAddProducts={goToMarketplace}
                            onDismiss={() => setCartScreenOpen(false)}
                            bottomInset={insets.bottom}
                        />
                    </View>
                </Modal>
            ) : null}

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