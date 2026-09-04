import { CachedIndentSelection, db, LocalIndentItemLine } from '@/databases/db';
import * as SecureStore from 'expo-secure-store';
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
                    const savedIndent = await SecureStore.getItemAsync(STORAGE_KEY);
                    if (savedIndent) {
                        const parsedDoc: CachedIndentSelection = JSON.parse(savedIndent);
                        const nextMap: Record<string, string> = {};
                        parsedDoc.items.forEach(i => { nextMap[i.product_id] = i.wholesaler_receipt_id; });
                        setSelectedOffers(nextMap);
                    }
                    const savedIntents = await SecureStore.getItemAsync(INTENTS_CACHE_KEY);
                    if (savedIntents) setCachedIntents(JSON.parse(savedIntents));
                }
            } catch (e) { console.error('❌ Hydration Failure:', e); }
            finally { setIsLoading(false); }
        }
        hydrateSelections();
    }, []);

    const updateSelections = useCallback(async (nextSelections: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>), currentPool: any[]) => {
        try {
            let resolveNextMap: Record<string, string>;
            if (typeof nextSelections === 'function') {
                setSelectedOffers(prev => { resolveNextMap = nextSelections(prev); return resolveNextMap; });
            } else {
                resolveNextMap = nextSelections;
                setSelectedOffers(resolveNextMap);
            }
            setTimeout(async () => {
                const itemsList: LocalIndentItemLine[] = Object.entries(resolveNextMap)
                    .filter(([_, rId]) => rId !== "")
                    .map(([pId, rId]) => {
                        const match = currentPool.find((p: any) => p.product_id === pId);
                        const qty = Number(match?.predicted_purchase_units || 0);
                        const prc = Number(match?.wholesaler_procurement_offers?.unit_pricing?.final_unit_selling_price || 0);
                        return { product_id: pId, wholesaler_receipt_id: rId, title: match?.title || "UNSPECIFIED", quantity: qty, price: prc, total: qty * prc };
                    })
                    .filter(i => i.quantity > 0);

                const documentPayload: CachedIndentSelection = { id: STORAGE_KEY, retailer_indent_id: retailerIndentId, retailer_id: retailerId, items: itemsList, updated_at: new Date().toISOString() };
                if (Platform.OS === 'web') {
                    itemsList.length === 0 ? await db.indents.delete(STORAGE_KEY) : await db.indents.put(documentPayload);
                } else {
                    itemsList.length === 0 ? await SecureStore.deleteItemAsync(STORAGE_KEY) : await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(documentPayload));
                }
            }, 0);
        } catch (e) { console.error('❌ Write Sync Failure:', e); }
    }, [retailerIndentId, retailerId]);

    const cacheIntentItems = useCallback(async (predictions: any[]) => {
        try {
            if (!predictions || predictions.length === 0) return;
            setCachedIntents(predictions);
            setTimeout(async () => {
                if (Platform.OS === 'web') {
                    await db.procurementIntents.clear();
                    await db.procurementIntents.bulkPut(predictions.map(p => ({
                        product_id: p.product_id, title: p.title || '', bar_code: p.bar_code || '', predicted_purchase_units: Number(p.predicted_purchase_units || 0),
                        metrics_in_units: { total_physical_stock: Number(p.metrics_in_units?.total_physical_stock || 0), average_daily_sales: Number(p.metrics_in_units?.average_daily_sales || 0) },
                        wholesaler_procurement_offers: p.wholesaler_procurement_offers, cached_at: new Date().toISOString()
                    })));
                } else {
                    await SecureStore.setItemAsync(INTENTS_CACHE_KEY, JSON.stringify(predictions));
                }
            }, 0);
        } catch (e) { console.error('❌ Cache Intents Failure:', e); }
    }, []);

    const deleteIndent = useCallback(async () => {
        setSelectedOffers({});
        setCachedIntents([]);
        if (Platform.OS === 'web') {
            await db.indents.delete(STORAGE_KEY);
            await db.procurementIntents.clear();
        } else {
            await SecureStore.deleteItemAsync(STORAGE_KEY);
            await SecureStore.deleteItemAsync(INTENTS_CACHE_KEY);
        }
    }, []);

    return { selectedOffers, cachedIntents, updateSelections, cacheIntentItems, deleteIndent, isHydrating: isLoading };
}
