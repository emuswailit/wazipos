
import { useProductsSync } from "@/context/ProductsSyncContext";
import { OutOfStockRecord } from "@/databases/types";
import { useOutOfStockRepository } from "@/databases/useOutOfStockRepository";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

export function useOutOfStockDashboard(outOfStockApi: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedEditItem, setSelectedEditItem] = useState<OutOfStockRecord | null>(null);
    const [backlogItems, setBacklogItems] = useState<OutOfStockRecord[]>([]);

    // Consume products natively from the pre-hydrated global sync provider
    const { productsList, isProductsSyncing } = useProductsSync();
    const oosDb = useOutOfStockRepository();

    // Telemetry trace debugger logs for out of stock actions
    useEffect(() => {
        if (outOfStockApi.data) console.log("📥 [Wazipos Debug] Shortages Payload Data:", JSON.stringify(outOfStockApi.data));
    }, [outOfStockApi.data]);

    const syncShortagesLedgerData = useCallback(async () => {
        try {
            const res = await outOfStockApi.request({ "action": "RetrieveOutOfStockItems" });
            const rawShortages = res?.data?.results || outOfStockApi?.data?.results;

            if (res?.ok && Array.isArray(rawShortages)) {
                const timestamp = new Date().toISOString();
                const parsedRecords: OutOfStockRecord[] = rawShortages.map((item: any) => ({
                    id: String(item.id), entity: String(item.entity || ''), product: String(item.product || ''), unit_of_receipt: String(item.unit_of_receipt || 'Piece'), product_title: String(item.product_title || 'UNSPECIFIED'), units_per_pack: Number(item.units_per_pack) || 1, customer: item.customer || null, customer_name: item.customer_name || '', customer_phone: item.customer_phone || '', required_quantity: Number(item.required_quantity || 0), is_special_order: String(item.is_special_order || 'true'), is_ordered: String(item.is_ordered || 'false'), retailer_indent: item.retailer_indent || null, created: String(item.created || ''), updated: String(item.updated || ''), owner: String(item.owner || ''), images: [], cached_at: timestamp
                }));

                await oosDb.bulkPutShortages(parsedRecords);
                setBacklogItems(parsedRecords);
            }
        } catch (err) { console.error("Shortage fetch tracking fault loop:", err); }
    }, [outOfStockApi, oosDb]);

    // LOCAL FIRST HYDRATION
    useEffect(() => {
        oosDb.getAllShortages().then(list => list?.length && setBacklogItems(list));
        syncShortagesLedgerData();
    }, []);

    // Reactive fuzzy search and tabular tracking computations
    const filteredItems = useMemo(() => {
        const safeBacklog = Array.isArray(backlogItems) ? backlogItems : [];
        const normQuery = searchQuery.toLowerCase().trim();
        if (!normQuery) return safeBacklog;
        return safeBacklog.filter(i => (i.product_title || '').toLowerCase().includes(normQuery));
    }, [searchQuery, backlogItems]);

    const stats = useMemo(() => {
        const safeBacklog = Array.isArray(backlogItems) ? backlogItems : [];
        return {
            totalLines: safeBacklog.length,
            totalUnits: safeBacklog.reduce((acc, curr) => acc + (curr.required_quantity || 0), 0)
        };
    }, [backlogItems]);

    const handleFormSubmit = async (values: any) => {
        if (!values.product) return;
        const isEditing = selectedEditItem !== null;

        const payload: any = {
            action: isEditing ? "UpdateOutOfStockItem" : "CreateOutOfStockItem",
            product: String(values.product.id),
            required_quantity: parseInt(values.required_quantity, 10),
            customer_name: values.customer_name || null,
            customer_phone: values.customer_phone || null
        };

        if (isEditing) {
            payload.out_of_stock_item_id = selectedEditItem.id;
        }

        console.log(`🚀 [Wazipos Dispatch] Executing payload:`, JSON.stringify(payload));
        const res = await outOfStockApi.request(payload);
        const serverItem = res?.data?.data || res?.data;

        if (res.ok && serverItem) {
            const timestamp = new Date().toISOString();
            const runtimeRecord: OutOfStockRecord = {
                id: String(serverItem.id || (isEditing ? selectedEditItem.id : Math.random().toString())),
                entity: String(serverItem.entity || ''),
                product: String(serverItem.product || values.product.id),
                unit_of_receipt: String(serverItem.unit_of_receipt || 'Piece'),
                product_title: String(serverItem.product_title || values.product.title || values.product.product_name || 'UNSPECIFIED'),
                units_per_pack: Number(serverItem.units_per_pack || 1),
                customer: serverItem.customer || null,
                customer_name: serverItem.customer_name || values.customer_name || '',
                customer_phone: serverItem.customer_phone || values.customer_phone || '',
                required_quantity: Number(serverItem.required_quantity || values.required_quantity),
                is_special_order: String(serverItem.is_special_order || 'true'),
                is_ordered: String(serverItem.is_ordered || 'false'),
                retailer_indent: serverItem.retailer_indent || null,
                created: String(serverItem.created || (isEditing ? selectedEditItem.created : timestamp)),
                updated: timestamp,
                owner: String(serverItem.owner || ''),
                images: [],
                cached_at: timestamp
            };

            if (isEditing) {
                await oosDb.updateShortageItem(runtimeRecord);
                setBacklogItems(prev => prev.map(item => item.id === runtimeRecord.id ? runtimeRecord : item));
            } else {
                await oosDb.addShortageItem(runtimeRecord);
                setBacklogItems(prev => [runtimeRecord, ...prev]);
            }

            setModalVisible(false);
            Alert.alert("Success", "Shortage anomaly log updated successfully.");
        } else {
            Alert.alert("Error", "Failed to commit shortage log entry.");
        }
    };

    return {
        searchQuery,
        setSearchQuery,
        modalVisible,
        setModalVisible,
        selectedEditItem,
        setSelectedEditItem,
        productOptions: productsList, // Forward shared global context directly down to autocomplete selections
        localDbLoading: isProductsSyncing,
        oosDbLoading: outOfStockApi.loading,
        filteredItems,
        stats,
        syncShortagesLedgerData,
        handleFormSubmit
    };
}
