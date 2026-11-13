// context/ShopperCartContext.tsx
import { useAuth } from "@/context/AuthContext";
import { db } from "@/databases/db";
import type {
    CustomerOrder,
    CustomerOrderItem,
    CustomerOrderItemImage,
    CustomerOrderItemReceiptDetails,
    RetailerReceipt,
} from "@/databases/types";
// 🌟 IMPORT HELPER FUNCTIONS
import { getReceiptName, getReceiptPrice } from "@/hooks/useRetailerInventory";
import { useGlobalSearchParams } from "expo-router";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Platform } from "react-native";

export interface ShopperCartLine {
    receiptId: string;
    productId: string;
    retailerId: string;
    name: string;
    unit: string;
    unitPrice: number;
    originalPrice: number;
    image?: string;
    quantity: number;
}

function resolveReceiptId(receipt: RetailerReceipt): string {
    const remote = receipt.remote_id;
    if (typeof remote === "string" && remote.length > 0) return remote;

    const wireId = (receipt as any).id;
    if (typeof wireId === "string" && wireId.length > 0) return wireId;
    if (typeof wireId === "number") return String(wireId);

    return "";
}

function receiptToReceiptDetails(
    receipt: RetailerReceipt,
): CustomerOrderItemReceiptDetails {
    return {
        id: receipt.remote_id,
        title: receipt.title,
        entity: receipt.entity,
        entity_title: receipt.entity_title,
        product: receipt.product,
        draft_id: receipt.draft_id,
        preparation_title: receipt.preparation_title,
        product_title: receipt.product_title,
        formulation_title: receipt.formulation_title,
        long_title: receipt.long_title,
        received_from: receipt.received_from,
        unit_of_receipt: receipt.unit_of_receipt,
        received_from_title: receipt.received_from_title,
        retailer_order: receipt.retailer_order,
        retailer_order_item: receipt.retailer_order_item,
        batch: receipt.batch,
        bar_code: receipt.bar_code,
        manufacture_date: receipt.manufacture_date,
        expiry_date: receipt.expiry_date,
        unit_buying_price: receipt.unit_buying_price,
        unit_selling_price: receipt.unit_selling_price,
        unit_price_discount: receipt.unit_price_discount,
        current_unit_quantity: receipt.current_unit_quantity,
        received_unit_quantity: receipt.received_unit_quantity,
        in_placement: receipt.in_placement,
        is_active: receipt.is_active,
        is_pom: receipt.is_pom,
        supplier_invoice: receipt.supplier_invoice,
        origin_country: receipt.origin_country,
        origin_country_title: receipt.origin_country_title,
        final_unit_selling_price: receipt.final_unit_selling_price,
        images: (receipt.images ?? []) as unknown as CustomerOrderItemImage[],
        created: receipt.created,
        updated: receipt.updated,
        employee: receipt.employee,
        owner: receipt.owner,
        days_to_expiry: receipt.days_to_expiry,
        expiry_status: receipt.expiry_status,
        packaging: receipt.packaging,
        units_per_pack: receipt.units_per_pack,
        manufacturer: receipt.manufacturer,
        manufacturer_title: receipt.manufacturer_title,
    };
}

function receiptToOrderItem(
    receipt: RetailerReceipt,
    quantity: number,
): CustomerOrderItem {
    const now = new Date().toISOString();
    const qty = Math.max(1, Math.floor(quantity || 0));

    // 🌟 USE ROBUST HELPERS to find the correct name and price
    const safePrice = getReceiptPrice(receipt);
    const safeName = getReceiptName(receipt);

    const original = Number(receipt.unit_selling_price || 0);
    const discountPerUnit = Math.max(0, original - safePrice);

    const details = receiptToReceiptDetails(receipt);
    // 🌟 FORCE the correct name and price onto the details object
    details.product_title = safeName;
    details.final_unit_selling_price = String(safePrice);

    return {
        id: "",
        title: safeName,
        customer_order: "",
        retailer_receipt: receipt.remote_id,
        purchased_quantity: qty,
        discount_quantity: "0",
        total_quantity: String(qty),
        unit_of_issue: receipt.unit_of_receipt || "unit",
        quantity: String(qty),
        item_price: String(original),
        item_price_total: (original * qty).toFixed(2),
        item_tax: "0",
        item_tax_total: "0",
        item_price_discount: String(discountPerUnit),
        item_price_discount_total: (discountPerUnit * qty).toFixed(2),
        item_net_price: String(safePrice),
        item_net_price_total: (safePrice * qty).toFixed(2),
        item_counter_price_discount: null,
        item_counter_price_discount_amount: null,
        item_counter_price_discount_amount_total: "0",
        receipt_details: details,
        created: now,
        updated: now,
        images: (receipt.images ?? []) as unknown as CustomerOrderItemImage[],
    };
}

function orderItemToLine(item: CustomerOrderItem): ShopperCartLine {
    const details = item.receipt_details;

    // 🌟 Fallback logic ensures we read what we forced in receiptToOrderItem
    const primary = Number(details?.final_unit_selling_price ?? item.item_net_price ?? 0);
    const original = Number(details?.unit_selling_price ?? item.item_price ?? 0);

    const image =
        (Array.isArray(item.images) && item.images[0]?.thumbnail) ||
        (Array.isArray(item.images) && item.images[0]?.image) ||
        (Array.isArray(details?.images) && details.images[0]?.thumbnail) ||
        (Array.isArray(details?.images) && details.images[0]?.image) ||
        undefined;

    return {
        receiptId: item.retailer_receipt,
        productId: details?.product ?? "",
        retailerId: details?.entity ?? "",
        name: item.title || details?.product_title || details?.long_title || "Unnamed product",
        unit: details?.unit_of_receipt || item.unit_of_issue || "unit",
        unitPrice: primary,
        originalPrice: original || primary,
        image,
        quantity: Number(item.purchased_quantity ?? 0),
    };
}

interface ShopperCartValue {
    order: CustomerOrder | null;
    lines: ShopperCartLine[];
    isReady: boolean;
    itemCount: number;
    totalUnits: number;
    subtotal: number;

    getQuantity: (receiptId: string) => number;
    hasLine: (receiptId: string) => boolean;

    addOrUpdate: (receipt: RetailerReceipt, quantity: number) => void;
    setQuantity: (receiptId: string, quantity: number) => void;
    // 🌟 ADDED INDEX FALLBACK
    removeLine: (receiptId: string, index?: number) => void;
    clear: () => void;
}

const ShopperCartContext = createContext<ShopperCartValue | undefined>(
    undefined,
);

export function ShopperCartProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user } = useAuth();
    const userId = user?.id ?? "";

    const params = useGlobalSearchParams<{
        id?: string;
        name?: string;
    }>();

    const retailerId = useMemo(() => {
        const raw = params.id;
        return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
    }, [params.id]);

    const retailerName = useMemo(() => {
        const raw = params.name;
        const resolved = Array.isArray(raw) ? raw[0] : raw;
        return resolved && resolved.length > 0 ? resolved : "Retailer";
    }, [params.name]);

    const [order, setOrder] = useState<CustomerOrder | null>(null);
    const [isReady, setIsReady] = useState(false);
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        setOrder(null);
        setIsReady(false);

        (async () => {
            if (!userId || !retailerId) {
                if (!cancelled) setIsReady(true);
                return;
            }

            try {
                const existing = await db.getOpenShopperDraft(userId, retailerId);
                if (cancelled) return;
                if (existing) setOrder(existing);
            } catch (e) {
                console.warn("[ShopperCart] hydrate failed:", e);
            } finally {
                if (!cancelled) setIsReady(true);
            }
        })();

        return () => { cancelled = true; };
    }, [userId, retailerId]);

    useEffect(() => {
        if (!isReady || !order || !order.id) return;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            db.replaceShopperItems(order).catch((e) =>
                console.warn("[ShopperCart] persist failed:", e),
            );
        }, 300);
        return () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [order, isReady]);

    useEffect(() => {
        if (Platform.OS !== "web") return;
        if (typeof window === "undefined") return;
        const onBeforeUnload = () => {
            if (order?.id) {
                db.replaceShopperItems(order).catch(() => { });
            }
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [order]);

    const lines = useMemo<ShopperCartLine[]>(
        () => (order?.order_items ?? []).map(orderItemToLine),
        [order],
    );

    const getQuantity = useCallback(
        (receiptId: string) =>
            lines.find((l) => l.receiptId === receiptId)?.quantity ?? 0,
        [lines],
    );

    const hasLine = useCallback(
        (receiptId: string) => lines.some((l) => l.receiptId === receiptId),
        [lines],
    );

    const addOrUpdate = useCallback(
        (receipt: RetailerReceipt, quantity: number) => {
            (async () => {
                const receiptId = resolveReceiptId(receipt);
                try {
                    if (!userId || !retailerId) return;
                    if (!receiptId) return;

                    let active = order;
                    if (!active) {
                        active = await db.getOrCreateShopperDraft(userId, retailerId, retailerName);
                    }

                    const normalizedReceipt: RetailerReceipt = {
                        ...receipt,
                        remote_id: receiptId,
                    };

                    const item = receiptToOrderItem(normalizedReceipt, quantity);

                    setOrder((prev) => {
                        const base = prev ?? active!;
                        const existing = base.order_items ?? [];
                        const idx = existing.findIndex(
                            (i) => i.retailer_receipt === receiptId,
                        );
                        const order_items =
                            idx >= 0
                                ? existing.map((i, j) => j === idx ? item : i)
                                : [...existing, item];

                        return { ...base, order_items };
                    });
                } catch (e) {
                    console.warn("[ShopperCart] addOrUpdate failed:", e);
                }
            })();
        },
        [order, userId, retailerId, retailerName],
    );

    const setQuantity = useCallback(
        (receiptId: string, quantity: number) => {
            const q = Math.max(1, Math.floor(quantity || 0));
            setOrder((prev) => {
                if (!prev) return prev;
                const order_items = (prev.order_items ?? []).map((i) => {
                    if (i.retailer_receipt !== receiptId) return i;
                    const unitPrice = Number(i.receipt_details?.final_unit_selling_price ?? i.item_net_price ?? 0);
                    return {
                        ...i,
                        purchased_quantity: q,
                        quantity: String(q),
                        total_quantity: String(q),
                        item_price_total: (Number(i.item_price ?? 0) * q).toFixed(2),
                        item_net_price_total: (unitPrice * q).toFixed(2),
                        item_price_discount_total: (Number(i.item_price_discount ?? 0) * q).toFixed(2),
                        updated: new Date().toISOString(),
                    };
                });
                return { ...prev, order_items };
            });
        },
        [],
    );

    // 🌟 UPDATED REMOVE LINE to handle corrupted items without an ID
    const removeLine = useCallback((receiptId: string, index?: number) => {
        setOrder((prev) => {
            if (!prev) return prev;
            const newItems = [...(prev.order_items ?? [])];

            // Try finding by ID first
            const idIndex = newItems.findIndex((i) => i.retailer_receipt === receiptId);

            if (idIndex >= 0) {
                newItems.splice(idIndex, 1);
            } else if (index !== undefined && index >= 0 && index < newItems.length) {
                // Fallback to index if the ID is missing
                newItems.splice(index, 1);
            }

            return { ...prev, order_items: newItems };
        });
    }, []);

    const clear = useCallback(() => {
        (async () => {
            try {
                if (userId && retailerId) {
                    // No single "delete by user + shop" in db: find this shop's
                    // cart order(s) for the user and delete each by id.
                    const orders = await db.getShopperOrdersByUserAndEntity(userId, retailerId);
                    for (const o of orders) {
                        if (o?.id != null) await db.deleteShopperOrderById(o.id as number);
                    }
                }
            } catch (e) {
                console.warn("[ShopperCart] clear failed:", e);
            } finally {
                setOrder(null);
            }
        })();
    }, [userId, retailerId]);

    const { itemCount, totalUnits, subtotal } = useMemo(() => {
        const items = order?.order_items ?? [];
        let units = 0;
        let sub = 0;
        for (const it of items) {
            const q = Number(it.purchased_quantity ?? 0);
            const price = Number(it.receipt_details?.final_unit_selling_price ?? it.item_net_price ?? 0);
            units += q;
            sub += price * q;
        }
        return { itemCount: items.length, totalUnits: units, subtotal: sub };
    }, [order]);

    const value = useMemo<ShopperCartValue>(
        () => ({
            order,
            lines,
            isReady,
            itemCount,
            totalUnits,
            subtotal,
            getQuantity,
            hasLine,
            addOrUpdate,
            setQuantity,
            removeLine,
            clear,
        }),
        [order, lines, isReady, itemCount, totalUnits, subtotal, getQuantity, hasLine, addOrUpdate, setQuantity, removeLine, clear],
    );

    return (
        <ShopperCartContext.Provider value={value}>
            {children}
        </ShopperCartContext.Provider>
    );
}

export function useShopperCart(): ShopperCartValue {
    const ctx = useContext(ShopperCartContext);
    if (!ctx) {
        throw new Error("useShopperCart must be used within <ShopperCartProvider />");
    }
    return ctx;
}