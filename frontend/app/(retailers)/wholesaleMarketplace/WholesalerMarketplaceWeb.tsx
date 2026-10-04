// components/retailers/wholesalersMarketPlace/WholesalerMarketplaceWeb.tsx
//
// Desktop marketplace view.
//
// Three-column layout:
//   ┌──────────────┬──────────────────────────────┬──────────────┐
//   │  Categories  │  Products (grid)             │  Indent cart │
//   │  sidebar     │                              │  panel       │
//   └──────────────┴──────────────────────────────┴──────────────┘
//
// The grid and cart panel share state through `useIndentBridge`. Every
// "add to indent" action flows through that hook, which handles the
// optimistic local write, the remote POST, and the offline queue.
//
// The cart panel is toggleable from a pill in the top bar. When the
// cart is closed, the grid expands into the freed width.

import { useAuth } from '@/context/AuthContext';
import type { RetailerIndentItem } from '@/databases/types';
import { useIndentBridge } from '@/hooks/useIndentBridge';
import {
    ArrowDownUp,
    ArrowLeft,
    Grid3x3,
    Package,
    RefreshCw,
    Search,
    ShoppingCart,
    X,
} from 'lucide-react-native';
import React, {
    useCallback,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line import/no-cycle
import IndentCartPanel from './IndentCartPanel';
import {
    ProductCard,
    useWholesalerProducts,
    type MarketplaceProduct,
    type WholesalerMarketplaceViewProps,
} from './index';
import QuantityInputModal from './QuantityInputModal';

/* ── Constants ──────────────────────────────────────────────── */

const isWeb = Platform.OS === 'web';
const SIDEBAR_WIDTH = 280;
const CART_WIDTH = 340;
const MAIN_PADDING = 20;
const GRID_GAP = 16;
const COLUMN_OPTIONS = [2, 3, 4, 5, 6];
const HOVER_PADDING = 30;

const webNoOutline = isWeb
    ? ({ outlineStyle: 'none' } as any)
    : {};
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

const SORTS = [
    { key: 'relevance', label: 'Relevance' },
    { key: 'price-asc', label: 'Price ↑' },
    { key: 'price-desc', label: 'Price ↓' },
    { key: 'name-asc', label: 'Name A→Z' },
    { key: 'stock', label: 'Most stock' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

/* ── Component ──────────────────────────────────────────────── */

export default function WholesalerMarketplaceWeb({
    onClose,
    wholesalerId,
    wholesalerTitle,
}: WholesalerMarketplaceViewProps) {
    const { theme, isDarkMode } = useAuth();
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const {
        products,
        loading,
        refreshing,
        error,
        refresh,
    } = useWholesalerProducts(wholesalerId);

    const {
        currentOpenIndent,
        hasOpenIndent,
        isDraftIndent,
        pendingOpCount,
        findItemByReceipts,
        getQuantityByReceipts,
        addToIndent,
        removeFromIndent,
        queueRevision,
    } = useIndentBridge();

    /* ── UI state ──────────────────────────────────────────── */

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [sort, setSort] = useState<SortKey>('relevance');
    const [inStockOnly, setInStockOnly] = useState(false);
    const [columns, setColumns] = useState(4);
    const [cartOpen, setCartOpen] = useState(true);

    /* ── Quantity modal state ─────────────────────────────── */

    const [modalProduct, setModalProduct] =
        useState<MarketplaceProduct | null>(null);
    const [cartBusy, setCartBusy] = useState(false);
    const [cartError, setCartError] = useState<string | null>(null);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const sidebarBg = isDarkMode ? '#111827' : '#f8fafc';

    /* ── Categories ────────────────────────────────────────── */

    const categories = useMemo(() => {
        const set = new Set<string>();
        products.forEach((p) => {
            if (p.category_title) set.add(p.category_title);
        });
        return [
            'All',
            ...Array.from(set).sort((a, b) => a.localeCompare(b)),
        ];
    }, [products]);

    const categoryCounts = useMemo(() => {
        const map: Record<string, number> = {
            All: products.length,
        };
        products.forEach((p) => {
            map[p.category_title] =
                (map[p.category_title] ?? 0) + 1;
        });
        return map;
    }, [products]);

    /* ── Filter + sort ─────────────────────────────────────── */

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = products.filter((p) => {
            const matchQ =
                !q ||
                `${p.name} ${p.category_title} ${p.sku ?? ''}`
                    .toLowerCase()
                    .includes(q);
            const matchC =
                category === 'All' ||
                p.category_title === category;
            const matchStock = !inStockOnly || p.stock > 0;
            return matchQ && matchC && matchStock;
        });

        switch (sort) {
            case 'price-asc':
                return [...rows].sort((a, b) => a.price - b.price);
            case 'price-desc':
                return [...rows].sort((a, b) => b.price - a.price);
            case 'name-asc':
                return [...rows].sort((a, b) =>
                    a.name.localeCompare(b.name),
                );
            case 'stock':
                return [...rows].sort((a, b) => b.stock - a.stock);
            default:
                return rows;
        }
    }, [products, search, category, sort, inStockOnly]);

    /* ── Grid maths ────────────────────────────────────────── */

    const mainWidth =
        windowWidth -
        SIDEBAR_WIDTH -
        (cartOpen ? CART_WIDTH : 0);
    const availableForGrid = mainWidth - MAIN_PADDING * 2;
    const cellWidth = Math.floor(
        (availableForGrid - GRID_GAP * (columns - 1)) / columns,
    );

    const activeFilterCount = inStockOnly ? 1 : 0;
    const showLoader = loading && products.length === 0;

    /* ── Cart actions ──────────────────────────────────────── */

    const handleRemoveItem = useCallback(
        async (item: RetailerIndentItem) => {
            setCartBusy(true);
            setCartError(null);
            try {
                const res = await removeFromIndent(item.id);
                if (!res.ok) {
                    setCartError(
                        res.message ?? 'Could not remove item.',
                    );
                }
            } catch (e: any) {
                setCartError(
                    e?.message ?? 'Something went wrong.',
                );
            } finally {
                setCartBusy(false);
            }
        },
        [removeFromIndent],
    );

    const handleSyncNow = useCallback(() => {
        // The bridge already exposes flushPendingOps indirectly via
        // the context; the poller will pick this up on the next tick.
        // A manual poke is a no-op if the queue is empty.
        if (pendingOpCount === 0) return;
        // Fire-and-forget — the UI updates when the drain completes.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (async () => {
            try {
                await refresh();
            } catch { }
        })();
    }, [pendingOpCount, refresh]);

    const handleCloseIndent = useCallback(async () => {
        // Placeholder — actual close is handled by the parent screen
        // or a dedicated flow. Kept here so the panel's CTA is wired.
        // For now: prompt the user. In a full integration, this would
        // call `closeIndent(currentOpenIndent.remote_id)`.
        setCartError(
            'Close indent is available from the main indent screen.',
        );
    }, []);

    const cartItemCount =
        currentOpenIndent?.retailer_indent_items?.length ?? 0;

    /* ── Render ────────────────────────────────────────────── */

    return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* ═══ Categories sidebar ═══════════════════════ */}
            <View
                style={{
                    width: SIDEBAR_WIDTH,
                    borderRightWidth: 1,
                    borderRightColor: borderColor,
                    backgroundColor: sidebarBg,
                    paddingTop: 16 + insets.top,
                    paddingBottom: 16 + insets.bottom,
                }}
            >
                <View
                    style={{
                        paddingHorizontal: 16,
                        marginBottom: 12,
                    }}
                >
                    <Text
                        numberOfLines={1}
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.lg,
                            color: theme.text,
                        }}
                    >
                        {wholesalerTitle ?? 'Wholesaler'}
                    </Text>
                    <Text
                        style={{
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.xs,
                            color: theme.textDark,
                            marginTop: 2,
                        }}
                    >
                        {products.length} items in inventory
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={onClose}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Back to marketplace"
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        marginBottom: 8,
                        ...webPointer,
                    }}
                >
                    <ArrowLeft size={14} color={theme.primary} />
                    <Text
                        style={{
                            marginLeft: 6,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.sm,
                            color: theme.primary,
                        }}
                    >
                        Back to marketplace
                    </Text>
                </TouchableOpacity>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: 10,
                        paddingBottom: 12,
                    }}
                    showsVerticalScrollIndicator
                >
                    <Text
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: theme.textDark,
                            paddingHorizontal: 6,
                            marginBottom: 8,
                        }}
                    >
                        Categories
                    </Text>

                    {categories.map((c) => {
                        const active = category === c;
                        return (
                            <TouchableOpacity
                                key={c}
                                onPress={() => setCategory(c)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    marginBottom: 2,
                                    backgroundColor: active
                                        ? subtleBg
                                        : 'transparent',
                                    ...webPointer,
                                }}
                            >
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        flex: 1,
                                        fontFamily: active
                                            ? theme.font.bold
                                            : theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                        color: active
                                            ? theme.primary
                                            : theme.text,
                                    }}
                                >
                                    {c}
                                </Text>
                                <Text
                                    style={{
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: 11,
                                        color: theme.textDark,
                                    }}
                                >
                                    {categoryCounts[c] ?? 0}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ═══ Main products area ════════════════════════ */}
            <View style={{ flex: 1 }}>
                {/* Top bar */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: MAIN_PADDING,
                        paddingTop: 12 + insets.top,
                        paddingBottom: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                        backgroundColor: theme.panel,
                        flexWrap: 'wrap',
                    }}
                >
                    {/* Search */}
                    <View
                        style={{
                            flex: 1,
                            minWidth: 200,
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor,
                            backgroundColor: subtleBg,
                            paddingHorizontal: 10,
                            height: 38,
                            marginRight: 10,
                            marginBottom: 6,
                        }}
                    >
                        <View style={{ marginRight: 8 }}>
                            <Search
                                size={15}
                                color={theme.textDark}
                            />
                        </View>
                        <TextInput
                            placeholder="Search products, SKU, category..."
                            placeholderTextColor={theme.textDark}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                flex: 1,
                                height: '100%',
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.sm,
                                color: theme.text,
                                ...webNoOutline,
                            }}
                        />
                        {search.length > 0 && (
                            <TouchableOpacity
                                onPress={() => setSearch('')}
                                activeOpacity={0.7}
                                style={webPointer}
                            >
                                <X
                                    size={14}
                                    color={theme.textDark}
                                />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Sort */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginRight: 10,
                            marginBottom: 6,
                        }}
                    >
                        <View style={{ marginRight: 4 }}>
                            <ArrowDownUp
                                size={13}
                                color={theme.textDark}
                            />
                        </View>
                        {SORTS.map((s) => {
                            const active = sort === s.key;
                            return (
                                <TouchableOpacity
                                    key={s.key}
                                    onPress={() => setSort(s.key)}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    style={{
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 7,
                                        backgroundColor: active
                                            ? subtleBg
                                            : 'transparent',
                                        marginRight: 2,
                                        ...webPointer,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: active
                                                ? theme.font.bold
                                                : theme.font
                                                    .regular,
                                            fontSize:
                                                theme.fontSize.xs,
                                            color: active
                                                ? theme.primary
                                                : theme.textDark,
                                        }}
                                    >
                                        {s.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* In-stock toggle */}
                    <TouchableOpacity
                        onPress={() => setInStockOnly((v) => !v)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: inStockOnly
                                ? theme.primary
                                : borderColor,
                            backgroundColor: inStockOnly
                                ? theme.primary
                                : 'transparent',
                            marginRight: 10,
                            marginBottom: 6,
                            ...webPointer,
                        }}
                    >
                        <View
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                borderWidth: 1.5,
                                borderColor: inStockOnly
                                    ? '#fff'
                                    : theme.textDark,
                                backgroundColor: inStockOnly
                                    ? '#fff'
                                    : 'transparent',
                                marginRight: 6,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {inStockOnly && (
                                <Text
                                    style={{
                                        fontSize: 9,
                                        color: theme.primary,
                                        fontFamily:
                                            theme.font.bold,
                                        lineHeight: 10,
                                    }}
                                >
                                    ✓
                                </Text>
                            )}
                        </View>
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                                color: inStockOnly
                                    ? '#fff'
                                    : theme.textDark,
                            }}
                        >
                            In stock
                        </Text>
                    </TouchableOpacity>

                    {/* Column picker */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginRight: 10,
                            marginBottom: 6,
                        }}
                    >
                        <View style={{ marginRight: 6 }}>
                            <Grid3x3
                                size={14}
                                color={theme.textDark}
                            />
                        </View>
                        <Text
                            style={{
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                color: theme.textDark,
                                marginRight: 6,
                            }}
                        >
                            Columns:
                        </Text>
                        <View
                            style={{
                                flexDirection: 'row',
                                padding: 3,
                                borderRadius: 8,
                                backgroundColor: subtleBg,
                            }}
                        >
                            {COLUMN_OPTIONS.map((o) => {
                                const active = columns === o;
                                return (
                                    <TouchableOpacity
                                        key={o}
                                        onPress={() => setColumns(o)}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        style={{
                                            paddingHorizontal: 10,
                                            paddingVertical: 5,
                                            borderRadius: 6,
                                            backgroundColor: active
                                                ? theme.panel
                                                : 'transparent',
                                            ...webPointer,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: active
                                                    ? theme.font.bold
                                                    : theme.font
                                                        .medium,
                                                fontSize:
                                                    theme.fontSize
                                                        .sm,
                                                color: active
                                                    ? theme.primary
                                                    : theme.textDark,
                                            }}
                                        >
                                            {o}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Refresh */}
                    <TouchableOpacity
                        onPress={refresh}
                        disabled={refreshing}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh inventory"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: subtleBg,
                            opacity: refreshing ? 0.6 : 1,
                            marginRight: 10,
                            marginBottom: 6,
                            ...webPointer,
                        }}
                    >
                        <RefreshCw
                            size={15}
                            color={theme.textDark}
                        />
                    </TouchableOpacity>

                    {/* Cart toggle */}
                    {!cartOpen && (
                        <TouchableOpacity
                            onPress={() => setCartOpen(true)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Show cart"
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                height: 34,
                                paddingHorizontal: 12,
                                borderRadius: 17,
                                backgroundColor:
                                    cartItemCount > 0
                                        ? theme.primary
                                        : subtleBg,
                                marginBottom: 6,
                                ...webPointer,
                            }}
                        >
                            <ShoppingCart
                                size={14}
                                color={
                                    cartItemCount > 0
                                        ? '#fff'
                                        : theme.textDark
                                }
                            />
                            <Text
                                style={{
                                    marginLeft: 6,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    color:
                                        cartItemCount > 0
                                            ? '#fff'
                                            : theme.textDark,
                                }}
                            >
                                Cart
                            </Text>
                            {cartItemCount > 0 && (
                                <View
                                    style={{
                                        marginLeft: 6,
                                        minWidth: 20,
                                        height: 20,
                                        borderRadius: 10,
                                        paddingHorizontal: 5,
                                        backgroundColor: '#fff',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 10,
                                            color: theme.primary,
                                            lineHeight: 12,
                                        }}
                                    >
                                        {cartItemCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Results summary */}
                <View
                    style={{
                        paddingHorizontal: MAIN_PADDING,
                        paddingVertical: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.xs,
                            color: theme.textDark,
                        }}
                    >
                        Showing {filtered.length} of {products.length}
                        {category !== 'All' ? ` · ${category}` : ''}
                        {inStockOnly ? ' · in stock' : ''}
                    </Text>

                    {activeFilterCount > 0 && (
                        <TouchableOpacity
                            onPress={() => setInStockOnly(false)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: subtleBg,
                                ...webPointer,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    color: theme.primary,
                                }}
                            >
                                Clear {activeFilterCount} filter
                                {activeFilterCount > 1 ? 's' : ''}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Grid or loader */}
                {showLoader ? (
                    <View
                        style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <ActivityIndicator
                            size="large"
                            color={theme.primary}
                        />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.sm,
                                color: theme.textDark,
                            }}
                        >
                            Loading inventory…
                        </Text>
                    </View>
                ) : error ? (
                    <View
                        style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 24,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                            }}
                        >
                            Could not load inventory
                        </Text>
                        <Text
                            style={{
                                marginTop: 4,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.sm,
                                color: theme.textDark,
                                textAlign: 'center',
                            }}
                        >
                            {error}
                        </Text>
                        <TouchableOpacity
                            onPress={refresh}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            style={{
                                marginTop: 16,
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 8,
                                backgroundColor: theme.primary,
                                ...webPointer,
                            }}
                        >
                            <RefreshCw size={13} color="#fff" />
                            <Text
                                style={{
                                    marginLeft: 6,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                    color: '#fff',
                                }}
                            >
                                Retry
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingLeft: MAIN_PADDING - HOVER_PADDING,
                            paddingRight: MAIN_PADDING - HOVER_PADDING,
                            paddingTop: MAIN_PADDING - HOVER_PADDING,
                            paddingBottom:
                                MAIN_PADDING -
                                HOVER_PADDING +
                                insets.bottom +
                                24,
                            flexGrow: 1,
                        }}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                    >
                        {filtered.length === 0 ? (
                            <View
                                style={{
                                    flex: 1,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: 240,
                                }}
                            >
                                <Package
                                    size={28}
                                    color={theme.textDark}
                                />
                                <Text
                                    style={{
                                        marginTop: 8,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.base,
                                        color: theme.textDark,
                                    }}
                                >
                                    No products match your filters.
                                </Text>
                            </View>
                        ) : (
                            <View
                                style={{
                                    flexDirection: 'row',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {filtered.map((p, i) => {
                                    const isLastInRow =
                                        (i + 1) % columns === 0;
                                    const indentQty =
                                        getQuantityByReceipts(
                                            p.receipt_ids,
                                        );
                                    const onIndent =
                                        !!findItemByReceipts(
                                            p.receipt_ids,
                                        );

                                    return (
                                        <View
                                            key={p.product_id}
                                            style={{
                                                width: cellWidth,
                                                padding: HOVER_PADDING,
                                                marginRight:
                                                    isLastInRow
                                                        ? 0
                                                        : GRID_GAP,
                                                marginBottom: GRID_GAP,
                                                zIndex: 1,
                                            }}
                                        >
                                            <ProductCard
                                                product={p}
                                                theme={theme}
                                                isDarkMode={
                                                    isDarkMode
                                                }
                                                borderColor={
                                                    borderColor
                                                }
                                                hoverScale={1.3}
                                                onPress={() =>
                                                    setModalProduct(
                                                        p,
                                                    )
                                                }
                                                onAddPress={() =>
                                                    setModalProduct(
                                                        p,
                                                    )
                                                }
                                                indentQuantity={
                                                    onIndent
                                                        ? indentQty
                                                        : 0
                                                }
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>

            {/* ═══ Cart panel (extreme right) ═══════════════ */}
            {cartOpen && (
                <View
                    style={{
                        width: CART_WIDTH,
                        borderLeftWidth: 1,
                        borderLeftColor: borderColor,
                        backgroundColor: theme.panel,
                        paddingTop: insets.top,
                        paddingBottom: insets.bottom,
                    }}
                >
                    <IndentCartPanel
                        indent={currentOpenIndent}
                        isDraftIndent={isDraftIndent}
                        pendingOpCount={pendingOpCount}
                        onRemoveItem={handleRemoveItem}
                        onCloseIndent={handleCloseIndent}
                        onSyncNow={handleSyncNow}
                        onDismiss={() => setCartOpen(false)}
                        busy={cartBusy}
                        errorText={cartError}
                    />
                </View>
            )}

            {/* ═══ Quantity modal ═══════════════════════════ */}
            <QuantityInputModal
                visible={!!modalProduct}
                product={modalProduct}
                onClose={() => setModalProduct(null)}
            />
        </View>
    );
}