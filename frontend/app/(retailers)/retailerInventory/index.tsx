// app/(wholesalers)/wholesaleInventory/InventoryContainer.tsx

import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableNativeFeedback,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';

import CardView from './CardView';
import InventoryAddModal from './InventoryAddModal';
import TableView from './TableView';

export type FilterTab = 'ALL' | 'ACTIVE' | 'EXPIRED';

const TAB_OPTIONS: FilterTab[] = [
    'ALL',
    'ACTIVE',
    'EXPIRED',
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

/* =========================================================
 * Platform-aware touchable
 * ======================================================= */

interface AppTouchableProps {
    onPress: () => void;
    children: React.ReactNode;
    style?: any;
    activeOpacity?: number;
    rippleColor?: string;
    disabled?: boolean;
}

function AppTouchable({
    onPress,
    children,
    style,
    activeOpacity = 0.7,
    rippleColor = 'rgba(255,255,255,0.3)',
    disabled = false,
}: AppTouchableProps) {
    if (Platform.OS === 'android') {
        return (
            <TouchableNativeFeedback
                onPress={onPress}
                disabled={disabled}
                background={TouchableNativeFeedback.Ripple(
                    rippleColor,
                    false
                )}
            >
                <View style={style}>{children}</View>
            </TouchableNativeFeedback>
        );
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={activeOpacity}
            disabled={disabled}
            style={style}
        >
            {children}
        </TouchableOpacity>
    );
}

/* =========================================================
 * Page-size select
 * ======================================================= */

interface PageSizeSelectProps {
    value: number;
    onChange: (size: number) => void;
    theme: any;
    isDarkMode: boolean;
    openDirection?: 'up' | 'down';
}

function PageSizeSelect({
    value,
    onChange,
    theme,
    isDarkMode,
    openDirection = 'down',
}: PageSizeSelectProps) {
    const [open, setOpen] = useState(false);

    const accent = theme?.primary;
    const textColor = theme?.text;
    const mutedText = theme?.textDark;

    return (
        <View
            className="relative"
            style={{
                zIndex: open ? 9999 : 1,
                elevation: open ? 9999 : 1,
            }}
        >
            <Pressable
                onPress={() => setOpen((v) => !v)}
                style={{
                    backgroundColor: theme?.background,
                    borderColor: accent,
                    borderWidth: 1,
                    height: 28,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                }}
            >
                <Text
                    style={{
                        color: mutedText,
                        fontFamily: theme?.font?.medium,
                    }}
                    className="text-[10px]"
                >
                    {value}/pg
                </Text>
                <Text
                    style={{
                        color: mutedText,
                        fontSize: 7,
                        transform: [
                            {
                                rotate: open
                                    ? '180deg'
                                    : '0deg',
                            },
                        ],
                    }}
                >
                    ▼
                </Text>
            </Pressable>

            {open && (
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        minWidth: 110,
                        backgroundColor: theme?.panel,
                        borderColor: accent,
                        borderWidth: 1,
                        borderRadius: 8,
                        overflow: 'hidden',
                        zIndex: 10000,
                        elevation: 10000,
                        ...(openDirection === 'up'
                            ? { bottom: 34 }
                            : { top: 34 }),
                    }}
                >
                    <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => {
                            const selected = size === value;
                            return (
                                <Pressable
                                    key={size}
                                    onPress={() => {
                                        onChange(size);
                                        setOpen(false);
                                    }}
                                    style={({ pressed }) => ({
                                        backgroundColor: pressed
                                            ? theme?.background
                                            : selected
                                                ? theme?.background
                                                : 'transparent',
                                        paddingHorizontal: 10,
                                        paddingVertical: 7,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent:
                                            'space-between',
                                    })}
                                >
                                    <Text
                                        style={{
                                            color: selected
                                                ? accent
                                                : textColor,
                                            fontFamily: selected
                                                ? theme?.font?.bold
                                                : theme?.font?.medium,
                                            fontSize: 11,
                                        }}
                                    >
                                        {size}/page
                                    </Text>
                                    {selected && (
                                        <Text
                                            style={{
                                                color: accent,
                                                fontSize: 11,
                                                fontFamily:
                                                    theme?.font?.bold,
                                            }}
                                        >
                                            ✓
                                        </Text>
                                    )}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

/* =========================================================
 * Inventory Container
 * ======================================================= */

export default function InventoryContainer() {
    const {
        retailerReceipts,
        triggerManualFetch,
        isLiveConnected,
        isManualRefreshing,
    } = useInventorySync();

    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();

    const [activeTab, setActiveTab] =
        useState<FilterTab>('ALL');

    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] =
        useState(false);

    const isLargeScreen = width >= 768;

    const [pageSize, setPageSize] = useState<number>(
        DEFAULT_PAGE_SIZE
    );

    const [visibleCount, setVisibleCount] =
        useState(DEFAULT_PAGE_SIZE);

    const [page, setPage] = useState(0);

    /* =========================================================
     * Filtering
     * ======================================================= */

    const filteredReceipts = useMemo(() => {
        if (!Array.isArray(retailerReceipts)) return [];

        const q = searchQuery.trim().toLowerCase();

        return retailerReceipts.filter((receipt: any) => {
            if (!receipt) return false;

            const isExpired =
                (typeof receipt.days_to_expiry ===
                    'number' &&
                    receipt.days_to_expiry <= 0) ||
                receipt.expiry_status === 'EXPIRED';

            if (activeTab === 'ACTIVE' && isExpired)
                return false;
            if (activeTab === 'EXPIRED' && !isExpired)
                return false;

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

                if (
                    !product.includes(q) &&
                    !batch.includes(q) &&
                    !supplier.includes(q)
                ) {
                    return false;
                }
            }

            return true;
        });
    }, [retailerReceipts, activeTab, searchQuery]);

    /* =========================================================
     * Header stats
     * ======================================================= */

    const totalItems = filteredReceipts.length;

    const totalValue = useMemo(() => {
        if (!Array.isArray(filteredReceipts)) return 0;

        return filteredReceipts.reduce(
            (sum: number, receipt: any) => {
                if (!receipt) return sum;

                const qty = Number(
                    receipt.current_unit_quantity ?? 0
                );
                if (!Number.isFinite(qty) || qty <= 0)
                    return sum;

                const priceStr =
                    receipt.final_unit_selling_price ??
                    receipt.unit_selling_price ??
                    '0';

                const price = parseFloat(priceStr);
                if (!Number.isFinite(price) || price < 0)
                    return sum;

                return sum + qty * price;
            },
            0
        );
    }, [filteredReceipts]);

    const totalValueLabel = useMemo(() => {
        return `KES ${totalValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }, [totalValue]);

    /* =========================================================
     * Small-screen infinite scroll
     * ======================================================= */

    useEffect(() => {
        setVisibleCount(pageSize);
    }, [activeTab, searchQuery, pageSize]);

    const visibleReceipts = useMemo(
        () => filteredReceipts.slice(0, visibleCount),
        [filteredReceipts, visibleCount]
    );

    const hasMore =
        visibleCount < filteredReceipts.length;

    const handleLoadMore = useCallback(() => {
        if (visibleCount < filteredReceipts.length) {
            setVisibleCount((c) => c + pageSize);
        }
    }, [visibleCount, filteredReceipts.length, pageSize]);

    const handleScroll = useCallback(
        (event: any) => {
            if (isLargeScreen) return;

            const {
                layoutMeasurement,
                contentOffset,
                contentSize,
            } = event.nativeEvent;

            const nearBottom =
                layoutMeasurement.height +
                contentOffset.y >=
                contentSize.height - 200;

            if (nearBottom) handleLoadMore();
        },
        [handleLoadMore, isLargeScreen]
    );

    /* =========================================================
     * Large-screen pagination
     * ======================================================= */

    const totalPages = Math.max(
        1,
        Math.ceil(filteredReceipts.length / pageSize)
    );

    useEffect(() => {
        setPage(0);
    }, [activeTab, searchQuery, pageSize]);

    useEffect(() => {
        if (page > totalPages - 1) setPage(0);
    }, [totalPages, page]);

    const pagedReceipts = useMemo(() => {
        const start = page * pageSize;
        return filteredReceipts.slice(
            start,
            start + pageSize
        );
    }, [filteredReceipts, page, pageSize]);

    const rangeStart =
        filteredReceipts.length === 0
            ? 0
            : page * pageSize + 1;
    const rangeEnd = Math.min(
        (page + 1) * pageSize,
        filteredReceipts.length
    );

    /* =========================================================
     * Handlers
     * ======================================================= */

    const handleRefresh = useCallback(() => {
        triggerManualFetch?.();
    }, [triggerManualFetch]);

    const handleOpenAdd = useCallback(() => {
        setIsAddModalOpen(true);
    }, []);

    const handleCloseAdd = useCallback(() => {
        setIsAddModalOpen(false);
    }, []);

    const handleAddSuccess = useCallback(() => {
        triggerManualFetch?.();
    }, [triggerManualFetch]);

    /* =========================================================
     * Render
     * ======================================================= */

    return (
        <View
            style={{ backgroundColor: theme?.background }}
            className="flex-1"
        >
            {isManualRefreshing && (
                <View className="absolute top-0 left-0 right-0 z-30 items-center pt-2">
                    <ActivityIndicator
                        size="small"
                        color={theme?.primary}
                    />
                </View>
            )}

            {/* ============================================================
                COMPACT STICKY HEADER
               ============================================================ */}
            <View
                style={{
                    backgroundColor: theme?.background,
                    borderBottomColor: theme?.primary,
                }}
                className="px-3 pt-2.5 pb-2 border-b z-20"
            >
                {/* Row 1 — stats + status + Add button, single line */}
                <View className="flex-row items-stretch gap-2 mb-2">
                    {/* Items stat */}
                    <View
                        style={{
                            backgroundColor: theme?.panel,
                            borderColor: theme?.primary,
                        }}
                        className="border rounded-lg px-2.5 py-1.5 justify-center min-w-[70px]"
                    >
                        <Text
                            style={{
                                color: theme?.textDark,
                                fontFamily: theme?.font?.bold,
                            }}
                            className="text-[9px] uppercase tracking-wider"
                        >
                            Items
                        </Text>
                        <Text
                            style={{
                                color: theme?.primary,
                                fontFamily: theme?.font?.bold,
                            }}
                            className="text-base mt-0.5"
                            numberOfLines={1}
                        >
                            {totalItems}
                        </Text>
                    </View>

                    {/* Value stat */}
                    <View
                        style={{
                            backgroundColor: theme?.panel,
                            borderColor: theme?.primary,
                        }}
                        className="border rounded-lg px-2.5 py-1.5 justify-center flex-1"
                    >
                        <Text
                            style={{
                                color: theme?.textDark,
                                fontFamily: theme?.font?.bold,
                            }}
                            className="text-[9px] uppercase tracking-wider"
                        >
                            Stock Value
                        </Text>
                        <Text
                            style={{
                                color: theme?.primary,
                                fontFamily: theme?.font?.bold,
                            }}
                            className="text-base mt-0.5"
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {totalValueLabel}
                        </Text>
                    </View>

                    {/* Live indicator + Add button stacked */}
                    <View className="justify-between items-end">
                        <View className="flex-row items-center mb-1">
                            <View
                                className={`w-1.5 h-1.5 rounded-full mr-1 ${isLiveConnected
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    }`}
                            />
                            <Text
                                style={{
                                    color: theme?.textDark,
                                    fontFamily:
                                        theme?.font?.medium,
                                }}
                                className="text-[9px]"
                            >
                                {isLiveConnected
                                    ? 'Live'
                                    : 'Offline'}
                            </Text>
                        </View>

                        <AppTouchable
                            onPress={handleOpenAdd}
                            style={{
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 6,
                                backgroundColor:
                                    theme?.primary,
                                overflow: 'hidden',
                            }}
                            rippleColor="rgba(255,255,255,0.3)"
                            activeOpacity={0.7}
                        >
                            <Text
                                style={{
                                    color: '#ffffff',
                                    fontSize: 12,
                                    fontFamily:
                                        theme?.font?.semibold,
                                }}
                            >
                                + Add
                            </Text>
                        </AppTouchable>
                    </View>
                </View>

                {/* Row 2 — search */}
                <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search product, batch, supplier..."
                    placeholderTextColor={theme?.textDark}
                    style={{
                        backgroundColor: theme?.panel,
                        color: theme?.text,
                        fontFamily: theme?.font?.medium,
                    }}
                    className="px-3 py-2 rounded-lg text-sm mb-2"
                />

                {/* Row 3 — tabs, compact */}
                <View className="flex-row">
                    {TAB_OPTIONS.map((tab) => {
                        const isActive = activeTab === tab;
                        return (
                            <AppTouchable
                                key={tab}
                                onPress={() =>
                                    setActiveTab(tab)
                                }
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 5,
                                    marginRight: 6,
                                    borderRadius: 999,
                                    backgroundColor:
                                        isActive
                                            ? theme?.primary
                                            : theme?.panel,
                                    overflow: 'hidden',
                                }}
                                rippleColor={
                                    isActive
                                        ? 'rgba(255,255,255,0.3)'
                                        : 'rgba(0,0,0,0.15)'
                                }
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={{
                                        color: isActive
                                            ? '#ffffff'
                                            : theme?.textDark,
                                        fontSize: 10,
                                        fontFamily: isActive
                                            ? theme?.font?.bold
                                            : theme?.font
                                                ?.medium,
                                        textTransform:
                                            'uppercase',
                                        letterSpacing: 0.4,
                                    }}
                                >
                                    {tab}
                                </Text>
                            </AppTouchable>
                        );
                    })}
                </View>
            </View>

            {/* ============================================================
                SCROLLABLE BODY
               ============================================================ */}
            <ScrollView
                className="flex-1 px-3 pt-3"
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={200}
                onScroll={handleScroll}
                refreshControl={
                    <RefreshControl
                        refreshing={!!isManualRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={
                            isDarkMode ? '#fff' : '#000'
                        }
                    />
                }
            >
                {filteredReceipts.length === 0 ? (
                    <View className="flex-1 items-center justify-center py-20">
                        <Text
                            style={{
                                color: theme?.textDark,
                                fontFamily:
                                    theme?.font?.regular,
                            }}
                            className="text-base"
                        >
                            {searchQuery
                                ? 'No results match your search'
                                : `No ${activeTab.toLowerCase()} items`}
                        </Text>
                    </View>
                ) : isLargeScreen ? (
                    <>
                        <TableView
                            data={pagedReceipts}
                            theme={theme}
                            isDarkMode={isDarkMode}
                        />

                        <View className="flex-row items-center justify-between mt-3 px-1">
                            <View className="flex-row items-center gap-2">
                                <Text
                                    style={{
                                        color: theme?.textDark,
                                        fontFamily:
                                            theme?.font?.medium,
                                    }}
                                    className="text-[10px]"
                                >
                                    {rangeStart}–{rangeEnd} of{' '}
                                    {filteredReceipts.length}
                                </Text>

                                <PageSizeSelect
                                    value={pageSize}
                                    onChange={setPageSize}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    openDirection="up"
                                />
                            </View>

                            <View className="flex-row items-center gap-1.5">
                                <TouchableOpacity
                                    onPress={() =>
                                        setPage((p) =>
                                            Math.max(
                                                0,
                                                p - 1
                                            )
                                        )
                                    }
                                    disabled={page === 0}
                                    activeOpacity={0.7}
                                    style={{
                                        opacity:
                                            page === 0
                                                ? 0.4
                                                : 1,
                                        backgroundColor:
                                            theme?.panel,
                                    }}
                                    className="px-2 h-7 rounded-md items-center justify-center"
                                >
                                    <Text
                                        style={{
                                            color: theme?.textDark,
                                            fontFamily:
                                                theme?.font
                                                    ?.bold,
                                        }}
                                        className="text-[10px]"
                                    >
                                        ←
                                    </Text>
                                </TouchableOpacity>

                                <View
                                    style={{
                                        backgroundColor:
                                            theme?.primary,
                                    }}
                                    className="px-2.5 h-7 rounded-md items-center justify-center"
                                >
                                    <Text
                                        style={{
                                            color: '#ffffff',
                                            fontFamily:
                                                theme?.font
                                                    ?.bold,
                                        }}
                                        className="text-[10px]"
                                    >
                                        {page + 1} /{' '}
                                        {totalPages}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() =>
                                        setPage((p) =>
                                            Math.min(
                                                totalPages - 1,
                                                p + 1
                                            )
                                        )
                                    }
                                    disabled={
                                        page >=
                                        totalPages - 1
                                    }
                                    activeOpacity={0.7}
                                    style={{
                                        opacity:
                                            page >=
                                                totalPages - 1
                                                ? 0.4
                                                : 1,
                                        backgroundColor:
                                            theme?.panel,
                                    }}
                                    className="px-2 h-7 rounded-md items-center justify-center"
                                >
                                    <Text
                                        style={{
                                            color: theme?.textDark,
                                            fontFamily:
                                                theme?.font
                                                    ?.bold,
                                        }}
                                        className="text-[10px]"
                                    >
                                        →
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                ) : (
                    <>
                        <View>
                            {visibleReceipts.map(
                                (
                                    receipt: any,
                                    idx: number
                                ) => (
                                    <CardView
                                        key={
                                            receipt?.id ??
                                            `receipt-${idx}`
                                        }
                                        item={receipt}
                                        theme={theme}
                                        isDarkMode={
                                            isDarkMode
                                        }
                                    />
                                )
                            )}
                        </View>

                        {hasMore && (
                            <View className="py-5 items-center justify-center">
                                <ActivityIndicator
                                    size="small"
                                    color={theme?.primary}
                                />
                                <Text
                                    style={{
                                        color: theme?.textDark,
                                        fontFamily:
                                            theme?.font?.regular,
                                    }}
                                    className="text-[10px] mt-1.5"
                                >
                                    Loading more...
                                </Text>
                            </View>
                        )}

                        {!hasMore && (
                            <View className="py-5 flex-row items-center justify-center gap-2">
                                <Text
                                    style={{
                                        color: theme?.textDark,
                                        fontFamily:
                                            theme?.font?.regular,
                                    }}
                                    className="text-[10px]"
                                >
                                    {filteredReceipts.length >
                                        pageSize
                                        ? `End — ${filteredReceipts.length} items`
                                        : `${filteredReceipts.length} items`}
                                </Text>

                                <PageSizeSelect
                                    value={pageSize}
                                    onChange={setPageSize}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    openDirection="up"
                                />
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            <InventoryAddModal
                isOpen={isAddModalOpen}
                onClose={handleCloseAdd}
                onSuccess={handleAddSuccess}
                isDarkMode={isDarkMode}
                theme={theme}
            />
        </View>
    );
}