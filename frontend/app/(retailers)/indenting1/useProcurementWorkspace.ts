import retailersApi from "@/api/retailersApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, useWindowDimensions } from 'react-native';
import useProcurementIndent from "./useProcurementIndent";

export function useProcurementWorkspace() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 800;

    const [searchQuery, setSearchQuery] = useState('');
    const [daysToOrder, setDaysToOrder] = useState('7');
    const [leadTimeDays, setLeadTimeDays] = useState('3');
    const [lookbackWindow, setLookbackWindow] = useState('30');
    const [budgetCap, setBudgetCap] = useState('500000');
    const [maxShelfDays, setMaxShelfDays] = useState('180');
    const [onlyShowBacklog, setOnlyShowBacklog] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [localRefreshTick, setLocalRefreshTick] = useState(0);

    const getPredictionsApi = useApi<any>(async (p: any) => await retailersApi.getProcurementPredictionsAction(p));
    const generateOrdersApi = useApi<any>(retailersApi.postCloseAndGenerateOrdersAction);

    const activeIndentId = getPredictionsApi.data?.retailer_indent_id || 'OFFLINE_DRAFT';
    const activeRetailerId = getPredictionsApi.data?.retailer_id || null;

    const { selectedOffers, cachedIntents, updateSelections, cacheIntentItems, deleteIndent, isHydrating } = useProcurementIndent(activeIndentId, activeRetailerId);

    const pool = useMemo(() => getPredictionsApi.data?.predictions || cachedIntents || [], [getPredictionsApi.data, cachedIntents, localRefreshTick]);

    const handleFetchParams = () => {
        getPredictionsApi.request({
            days_to_order: parseInt(daysToOrder, 10) || 7, lead_time_days: parseInt(leadTimeDays, 10) || 3,
            lookback_window: parseInt(lookbackWindow, 10) || 30, max_shelf_days: parseInt(maxShelfDays, 10) || 180
        }).then((res: any) => {
            if (res?.ok && res?.data?.predictions) {
                cacheIntentItems(res.data.predictions);
                setLocalRefreshTick(p => p + 1);
            }
        }).catch(() => console.log("⚠️ Connection offline. Fallback active."));
        setCurrentPage(1);
    };

    useEffect(() => { if (!isHydrating) handleFetchParams(); }, [isHydrating]);

    useEffect(() => {
        if (getPredictionsApi.data) console.log("[RAW API DATA INGESTION]:", JSON.stringify(getPredictionsApi.data));
    }, [getPredictionsApi.data]);

    const indentDocumentData = useMemo(() => {
        const items = Object.entries(selectedOffers).filter(([_, rId]) => rId !== "").map(([pId, rId]) => {
            const item = pool.find((p: any) => p.product_id === pId);
            const qty = Number(item?.predicted_purchase_units || 0);
            const price = Number(item?.wholesaler_procurement_offers?.unit_pricing?.final_unit_selling_price || 0);
            return { product_id: pId, wholesaler_receipt_id: rId, title: item?.title || "Line Item", quantity: qty, price, total: qty * price };
        }).filter(i => i.quantity > 0);
        return items.length > 0 ? { retailer_indent_id: activeIndentId, retailer_id: activeRetailerId, items } : null;
    }, [selectedOffers, pool, activeIndentId, activeRetailerId]);

    useEffect(() => { console.log("[RAW LOCAL INDENT MUTATION]:", JSON.stringify(indentDocumentData)); }, [indentDocumentData]);

    const isBudgetBreached = useMemo(() => {
        if (!indentDocumentData?.items?.length) return false;
        const limit = parseFloat(budgetCap.replace(/[^0-9.]/g, '')) || 0;
        return limit > 0 && indentDocumentData.items.reduce((acc, i) => acc + i.total, 0) > limit;
    }, [indentDocumentData, budgetCap]);

    const isAllSelected = useMemo(() => {
        const targets = pool.filter((p: any) => Number(p.predicted_purchase_units || 0) > 0 && p.wholesaler_procurement_offers);
        return targets.length > 0 && targets.every((p: any) => selectedOffers[p.product_id] === p.wholesaler_procurement_offers.wholesaler_receipt_id);
    }, [selectedOffers, pool]);

    const handleSelectAll = () => {
        const targets = pool.filter((p: any) => Number(p.predicted_purchase_units || 0) > 0 && p.wholesaler_procurement_offers);
        if (isAllSelected) return updateSelections({}, pool);
        const nextMap: Record<string, string> = {};
        targets.forEach((p: any) => { nextMap[p.product_id] = p.wholesaler_procurement_offers.wholesaler_receipt_id; });
        updateSelections(nextMap, pool);
    };

    const handleToggleOffer = (item: any, rId: string) => {
        updateSelections(prev => ({ ...prev, [item.product_id]: prev[item.product_id] === rId ? "" : rId }), pool);
    };

    const handleCheckoutCommit = async () => {
        const emptyMsg = "This requisition matrix draft contains no selected product offer lines. Please check at least one supplier offer line before trying to finalize or close the indent workbench.";
        if (!indentDocumentData || !indentDocumentData.items || indentDocumentData.items.length === 0) {
            if (Platform.OS === 'web') {
                window.alert(`Indent Empty ⚠️\n\n${emptyMsg}`);
            } else {
                Alert.alert("Indent Empty ⚠️", emptyMsg);
            }
            return;
        }
        const res = await generateOrdersApi.request({
            indent_id: activeIndentId,
            items: indentDocumentData.items.map(i => ({ product_id: i.product_id, wholesaler_receipt_id: i.wholesaler_receipt_id, requested_quantity: i.quantity }))
        });
        console.log("[DEBUG] Raw generateOrdersApi output:", res);
        if (res?.ok || res?.status === 200 || res?.status === 201 || res?.data?.success === true) {
            const successMsg = "Supply chain orders generated successfully.";
            if (Platform.OS === 'web') {
                window.alert(`Success 🎉\n\n${successMsg}`);
                await deleteIndent();
                handleFetchParams();
                setLocalRefreshTick(p => p + 1);
            } else {
                Alert.alert("Success 🎉", successMsg, [{
                    text: "OK",
                    onPress: async () => {
                        await deleteIndent();
                        handleFetchParams();
                        setLocalRefreshTick(p => p + 1);
                    }
                }]);
            }
        } else {
            const errorMsg = generateOrdersApi.errorMessage || res?.data?.message || "Order checkout declined.";
            if (Platform.OS === 'web') {
                window.alert(`Failure ⚠️\n\n${errorMsg}`);
            } else {
                Alert.alert("Failure ⚠️", errorMsg);
            }
        }
    };

    const matrixData = useMemo(() => onlyShowBacklog ? pool.filter((p: any) => Number(p.predicted_purchase_units || 0) > 0) : pool, [onlyShowBacklog, pool]);

    return {
        theme, isDarkMode, isLarge, searchQuery, setSearchQuery: (q: string) => { setSearchQuery(q); setCurrentPage(1); },
        daysToOrder, setDaysToOrder, leadTimeDays, setLeadTimeDays, lookbackWindow, setLookbackWindow, maxShelfDays, setMaxShelfDays, budgetCap, setBudgetCap,
        onlyShowBacklog, setOnlyShowBacklog, currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, isHydrating,
        getPredictionsApi, generateOrdersApi, selectedOffers, matrixData, indentDocumentData, isBudgetBreached, isAllSelected,
        handleFetchParams, handleSelectAll, handleToggleOffer, handleCheckoutCommit
    };
}
