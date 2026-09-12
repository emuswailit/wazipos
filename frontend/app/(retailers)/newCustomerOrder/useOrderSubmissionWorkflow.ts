import { dbInstance } from '@/databases/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { triggerLocalPushNotification } from './notificationHelper';

const isWeb = Platform.OS === 'web';

export function useOrderSubmissionWorkflow({
    user, isOnline, paymentMethodsList, selectedPaymentMethodId, paymentDetails, deliveryMethod, processedLineItems,
    submitOrderToRemote, deductLocalInventoryStock, triggerBanner, setMomoActiveDraftId, setMomoActiveOrderNumber,
    setMomoActiveDraftItems, setIsMomoPolling, persistFinalCustomerOrder, clearStorageActiveLines, forceImmediateSyncQueuePass,
    setLineItems, resetFulfillmentForm, setIsBottomSheetVisible, setPaymentDetails, setSelectedPaymentMethodId,
    setDeliveryMethod, getTodayString, momoActiveDraftId, momoActiveOrderNumber, momoActiveItems, refreshLocalOrderStatistics
}: any) {

    const mapItems = (arr: any[], draftId: string, full = false) => arr.map((i: any) => {
        const base = {
            retailer_receipt: String(i.selectedProduct || i.retailer_receipt || ''),
            purchased_quantity: i.quantity || i.purchased_quantity,
            unit_selling_price: Number(i.price || i.unit_selling_price || 0).toFixed(2),
            final_unit_selling_price: Number((i.price || i.unit_selling_price || 0) - ((i.discount || i.item_discount || 0) / (i.quantity || i.purchased_quantity || 1))).toFixed(2),
            item_discount: Number(i.discount || i.item_discount || 0).toFixed(2)
        };
        return full ? { ...base, customer_order_draft_id: draftId, product_name: i.selectedProductTitle || i.product_name || 'Product', status: 'OPEN', quantity_discount_id: null, quantity_discount_name: null, price_discount_id: null, price_discount_name: null } : base;
    });

    const buildOrder = (draft: string, num: string, synced: boolean, paid: boolean, uuid: string, items: any[]) => ({
        draft_id: draft, order_number: num, status: 'OPEN', is_paid: paid, synced, user_id: String(user?.id || 'unknown_vendor'),
        title: `Order for ${paymentDetails.customerName || 'Walk-in Customer'}`, customerName: paymentDetails.customerName || 'Walk-in Customer',
        customerPhone: paymentDetails.customerPhone || '', deliveryMethod, shippingCost: 0, selectedPaymentMethodId: String(selectedPaymentMethodId || ''),
        paymentAccountNumber: paymentDetails.mobileMoneyNumber || '', dueDate: !paid && paymentMethodsList.find((m: any) => m.id === selectedPaymentMethodId)?.title?.toUpperCase() === 'CREDIT' ? paymentDetails.dueDate : null,
        updatedAt: new Date().toISOString(), customerOrderItems: items, vendor_session_id: '', remote_id: uuid, ...(!isWeb && { id: Date.now() })
    });

    const handleSaveOrder = async () => {
        try {
            const activeMethodTitle = paymentMethodsList.find((m: any) => m.id === selectedPaymentMethodId)?.title?.toUpperCase() || '';
            if (activeMethodTitle === 'MOBILE MONEY' && !isOnline) return triggerBanner('danger', "Checkout Rejected", "No internet connection detected. MOBILE MONEY orders cannot be buffered offline.");

            const draftId = `${user?.id || 'unknown_vendor'}:${Date.now()}`;
            const orderNum = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
            const payload = mapItems(processedLineItems, draftId);

            const res = await submitOrderToRemote({ paymentDetails, selectedPaymentMethodId: String(selectedPaymentMethodId), deliveryMethod, activeMethodTitle, generatedDraftId: draftId, orderItemsPayload: payload });

            if (activeMethodTitle === 'MOBILE MONEY') {
                if (res?.ok) {
                    setMomoActiveDraftId(draftId); setMomoActiveOrderNumber(orderNum); setMomoActiveDraftItems(payload); setIsMomoPolling(true);
                } else {
                    triggerBanner('danger', res?.errors ? "Server Transaction Refused" : "Verification Blocked", res?.errors ? (Array.isArray(res.errors) ? res.errors.join(', ') : String(res.errors)) : "M-Pesa validation streams require active server handshakes.");
                }
                return;
            }

            const ok = !!res?.ok;
            const srv = res?.data?.data || res?.data;
            const uuid = String(srv?.id || srv?.order_id || srv?.remote_id || srv?.customer_order_details?.id || "");

            if (ok) {
                await deductLocalInventoryStock(payload);
                triggerBanner('success', "Order Saved Remotely", `Reference number signature #${orderNum} stored successfully.`);
                await triggerLocalPushNotification("✨ Order Created Successfully", `Order #${orderNum} has been verified and synced with the backend matrix.`);
            } else {
                triggerBanner('success', "Saved to Local Cache", `Reference number #${orderNum} cached securely for auto-sync.`);
                await triggerLocalPushNotification("🗒️ Order Saved Locally", `Order #${orderNum} has been buffered into offline memory storage.`);
            }

            if (persistFinalCustomerOrder) await persistFinalCustomerOrder(buildOrder(draftId, orderNum, ok, false, uuid, mapItems(processedLineItems, draftId, true)), draftId);
            await clearStorageActiveLines();
            if (isOnline && !ok) forceImmediateSyncQueuePass();

            setLineItems([{ id: Date.now().toString(), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
            resetFulfillmentForm();
            if (refreshLocalOrderStatistics) await refreshLocalOrderStatistics();
        } catch (e) { console.error("🚨 [WORKFLOW FAILURE]: handleSaveOrder block crash:", e); }
    };

    const handleMomoVerificationFinished = async (success: boolean, msg: string, triggerManualFetch?: () => Promise<void>) => {
        setIsMomoPolling(false);
        if (!success) return;
        try {
            if (persistFinalCustomerOrder) await persistFinalCustomerOrder(buildOrder(momoActiveDraftId, momoActiveOrderNumber, true, true, momoActiveDraftId, mapItems(momoActiveItems, momoActiveDraftId, true)), momoActiveDraftId);

            if (isWeb) {
                const match = await dbInstance.customerOrders.where('draft_id').equals(momoActiveDraftId).first();
                if (match?.id !== undefined) await dbInstance.customerOrders.update(match.id, { synced: "TRUE", is_paid: true });
            } else {
                const raw = await AsyncStorage.getItem('wazipos_customer_orders_payload');
                const fullList: any[] = raw ? JSON.parse(raw) : [];
                const match = fullList.find((x: any) => x.draft_id === momoActiveDraftId);
                if (match) { match.synced = "TRUE"; match.is_paid = true; }
                await AsyncStorage.setItem('wazipos_customer_orders_payload', JSON.stringify(fullList));
            }
            if (triggerManualFetch) await triggerManualFetch();
            if (refreshLocalOrderStatistics) await refreshLocalOrderStatistics();
        } catch (e) { console.error("🚨 [WORKFLOW MOBILE MONEY UPDATER CRASH]:", e); }
    };

    return { handleSaveOrder, handleMomoVerificationFinished };
}
