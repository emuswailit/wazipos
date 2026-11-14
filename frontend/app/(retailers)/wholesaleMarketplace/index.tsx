// app/(retailers)/wholesaleMarketplace/index.tsx
//
// Wholesale marketplace route.
//
//   1. Find a wholesaler: WholesalerDiscoveryScreen
//      (components/retailers/wholesaleDiscovery) — Near me / All Kenya,
//      county + sub-county filters, search by wholesaler or product.
//   2. Tap one: WholesalerMarketplaceModal shows its products, which can be
//      added to the open retailer indent.
//
// This file also holds what the product views share: the wholesaler
// products hook (useWholesalerProducts), ProductCard and small helpers.
//
// NESTED INTERACTIVES
//   On react-native-web both Pressable and TouchableOpacity render as
//   <button>, and nested <button> elements are invalid HTML. Every
//   interactive element that would otherwise sit inside another one is
//   rendered as a `View` with platform-appropriate handlers:
//     web    → onClick (with stopPropagation)
//     native → onStartShouldSetResponder + onResponderRelease

import wholesalersApi from '@/api/wholesalersApi';
import type { EntityItem } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import {
    Package,
    ShoppingCart,
} from 'lucide-react-native';
import React, {
    useCallback,
    useEffect,
    useState,
} from 'react';
import {
    Image,
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WholesalerDiscoveryScreen from '@/components/retailers/wholesaleDiscovery/WholesalerDiscoveryScreen';

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
 *  Route: find a wholesaler (Near me / All Kenya / search by product),
 *  then open its marketplace. See components/retailers/wholesaleDiscovery.
 * ════════════════════════════════════════════════════════════ */

export default function WholesaleMarketplaceRoute() {
    return <WholesalerDiscoveryScreen />;
}
