// components/retailers/wholesalersMarketPlace/index.tsx
//
// Orchestrator for the wholesaler marketplace.
//
// Top half — the list of wholesalers the logged-in retailer can browse.
// Tapping a row opens the full-screen marketplace modal for that
// wholesaler, where individual products are shown and can be added to
// the current open retailer indent.
//
// RESPONSIVE FILTER LAYOUT
//   Large screens (≥ 768px):
//     Filters render inline inside the toolbar — county picker, sub-county
//     picker, town chips, and sort pills are all visible at once.
//   Small screens (< 768px):
//     The toolbar collapses to just search + a "Filters" button. All
//     filters (county, sub-county, town, sort) move into a slide-up
//     bottom sheet, which is dismissed by tapping the backdrop or
//     pressing "Show N results".
//
// NESTED INTERACTIVES
//   On react-native-web both Pressable and TouchableOpacity render as
//   <button>, and nested <button> elements are invalid HTML. Every
//   interactive element that would otherwise sit inside another one is
//   rendered as a `View` with platform-appropriate handlers:
//     web    → onClick (with stopPropagation)
//     native → onStartShouldSetResponder + onResponderRelease

import wholesalersApi from '@/api/wholesalersApi';
import LocationFilterBar from '@/components/common/LocationFilterBar';
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
    SlidersHorizontal,
    Tag,
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
    Image,
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
const H_PADDING_DESKTOP = 12;
const H_PADDING_MOBILE = 10;
const THUMB_DESKTOP = 84;
const THUMB_MOBILE = 64;
const ALL = 'All';
const LARGE_SCREEN_MIN_WIDTH = 768;

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

/* ════════════════════════════════════════════════════════════
 *  Chip row — town pills
 * ════════════════════════════════════════════════════════════ */

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
        <View>
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: theme.textDark,
                    marginBottom: 6,
                }}
            >
                {label}
            </Text>
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
                                paddingVertical: 6,
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
    );
};

/* ════════════════════════════════════════════════════════════
 *  Sort pills row
 * ════════════════════════════════════════════════════════════ */

interface SortRowProps {
    value: SortKey;
    onChange: (k: SortKey) => void;
    theme: any;
    subtleBg: string;
}

const SortRow: React.FC<SortRowProps> = ({
    value,
    onChange,
    theme,
    subtleBg,
}) => {
    return (
        <View>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 6,
                }}
            >
                <ArrowUpDown
                    size={12}
                    color={theme.textDark}
                    style={{ marginRight: 6 }}
                />
                <Text
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 10,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: theme.textDark,
                    }}
                >
                    Sort
                </Text>
            </View>
            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                }}
            >
                {SORTS.map((s) => {
                    const active = value === s.key;
                    return (
                        <TouchableOpacity
                            key={s.key}
                            onPress={() => onChange(s.key)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 7,
                                backgroundColor: active
                                    ? subtleBg
                                    : 'transparent',
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: active
                                        ? theme.font.bold
                                        : theme.font.regular,
                                    fontSize: theme.fontSize.xs,
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
    const [town, setTown] = useState<string>(ALL);
    const [sort, setSort] = useState<SortKey>('relevance');
    const [isMounted, setIsMounted] = useState(false);
    const [activeWholesaler, setActiveWholesaler] =
        useState<EntityItem | null>(null);

    /* ── Location filter (county + sub-county, UUID-based) ── */
    const [locationCountyId, setLocationCountyId] =
        useState<string>('');
    const [locationSubCountyId, setLocationSubCountyId] =
        useState<string>('');

    /* ── Mobile filters bottom sheet ──────────────────────── */
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);
    useEscapeToClose(!!activeWholesaler, () =>
        setActiveWholesaler(null),
    );

    const width = isMounted ? windowWidth : 375;
    const isLargeScreen = width >= LARGE_SCREEN_MIN_WIDTH;
    const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);
    const H_PADDING = isLargeScreen
        ? H_PADDING_DESKTOP
        : H_PADDING_MOBILE;
    const THUMB = isLargeScreen ? THUMB_DESKTOP : THUMB_MOBILE;

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    /* ── Town options — narrowed by the county picker ─── */
    const townOptions = useMemo(() => {
        const pool = locationCountyId
            ? listings.filter(
                (e) => e.county === locationCountyId
            )
            : listings;
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
    }, [listings, locationCountyId]);

    useEffect(() => {
        if (town !== ALL && !townOptions.includes(town))
            setTown(ALL);
    }, [townOptions, town]);

    /* ── Filter + sort ────────────────────────────────────── */

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

            const matchesLocationCounty =
                !locationCountyId ||
                e.county === locationCountyId;

            const matchesLocationSubCounty =
                !locationSubCountyId ||
                e.sub_county === locationSubCountyId;

            const matchesTownChip =
                town === ALL || e.town === town;

            return (
                matchesQuery &&
                matchesLocationCounty &&
                matchesLocationSubCounty &&
                matchesTownChip
            );
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
    }, [
        listings,
        search,
        locationCountyId,
        locationSubCountyId,
        town,
        sort,
    ]);

    const activeFilters =
        (locationCountyId ? 1 : 0) +
        (locationSubCountyId ? 1 : 0) +
        (town !== ALL ? 1 : 0);

    const clearFilters = () => {
        setTown(ALL);
        setLocationCountyId('');
        setLocationSubCountyId('');
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
                    borderRadius: isLargeScreen ? 14 : 12,
                    borderWidth: 1,
                    borderColor,
                    marginBottom: isLargeScreen ? 10 : 8,
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
                            size={isLargeScreen ? 22 : 18}
                            color="rgba(15,23,42,0.35)"
                        />
                    )}
                    {item.is_verified && (
                        <View
                            style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                width: isLargeScreen ? 18 : 16,
                                height: isLargeScreen ? 18 : 16,
                                borderRadius: isLargeScreen ? 9 : 8,
                                backgroundColor: '#16a34a',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <BadgeCheck
                                size={isLargeScreen ? 10 : 9}
                                color="#fff"
                            />
                        </View>
                    )}
                </View>

                {/* Content */}
                <View
                    style={{
                        flex: 1,
                        padding: isLargeScreen ? 10 : 8,
                        justifyContent: 'space-between',
                    }}
                >
                    <View>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginBottom: 2,
                            }}
                        >
                            <Tag
                                size={isLargeScreen ? 10 : 9}
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
                                    fontSize: isLargeScreen ? 9 : 8,
                                    letterSpacing: 0.5,
                                    textTransform: 'uppercase',
                                    color: isDarkMode
                                        ? '#93c5fd'
                                        : '#1e40af',
                                }}
                            >
                                {item.entity_type}
                            </Text>
                            {item.entity_code && isLargeScreen ? (
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
                                fontSize: isLargeScreen
                                    ? theme.fontSize.base
                                    : theme.fontSize.sm,
                                color: theme.text,
                            }}
                        >
                            {item.title}
                        </Text>

                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginTop: 2,
                            }}
                        >
                            <View style={{ marginRight: 4 }}>
                                <Package
                                    size={isLargeScreen ? 11 : 10}
                                    color={theme.textDark}
                                />
                            </View>
                            <Text
                                numberOfLines={1}
                                style={{
                                    flex: 1,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: isLargeScreen
                                        ? theme.fontSize.xs
                                        : 10,
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
                                    marginTop: 1,
                                }}
                            >
                                <View style={{ marginRight: 4 }}>
                                    <Phone
                                        size={
                                            isLargeScreen ? 11 : 10
                                        }
                                        color={theme.textDark}
                                    />
                                </View>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        flex: 1,
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize: isLargeScreen
                                            ? theme.fontSize.xs
                                            : 10,
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
                            marginTop: isLargeScreen ? 8 : 6,
                        }}
                    >
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
                                paddingHorizontal: isLargeScreen
                                    ? 10
                                    : 8,
                                paddingVertical: isLargeScreen
                                    ? 5
                                    : 4,
                                borderRadius: 8,
                                backgroundColor: theme.primary,
                                ...webPointer,
                            }}
                        >
                            <Phone
                                size={isLargeScreen ? 11 : 10}
                                color="#fff"
                            />
                            <Text
                                style={{
                                    marginLeft: 5,
                                    fontFamily: theme.font.bold,
                                    fontSize: isLargeScreen ? 11 : 10,
                                    color: '#fff',
                                }}
                            >
                                Contact
                            </Text>
                        </View>

                        <ChevronRight
                            size={isLargeScreen ? 16 : 14}
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
                position: 'relative',
            }}
        >
            {/* ── Toolbar ──────────────────────────────── */}
            <View
                style={{
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    backgroundColor: theme.panel,
                    position: 'relative',
                    zIndex: 10,
                    ...({ overflow: 'visible' } as any),
                }}
            >
                <View
                    style={{
                        width: contentWidth,
                        alignSelf: 'center',
                        paddingHorizontal: H_PADDING,
                        paddingTop: 10,
                        paddingBottom: 8,
                        position: 'relative',
                        ...({ overflow: 'visible' } as any),
                    }}
                >
                    {/* Title row */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                        }}
                    >
                        <View
                            style={{ flex: 1, marginRight: 8 }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: isLargeScreen
                                        ? theme.fontSize.lg
                                        : theme.fontSize.base,
                                    color: theme.text,
                                    letterSpacing: -0.3,
                                }}
                            >
                                Marketplace
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={{
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize: isLargeScreen
                                        ? theme.fontSize.sm
                                        : 11,
                                    color: theme.textDark,
                                }}
                            >
                                {filtered.length}{' '}
                                {filtered.length === 1
                                    ? 'listing'
                                    : 'listings'}
                                {isLargeScreen
                                    ? ` · ${wholesalerType}`
                                    : ''}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={forceEntitiesRefresh}
                            disabled={isEntitiesRefreshing}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh listings"
                            activeOpacity={0.8}
                            style={{
                                width: isLargeScreen ? 34 : 30,
                                height: isLargeScreen ? 34 : 30,
                                borderRadius: isLargeScreen
                                    ? 17
                                    : 15,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: subtleBg,
                                opacity: isEntitiesRefreshing
                                    ? 0.6
                                    : 1,
                            }}
                        >
                            <RefreshCw
                                size={isLargeScreen ? 15 : 14}
                                color={theme.textDark}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Search row — small screens pair search + Filters */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        <View
                            style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor: subtleBg,
                                paddingHorizontal: 10,
                                height: isLargeScreen ? 40 : 38,
                                marginRight: isLargeScreen ? 0 : 8,
                            }}
                        >
                            <View style={{ marginRight: 8 }}>
                                <Search
                                    size={isLargeScreen ? 15 : 14}
                                    color={theme.textDark}
                                />
                            </View>
                            <TextInput
                                placeholder="Search name, town, county..."
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
                                    fontSize: isLargeScreen
                                        ? theme.fontSize.base
                                        : theme.fontSize.sm,
                                    color: theme.text,
                                    ...webNoOutline,
                                }}
                            />
                        </View>

                        {/* Mobile-only Filters button */}
                        {!isLargeScreen && (
                            <TouchableOpacity
                                onPress={() =>
                                    setFiltersSheetOpen(true)
                                }
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Open filters"
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingHorizontal: 12,
                                    height: 38,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor:
                                        activeFilters > 0
                                            ? theme.primary
                                            : borderColor,
                                    backgroundColor:
                                        activeFilters > 0
                                            ? `${theme.primary}15`
                                            : 'transparent',
                                }}
                            >
                                <SlidersHorizontal
                                    size={14}
                                    color={
                                        activeFilters > 0
                                            ? theme.primary
                                            : theme.textDark
                                    }
                                />
                                <Text
                                    style={{
                                        marginLeft: 6,
                                        fontFamily: theme.font.bold,
                                        fontSize: 12,
                                        color:
                                            activeFilters > 0
                                                ? theme.primary
                                                : theme.textDark,
                                    }}
                                >
                                    Filters
                                </Text>
                                {activeFilters > 0 && (
                                    <View
                                        style={{
                                            marginLeft: 6,
                                            minWidth: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            paddingHorizontal: 5,
                                            backgroundColor:
                                                theme.primary,
                                            alignItems: 'center',
                                            justifyContent:
                                                'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 10,
                                                color: '#fff',
                                                lineHeight: 12,
                                            }}
                                        >
                                            {activeFilters}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* ── Inline filters (large screens only) ── */}
                    {isLargeScreen && (
                        <>
                            <View
                                style={{
                                    marginBottom: 8,
                                    position: 'relative',
                                    zIndex: 100,
                                    ...({
                                        overflow: 'visible',
                                    } as any),
                                }}
                            >
                                <LocationFilterBar
                                    county={locationCountyId}
                                    subCounty={locationSubCountyId}
                                    onChangeCounty={(id) =>
                                        setLocationCountyId(id)
                                    }
                                    onChangeSubCounty={(id) =>
                                        setLocationSubCountyId(id)
                                    }
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    countyLabel="Filter by county"
                                    subCountyLabel="Filter by sub-county"
                                    gap={8}
                                />
                            </View>

                            <View style={{ marginBottom: 6 }}>
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
                                        paddingHorizontal: 9,
                                        paddingVertical: 3,
                                        borderRadius: 7,
                                        backgroundColor: subtleBg,
                                        marginBottom: 6,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.xs,
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

                            <SortRow
                                value={sort}
                                onChange={setSort}
                                theme={theme}
                                subtleBg={subtleBg}
                            />
                        </>
                    )}

                    {/* ── Active filter pills (small screens only) ── */}
                    {!isLargeScreen && activeFilters > 0 && (
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 4,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    color: theme.textDark,
                                    marginRight: 2,
                                }}
                            >
                                {activeFilters}{' '}
                                {activeFilters === 1
                                    ? 'filter'
                                    : 'filters'}
                            </Text>
                            <TouchableOpacity
                                onPress={clearFilters}
                                activeOpacity={0.8}
                                style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 999,
                                    backgroundColor: `${theme.primary}15`,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 10,
                                        color: theme.primary,
                                    }}
                                >
                                    Clear all
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {/* ── List ─────────────────────────────────── */}
            {showInitialSpinner ? (
                <View
                    style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        position: 'relative',
                        zIndex: 1,
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
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    <FlatList
                        data={filtered}
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
                        refreshing={isEntitiesRefreshing}
                        onRefresh={forceEntitiesRefresh}
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

            {/* ═══ Filters bottom sheet (small screens) ══════ */}
            <Modal
                visible={filtersSheetOpen}
                transparent
                animationType="slide"
                onRequestClose={() =>
                    setFiltersSheetOpen(false)
                }
                statusBarTranslucent
            >
                <Pressable
                    onPress={() => setFiltersSheetOpen(false)}
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
                            maxHeight: '85%',
                            paddingBottom: insets.bottom,
                        }}
                    >
                        {/* Drag handle */}
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

                        {/* Header */}
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
                                    fontSize: theme.fontSize.lg,
                                    color: theme.text,
                                }}
                            >
                                Filters
                            </Text>
                            <TouchableOpacity
                                onPress={() =>
                                    setFiltersSheetOpen(false)
                                }
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="Close filters"
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

                        {/* Scrollable body */}
                        <ScrollView
                            contentContainerStyle={{
                                padding: 16,
                                gap: 16,
                            }}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <LocationFilterBar
                                county={locationCountyId}
                                subCounty={locationSubCountyId}
                                onChangeCounty={(id) =>
                                    setLocationCountyId(id)
                                }
                                onChangeSubCounty={(id) =>
                                    setLocationSubCountyId(id)
                                }
                                theme={theme}
                                isDarkMode={isDarkMode}
                                countyLabel="Filter by county"
                                subCountyLabel="Filter by sub-county"
                                gap={12}
                            />

                            <ChipRow
                                label="Town"
                                options={townOptions}
                                value={town}
                                onChange={setTown}
                                theme={theme}
                                borderColor={borderColor}
                            />

                            <SortRow
                                value={sort}
                                onChange={setSort}
                                theme={theme}
                                subtleBg={subtleBg}
                            />
                        </ScrollView>

                        {/* Footer CTA */}
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                                paddingHorizontal: 16,
                                paddingTop: 12,
                                paddingBottom: 12,
                                borderTopWidth: 1,
                                borderTopColor: borderColor,
                                backgroundColor: theme.panel,
                            }}
                        >
                            {activeFilters > 0 ? (
                                <TouchableOpacity
                                    onPress={clearFilters}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    style={{
                                        paddingHorizontal: 14,
                                        height: 44,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: borderColor,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 13,
                                            color: theme.textDark,
                                        }}
                                    >
                                        Clear all
                                    </Text>
                                </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity
                                onPress={() =>
                                    setFiltersSheetOpen(false)
                                }
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                style={{
                                    flex: 1,
                                    height: 44,
                                    borderRadius: 10,
                                    backgroundColor: theme.primary,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 14,
                                        color: '#fff',
                                    }}
                                >
                                    Show {filtered.length}{' '}
                                    {filtered.length === 1
                                        ? 'result'
                                        : 'results'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

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