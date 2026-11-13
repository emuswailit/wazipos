// components/shoppers/RetailerShopFrontWeb.tsx
import type { DeliveryMethod } from "@/components/common/DeliveryMethodSelector";
import RecordPaymentModal from "@/components/common/RecordPaymentModal";
import { useAuth } from "@/context/AuthContext";
import { useShopperCart } from "@/context/ShopperCartContext";
import type { CustomerOrder, RetailerReceipt } from "@/databases/types";
import { useEmployees } from "@/hooks/useEmployees";
import {
    CUSTOMER_PAYMENT_CONFIG,
    type RecordPaymentConfig,
} from "@/hooks/useRecordPayment";
import {
    getReceiptCategory,
    getReceiptDiscountPercent,
    getReceiptImage,
    getReceiptKey,
    getReceiptName,
    getReceiptOriginalPrice,
    getReceiptPrice,
    getReceiptStock,
    InventorySortKey,
    useRetailerInventory,
} from "@/hooks/useRetailerInventory";
import { useRuntimeClass } from "@/hooks/useRuntimeClass";
import {
    ArrowDownUp,
    ArrowLeft,
    Building2,
    Check,
    LayoutGrid,
    Package,
    Search,
    ShoppingCart,
    SlidersHorizontal,
    X,
} from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    LayoutChangeEvent,
    Modal,
    Platform,
    Pressable, // 🟢 GUARANTEED IMPORT
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import retailersApi from "@/api/retailersApi";
import { useApi } from "@/hooks/useApi";

import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";

import RetailerCartPanel, {
    type CustomerAddress,
} from "./RetailerCartPanel";
import RetailerQuantityModal from "./RetailerQuantityModal";
import type { RetailerShopFrontProps } from "./RetailerShopFront";

type AppTheme = ReturnType<typeof useAuth>["theme"];

type Courier = { id: string; entity_title: string };
type CollectionPoint = {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
};

interface ExtendedProps extends RetailerShopFrontProps {
    retailerLat?: number;
    retailerLng?: number;
}

const isWeb = Platform.OS === "web";
const webNoOutline = isWeb ? ({ outlineStyle: "none" } as any) : undefined;

const TABLET_BREAKPOINT = 640;
const THREE_COLUMN_BREAKPOINT = 1200;
const CATEGORIES_RAIL_WIDTH = 260;
const CART_PANEL_WIDTH = 340;
const H_PADDING_DESKTOP = 24;
const H_PADDING_MOBILE = 16;
const GRID_GAP_DESKTOP = 18;
const GRID_GAP_MOBILE = 14;
const HOVER_SCALE = 1.12;
const HOVER_OUT_DELAY_MS = 60;
const IMAGE_ASPECT_RATIO = 0.65;
const SUCCESS = "#16a34a";
const NARROW_COLUMNS = 2;

const SORTS: { key: InventorySortKey; label: string }[] = [
    { key: "relevance", label: "Featured" },
    { key: "price-asc", label: "Price · Low" },
    { key: "price-desc", label: "Price · High" },
    { key: "name-asc", label: "A→Z" },
    { key: "stock", label: "In stock" },
];

const extractArray = (res: any, expectedKey: string): any[] => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.[expectedKey])) return res.data[expectedKey];
    if (Array.isArray(res.data?.results)) return res.data.results;
    if (Array.isArray(res.data?.data)) return res.data.data;
    if (Array.isArray(res[expectedKey])) return res[expectedKey];
    if (Array.isArray(res.results)) return res.results;
    return [];
};

const ProductImage: React.FC<{
    uri?: string;
    width: number;
    height: number;
    isDarkMode: boolean;
}> = ({ uri, width, height, isDarkMode }) => {
    const [errored, setErrored] = useState(false);
    useEffect(() => {
        setErrored(false);
    }, [uri]);
    const showImage = uri && !errored;
    const backdrop = isDarkMode ? "#111827" : "#f4f6f8";

    return (
        <View
            className="items-center justify-center overflow-hidden"
            style={{ width, height, backgroundColor: backdrop }}
        >
            {showImage ? (
                <Image
                    source={{ uri }}
                    style={{ width, height }}
                    resizeMode="contain"
                    onError={() => setErrored(true)}
                />
            ) : (
                <Package
                    size={Math.max(22, Math.min(width, height) * 0.22)}
                    color={
                        isDarkMode
                            ? "rgba(148,163,184,0.4)"
                            : "rgba(100,116,139,0.35)"
                    }
                    strokeWidth={1.5}
                />
            )}
        </View>
    );
};

interface ProductCardProps {
    product: RetailerReceipt;
    width: number;
    theme: AppTheme;
    isDarkMode: boolean;
    borderColor: string;
    inCartQuantity: number;
    onAddToCart: (receipt: RetailerReceipt) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
    product,
    width,
    theme,
    isDarkMode,
    borderColor,
    inCartQuantity,
    onAddToCart,
}) => {
    const [hovered, setHovered] = useState(false);
    const hoverOutTimer = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (hoverOutTimer.current) clearTimeout(hoverOutTimer.current);
        };
    }, []);

    const name = getReceiptName(product);
    const category = getReceiptCategory(product);
    const price = getReceiptPrice(product);
    const originalPrice = getReceiptOriginalPrice(product);
    const discountPercent = getReceiptDiscountPercent(product);
    const stock = getReceiptStock(product);
    const image = getReceiptImage(product);
    const unit = product.unit_of_receipt || "unit";

    const imageHeight = Math.round(width * IMAGE_ASPECT_RATIO);

    const hasDiscount =
        discountPercent > 0 && originalPrice > 0 && originalPrice > price;
    const outOfStock = stock <= 0;
    const lowStock = !outOfStock && stock <= 5;
    const onCart = inCartQuantity > 0;

    const handleHoverIn = () => {
        if (hoverOutTimer.current) {
            clearTimeout(hoverOutTimer.current);
            hoverOutTimer.current = null;
        }
        setHovered(true);
    };

    const handleHoverOut = () => {
        if (hoverOutTimer.current) clearTimeout(hoverOutTimer.current);
        hoverOutTimer.current = setTimeout(
            () => setHovered(false),
            HOVER_OUT_DELAY_MS,
        );
    };

    const handleAdd = () => {
        if (outOfStock) return;
        onAddToCart(product);
    };

    const hoverTransform =
        isWeb && hovered
            ? { transform: [{ scale: HOVER_SCALE }], zIndex: 100 }
            : { zIndex: 1 };

    const ctaBackground = outOfStock
        ? isDarkMode
            ? "#1e293b"
            : "#e2e8f0"
        : onCart
            ? SUCCESS
            : isWeb && hovered
                ? theme.primary
                : isDarkMode
                    ? "#1e40af"
                    : theme.primary;
    const ctaForeground = outOfStock
        ? isDarkMode
            ? "#475569"
            : "#94a3b8"
        : "#fff";
    const ctaLabel = outOfStock
        ? "Unavailable"
        : onCart
            ? `In cart · ${inCartQuantity}`
            : "Add to cart";

    return (
        <View
            className="relative cursor-pointer"
            style={{
                width,
                ...(isWeb ? ({ transitionDuration: "180ms" } as any) : null),
                ...hoverTransform,
            }}
            {...(isWeb
                ? ({
                    onMouseEnter: handleHoverIn,
                    onMouseLeave: handleHoverOut,
                } as any)
                : {})}
        >
            <Pressable
                onPress={handleAdd}
                disabled={outOfStock}
                accessibilityRole="button"
                accessibilityLabel={`${name}, KES ${price.toFixed(0)}`}
                className="rounded-xl border overflow-hidden"
                style={{
                    backgroundColor: theme.panel,
                    borderColor: isWeb && hovered ? theme.primary : borderColor,
                    ...(isWeb ? ({ transitionDuration: "180ms" } as any) : null),
                    ...(isWeb && hovered
                        ? {
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 12 },
                            shadowOpacity: isDarkMode ? 0.5 : 0.18,
                            shadowRadius: 24,
                            elevation: 12,
                        }
                        : {
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: isDarkMode ? 0.2 : 0.04,
                            shadowRadius: 3,
                            elevation: 1,
                        }),
                }}
            >
                <View className="relative">
                    <ProductImage
                        uri={image}
                        width={width}
                        height={imageHeight}
                        isDarkMode={isDarkMode}
                    />
                    {hasDiscount && (
                        <View
                            className="absolute top-2 left-2 px-2 py-1 rounded-full"
                            style={{
                                backgroundColor: "#dc2626",
                                shadowColor: "#dc2626",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 4,
                            }}
                        >
                            <Text
                                className="text-[10px] font-bold text-white tracking-wider leading-3"
                                style={{ fontFamily: theme.font.bold }}
                            >
                                −{discountPercent}%
                            </Text>
                        </View>
                    )}
                    {onCart && (
                        <View
                            className="absolute top-2 right-2 min-w-[28px] h-7 rounded-full px-2 flex-row items-center justify-center"
                            style={{
                                backgroundColor: SUCCESS,
                                shadowColor: SUCCESS,
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 4,
                            }}
                        >
                            <ShoppingCart size={11} color="#fff" />
                            <Text
                                className="ml-1 text-[11px] font-bold text-white leading-3"
                                style={{ fontFamily: theme.font.bold }}
                            >
                                {inCartQuantity}
                            </Text>
                        </View>
                    )}
                    {outOfStock && (
                        <View
                            className="absolute inset-0 items-center justify-center"
                            style={{
                                backgroundColor: isDarkMode
                                    ? "rgba(15,23,42,0.72)"
                                    : "rgba(255,255,255,0.72)",
                            }}
                        >
                            <View
                                className="px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: "#dc2626" }}
                            >
                                <Text
                                    className="text-[10px] font-bold text-white tracking-widest uppercase"
                                    style={{ fontFamily: theme.font.bold }}
                                >
                                    Out of stock
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
                <View className="p-2.5">
                    <Text
                        className="text-[9px] font-semibold tracking-wider uppercase opacity-75"
                        style={{
                            fontFamily: theme.font.semibold,
                            color: theme.textDark,
                        }}
                    >
                        {category}
                    </Text>
                    <Text
                        className="text-[13px] font-semibold leading-[17px] mt-1 min-h-[32px]"
                        style={{
                            fontFamily: theme.font.semibold,
                            color: theme.text,
                        }}
                        numberOfLines={2}
                    >
                        {name}
                    </Text>
                    <View className="flex-row items-baseline mt-1">
                        <Text
                            className="text-[15px] font-bold tracking-tight"
                            style={{
                                fontFamily: theme.font.bold,
                                color: hasDiscount ? "#dc2626" : theme.text,
                            }}
                        >
                            KES {price.toFixed(0)}
                        </Text>
                        {hasDiscount && (
                            <Text
                                className="ml-1.5 text-[11px] line-through opacity-75"
                                style={{
                                    fontFamily: theme.font.regular,
                                    color: theme.textDark,
                                }}
                            >
                                {originalPrice.toFixed(0)}
                            </Text>
                        )}
                        <View className="flex-1" />
                        <Text
                            className="text-[10px] opacity-75"
                            style={{
                                fontFamily: theme.font.regular,
                                color: theme.textDark,
                            }}
                        >
                            /{unit}
                        </Text>
                    </View>
                    <View className="flex-row items-center mt-1">
                        <View
                            className="w-1.5 h-1.5 rounded-full mr-1.5"
                            style={{
                                backgroundColor: outOfStock
                                    ? "#dc2626"
                                    : lowStock
                                        ? "#f59e0b"
                                        : SUCCESS,
                            }}
                        />
                        <Text
                            className="text-[10px] font-medium"
                            style={{
                                fontFamily: theme.font.medium,
                                color: outOfStock
                                    ? "#dc2626"
                                    : lowStock
                                        ? "#f59e0b"
                                        : theme.textDark,
                                opacity: outOfStock || lowStock ? 1 : 0.85,
                            }}
                        >
                            {outOfStock
                                ? "Currently unavailable"
                                : lowStock
                                    ? `Only ${stock} left`
                                    : `${stock.toLocaleString()} in stock`}
                        </Text>
                    </View>
                    <View
                        className="mt-2 h-8 rounded-lg flex-row items-center justify-center"
                        style={{
                            backgroundColor: ctaBackground,
                            opacity: outOfStock ? 0.6 : 1,
                            ...(isWeb
                                ? ({ transitionDuration: "160ms" } as any)
                                : null),
                        }}
                    >
                        <ShoppingCart size={13} color={ctaForeground} />
                        <Text
                            className="ml-1.5 text-[12px] font-semibold tracking-wide"
                            style={{
                                fontFamily: theme.font.semibold,
                                color: ctaForeground,
                            }}
                        >
                            {ctaLabel}
                        </Text>
                    </View>
                </View>
            </Pressable>
        </View>
    );
};

const CategoriesRail: React.FC<{
    categories: { name: string; count: number }[];
    selected: string;
    onSelect: (name: string) => void;
    theme: AppTheme;
    isDarkMode: boolean;
}> = ({ categories, selected, onSelect, theme, isDarkMode }) => {
    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";
    const all = categories.find((c) => c.name === "All");
    const rest = categories.filter((c) => c.name !== "All");

    const renderItem = (
        item: { name: string; count: number },
        isFirst = false,
    ) => {
        const active = selected === item.name;
        return (
            <TouchableOpacity
                key={item.name}
                onPress={() => onSelect(item.name)}
                activeOpacity={0.8}
                className={`flex-row items-center px-4 py-2.5 cursor-pointer ${!isFirst ? "border-t" : ""}`}
                style={{
                    borderTopColor: isDarkMode ? "#111827" : "#f4f6f8",
                    backgroundColor: active
                        ? isDarkMode
                            ? "rgba(59,130,246,0.08)"
                            : "rgba(0,86,179,0.05)"
                        : "transparent",
                }}
            >
                <View
                    className="w-[15px] h-[15px] rounded border-[1.5px] items-center justify-center mr-2.5 shrink-0"
                    style={{
                        borderColor: active ? theme.primary : borderColor,
                        backgroundColor: active ? theme.primary : "transparent",
                    }}
                >
                    {active && <Check size={10} color="#fff" strokeWidth={3} />}
                </View>
                <Text
                    className="flex-1 text-[11px] leading-[14px] tracking-wide uppercase"
                    style={{
                        fontFamily: active
                            ? theme.font.semibold
                            : theme.font.regular,
                        color: active ? theme.text : theme.textDark,
                    }}
                    numberOfLines={2}
                >
                    {item.name}
                </Text>
                <Text
                    className="ml-2 text-[10px] shrink-0"
                    style={{
                        fontFamily: theme.font.medium,
                        color: theme.textDark,
                        opacity: active ? 1 : 0.7,
                    }}
                >
                    {item.count}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View
            className="flex-1 border-r overflow-hidden"
            style={{ backgroundColor: theme.panel, borderRightColor: borderColor }}
        >
            <View
                className="flex-row items-center px-4 py-3 border-b"
                style={{ borderBottomColor: borderColor }}
            >
                <LayoutGrid size={12} color={theme.textDark} />
                <Text
                    className="ml-1.5 text-[10px] font-bold tracking-wider uppercase"
                    style={{ fontFamily: theme.font.bold, color: theme.textDark }}
                >
                    Categories
                </Text>
            </View>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 16 }}
                showsVerticalScrollIndicator
            >
                {all && renderItem(all, true)}
                {rest.map((c) => renderItem(c))}
            </ScrollView>
        </View>
    );
};

export default function RetailerShopFrontWeb({
    retailerId,
    retailerName,
    retailerType,
    retailerLocation,
    onBack,
    retailerLat = 0.0,
    retailerLng = 0.0,
}: ExtendedProps) {
    const { theme, isDarkMode } = useAuth();
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const runtimeClass = useRuntimeClass();
    const isMobileWeb = runtimeClass === "mobile-web";
    const isDesktopWeb = runtimeClass === "desktop-web";
    const cart = useShopperCart();

    const [productsColumnWidth, setProductsColumnWidth] = useState(0);
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
    const [cartSheetOpen, setCartSheetOpen] = useState(false);
    const [modalProduct, setModalProduct] = useState<RetailerReceipt | null>(null);
    const [payingOrder, setPayingOrder] = useState<CustomerOrder | null>(null);

    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("PICKUP");
    const [isRetailerDelivery, setIsRetailerDelivery] = useState(false);
    const [selectedDeliveryEmployeeId, setSelectedDeliveryEmployeeId] = useState<string | null>(null);

    const { employees: deliveryEmployees, isLoading: deliveryEmployeesLoading } = useEmployees(isRetailerDelivery && !!retailerId); // fetch delivery staff only when retailer delivery is chosen

    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [couriersLoading, setCouriersLoading] = useState(false);
    const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);

    const [deliveryEntities, setDeliveryEntities] = useState<Courier[]>([]);
    const [deliveryEntitiesLoading, setDeliveryEntitiesLoading] = useState(false);
    const [selectedDeliveryEntityId, setSelectedDeliveryEntityId] =
        useState<string | null>(null);

    const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>([]);
    const [pointsLoading, setPointsLoading] = useState(false);
    const [selectedCollectionPoint, setSelectedCollectionPoint] =
        useState<CollectionPoint | null>(null);

    const [customerAddress, setCustomerAddress] = useState<CustomerAddress | null>(
        null,
    );

    const [shippingCost, setShippingCost] = useState<number | null>(null);
    const [shippingLoading, setShippingLoading] = useState(false);
    const [shippingError, setShippingError] = useState<string | null>(null);

    const [apiError, setApiError] = useState<{
        isOpen: boolean;
        title: string;
        envelope: any | null;
        fallbackMessage: string | null;
        onRetry?: () => void;
    }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    const [retryKey, setRetryKey] = useState(0);

    const fetchApi = useApi<any>(
        async (payload: any) => await retailersApi.retailerReceiptsAction(payload),
    );
    const fetchApiRef = useRef(fetchApi);
    fetchApiRef.current = fetchApi;

    useEffect(() => {
        if (deliveryMethod !== "COURIER") return;
        let cancelled = false;
        (async () => {
            setCouriersLoading(true);
            try {
                const res = await fetchApiRef.current.request({
                    action: "GetCourierEntities",
                });
                if (!cancelled) {
                    const env = extractEnvelope(res);
                    if (String(env.response_code) !== "0") {
                        setApiError({
                            isOpen: true,
                            title: "Couriers Unavailable",
                            envelope: env,
                            fallbackMessage: null,
                            onRetry: () => setRetryKey((k) => k + 1),
                        });
                    } else {
                        const results = extractArray(res, "couriers");
                        setCouriers(results);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    setApiError({
                        isOpen: true,
                        title: "Connection Error",
                        envelope: null,
                        fallbackMessage: err?.message || "Could not reach the server to load couriers.",
                        onRetry: () => setRetryKey((k) => k + 1),
                    });
                }
            } finally {
                if (!cancelled) setCouriersLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [deliveryMethod, retryKey]);

    useEffect(() => {
        if (deliveryMethod !== "DELIVERY") return;
        let cancelled = false;
        (async () => {
            setDeliveryEntitiesLoading(true);
            try {
                const res = await fetchApiRef.current.request({
                    action: "GetDeliveryEntities",
                });
                if (!cancelled) {
                    const env = extractEnvelope(res);
                    if (String(env.response_code) !== "0") {
                        setApiError({
                            isOpen: true,
                            title: "Transporters Unavailable",
                            envelope: env,
                            fallbackMessage: null,
                            onRetry: () => setRetryKey((k) => k + 1),
                        });
                    } else {
                        const results = extractArray(res, "couriers");
                        setDeliveryEntities(results);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    setApiError({
                        isOpen: true,
                        title: "Connection Error",
                        envelope: null,
                        fallbackMessage: err?.message || "Could not reach the server to load transporters.",
                        onRetry: () => setRetryKey((k) => k + 1),
                    });
                }
            } finally {
                if (!cancelled) setDeliveryEntitiesLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [deliveryMethod, retryKey]);

    useEffect(() => {
        if (deliveryMethod !== "DELIVERY" || !selectedDeliveryEntityId) {
            setCollectionPoints([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setPointsLoading(true);
            try {
                const res = await fetchApiRef.current.request({
                    action: "GetCollectionPoints",
                    courier_id: selectedDeliveryEntityId,
                });
                if (!cancelled) {
                    const env = extractEnvelope(res);
                    if (String(env.response_code) !== "0") {
                        setApiError({
                            isOpen: true,
                            title: "Collection Points Error",
                            envelope: env,
                            fallbackMessage: null,
                            onRetry: () => setRetryKey((k) => k + 1),
                        });
                    } else {
                        const results = extractArray(res, "collection_points");
                        setCollectionPoints(results);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    setApiError({
                        isOpen: true,
                        title: "Connection Error",
                        envelope: null,
                        fallbackMessage: err?.message || "Could not reach the server to load collection points.",
                        onRetry: () => setRetryKey((k) => k + 1),
                    });
                }
            } finally {
                if (!cancelled) setPointsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [deliveryMethod, selectedDeliveryEntityId, retryKey]);

    useEffect(() => {
        if (deliveryMethod !== "COURIER" && deliveryMethod !== "DELIVERY") {
            setShippingCost(null);
            setShippingError(null);
            return;
        }

        if (isRetailerDelivery) {
            setShippingCost(0);
            setShippingError(null);
            setShippingLoading(false);
            return;
        }

        let destLat: number | null = null;
        let destLng: number | null = null;

        if (deliveryMethod === "COURIER") {
            destLat = customerAddress?.latitude ?? null;
            destLng = customerAddress?.longitude ?? null;
        } else if (deliveryMethod === "DELIVERY") {
            destLat = selectedCollectionPoint?.latitude ?? null;
            destLng = selectedCollectionPoint?.longitude ?? null;
        }

        if (destLat == null || destLng == null) {
            setShippingCost(null);
            return;
        }

        let cancelled = false;
        (async () => {
            setShippingLoading(true);
            setShippingError(null);
            setShippingCost(null);

            try {
                const res = await fetchApiRef.current.request({
                    action: "CalculateShippingRate",
                    entity: retailerId,
                    origin_latitude: retailerLat,
                    origin_longitude: retailerLng,
                    destination_latitude: destLat,
                    destination_longitude: destLng,
                    delivery_method: deliveryMethod,
                    order_total: cart.subtotal || 0,
                    is_retailer_delivery: isRetailerDelivery,
                });

                if (!cancelled) {
                    const env = extractEnvelope(res);
                    if (String(env.response_code) !== "0") {
                        const msg = env.response_message || "Could not calculate shipping rate.";
                        setShippingError(msg);
                        setApiError({
                            isOpen: true,
                            title: "Shipping Calculation Failed",
                            envelope: env,
                            fallbackMessage: null,
                            onRetry: () => setRetryKey((k) => k + 1),
                        });
                    } else {
                        const cost = res.data?.shipping_cost ?? res.data?.cost ?? res.data?.amount ?? 0;
                        setShippingCost(cost);
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    const msg = err?.message || "Could not connect to server. Please try again.";
                    setShippingError(msg);
                    setApiError({
                        isOpen: true,
                        title: "Shipping Calculation Failed",
                        envelope: null,
                        fallbackMessage: msg,
                        onRetry: () => setRetryKey((k) => k + 1),
                    });
                }
            } finally {
                if (!cancelled) setShippingLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [
        deliveryMethod,
        isRetailerDelivery,
        customerAddress?.latitude,
        customerAddress?.longitude,
        selectedCollectionPoint?.latitude,
        selectedCollectionPoint?.longitude,
        retailerId,
        retailerLat,
        retailerLng,
        cart.subtotal,
        retryKey
    ]);

    const {
        filtered,
        products,
        categories,
        searchQuery,
        setSearchQuery,
        category,
        setCategory,
        sort,
        setSort,
        inStockOnly,
        setInStockOnly,
        status,
        error,
        isLoading,
    } = useRetailerInventory(retailerId);

    const borderColor = isDarkMode ? "#1e293b" : "#e8edf2";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";
    const subtleBorder = isDarkMode ? "#1e293b" : "#e2e8f0";
    const showThreeColumn = isDesktopWeb && windowWidth >= THREE_COLUMN_BREAKPOINT;

    const { H_PADDING, GRID_GAP } = useMemo(() => {
        if (isMobileWeb || windowWidth < TABLET_BREAKPOINT)
            return { H_PADDING: H_PADDING_MOBILE, GRID_GAP: GRID_GAP_MOBILE };
        return { H_PADDING: H_PADDING_DESKTOP, GRID_GAP: GRID_GAP_DESKTOP };
    }, [windowWidth, isMobileWeb]);

    const effectiveColumnWidth = useMemo(() => {
        if (showThreeColumn)
            return Math.max(0, windowWidth - CATEGORIES_RAIL_WIDTH - CART_PANEL_WIDTH);
        return productsColumnWidth > 0 ? productsColumnWidth : windowWidth;
    }, [showThreeColumn, productsColumnWidth, windowWidth]);

    const innerGridWidth = Math.max(0, effectiveColumnWidth - H_PADDING * 2);

    const columns = useMemo(() => {
        if (isMobileWeb || !showThreeColumn) return NARROW_COLUMNS;
        return 3;
    }, [showThreeColumn, isMobileWeb]);

    const cardWidth = useMemo(() => {
        if (innerGridWidth <= 0) return 0;
        const usable = innerGridWidth - GRID_GAP * (columns - 1);
        if (usable <= 0) return 0;
        return Math.floor(usable / columns);
    }, [innerGridWidth, columns, GRID_GAP]);

    const handleProductsColumnLayout = useCallback((e: LayoutChangeEvent) => {
        const next = e.nativeEvent.layout.width;
        if (next > 0) setProductsColumnWidth(next);
    }, []);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (category && category !== "All") n++;
        if (inStockOnly) n++;
        return n;
    }, [category, inStockOnly]);

    const clearAllFilters = useCallback(() => {
        setCategory("All");
        setInStockOnly(false);
        setSort("relevance");
    }, [setCategory, setInStockOnly, setSort]);

    const cartItemCount = cart.itemCount;
    const topPad = isWeb ? 16 : 54;

    const handleRequestCloseOrder = useCallback((o: CustomerOrder) => {
        setPayingOrder(o);
    }, []);

    const activeCouriers = useMemo<Courier[]>(() => {
        if (deliveryMethod === "COURIER") return couriers;
        if (deliveryMethod === "DELIVERY") return deliveryEntities;
        return [];
    }, [deliveryMethod, couriers, deliveryEntities]);

    const activeCouriersLoading =
        deliveryMethod === "COURIER"
            ? couriersLoading
            : deliveryMethod === "DELIVERY"
                ? deliveryEntitiesLoading
                : false;

    const activeSelectedCourierId =
        deliveryMethod === "COURIER"
            ? selectedCourierId
            : deliveryMethod === "DELIVERY"
                ? selectedDeliveryEntityId
                : null;

    const handleSelectCourier = useCallback(
        (id: string | null) => {
            if (deliveryMethod === "COURIER") {
                setSelectedCourierId(id);
                setSelectedCollectionPoint(null);
            } else if (deliveryMethod === "DELIVERY") {
                setSelectedDeliveryEntityId(id);
                setSelectedCollectionPoint(null);
            }
        },
        [deliveryMethod],
    );

    const handleDeliveryMethodChange = useCallback((m: DeliveryMethod) => {
        setDeliveryMethod(m);
        if (m === "PICKUP") {
            setSelectedCourierId(null);
            setSelectedDeliveryEntityId(null);
            setSelectedCollectionPoint(null);
            setIsRetailerDelivery(false);
        }
    }, []);

    const customerConfig = useMemo<RecordPaymentConfig>(
        () => ({
            ...CUSTOMER_PAYMENT_CONFIG,
            buildPaymentPayload: ({ selectedMethod, mobileNumber }) => {
                const order = payingOrder;
                const orderItems = (order?.order_items ?? []).map((it: any) => {
                    const receipt =
                        it.receipt_details || it.retailer_receipt_details || it;
                    const finalPrice = Number(
                        receipt.final_unit_selling_price ??
                        receipt.unit_selling_price ??
                        it.item_net_price ??
                        0,
                    );
                    return {
                        purchased_quantity: Number(it.purchased_quantity ?? 1),
                        retailer_receipt: String(
                            it.retailer_receipt || receipt.id || "",
                        ),
                        unit_of_issue: String(
                            it.unit_of_issue ?? receipt.unit_of_receipt ?? "PIECE",
                        ).toUpperCase(),
                        final_unit_selling_price: finalPrice,
                    };
                });

                const isDelivery = deliveryMethod === "DELIVERY";
                const isCourier = deliveryMethod === "COURIER";
                const isShippingActive = isDelivery || isCourier;

                const destination_latitude = isDelivery
                    ? (selectedCollectionPoint?.latitude ?? 0.0)
                    : isCourier
                        ? (customerAddress?.latitude ?? 0.0)
                        : 0.0;

                const destination_longitude = isDelivery
                    ? (selectedCollectionPoint?.longitude ?? 0.0)
                    : isCourier
                        ? (customerAddress?.longitude ?? 0.0)
                        : 0.0;

                const pickedEntityId = isDelivery
                    ? selectedDeliveryEntityId
                    : isCourier
                        ? selectedCourierId
                        : null;

                return {
                    action: CUSTOMER_PAYMENT_CONFIG.paymentAction,
                    customer_order_details: {
                        city_name: "",
                        customer_name: isCourier
                            ? (customerAddress?.name ?? "")
                            : "",
                        customer_phone: isCourier
                            ? (customerAddress?.phone ?? mobileNumber)
                            : "",
                        destination_latitude,
                        destination_longitude,
                        draft_id: order?.draft_id ?? "",
                        farness: "",
                        order_channel: "ANDROID",
                        order_items: orderItems,
                        order_origin: "STAFF",
                        origin_latitude: retailerLat,
                        origin_longitude: retailerLng,
                        payment_account_number: mobileNumber,
                        payment_method: selectedMethod.id,
                        reference_number: "",
                        shipping_cost: isShippingActive ? (shippingCost ?? 0) : 0.0,
                        delivery_method: deliveryMethod,
                        delivery_person: isRetailerDelivery ? selectedDeliveryEmployeeId : null,
                        courier_id: isRetailerDelivery ? null : pickedEntityId,
                        collection_point_id: isDelivery && !isRetailerDelivery
                            ? (selectedCollectionPoint?.id ?? null)
                            : null,
                    },
                };
            },
        }),
        [
            payingOrder,
            deliveryMethod,
            selectedCollectionPoint,
            selectedDeliveryEntityId,
            selectedCourierId,
            customerAddress,
            shippingCost,
            retailerLat,
            retailerLng,
            isRetailerDelivery,
            selectedDeliveryEmployeeId
        ],
    );

    const cartPanel = (
        <RetailerCartPanel
            onClose={showThreeColumn ? undefined : () => setCartSheetOpen(false)}
            bottomInset={showThreeColumn ? 0 : insets.bottom}
            onRequestCloseOrder={handleRequestCloseOrder}
            deliveryMethod={deliveryMethod}
            onDeliveryMethodChange={handleDeliveryMethodChange}
            couriers={activeCouriers}
            couriersLoading={activeCouriersLoading}
            selectedCourierId={activeSelectedCourierId}
            onSelectCourier={handleSelectCourier}
            collectionPoints={collectionPoints}
            collectionPointsLoading={pointsLoading}
            selectedCollectionPoint={selectedCollectionPoint}
            onSelectCollectionPoint={setSelectedCollectionPoint}
            customerAddress={customerAddress}
            onCustomerAddressChange={setCustomerAddress}
            shippingCost={shippingCost}
            shippingLoading={shippingLoading}
            shippingError={shippingError}
            retailerName={retailerName}
            retailerLocation={retailerLocation}
            isRetailerDelivery={isRetailerDelivery}
            onToggleRetailerDelivery={setIsRetailerDelivery}
            deliveryEmployees={deliveryEmployees}
            deliveryEmployeesLoading={deliveryEmployeesLoading}
            selectedDeliveryEmployeeId={selectedDeliveryEmployeeId}
            onSelectDeliveryEmployee={setSelectedDeliveryEmployeeId}
        />
    );

    const SearchBox = (
        <View
            className="flex-1 min-w-0 flex-row items-center rounded-[10px] border px-3 h-[38px]"
            style={{ borderColor: subtleBorder, backgroundColor: subtleBg }}
        >
            <Search size={14} color={theme.textDark} />
            <TextInput
                placeholder="Search products, SKU…"
                placeholderTextColor={theme.textDark}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 min-w-0 h-full ml-2 text-[13px]"
                style={{
                    fontFamily: theme.font.regular,
                    color: theme.text,
                    ...webNoOutline,
                }}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    hitSlop={8}
                    className="cursor-pointer"
                >
                    <X size={14} color={theme.textDark} />
                </TouchableOpacity>
            )}
        </View>
    );

    const toolbar = (
        <View
            className="border-b z-[200]"
            style={{ backgroundColor: theme.panel, borderBottomColor: borderColor }}
        >
            <View className="px-6 pb-3" style={{ paddingTop: topPad }}>
                <View className="flex-row items-center mb-3">
                    <TouchableOpacity
                        onPress={onBack}
                        activeOpacity={0.8}
                        className="w-[34px] h-[34px] rounded-full items-center justify-center shrink-0 cursor-pointer"
                        style={{ backgroundColor: subtleBg }}
                    >
                        <ArrowLeft size={16} color={theme.text} />
                    </TouchableOpacity>
                    <View className="flex-1 min-w-0 mx-3">
                        <Text
                            className="text-[17px] font-bold"
                            style={{ fontFamily: theme.font.bold, color: theme.text }}
                            numberOfLines={1}
                        >
                            {retailerName ?? "Retailer"}
                        </Text>
                        <View className="flex-row items-center mt-0.5">
                            <Building2
                                size={11}
                                color={theme.textDark}
                                className="opacity-70 shrink-0"
                            />
                            <Text
                                className="ml-1 text-[11px] opacity-85 shrink"
                                style={{
                                    fontFamily: theme.font.regular,
                                    color: theme.textDark,
                                }}
                                numberOfLines={1}
                            >
                                {retailerType ?? "Retailer"}
                                {retailerLocation ? ` · ${retailerLocation}` : ""}
                            </Text>
                        </View>
                    </View>
                    <View
                        className="px-2.5 py-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: subtleBg }}
                    >
                        <Text
                            className="text-[11px] font-semibold"
                            style={{
                                fontFamily: theme.font.semibold,
                                color: theme.textDark,
                            }}
                        >
                            {filtered.length}
                            {filtered.length !== products.length
                                ? ` / ${products.length}`
                                : ""}{" "}
                            items
                        </Text>
                    </View>
                </View>
                <View className="flex-row items-center gap-2">
                    {SearchBox}
                    {!showThreeColumn && (
                        <TouchableOpacity
                            onPress={() => setFiltersSheetOpen(true)}
                            activeOpacity={0.8}
                            className="flex-row items-center px-3 h-[38px] rounded-[10px] border shrink-0 cursor-pointer"
                            style={{
                                borderColor:
                                    activeFilterCount > 0
                                        ? theme.primary
                                        : subtleBorder,
                                backgroundColor:
                                    activeFilterCount > 0
                                        ? `${theme.primary}15`
                                        : "transparent",
                            }}
                        >
                            <SlidersHorizontal
                                size={14}
                                color={
                                    activeFilterCount > 0
                                        ? theme.primary
                                        : theme.textDark
                                }
                            />
                            <Text
                                className="ml-1.5 text-[12px] font-semibold"
                                style={{
                                    fontFamily: theme.font.semibold,
                                    color:
                                        activeFilterCount > 0
                                            ? theme.primary
                                            : theme.textDark,
                                }}
                            >
                                Filters
                            </Text>
                            {activeFilterCount > 0 && (
                                <View
                                    className="ml-1.5 min-w-[18px] h-[18px] rounded-full px-1 items-center justify-center"
                                    style={{ backgroundColor: theme.primary }}
                                >
                                    <Text
                                        className="text-[10px] font-bold text-white leading-3"
                                        style={{ fontFamily: theme.font.bold }}
                                    >
                                        {activeFilterCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
                {showThreeColumn && (
                    <>
                        {categories.length > 1 && (
                            <View className="flex-row items-center mt-2.5">
                                <View className="flex-1 min-w-0">
                                    <FlatList
                                        horizontal
                                        data={categories}
                                        keyExtractor={(c) => c.name}
                                        showsHorizontalScrollIndicator={false}
                                        ItemSeparatorComponent={() => (
                                            <View className="w-1.5" />
                                        )}
                                        renderItem={({ item: c }) => {
                                            const active = category === c.name;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => setCategory(c.name)}
                                                    activeOpacity={0.8}
                                                    className="flex-row items-center px-3 py-1.5 rounded-full border cursor-pointer"
                                                    style={{
                                                        backgroundColor: active
                                                            ? theme.text
                                                            : subtleBg,
                                                        borderColor: active
                                                            ? theme.text
                                                            : subtleBorder,
                                                    }}
                                                >
                                                    <Text
                                                        className="max-w-[160px] text-[12px]"
                                                        style={{
                                                            fontFamily: active
                                                                ? theme.font.semibold
                                                                : theme.font.medium,
                                                            color: active
                                                                ? theme.panel
                                                                : theme.textDark,
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        {c.name}
                                                    </Text>
                                                    {c.name !== "All" && (
                                                        <Text
                                                            className="ml-1.5 text-[10px] opacity-80"
                                                            style={{
                                                                fontFamily:
                                                                    theme.font.medium,
                                                                color: active
                                                                    ? "rgba(255,255,255,0.7)"
                                                                    : theme.textDark,
                                                            }}
                                                        >
                                                            {c.count}
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                                <TouchableOpacity
                                    onPress={() => setInStockOnly((v) => !v)}
                                    activeOpacity={0.8}
                                    className="flex-row items-center px-3 h-8 rounded-[10px] border shrink-0 ml-2 cursor-pointer"
                                    style={{
                                        borderColor: inStockOnly
                                            ? theme.primary
                                            : subtleBorder,
                                        backgroundColor: inStockOnly
                                            ? `${theme.primary}15`
                                            : "transparent",
                                    }}
                                >
                                    <View
                                        className="w-3 h-3 rounded border-[1.5px] items-center justify-center mr-1.5"
                                        style={{
                                            borderColor: inStockOnly
                                                ? theme.primary
                                                : theme.textDark,
                                            backgroundColor: inStockOnly
                                                ? theme.primary
                                                : "transparent",
                                        }}
                                    >
                                        {inStockOnly && (
                                            <Text
                                                className="text-[8px] text-white font-bold leading-[9px]"
                                                style={{ fontFamily: theme.font.bold }}
                                            >
                                                ✓
                                            </Text>
                                        )}
                                    </View>
                                    <Text
                                        className="text-[12px] font-semibold"
                                        style={{
                                            fontFamily: theme.font.semibold,
                                            color: inStockOnly
                                                ? theme.primary
                                                : theme.textDark,
                                        }}
                                    >
                                        In stock
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <View className="flex-row items-center mt-2.5">
                            <View className="mr-2 opacity-70 shrink-0">
                                <ArrowDownUp size={12} color={theme.textDark} />
                            </View>
                            <View className="flex-1 min-w-0">
                                <FlatList
                                    horizontal
                                    data={SORTS}
                                    keyExtractor={(s) => s.key}
                                    showsHorizontalScrollIndicator={false}
                                    ItemSeparatorComponent={() => <View className="w-1" />}
                                    renderItem={({ item: s }) => {
                                        const active = sort === s.key;
                                        return (
                                            <TouchableOpacity
                                                onPress={() => setSort(s.key)}
                                                activeOpacity={0.8}
                                                className="px-2.5 py-1 rounded-md cursor-pointer"
                                                style={{
                                                    backgroundColor: active
                                                        ? subtleBg
                                                        : "transparent",
                                                }}
                                            >
                                                <Text
                                                    className="text-[12px]"
                                                    style={{
                                                        fontFamily: active
                                                            ? theme.font.semibold
                                                            : theme.font.regular,
                                                        color: active
                                                            ? theme.text
                                                            : theme.textDark,
                                                        opacity: active ? 1 : 0.75,
                                                    }}
                                                >
                                                    {s.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    }}
                                />
                            </View>
                        </View>
                    </>
                )}
            </View>
        </View>
    );

    const grid = (
        <View className="flex-1 min-h-0 overflow-hidden">
            {isLoading && products.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text
                        className="mt-3.5 text-sm"
                        style={{
                            fontFamily: theme.font.regular,
                            color: theme.textDark,
                        }}
                    >
                        Loading storefront…
                    </Text>
                </View>
            ) : status === "error" && products.length === 0 ? (
                <View className="flex-1 items-center justify-center p-6">
                    <Package size={32} color={theme.textDark} />
                    <Text
                        className="mt-3.5 text-base font-semibold"
                        style={{
                            fontFamily: theme.font.semibold,
                            color: theme.text,
                        }}
                    >
                        Couldn't load storefront
                    </Text>
                    <Text
                        className="mt-1.5 max-w-[380px] text-center text-sm"
                        style={{
                            fontFamily: theme.font.regular,
                            color: theme.textDark,
                        }}
                    >
                        {error ?? "Something went wrong."}
                    </Text>
                </View>
            ) : cardWidth > 0 ? (
                <FlatList
                    data={filtered}
                    keyExtractor={getReceiptKey}
                    numColumns={columns}
                    key={`cols-${columns}`}
                    columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
                    contentContainerStyle={{
                        paddingHorizontal: H_PADDING,
                        paddingTop: H_PADDING,
                        paddingBottom: H_PADDING + 96,
                        flexGrow: 1,
                    }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    extraData={cart.lines}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center py-16">
                            <Package
                                size={32}
                                color={theme.textDark}
                                strokeWidth={1.5}
                            />
                            <Text
                                className="mt-3 text-base font-semibold"
                                style={{
                                    fontFamily: theme.font.semibold,
                                    color: theme.text,
                                }}
                            >
                                Nothing here yet
                            </Text>
                            <Text
                                className="mt-1 max-w-[320px] text-center text-sm"
                                style={{
                                    fontFamily: theme.font.regular,
                                    color: theme.textDark,
                                }}
                            >
                                Try adjusting your search or filters.
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <ProductCard
                            product={item}
                            width={cardWidth}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            borderColor={borderColor}
                            inCartQuantity={cart.getQuantity(getReceiptKey(item))}
                            onAddToCart={setModalProduct}
                        />
                    )}
                />
            ) : (
                <View className="flex-1" />
            )}
        </View>
    );

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            {showThreeColumn ? (
                <View className="flex-1 flex-row">
                    <View
                        className="shrink-0"
                        style={{ width: CATEGORIES_RAIL_WIDTH }}
                    >
                        <CategoriesRail
                            categories={categories}
                            selected={category}
                            onSelect={setCategory}
                            theme={theme}
                            isDarkMode={isDarkMode}
                        />
                    </View>
                    <View className="flex-1 min-w-0 overflow-hidden">
                        {toolbar}
                        {grid}
                    </View>
                    <View
                        className="shrink-0 border-l"
                        style={{
                            width: CART_PANEL_WIDTH,
                            borderLeftColor: borderColor,
                            backgroundColor: theme.panel,
                        }}
                    >
                        {cartPanel}
                    </View>
                </View>
            ) : (
                <View className="flex-1" onLayout={handleProductsColumnLayout}>
                    {toolbar}
                    {grid}
                    {cartItemCount > 0 && !cartSheetOpen && (
                        <TouchableOpacity
                            onPress={() => setCartSheetOpen(true)}
                            activeOpacity={0.85}
                            className="absolute w-14 h-14 rounded-full items-center justify-center shadow-lg cursor-pointer"
                            style={{
                                right: H_PADDING + insets.right,
                                bottom: 24 + insets.bottom,
                                backgroundColor: theme.primary,
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.22,
                                shadowRadius: 12,
                                elevation: 8,
                            }}
                        >
                            <ShoppingCart size={22} color="#fff" />
                            <View
                                className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full px-1 items-center justify-center border-2"
                                style={{
                                    backgroundColor: theme.primary,
                                    borderColor: theme.background,
                                }}
                            >
                                <Text
                                    className="text-[10px] font-bold text-white leading-3"
                                    style={{ fontFamily: theme.font.bold }}
                                >
                                    {cartItemCount}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Filters Sheet (narrow only) */}
            {!showThreeColumn && (
                <Modal
                    visible={filtersSheetOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setFiltersSheetOpen(false)}
                    statusBarTranslucent
                >
                    <Pressable
                        onPress={() => setFiltersSheetOpen(false)}
                        className="flex-1 bg-black/50 justify-end"
                    >
                        <Pressable
                            onPress={(e) => e.stopPropagation?.()}
                            className="rounded-t-[22px] max-h-[85%]"
                            style={{
                                backgroundColor: theme.panel,
                                paddingBottom: insets.bottom + 12,
                            }}
                        >
                            <View className="items-center pt-3 pb-1.5">
                                <View
                                    className="w-10 h-1 rounded-full"
                                    style={{ backgroundColor: borderColor }}
                                />
                            </View>
                            <View
                                className="flex-row items-center justify-between px-5 py-3.5 border-b"
                                style={{ borderBottomColor: borderColor }}
                            >
                                <Text
                                    className="text-lg font-bold"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        color: theme.text,
                                    }}
                                >
                                    Filters
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setFiltersSheetOpen(false)}
                                    activeOpacity={0.8}
                                    className="w-8 h-8 rounded-full items-center justify-center cursor-pointer"
                                    style={{ backgroundColor: subtleBg }}
                                >
                                    <X size={15} color={theme.text} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                contentContainerStyle={{ padding: 20, gap: 20 }}
                                showsVerticalScrollIndicator={false}
                            >
                                {categories.length > 1 && (
                                    <View>
                                        <Text
                                            className="text-[10px] font-bold tracking-wider uppercase mb-2.5"
                                            style={{
                                                fontFamily: theme.font.bold,
                                                color: theme.textDark,
                                            }}
                                        >
                                            Category
                                        </Text>
                                        <View className="flex-row flex-wrap gap-1.5">
                                            {categories.map((c) => {
                                                const active = category === c.name;
                                                return (
                                                    <TouchableOpacity
                                                        key={c.name}
                                                        onPress={() => setCategory(c.name)}
                                                        activeOpacity={0.8}
                                                        className="flex-row items-center px-3 py-2 rounded-full border cursor-pointer"
                                                        style={{
                                                            borderColor: active
                                                                ? theme.primary
                                                                : subtleBorder,
                                                            backgroundColor: active
                                                                ? theme.primary
                                                                : "transparent",
                                                        }}
                                                    >
                                                        <Text
                                                            className="text-[12px]"
                                                            style={{
                                                                fontFamily: active
                                                                    ? theme.font.bold
                                                                    : theme.font.medium,
                                                                color: active
                                                                    ? "#fff"
                                                                    : theme.textDark,
                                                            }}
                                                        >
                                                            {c.name}
                                                        </Text>
                                                        {c.name !== "All" && (
                                                            <Text
                                                                className="ml-1.5 text-[10px] opacity-80"
                                                                style={{
                                                                    fontFamily:
                                                                        theme.font.medium,
                                                                    color: active
                                                                        ? "rgba(255,255,255,0.75)"
                                                                        : theme.textDark,
                                                                }}
                                                            >
                                                                {c.count}
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}
                                <View>
                                    <Text
                                        className="text-[10px] font-bold tracking-wider uppercase mb-2.5"
                                        style={{
                                            fontFamily: theme.font.bold,
                                            color: theme.textDark,
                                        }}
                                    >
                                        Availability
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setInStockOnly((v) => !v)}
                                        activeOpacity={0.8}
                                        className="flex-row items-center px-3.5 py-3 rounded-[10px] border cursor-pointer"
                                        style={{
                                            borderColor: inStockOnly
                                                ? theme.primary
                                                : subtleBorder,
                                            backgroundColor: inStockOnly
                                                ? `${theme.primary}15`
                                                : "transparent",
                                        }}
                                    >
                                        <View
                                            className="w-4 h-4 rounded border-[1.5px] items-center justify-center mr-2.5"
                                            style={{
                                                borderColor: inStockOnly
                                                    ? theme.primary
                                                    : theme.textDark,
                                                backgroundColor: inStockOnly
                                                    ? theme.primary
                                                    : "transparent",
                                            }}
                                        >
                                            {inStockOnly && (
                                                <Text
                                                    className="text-[10px] text-white font-bold leading-3"
                                                    style={{
                                                        fontFamily: theme.font.bold,
                                                    }}
                                                >
                                                    ✓
                                                </Text>
                                            )}
                                        </View>
                                        <Text
                                            className="text-[13px] font-medium"
                                            style={{
                                                fontFamily: theme.font.medium,
                                                color: inStockOnly
                                                    ? theme.primary
                                                    : theme.text,
                                            }}
                                        >
                                            In stock only
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View>
                                    <Text
                                        className="text-[10px] font-bold tracking-wider uppercase mb-2.5"
                                        style={{
                                            fontFamily: theme.font.bold,
                                            color: theme.textDark,
                                        }}
                                    >
                                        Sort by
                                    </Text>
                                    <View className="flex-row flex-wrap gap-1.5">
                                        {SORTS.map((s) => {
                                            const active = sort === s.key;
                                            return (
                                                <TouchableOpacity
                                                    key={s.key}
                                                    onPress={() => setSort(s.key)}
                                                    activeOpacity={0.8}
                                                    className="px-3.5 py-2 rounded-full border cursor-pointer"
                                                    style={{
                                                        borderColor: active
                                                            ? theme.primary
                                                            : subtleBorder,
                                                        backgroundColor: active
                                                            ? theme.primary
                                                            : "transparent",
                                                    }}
                                                >
                                                    <Text
                                                        className="text-[12px]"
                                                        style={{
                                                            fontFamily: active
                                                                ? theme.font.bold
                                                                : theme.font.medium,
                                                            color: active
                                                                ? "#fff"
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
                            </ScrollView>
                            <View
                                className="flex-row items-center gap-2.5 px-5 pt-3 border-t"
                                style={{ borderTopColor: borderColor }}
                            >
                                {activeFilterCount > 0 || sort !== "relevance" ? (
                                    <TouchableOpacity
                                        onPress={clearAllFilters}
                                        activeOpacity={0.8}
                                        className="px-4 h-11 rounded-[10px] border items-center justify-center cursor-pointer"
                                        style={{ borderColor: subtleBorder }}
                                    >
                                        <Text
                                            className="text-[13px] font-bold"
                                            style={{
                                                fontFamily: theme.font.bold,
                                                color: theme.textDark,
                                            }}
                                        >
                                            Clear all
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}
                                <TouchableOpacity
                                    onPress={() => setFiltersSheetOpen(false)}
                                    activeOpacity={0.85}
                                    className="flex-1 h-11 rounded-[10px] items-center justify-center cursor-pointer"
                                    style={{ backgroundColor: theme.primary }}
                                >
                                    <Text
                                        className="text-[14px] font-bold text-white"
                                        style={{ fontFamily: theme.font.bold }}
                                    >
                                        Show {filtered.length}{" "}
                                        {filtered.length === 1 ? "result" : "results"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}

            {/* Cart Sheet (narrow only) */}
            {!showThreeColumn && (
                <Modal
                    visible={cartSheetOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setCartSheetOpen(false)}
                    statusBarTranslucent
                >
                    <Pressable
                        onPress={() => setCartSheetOpen(false)}
                        className="flex-1 bg-black/50 justify-end"
                    >
                        <Pressable
                            onPress={(e) => e.stopPropagation?.()}
                            className="rounded-t-[22px] max-h-[85%] min-h-[320px] overflow-hidden"
                            style={{ backgroundColor: theme.panel }}
                        >
                            <View className="items-center pt-2.5 pb-1">
                                <View
                                    className="w-10 h-1 rounded-full"
                                    style={{ backgroundColor: borderColor }}
                                />
                            </View>
                            <View className="flex-1 min-h-0">{cartPanel}</View>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}

            <RetailerQuantityModal
                visible={!!modalProduct}
                product={modalProduct}
                onClose={() => setModalProduct(null)}
            />
            <RecordPaymentModal
                isOpen={!!payingOrder}
                orderId={payingOrder?.draft_id ?? ""}
                orderRef={payingOrder?.draft_id ?? ""}
                config={customerConfig}
                onlineOnly
                onClose={() => setPayingOrder(null)}
                onSuccess={async () => {
                    setPayingOrder(null);
                }}
            />

            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                onRetry={
                    apiError.onRetry
                        ? () => {
                            setApiError((prev) => ({ ...prev, isOpen: false }));
                            apiError.onRetry?.();
                        }
                        : undefined
                }
            />
        </View>
    );
}