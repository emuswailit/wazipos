import { CachedIndentSelection, dbInstance as db, LocalIndentItemLine } from '@/databases/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'wazipos_procurement_draft_indent';
const INTENTS_CACHE_KEY = 'wazipos_procurement_intents_cache';

export default function useProcurementIndent(retailerIndentId: string | null, retailerId: string | null) {
    const [selectedOffers, setSelectedOffers] = useState<Record<string, string>>({});
    const [cachedIntents, setCachedIntents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function hydrateSelections() {
            try {
                if (Platform.OS === 'web') {
                    const cachedIndent = await db.indents.get(STORAGE_KEY);
                    if (cachedIndent?.items) {
                        const nextMap: Record<string, string> = {};
                        cachedIndent.items.forEach(i => { nextMap[i.product_id] = i.wholesaler_receipt_id; });
                        setSelectedOffers(nextMap);
                    }
                    const intents = await db.procurementIntents.toArray();
                    if (intents.length > 0) setCachedIntents(intents);
                } else {
                    const savedIndent = await AsyncStorage.getItem(STORAGE_KEY);
                    if (savedIndent) {
                        const parsedDoc: CachedIndentSelection = JSON.parse(savedIndent);
                        const nextMap: Record<string, string> = {};
                        parsedDoc.items.forEach(i => { nextMap[i.product_id] = i.wholesaler_receipt_id; });
                        setSelectedOffers(nextMap);
                    }
                    const savedIntents = await AsyncStorage.getItem(INTENTS_CACHE_KEY);
                    if (savedIntents) setCachedIntents(JSON.parse(savedIntents));
                }
            } catch (e) {
                console.error('❌ Hydration Failure:', e);
            } finally {
                setIsLoading(false);
            }
        }
        hydrateSelections();
    }, []);

    async function executePersist(resolvedMap: Record<string, string>, pool: any[]) {
        const itemsList: LocalIndentItemLine[] = Object.entries(resolvedMap)
            .filter(([_, rId]) => rId !== "")
            .map(([pId, rId]) => {
                const match = pool.find((p: any) => p.product_id === pId);
                const qty = Number(match?.predicted_purchase_units || 0);
                const prc = Number(match?.wholesaler_procurement_offers?.unit_pricing?.final_unit_selling_price || 0);
                return {
                    product_id: pId,
                    wholesaler_receipt_id: rId,
                    title: match?.title || "UNSPECIFIED",
                    quantity: qty,
                    price: prc,
                    total: qty * prc
                };
            })
            .filter(i => i.quantity > 0);

        const documentPayload: CachedIndentSelection = {
            id: STORAGE_KEY,
            retailer_indent_id: retailerIndentId,
            retailer_id: retailerId,
            items: itemsList,
            updated_at: new Date().toISOString()
        };

        if (Platform.OS === 'web') {
            itemsList.length === 0 ? await db.indents.delete(STORAGE_KEY) : await db.indents.put(documentPayload);
        } else {
            itemsList.length === 0 ? await AsyncStorage.removeItem(STORAGE_KEY) : await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(documentPayload));
        }
    }

    const updateSelections = useCallback(async (
        nextSelections: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
        currentPool: any[]
    ) => {
        try {
            let targetNextMap: Record<string, string>;

            if (typeof nextSelections === 'function') {
                setSelectedOffers(prev => {
                    targetNextMap = nextSelections(prev);
                    executePersist(targetNextMap, currentPool);
                    return targetNextMap;
                });
            } else {
                targetNextMap = nextSelections;
                setSelectedOffers(targetNextMap);
                await executePersist(targetNextMap, currentPool);
            }
        } catch (e) {
            console.error('❌ Write Sync Failure:', e);
        }
    }, [retailerIndentId, retailerId]);

    const cacheIntentItems = useCallback(async (predictions: any[]) => {
        try {
            if (!predictions || predictions.length === 0) return;
            setCachedIntents(predictions);

            if (Platform.OS === 'web') {
                await db.procurementIntents.clear();
                await db.procurementIntents.bulkPut(predictions.map(p => ({
                    product_id: p.product_id,
                    title: p.title || '',
                    bar_code: p.bar_code || '',
                    predicted_purchase_units: Number(p.predicted_purchase_units || 0),
                    metrics_in_units: {
                        total_physical_stock: Number(p.metrics_in_units?.total_physical_stock || 0),
                        average_daily_sales: Number(p.metrics_in_units?.average_daily_sales || 0)
                    },
                    wholesaler_procurement_offers: p.wholesaler_procurement_offers,
                    cached_at: new Date().toISOString()
                })));
            } else {
                await AsyncStorage.setItem(INTENTS_CACHE_KEY, JSON.stringify(predictions));
            }
        } catch (e) {
            console.error('❌ Cache Intents Failure:', e);
        }
    }, []);

    const deleteIndent = useCallback(async () => {
        setSelectedOffers({});
        setCachedIntents([]);
        if (Platform.OS === 'web') {
            await db.indents.delete(STORAGE_KEY);
            await db.procurementIntents.clear();
        } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
            await AsyncStorage.removeItem(INTENTS_CACHE_KEY);
        }
    }, []);

    const getGroupedWholesalerOrders = useCallback(() => {
        const orderMap: Record<string, any> = {};

        Object.entries(selectedOffers)
            .filter(([_, wholesalerReceiptId]) => wholesalerReceiptId !== "")
            .forEach(([productId, wholesalerReceiptId]) => {
                const intentMatch = cachedIntents.find((p: any) => p.product_id === productId);
                if (!intentMatch) return;

                const qty = Number(intentMatch.predicted_purchase_units || 0);
                const offer = intentMatch.wholesaler_procurement_offers;
                const prc = Number(offer?.unit_pricing?.final_unit_selling_price || 0);

                if (qty <= 0) return;

                const wholesalerId = offer?.wholesaler_id || "unknown_wholesaler";
                const wholesalerTitle = offer?.wholesaler_title || "Unspecified Wholesaler";

                const lineItem = {
                    product_id: productId,
                    title: intentMatch.title || "UNSPECIFIED",
                    quantity: qty,
                    price: prc,
                    total: qty * prc
                };

                if (!orderMap[wholesalerId]) {
                    orderMap[wholesalerId] = {
                        id: `draft_${wholesalerId}`,
                        document_number: `IND-${wholesalerId.substring(0, 5).toUpperCase()}`,
                        created: new Date().toLocaleDateString(),
                        wholesaler_title: wholesalerTitle,
                        order_items: [],
                        final_price_total: 0,
                        is_paid: 'false',
                        status: 'DRAFT_INDENT'
                    };
                }

                orderMap[wholesalerId].order_items.push(lineItem);
                orderMap[wholesalerId].final_price_total += lineItem.total;
            });

        return Object.values(orderMap);
    }, [selectedOffers, cachedIntents]);

    return {
        selectedOffers,
        cachedIntents,
        updateSelections,
        cacheIntentItems,
        deleteIndent,
        isHydrating: isLoading,
        groupedWholesalerOrders: getGroupedWholesalerOrders()
    };
}
