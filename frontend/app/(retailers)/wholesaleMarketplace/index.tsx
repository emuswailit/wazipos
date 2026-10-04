// components/retailers/wholesalersMarketPlace/index.tsx
//
// Orchestrator for the wholesaler marketplace.
//
// Top half — the list of wholesalers the logged-in retailer can browse.
// Tapping a row opens the full-screen marketplace modal for that
// wholesaler, where individual products are shown and can be added to
// the current open retailer indent.
//
// This file also exports the shared utilities consumed by the two
// platform views (Web + Mobile) and by the product card:
//   - MarketplaceProduct — the view model rendered on each card
//   - ProductCard — the reusable product tile
//   - useWholesalerProducts — the receipt fetch + aggregate hook
//   - resolveEntityId — the identifier resolver for the wholesaler rows
//
// NESTED INTERACTIVES
//   On react-native-web both Pressable and TouchableOpacity render as
//   <button>, and nested <button> elements are invalid HTML. Every
//   interactive element that would otherwise sit inside another one is
//   rendered as a `View` with platform-appropriate handlers:
//     web    → onClick (with stopPropagation)
//     native → onStartShouldSetResponder + onResponderRelease

import wholesalersApi from '@/api/wholesalersApi';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import type { EntityItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import {
    ArrowUpDown,
    BadgeCheck,
    Building2,
    ChevronRight,
    Package,
    Phone,
    RefreshCw,
    Search,
    ShoppingCart,
    Tag,
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
    Image,
    Platform,
    Pressable,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WholesalerMarketplaceModal from './WholesalerMarketplaceModal';

/* ════════════════════════════════════════════════════════════
 *  Universal helpers
 * ════════════════════════════════════════════════════════════ */

export const isWeb = Platform.OS === 'web';

export const useUniversalInsets = useSafeAreaInsets;

export function useEscapeToClose(active: boolean, onClose: () => void) {
    useEffect(() => {
        if (!isWeb || !active) return;
        const w: any = typeof window !== 'undefined' ? window : null;
        if (!w) return;
        const handler = (e: any) => {
            if (e?.key === 'Escape') onClose();
        };
        w.addEventListener('keydown', handler);
        return () => w.removeEventListener('keydown', handler);
    }, [active, onClose]);
}

export const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
export const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};

export function cardShadow(intensity: 'soft' | 'strong' = 'soft') {
    const cfg =
        intensity === 'strong'
            ? { offset: 10, opacity: 0.18, radius: 22, elevation: 14 }
            : { offset: 4, opacity: 0.1, radius: 10, elevation: 6 };
    return {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: cfg.offset },
        shadowOpacity: cfg.opacity,
        shadowRadius: cfg.radius,
        elevation: cfg.elevation,
    };
}

/**
 * The EntitiesSyncContext writes the server UUID onto `entity.id`
 * (as a string at runtime despite the type saying `number`) and never
 * populates `remote_id`. This helper resolves the ID no matter which
 * field the producer used.
 */
export function resolveEntityId(
    entity: EntityItem | null | undefined,
): string {
    if (!entity) return '';
    const anyE = entity as any;
    const raw = anyE.remote_id ?? anyE.id ?? '';
    return raw === null || raw === undefined ? '' : String(raw);
}

/* ════════════════════════════════════════════════════════════
 *  Marketplace view model
 * ════════════════════════════════════════════════════════════ */

export interface MarketplaceProduct {
    product_id: string;
    name: string;
    category_id: string;
    category_title: string;
    unit: string;
    price: number;
    original_price: number;
    stock: number;
    sku?: string;
    image?: string;
    price_discount: { title: string; percent: number } | null;
    quantity_discount: { title: string; display: string } | null;
    receipt_ids: string[];
    has_expired_stock: boolean;
}

export interface WholesalerMarketplaceViewProps {
    onClose: () => void;
    wholesalerId: string;
    wholesalerTitle?: string;
}

/* ── Parsing helpers ──────────────────────────────────────── */

const isTruthy = (v: any) => v === true || v === 'true';

function resolveArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.results)) return raw.results;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.receipts)) return raw.receipts;
        if (Array.isArray(raw.items)) return raw.items;
        if (Array.isArray(raw.products)) return raw.products;
        if (raw.data && typeof raw.data === 'object') {
            if (Array.isArray(raw.data.results)) return raw.data.results;
            if (Array.isArray(raw.data.items)) return raw.data.items;
            if (Array.isArray(raw.data.receipts))
                return raw.data.receipts;
        }
    }
    return [];
}

function pickImage(images: any): string | undefined {
    if (!Array.isArray(images) || images.length === 0) return undefined;
    for (const img of images) {
        if (typeof img === 'string' && img.length > 0) return img;
        if (img && typeof img === 'object') {
            if (typeof img.image === 'string' && img.image.length > 0)
                return img.image;
            if (
                typeof img.thumbnail === 'string' &&
                img.thumbnail.length > 0
            )
                return img.thumbnail;
            if (typeof img.url === 'string' && img.url.length > 0)
                return img.url;
        }
    }
    return undefined;
}

function normalizeReceipt(raw: any): MarketplaceProduct | null {
    const productId = raw?.product ?? raw?.product_id;
    if (!productId) return null;

    const receiptPrice = Number(raw.unit_selling_price ?? 0);
    const finalPrice = Number(
        raw.final_unit_selling_price ?? receiptPrice,
    );
    const pd = raw.price_discount;
    const hasActivePd = isTruthy(pd?.is_currently_active);
    const qdList = Array.isArray(raw.quantity_discounts)
        ? raw.quantity_discounts
        : [];
    const activeQd = qdList.find((q: any) =>
        isTruthy(q?.is_currently_active),
    );

    return {
        product_id: String(productId),
        name: String(
            raw.product_title ?? raw.title ?? 'Unnamed product',
        ),
        category_id: String(raw.category ?? ''),
        category_title: String(
            raw.category_title ?? 'Uncategorized',
        ),
        unit: String(raw.unit_of_receipt ?? 'unit'),
        price: hasActivePd ? finalPrice : receiptPrice,
        original_price: receiptPrice,
        stock: Number(raw.current_unit_quantity ?? 0),
        sku: raw.bar_code ? String(raw.bar_code) : undefined,
        image: pickImage(raw.images),
        price_discount: hasActivePd
            ? {
                title: String(
                    pd?.title ?? `${pd?.percent ?? 0}% OFF`,
                ),
                percent: Number(pd?.percent ?? 0),
            }
            : null,
        quantity_discount: activeQd
            ? {
                title: String(activeQd.title ?? 'Quantity offer'),
                display: String(
                    activeQd?.bonus_ratio?.display ??
                    activeQd.title ??
                    '',
                ),
            }
            : null,
        receipt_ids: raw.id ? [String(raw.id)] : [],
        has_expired_stock: isTruthy(raw.expiry_status),
    };
}

function aggregateByProduct(
    rows: MarketplaceProduct[],
): MarketplaceProduct[] {
    const map = new Map<string, MarketplaceProduct>();
    for (const r of rows) {
        const existing = map.get(r.product_id);
        if (!existing) {
            map.set(r.product_id, { ...r });
            continue;
        }
        map.set(r.product_id, {
            ...existing,
            receipt_ids: [
                ...existing.receipt_ids,
                ...r.receipt_ids,
            ],
            stock: existing.stock + r.stock,
            price: Math.min(existing.price, r.price),
            original_price:
                existing.original_price || r.original_price,
            price_discount:
                existing.price_discount ?? r.price_discount,
            quantity_discount:
                existing.quantity_discount ?? r.quantity_discount,
            image: existing.image ?? r.image,
            sku: existing.sku ?? r.sku,
            has_expired_stock:
                existing.has_expired_stock || r.has_expired_stock,
        });
    }
    return Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
    );
}

/* ════════════════════════════════════════════════════════════
 *  Data hook — fetch + aggregate wholesaler receipts
 * ════════════════════════════════════════════════════════════ */

export function useWholesalerProducts(
    wholesalerId: string | undefined,
) {
    const api = useApi(wholesalersApi.wholesaleReceiptsAction);
    const [products, setProducts] = useState<MarketplaceProduct[]>(
        [],
    );
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(
        async (mode: 'initial' | 'refresh' = 'initial') => {
            if (!wholesalerId) return;
            if (mode === 'refresh') setRefreshing(true);
            setError(null);
            try {
                const res = await api.request({
                    action: 'WholesalerReceiptsById',
                    wholesaler: wholesalerId,
                });
                const raw = (res as any)?.data ?? api.data ?? res;
                const rows = resolveArray(raw)
                    .map(normalizeReceipt)
                    .filter(Boolean) as MarketplaceProduct[];
                setProducts(aggregateByProduct(rows));
            } catch (e: any) {
                console.error(
                    '[WholesalerReceiptsById] failed →',
                    e,
                );
                setError(
                    e?.message ?? 'Failed to load inventory',
                );
                setProducts([]);
            } finally {
                if (mode === 'refresh') setRefreshing(false);
            }
        },
        [wholesalerId, api],
    );

    useEffect(() => {
        load('initial');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wholesalerId]);

    return {
        products,
        loading: api.loading,
        refreshing,
        error,
        refresh: () => load('refresh'),
    };
}

/* ════════════════════════════════════════════════════════════
 *  Product card
 *
 *  The cart icon is a `View` (not a Pressable), because on web both
 *  Pressable and TouchableOpacity render as <button>, and nested
 *  <button> elements are invalid HTML. Web uses onClick, native uses
 *  responder props.
 * ════════════════════════════════════════════════════════════ */

export const HOVER_SCALE = 1.3;

interface ProductCardProps {
    product: MarketplaceProduct;
    theme: any;
    isDarkMode: boolean;
    borderColor: string;
    hoverScale?: number;
    onPress?: () => void;
    onAddPress?: () => void;
    /**
     * Quantity currently on the open indent, if any.
     * 0 / undefined → not on indent → cart icon shows primary color.
     * > 0 → on indent → cart icon shows green + a small badge.
     */
    indentQuantity?: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({
    product,
    theme,
    isDarkMode,
    borderColor,
    hoverScale = HOVER_SCALE,
    onPress,
    onAddPress,
    indentQuantity,
}) => {
    const hasDiscount =
        !!product.price_discount && product.price_discount.percent > 0;
    const hasQtyDiscount = !!product.quantity_discount;
    const outOfStock = product.stock <= 0;
    const onIndent = (indentQuantity ?? 0) > 0;

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={product.name}
            focusable
            style={({ pressed, hovered }: any) => [
                {
                    backgroundColor: theme.panel,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor,
                    overflow: 'hidden',
                    opacity: pressed ? 0.92 : 1,
                    ...webPointer,
                },
                isWeb && hovered && hoverScale > 1
                    ? {
                        transform: [{ scale: hoverScale }],
                        zIndex: 100,
                        ...cardShadow('strong'),
                    }
                    : null,
                isWeb
                    ? ({ transitionDuration: '160ms' } as any)
                    : null,
            ]}
        >
            {/* ── Cover + floating cart button ─────────── */}
            <View
                style={{
                    aspectRatio: 1,
                    backgroundColor: isDarkMode
                        ? '#0f172a'
                        : '#f1f5f9',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {product.image ? (
                    <Image
                        source={{ uri: product.image }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                    />
                ) : (
                    <View
                        style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Package
                            size={28}
                            color="rgba(148,163,184,0.6)"
                        />
                    </View>
                )}

                {hasDiscount && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                            backgroundColor: '#dc2626',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                color: '#fff',
                                letterSpacing: 0.4,
                            }}
                        >
                            -{product.price_discount!.percent}%
                        </Text>
                    </View>
                )}

                {hasQtyDiscount && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                            backgroundColor: '#16a34a',
                            maxWidth: '58%',
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 9,
                                color: '#fff',
                                letterSpacing: 0.3,
                            }}
                        >
                            {product.quantity_discount!.title.toUpperCase()}
                        </Text>
                    </View>
                )}

                {onAddPress && (
                    <View
                        {...(isWeb
                            ? ({
                                onClick: (e: any) => {
                                    e?.stopPropagation?.();
                                    onAddPress();
                                },
                            } as any)
                            : {
                                onStartShouldSetResponder: () =>
                                    true,
                                onResponderRelease: () =>
                                    onAddPress(),
                            })}
                        accessibilityRole="button"
                        accessibilityLabel={
                            onIndent
                                ? `Edit ${product.name} on indent, ${indentQuantity} units`
                                : `Add ${product.name} to indent`
                        }
                        style={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: onIndent
                                ? '#16a34a'
                                : theme.primary,
                            borderWidth: 2,
                            borderColor: isDarkMode
                                ? '#0f172a'
                                : '#ffffff',
                            ...cardShadow('soft'),
                            ...webPointer,
                        }}
                    >
                        <ShoppingCart size={16} color="#fff" />
                        {onIndent && (
                            <View
                                style={{
                                    position: 'absolute',
                                    top: -6,
                                    right: -6,
                                    minWidth: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    paddingHorizontal: 5,
                                    backgroundColor: '#fff',
                                    borderWidth: 1.5,
                                    borderColor: '#16a34a',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                        color: '#16a34a',
                                        lineHeight: 12,
                                    }}
                                >
                                    {indentQuantity}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>

            {/* ── Details ──────────────────────────────── */}
            <View style={{ padding: 10 }}>
                <Text
                    numberOfLines={1}
                    style={{
                        fontFamily: theme.font.medium,
                        fontSize: 10,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: theme.textDark,
                    }}
                >
                    {product.category_title}
                </Text>

                <Text
                    numberOfLines={2}
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                        color: theme.text,
                        marginTop: 3,
                        minHeight: 36,
                    }}
                >
                    {product.name}
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        marginTop: 6,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.base,
                            color: hasDiscount
                                ? '#dc2626'
                                : theme.primary,
                        }}
                    >
                        KES {product.price.toFixed(2)}
                    </Text>
                    {hasDiscount &&
                        product.original_price > product.price && (
                            <Text
                                numberOfLines={1}
                                style={{
                                    marginLeft: 6,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: 10,
                                    color: theme.textDark,
                                    textDecorationLine:
                                        'line-through',
                                }}
                            >
                                KES{' '}
                                {product.original_price.toFixed(2)}
                            </Text>
                        )}
                    <View style={{ flex: 1 }} />
                    <Text
                        style={{
                            fontFamily: theme.font.regular,
                            fontSize: 10,
                            color: theme.textDark,
                        }}
                    >
                        /{product.unit}
                    </Text>
                </View>

                <Text
                    style={{
                        fontFamily: theme.font.regular,
                        fontSize: 10,
                        color: outOfStock
                            ? '#dc2626'
                            : theme.textDark,
                        marginTop: 3,
                    }}
                >
                    {outOfStock
                        ? 'Out of stock'
                        : `${product.stock.toLocaleString()} in stock`}
                </Text>
            </View>
        </Pressable>
    );
};

/* ════════════════════════════════════════════════════════════
 *  Wholesaler-list helpers (orchestrator)
 * ════════════════════════════════════════════════════════════ */

const WHOLESALER_FOR_RETAILER: Record<string, string> = {
    GeneralRetailer: 'GeneralWholesaler',
    PharmaceuticalRetailer: 'PharmaceuticalWholesaler',
};

interface MarketplaceListProps {
    onItemPress?: (item: EntityItem) => void;
    onContactPress?: (item: EntityItem) => void;
}

const SORTS = [
    { key: 'relevance', label: 'Relevance' },
    { key: 'name-asc', label: 'A→Z' },
    { key: 'name-desc', label: 'Z→A' },
    { key: 'verified', label: 'Verified' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

const ACCENTS = [
    '#fef3c7',
    '#dbeafe',
    '#fce7f3',
    '#e2e8f0',
    '#dcfce7',
    '#fef9c3',
];
const MAX_CONTENT_WIDTH = 720;
const PAGE_SIZE = 15;
const H_PADDING = 12;
const THUMB = 84;
const ALL = 'All';

function pickCover(entity: EntityItem): string | undefined {
    const logo = entity.logos?.[0];
    if (typeof logo === 'string') return logo;
    if (logo && typeof logo === 'object' && 'url' in logo)
        return (logo as any).url;
    const img = entity.images?.[0];
    if (typeof img === 'string') return img;
    if (img && typeof img === 'object' && 'url' in img)
        return (img as any).url;
    return undefined;
}

function countyOf(entity: EntityItem): string | undefined {
    return entity.county_title || entity.county || undefined;
}

function formatLocation(entity: EntityItem): string {
    const parts = [
        entity.town,
        countyOf(entity),
        entity.country_title || entity.country,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Location not set';
}

interface ChipRowProps {
    label: string;
    options: string[];
    value: string;
    onChange: (v: string) => void;
    theme: any;
    borderColor: string;
}

const ChipRow: React.FC<ChipRowProps> = ({
    label,
    options,
    value,
    onChange,
    theme,
    borderColor,
}) => {
    if (options.length <= 1) return null;
    return (
        <View
            style={{ flexDirection: 'row', alignItems: 'center' }}
        >
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: theme.textDark,
                    marginRight: 8,
                }}
            >
                {label}
            </Text>
            <View style={{ flex: 1 }}>
                <FlatList
                    horizontal
                    data={options}
                    keyExtractor={(c) => `${label}-${c}`}
                    showsHorizontalScrollIndicator={false}
                    ItemSeparatorComponent={() => (
                        <View style={{ width: 6 }} />
                    )}
                    renderItem={({ item: c }) => {
                        const active = value === c;
                        return (
                            <TouchableOpacity
                                onPress={() => onChange(c)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                style={{
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
                                        fontSize:
                                            theme.fontSize.xs,
                                        color: active
                                            ? '#fff'
                                            : theme.textDark,
                                    }}
                                >
                                    {c}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        </View>
    );
};

/* ════════════════════════════════════════════════════════════
 *  Orchestrator
 * ════════════════════════════════════════════════════════════ */

export default function MarketplaceListManager({
    onItemPress,
    onContactPress,
}: MarketplaceListProps) {
    const { width: windowWidth } = useWindowDimensions();
    const { theme, isDarkMode, user } = useAuth();
    const insets = useUniversalInsets();
    const {
        generalWholesalers,
        pharmaceuticalWholesalers,
        isEntitiesSyncing,
        isEntitiesRefreshing,
        forceEntitiesRefresh,
    } = useEntitiesSync();

    const retailerType: string | undefined = (user as any)
        ?.entity_type;
    const wholesalerType = retailerType
        ? WHOLESALER_FOR_RETAILER[retailerType]
        : undefined;

    const listings: EntityItem[] = useMemo(() => {
        if (wholesalerType === 'GeneralWholesaler')
            return generalWholesalers;
        if (wholesalerType === 'PharmaceuticalWholesaler')
            return pharmaceuticalWholesalers;
        return [];
    }, [
        wholesalerType,
        generalWholesalers,
        pharmaceuticalWholesalers,
    ]);

    const [search, setSearch] = useState('');
    const [county, setCounty] = useState<string>(ALL);
    const [town, setTown] = useState<string>(ALL);
    const [sort, setSort] = useState<SortKey>('relevance');
    const [isMounted, setIsMounted] = useState(false);
    const [page, setPage] = useState(1);
    const [activeWholesaler, setActiveWholesaler] =
        useState<EntityItem | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);
    useEscapeToClose(!!activeWholesaler, () =>
        setActiveWholesaler(null),
    );

    const width = isMounted ? windowWidth : 375;
    const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    /* ── Filter options ───────────────────────────────────── */

    const countyOptions = useMemo(
        () => [
            ALL,
            ...Array.from(
                new Set(
                    listings
                        .map(countyOf)
                        .filter(Boolean) as string[],
                ),
            ).sort((a, b) => a.localeCompare(b)),
        ],
        [listings],
    );

    const townOptions = useMemo(() => {
        const pool =
            county === ALL
                ? listings
                : listings.filter((e) => countyOf(e) === county);
        return [
            ALL,
            ...Array.from(
                new Set(
                    pool
                        .map((e) => e.town)
                        .filter(Boolean) as string[],
                ),
            ).sort((a, b) => a.localeCompare(b)),
        ];
    }, [listings, county]);

    useEffect(() => {
        if (town !== ALL && !townOptions.includes(town))
            setTown(ALL);
    }, [townOptions, town]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = listings.filter((e) => {
            const matchesQuery =
                !q ||
                `${e.title} ${e.town ?? ''} ${countyOf(e) ?? ''
                    } ${e.country ?? ''} ${e.phone ?? ''} ${e.phone1 ?? ''
                    } ${e.email ?? ''}`
                    .toLowerCase()
                    .includes(q);
            const matchesCounty =
                county === ALL || countyOf(e) === county;
            const matchesTown = town === ALL || e.town === town;
            return matchesQuery && matchesCounty && matchesTown;
        });

        switch (sort) {
            case 'name-asc':
                return [...rows].sort((a, b) =>
                    a.title.localeCompare(b.title),
                );
            case 'name-desc':
                return [...rows].sort((a, b) =>
                    b.title.localeCompare(a.title),
                );
            case 'verified':
                return [...rows].sort(
                    (a, b) =>
                        Number(Boolean(b.is_verified)) -
                        Number(Boolean(a.is_verified)),
                );
            default:
                return rows;
        }
    }, [listings, search, county, town, sort]);

    useEffect(() => {
        setPage(1);
    }, [search, county, town, sort]);

    const visible = useMemo(
        () => filtered.slice(0, page * PAGE_SIZE),
        [filtered, page],
    );
    const hasMore = visible.length < filtered.length;

    const activeFilters =
        (county !== ALL ? 1 : 0) + (town !== ALL ? 1 : 0);
    const clearFilters = () => {
        setCounty(ALL);
        setTown(ALL);
    };

    const handleWholesalerPress = (item: EntityItem) => {
        onItemPress?.(item);
        setActiveWholesaler(item);
    };
    const closeModal = () => setActiveWholesaler(null);

    /* ── Guard: unsupported account type ──────────────────── */

    if (!retailerType || !wholesalerType) {
        return (
            <View
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                    backgroundColor: theme.background,
                }}
            >
                <Package size={32} color={theme.textDark} />
                <Text
                    style={{
                        marginTop: 12,
                        textAlign: 'center',
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.base,
                        color: theme.text,
                    }}
                >
                    Unsupported account type
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        textAlign: 'center',
                        fontFamily: theme.font.regular,
                        fontSize: theme.fontSize.sm,
                        color: theme.textDark,
                    }}
                >
                    {retailerType
                        ? `No wholesaler feed is configured for "${retailerType}".`
                        : 'Your account does not have a retailer entity_type set.'}
                </Text>
            </View>
        );
    }

    const showInitialSpinner =
        isEntitiesSyncing && listings.length === 0;

    /* ── Wholesaler row renderer ──────────────────────────── */

    const renderCard = (item: EntityItem, index: number) => {
        const cover = pickCover(item);
        const accent = ACCENTS[index % ACCENTS.length];
        const phone = item.phone || item.phone1;

        return (
            <Pressable
                onPress={() => handleWholesalerPress(item)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                focusable
                style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    backgroundColor: theme.panel,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor,
                    marginBottom: 10,
                    overflow: 'hidden',
                    opacity: pressed ? 0.9 : 1,
                    ...webPointer,
                    ...(isWeb && hovered
                        ? {
                            transform: [{ scale: 1.005 }],
                            borderColor: theme.primary,
                        }
                        : null),
                    ...(isWeb
                        ? ({ transitionDuration: '150ms' } as any)
                        : null),
                })}
            >
                {/* Thumbnail */}
                <View
                    style={{
                        width: THUMB,
                        minHeight: THUMB,
                        backgroundColor: accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {cover ? (
                        <Image
                            source={{ uri: cover }}
                            style={{
                                width: THUMB,
                                height: '100%',
                            }}
                            resizeMode="cover"
                        />
                    ) : (
                        <Building2
                            size={22}
                            color="rgba(15,23,42,0.35)"
                        />
                    )}
                    {item.is_verified && (
                        <View
                            style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                backgroundColor: '#16a34a',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <BadgeCheck size={10} color="#fff" />
                        </View>
                    )}
                </View>

                {/* Content */}
                <View
                    style={{
                        flex: 1,
                        padding: 10,
                        justifyContent: 'space-between',
                    }}
                >
                    <View>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginBottom: 3,
                            }}
                        >
                            <Tag
                                size={10}
                                color={
                                    isDarkMode
                                        ? '#93c5fd'
                                        : '#1e40af'
                                }
                            />
                            <Text
                                numberOfLines={1}
                                style={{
                                    marginLeft: 4,
                                    fontFamily: theme.font.bold,
                                    fontSize: 9,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                    color: isDarkMode
                                        ? '#93c5fd'
                                        : '#1e40af',
                                }}
                            >
                                {item.entity_type}
                            </Text>
                            {item.entity_code ? (
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        marginLeft: 8,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: 9,
                                        color: theme.textDark,
                                    }}
                                >
                                    #{item.entity_code}
                                </Text>
                            ) : null}
                        </View>

                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                            }}
                        >
                            {item.title}
                        </Text>

                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginTop: 3,
                            }}
                        >
                            <View style={{ marginRight: 4 }}>
                                <Package
                                    size={11}
                                    color={theme.textDark}
                                />
                            </View>
                            <Text
                                numberOfLines={1}
                                style={{
                                    flex: 1,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: theme.fontSize.xs,
                                    color: theme.textDark,
                                }}
                            >
                                {formatLocation(item)}
                            </Text>
                        </View>

                        {phone ? (
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    marginTop: 2,
                                }}
                            >
                                <View style={{ marginRight: 4 }}>
                                    <Phone
                                        size={11}
                                        color={theme.textDark}
                                    />
                                </View>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        flex: 1,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                        color: theme.textDark,
                                    }}
                                >
                                    {phone}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 8,
                        }}
                    >
                        {/* Contact — View (not TouchableOpacity) so it
                            doesn't render as a nested <button> on web. */}
                        <View
                            {...(isWeb
                                ? ({
                                    onClick: (e: any) => {
                                        e?.stopPropagation?.();
                                        onContactPress?.(
                                            item,
                                        );
                                    },
                                } as any)
                                : {
                                    onStartShouldSetResponder:
                                        () => true,
                                    onResponderRelease: () =>
                                        onContactPress?.(
                                            item,
                                        ),
                                })}
                            accessibilityRole="button"
                            accessibilityLabel={`Contact ${item.title}`}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: theme.primary,
                                ...webPointer,
                            }}
                        >
                            <Phone size={11} color="#fff" />
                            <Text
                                style={{
                                    marginLeft: 5,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    color: '#fff',
                                }}
                            >
                                Contact
                            </Text>
                        </View>

                        <ChevronRight
                            size={16}
                            color={theme.textDark}
                        />
                    </View>
                </View>
            </Pressable>
        );
    };

    /* ── Render ───────────────────────────────────────────── */

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: theme.background,
            }}
        >
            {/* ── Toolbar ──────────────────────────────── */}
            <View
                style={{
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    backgroundColor: theme.panel,
                }}
            >
                <View
                    style={{
                        width: contentWidth,
                        alignSelf: 'center',
                        padding: 12,
                    }}
                >
                    {/* Title row */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 10,
                        }}
                    >
                        <View
                            style={{ flex: 1, marginRight: 8 }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                    color: theme.text,
                                }}
                            >
                                Marketplace
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={{
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: theme.fontSize.sm,
                                    color: theme.textDark,
                                }}
                            >
                                {filtered.length}{' '}
                                {filtered.length === 1
                                    ? 'listing'
                                    : 'listings'}{' '}
                                · {wholesalerType}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={forceEntitiesRefresh}
                            disabled={isEntitiesRefreshing}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh listings"
                            activeOpacity={0.8}
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 17,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: subtleBg,
                                opacity: isEntitiesRefreshing
                                    ? 0.6
                                    : 1,
                            }}
                        >
                            <RefreshCw
                                size={15}
                                color={theme.textDark}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Search */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor,
                            backgroundColor: subtleBg,
                            paddingHorizontal: 10,
                            height: 40,
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
                            placeholder="Search name, town, county, phone, email..."
                            placeholderTextColor={theme.textDark}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                            clearButtonMode="while-editing"
                            style={{
                                flex: 1,
                                height: '100%',
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.base,
                                color: theme.text,
                                ...webNoOutline,
                            }}
                        />
                    </View>

                    {/* Filters */}
                    <View style={{ marginBottom: 8 }}>
                        <ChipRow
                            label="County"
                            options={countyOptions}
                            value={county}
                            onChange={setCounty}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>
                    <View style={{ marginBottom: 8 }}>
                        <ChipRow
                            label="Town"
                            options={townOptions}
                            value={town}
                            onChange={setTown}
                            theme={theme}
                            borderColor={borderColor}
                        />
                    </View>

                    {activeFilters > 0 && (
                        <TouchableOpacity
                            onPress={clearFilters}
                            activeOpacity={0.8}
                            style={{
                                alignSelf: 'flex-start',
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 7,
                                backgroundColor: subtleBg,
                                marginBottom: 8,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                    color: theme.primary,
                                }}
                            >
                                Clear {activeFilters}{' '}
                                {activeFilters === 1
                                    ? 'filter'
                                    : 'filters'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Sort pills */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                        }}
                    >
                        <View
                            style={{
                                marginRight: 6,
                                marginBottom: 4,
                            }}
                        >
                            <ArrowUpDown
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 7,
                                        backgroundColor: active
                                            ? subtleBg
                                            : 'transparent',
                                        marginRight: 4,
                                        marginBottom: 4,
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
                </View>
            </View>

            {/* ── List ─────────────────────────────────── */}
            {showInitialSpinner ? (
                <View
                    style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
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
                        Loading {wholesalerType} listings…
                    </Text>
                </View>
            ) : (
                <View
                    style={{
                        flex: 1,
                        width: contentWidth,
                        alignSelf: 'center',
                    }}
                >
                    <FlatList
                        data={visible}
                        keyExtractor={(item) =>
                            resolveEntityId(item) ||
                            String(Math.random())
                        }
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        contentContainerStyle={{
                            padding: H_PADDING,
                            paddingBottom:
                                H_PADDING + 24 + insets.bottom,
                            flexGrow: 1,
                        }}
                        onEndReachedThreshold={0.4}
                        onEndReached={() => {
                            if (hasMore) setPage((p) => p + 1);
                        }}
                        refreshing={isEntitiesRefreshing}
                        onRefresh={forceEntitiesRefresh}
                        ListFooterComponent={
                            hasMore ? (
                                <Text
                                    style={{
                                        textAlign: 'center',
                                        paddingVertical: 16,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.sm,
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
                                    justifyContent: 'center',
                                    alignItems: 'center',
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
                                        textAlign: 'center',
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.base,
                                        color: theme.textDark,
                                    }}
                                >
                                    No {wholesalerType} listings
                                    match your filters.
                                </Text>
                            </View>
                        }
                        renderItem={({ item, index }) =>
                            renderCard(item, index)
                        }
                    />
                </View>
            )}

            {/* ── Full-screen marketplace modal ────────── */}
            <WholesalerMarketplaceModal
                visible={!!activeWholesaler}
                onClose={closeModal}
                wholesalerId={resolveEntityId(activeWholesaler)}
                wholesalerTitle={activeWholesaler?.title}
            />
        </View>
    );
}