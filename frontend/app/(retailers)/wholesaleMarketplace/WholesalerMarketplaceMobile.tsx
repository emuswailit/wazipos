// components/retailers/wholesalersMarketPlace/WholesalerMarketplaceMobile.tsx
//
// Mobile marketplace view.
//
// Single-column layout:
//   ┌────────────────────────────────────────┐
//   │  Header (back / title / refresh)       │
//   │  Search                                │
//   │  Category chips + More                 │
//   │  Sort pills + In-stock toggle          │
//   ├────────────────────────────────────────┤
//   │  Products (2-column grid)              │
//   │                                        │
//   │                          ╭─────────╮   │
//   │                          │ Cart FAB│   │  ← floating
//   │                          ╰─────────╯   │
//   └────────────────────────────────────────┘
//
// The cart lives behind a floating action button (FAB) at the
// bottom-right. Tapping it opens a bottom sheet hosting the same
// `IndentCartPanel` used on web.
//
// All indent mutations route through `useIndentBridge`, so an item
// added here is visible on any other device once the WS frame lands.

import { useAuth } from '@/context/AuthContext';
import type { RetailerIndentItem } from '@/databases/types';
import { useIndentBridge } from '@/hooks/useIndentBridge';
import {
    ArrowDownUp,
    ArrowLeft,
    ChevronDown,
    Package,
    RefreshCw,
    Search,
    ShoppingCart,
    X,
} from 'lucide-react-native';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    Pressable,
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
const H_PADDING = 12;
const GRID_GAP = 10;
const COLUMNS = 2;
const PAGE_SIZE = 20;
const MAX_VISIBLE_CHIPS = 5;
const FAB_SIZE = 56;

const webNoOutline = isWeb
    ? ({ outlineStyle: 'none' } as any)
    : {};

const SORTS = [
    { key: 'relevance', label: 'Relevance' },
    { key: 'price-asc', label: 'Price ↑' },
    { key: 'price-desc', label: 'Price ↓' },
    { key: 'name-asc', label: 'A→Z' },
    { key: 'stock', label: 'Stock' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

/* ── Component ──────────────────────────────────────────────── */

export default function WholesalerMarketplaceMobile({
    onClose,
    wholesalerId,
    wholesalerTitle,
}: WholesalerMarketplaceViewProps) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
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
        isDraftIndent,
        pendingOpCount,
        findItemByReceipts,
        getQuantityByReceipts,
        removeFromIndent,
    } = useIndentBridge();

    /* ── UI state ──────────────────────────────────────────── */

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [sort, setSort] = useState<SortKey>('relevance');
    const [inStockOnly, setInStockOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [categorySheetOpen, setCategorySheetOpen] = useState(false);
    const [cartSheetOpen, setCartSheetOpen] = useState(false);

    /* ── Modal state ──────────────────────────────────────── */

    const [modalProduct, setModalProduct] =
        useState<MarketplaceProduct | null>(null);
    const [cartBusy, setCartBusy] = useState(false);
    const [cartError, setCartError] = useState<string | null>(null);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    /* ── Categories ────────────────────────────────────────── */

    const categories = useMemo(() => {
        const counts = new Map<string, number>();
        products.forEach((p) => {
            counts.set(
                p.category_title,
                (counts.get(p.category_title) ?? 0) + 1,
            );
        });
        const sorted = Array.from(counts.entries())
            .sort(
                (a, b) =>
                    b[1] - a[1] || a[0].localeCompare(b[0]),
            )
            .map(([name, count]) => ({ name, count }));
        return [
            { name: 'All', count: products.length },
            ...sorted,
        ];
    }, [products]);

    const visibleChips = useMemo(
        () => categories.slice(0, MAX_VISIBLE_CHIPS),
        [categories],
    );
    const hasMoreChips = categories.length > MAX_VISIBLE_CHIPS;

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

    useEffect(() => {
        setPage(1);
    }, [search, category, sort, inStockOnly]);

    const visible = useMemo(
        () => filtered.slice(0, page * PAGE_SIZE),
        [filtered, page],
    );
    const hasMore = visible.length < filtered.length;

    const cardWidth = useMemo(
        () =>
            Math.floor(
                (width - H_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) /
                COLUMNS,
            ),
        [width],
    );

    const showLoader = loading && products.length === 0;

    const cartItemCount =
        currentOpenIndent?.retailer_indent_items?.length ?? 0;

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
        if (pendingOpCount === 0) return;
        // The context's poller will pick this up shortly. Kicking a
        // network refresh here just nudges the UI.
        (async () => {
            try {
                await refresh();
            } catch { }
        })();
    }, [pendingOpCount, refresh]);

    const handleCloseIndent = useCallback(async () => {
        setCartError(
            'Close indent is available from the main indent screen.',
        );
    }, []);

    /* ── Category chip ─────────────────────────────────────── */

    const CategoryChip = ({
        label,
        count,
        active,
        onPress,
    }: {
        label: string;
        count?: number;
        active: boolean;
        onPress: () => void;
    }) => (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: active
                    ? theme.primary
                    : 'transparent',
                borderColor: active
                    ? theme.primary
                    : borderColor,
            }}
        >
            <Text
                style={{
                    fontFamily: active
                        ? theme.font.bold
                        : theme.font.medium,
                    fontSize: theme.fontSize.xs,
                    color: active ? '#fff' : theme.textDark,
                }}
            >
                {label}
            </Text>
            {typeof count === 'number' && (
                <Text
                    style={{
                        marginLeft: 5,
                        fontFamily: theme.font.medium,
                        fontSize: 10,
                        color: active
                            ? 'rgba(255,255,255,0.85)'
                            : theme.textDark,
                    }}
                >
                    {count}
                </Text>
            )}
        </TouchableOpacity>
    );

    /* ── Render ────────────────────────────────────────────── */

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: theme.background,
            }}
        >
            {/* ═══ Header ════════════════════════════════════ */}
            <View
                style={{
                    paddingHorizontal: H_PADDING,
                    paddingTop: 14 + insets.top,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    backgroundColor: theme.panel,
                }}
            >
                {/* Row 1 — back / title / refresh */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 10,
                    }}
                >
                    <TouchableOpacity
                        onPress={onClose}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: subtleBg,
                        }}
                    >
                        <ArrowLeft size={16} color={theme.text} />
                    </TouchableOpacity>

                    <View
                        style={{
                            flex: 1,
                            marginHorizontal: 10,
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                            }}
                        >
                            {wholesalerTitle ?? 'Wholesaler'}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                                color: theme.textDark,
                            }}
                        >
                            {filtered.length} of {products.length}{' '}
                            {products.length === 1
                                ? 'item'
                                : 'items'}
                        </Text>
                    </View>

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
                        }}
                    >
                        <RefreshCw
                            size={15}
                            color={theme.textDark}
                        />
                    </TouchableOpacity>
                </View>

                {/* Row 2 — search */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: subtleBg,
                        paddingHorizontal: 10,
                        height: 38,
                        marginBottom: 10,
                    }}
                >
                    <View style={{ marginRight: 8 }}>
                        <Search
                            size={15}
                            color={theme.textDark}
                        />
                    </View>
                    <TextInput
                        placeholder="Search products, SKU..."
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
                        >
                            <X
                                size={14}
                                color={theme.textDark}
                            />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Row 3 — category chips + More */}
                {categories.length > 1 && (
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        <View style={{ flex: 1 }}>
                            <FlatList
                                horizontal
                                data={visibleChips}
                                keyExtractor={(c) => c.name}
                                showsHorizontalScrollIndicator={
                                    false
                                }
                                ItemSeparatorComponent={() => (
                                    <View style={{ width: 6 }} />
                                )}
                                renderItem={({ item: c }) => (
                                    <CategoryChip
                                        label={c.name}
                                        count={
                                            c.name !== 'All'
                                                ? c.count
                                                : undefined
                                        }
                                        active={
                                            category === c.name
                                        }
                                        onPress={() =>
                                            setCategory(c.name)
                                        }
                                    />
                                )}
                            />
                        </View>
                        {hasMoreChips && (
                            <TouchableOpacity
                                onPress={() =>
                                    setCategorySheetOpen(true)
                                }
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="More categories"
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 999,
                                    borderWidth: 1,
                                    borderColor,
                                    backgroundColor: subtleBg,
                                    marginLeft: 6,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.xs,
                                        color: theme.primary,
                                        marginRight: 3,
                                    }}
                                >
                                    More
                                </Text>
                                <ChevronDown
                                    size={12}
                                    color={theme.primary}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Row 4 — sort + in-stock */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <View style={{ marginRight: 6 }}>
                        <ArrowDownUp
                            size={12}
                            color={theme.textDark}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <FlatList
                            horizontal
                            data={
                                SORTS as unknown as {
                                    key: SortKey;
                                    label: string;
                                }[]
                            }
                            keyExtractor={(s) => s.key}
                            showsHorizontalScrollIndicator={false}
                            ItemSeparatorComponent={() => (
                                <View style={{ width: 4 }} />
                            )}
                            renderItem={({ item: s }) => {
                                const active = sort === s.key;
                                return (
                                    <TouchableOpacity
                                        onPress={() =>
                                            setSort(s.key)
                                        }
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        style={{
                                            paddingHorizontal: 9,
                                            paddingVertical: 4,
                                            borderRadius: 7,
                                            backgroundColor: active
                                                ? subtleBg
                                                : 'transparent',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: active
                                                    ? theme.font
                                                        .bold
                                                    : theme.font
                                                        .regular,
                                                fontSize:
                                                    theme.fontSize
                                                        .xs,
                                                color: active
                                                    ? theme.primary
                                                    : theme.textDark,
                                            }}
                                        >
                                            {s.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={() => setInStockOnly((v) => !v)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: inStockOnly
                                ? theme.primary
                                : borderColor,
                            backgroundColor: inStockOnly
                                ? theme.primary
                                : 'transparent',
                            marginLeft: 6,
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
                                marginRight: 5,
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
                                fontSize: 11,
                                color: inStockOnly
                                    ? '#fff'
                                    : theme.textDark,
                            }}
                        >
                            In stock
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ═══ Grid ══════════════════════════════════════ */}
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
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor: theme.primary,
                        }}
                    >
                        <Text
                            style={{
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
                <FlatList
                    data={visible}
                    keyExtractor={(item) => item.product_id}
                    numColumns={COLUMNS}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={{
                        paddingHorizontal: H_PADDING,
                        paddingTop: H_PADDING,
                        paddingBottom:
                            H_PADDING + 96 + insets.bottom,
                        flexGrow: 1,
                    }}
                    showsVerticalScrollIndicator={false}
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                        if (hasMore) setPage((p) => p + 1);
                    }}
                    refreshing={refreshing}
                    onRefresh={refresh}
                    ListFooterComponent={
                        hasMore ? (
                            <Text
                                style={{
                                    textAlign: 'center',
                                    paddingVertical: 16,
                                    fontFamily: theme.font.regular,
                                    fontSize: theme.fontSize.sm,
                                    color: theme.textDark,
                                }}
                            >
                                Loading more…
                            </Text>
                        ) : null
                    }
                    ListEmptyComponent={
                        <View
                            style={{
                                flex: 1,
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 40,
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
                    }
                    renderItem={({ item, index }) => {
                        const indentQty =
                            getQuantityByReceipts(item.receipt_ids);
                        const onIndent = !!findItemByReceipts(
                            item.receipt_ids,
                        );

                        return (
                            <View
                                style={{
                                    width: cardWidth,
                                    marginRight:
                                        index % COLUMNS ===
                                            COLUMNS - 1
                                            ? 0
                                            : GRID_GAP,
                                    marginBottom: GRID_GAP,
                                }}
                            >
                                <ProductCard
                                    product={item}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    borderColor={borderColor}
                                    hoverScale={1}
                                    onPress={() =>
                                        setModalProduct(item)
                                    }
                                    onAddPress={() =>
                                        setModalProduct(item)
                                    }
                                    indentQuantity={
                                        onIndent ? indentQty : 0
                                    }
                                />
                            </View>
                        );
                    }}
                />
            )}

            {/* ═══ Floating cart FAB ═════════════════════════ */}
            {cartItemCount > 0 && !cartSheetOpen && (
                <TouchableOpacity
                    onPress={() => setCartSheetOpen(true)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Open cart, ${cartItemCount} items`}
                    style={{
                        position: 'absolute',
                        right: H_PADDING + insets.right,
                        bottom: 24 + insets.bottom,
                        width: FAB_SIZE,
                        height: FAB_SIZE,
                        borderRadius: FAB_SIZE / 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.primary,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.22,
                        shadowRadius: 12,
                        elevation: 8,
                    }}
                >
                    <ShoppingCart size={22} color="#fff" />
                    <View
                        style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 22,
                            height: 22,
                            borderRadius: 11,
                            paddingHorizontal: 5,
                            backgroundColor:
                                pendingOpCount > 0
                                    ? '#f59e0b'
                                    : '#dc2626',
                            borderWidth: 2,
                            borderColor: theme.background,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                color: '#fff',
                                lineHeight: 12,
                            }}
                        >
                            {cartItemCount}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* ═══ Category sheet ════════════════════════════ */}
            <Modal
                visible={categorySheetOpen}
                transparent
                animationType="slide"
                onRequestClose={() =>
                    setCategorySheetOpen(false)
                }
                statusBarTranslucent
            >
                <Pressable
                    onPress={() => setCategorySheetOpen(false)}
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation?.()}
                        style={{
                            backgroundColor: theme.panel,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            maxHeight: '75%',
                            paddingBottom: 24 + insets.bottom,
                        }}
                    >
                        <View
                            style={{
                                alignItems: 'center',
                                paddingTop: 10,
                                paddingBottom: 4,
                            }}
                        >
                            <View
                                style={{
                                    width: 40,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: borderColor,
                                }}
                            />
                        </View>

                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize:
                                        theme.fontSize.base,
                                    color: theme.text,
                                }}
                            >
                                Categories
                            </Text>
                            <TouchableOpacity
                                onPress={() =>
                                    setCategorySheetOpen(false)
                                }
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: subtleBg,
                                }}
                            >
                                <X
                                    size={14}
                                    color={theme.text}
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            contentContainerStyle={{
                                paddingVertical: 8,
                            }}
                            showsVerticalScrollIndicator={false}
                        >
                            {categories.map((c) => {
                                const active =
                                    category === c.name;
                                return (
                                    <TouchableOpacity
                                        key={c.name}
                                        onPress={() => {
                                            setCategory(c.name);
                                            setCategorySheetOpen(
                                                false,
                                            );
                                        }}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            paddingHorizontal: 16,
                                            paddingVertical: 12,
                                            backgroundColor: active
                                                ? subtleBg
                                                : 'transparent',
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: 9,
                                                borderWidth: 2,
                                                borderColor: active
                                                    ? theme.primary
                                                    : borderColor,
                                                alignItems:
                                                    'center',
                                                justifyContent:
                                                    'center',
                                                marginRight: 12,
                                            }}
                                        >
                                            {active && (
                                                <View
                                                    style={{
                                                        width: 9,
                                                        height: 9,
                                                        borderRadius: 5,
                                                        backgroundColor:
                                                            theme.primary,
                                                    }}
                                                />
                                            )}
                                        </View>
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                flex: 1,
                                                fontFamily: active
                                                    ? theme.font
                                                        .bold
                                                    : theme.font
                                                        .medium,
                                                fontSize:
                                                    theme.fontSize
                                                        .base,
                                                color: active
                                                    ? theme.primary
                                                    : theme.text,
                                            }}
                                        >
                                            {c.name}
                                        </Text>
                                        <Text
                                            style={{
                                                fontFamily:
                                                    theme.font
                                                        .regular,
                                                fontSize:
                                                    theme.fontSize
                                                        .sm,
                                                color: theme.textDark,
                                            }}
                                        >
                                            {c.count}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* ═══ Cart sheet ════════════════════════════════ */}
            <Modal
                visible={cartSheetOpen}
                transparent
                animationType="slide"
                onRequestClose={() =>
                    setCartSheetOpen(false)
                }
                statusBarTranslucent
            >
                <Pressable
                    onPress={() => setCartSheetOpen(false)}
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation?.()}
                        style={{
                            backgroundColor: theme.panel,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            maxHeight: '82%',
                            minHeight: 320,
                            overflow: 'hidden',
                        }}
                    >
                        <View
                            style={{
                                alignItems: 'center',
                                paddingTop: 10,
                                paddingBottom: 4,
                            }}
                        >
                            <View
                                style={{
                                    width: 40,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: borderColor,
                                }}
                            />
                        </View>

                        <View
                            style={{ flex: 1, minHeight: 0 }}
                        >
                            <IndentCartPanel
                                indent={currentOpenIndent}
                                isDraftIndent={isDraftIndent}
                                pendingOpCount={pendingOpCount}
                                onRemoveItem={handleRemoveItem}
                                onCloseIndent={handleCloseIndent}
                                onSyncNow={handleSyncNow}
                                onDismiss={() =>
                                    setCartSheetOpen(false)
                                }
                                busy={cartBusy}
                                errorText={cartError}
                                bottomInset={insets.bottom}
                            />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* ═══ Quantity modal ════════════════════════════ */}
            <QuantityInputModal
                visible={!!modalProduct}
                product={modalProduct}
                onClose={() => setModalProduct(null)}
            />
        </View>
    );
}