import { db } from '@/databases/db';
import * as Network from 'expo-network';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

export function useOrderFormSubmission(submitOrderApi, activeUserSession, onSubmitOrder) {
    const [showSuccessBanner, setShowSuccessBanner] = useState(false);
    const [bannerRefCode, setBannerRefCode] = useState('');
    const userId = activeUserSession?.id || "unknown_vendor";

    const submitWorkflow = async (formState) => {
        const {
            computedTotals, selectedPaymentMethodId, deliveryMethod, isCredit,
            isMobileMoney, customerName, customerPhone, dueDate, shippingCost,
            paymentAccountNumber, resetForm
        } = formState;

        const items = computedTotals.lineItemsWithTotals.filter(i => i.selectedProduct !== null && (Number(i.quantity) || 0) > 0);
        if (!items.length) return;

        if (!selectedPaymentMethodId || !deliveryMethod) return Alert.alert("Error", "⚠️ Missing payment or delivery channel.");
        if (isCredit && (!customerName.trim() || !customerPhone.trim() || !dueDate.trim())) return Alert.alert("Error", "⚠️ Credit fields mandatory.");
        if (isMobileMoney && !accNum.trim()) return Alert.alert("Error", "⚠️ Account phone number required.");

        const hasNet = Platform.OS === 'web' ? navigator.onLine : (await Network.getNetworkStateAsync()).isConnected;
        if (!hasNet && isMobileMoney) return Alert.alert("Action Blocked", "🛑 Mobile Money processing is restricted while offline.");

        const draftId = `draft-${Date.now()}`;
        const isPaid = !(isCredit || isMobileMoney);

        const orderItemsPayload = items.map(i => {
            const qty = Number(i.quantity) || 1;
            let k = i.selectedProduct, n = i.selectedProductTitle, pObj = null;

            if (typeof i.selectedProduct === 'string') {
                try { pObj = JSON.parse(i.selectedProduct); } catch { }
            } else if (i.selectedProduct) { pObj = i.selectedProduct; }

            if (pObj) {
                k = pObj.key || pObj.id || k;
                n = pObj.title || pObj.product_name || n;
            }

            const baseP = Number(pObj?.price || pObj?.unit_selling_price || i.price || 0);
            const disc = Number(i.discount || 0);
            const finalP = disc > 0 ? Math.max(0, baseP - (disc / qty)).toFixed(2) : baseP.toFixed(2);

            return {
                customer_order_draft_id: draftId, purchased_quantity: qty, retailer_receipt: String(k),
                unit_of_issue: "PIECE", unit_selling_price: baseP.toFixed(2), final_unit_selling_price: finalP,
                item_discount: disc.toFixed(2), product_name: n, quantity_discount_id: null,
                quantity_discount_name: null, price_discount_id: null, price_discount_name: null, status: "CLOSED"
            };
        });

        const localOrder = {
            draft_id: draftId, order_number: "", status: 'CLOSED', is_paid: isPaid, synced: false,
            user_id: userId, title: `Order ${draftId}`, customerName: isCredit ? customerName.trim() : "Walk-in Retail Customer",
            customerPhone: customerPhone.trim(), deliveryMethod, shippingCost: parseFloat(shippingCost) || 0,
            selectedPaymentMethodId, paymentAccountNumber: paymentAccountNumber.trim(), dueDate: isCredit ? (dueDate.trim() || null) : null,
            vendor_session_id: userId, updatedAt: new Date().toISOString(), customerOrderItems: orderItemsPayload
        };

        if (db?.upsertOrder) await db.upsertOrder(localOrder);

        if (!hasNet) {
            if (!isCredit) {
                try {
                    const cached = await db.getRetailerReceipts();
                    if (cached?.length) {
                        await db.saveRetailerReceipts(cached.map((s) => {
                            const m = orderItemsPayload.find(item => item.retailer_receipt === s.key || item.retailer_receipt === s.id);
                            if (m) s.current_unit_quantity = Math.max(0, (s.current_unit_quantity || 0) - m.purchased_quantity);
                            return s;
                        }));
                    }
                } catch { }
            }
            Alert.alert("Offline Preserved", "🎉 Saved to device cache!");
            onSubmitOrder?.({ items, totalAmount: computedTotals.grandTotal });
            await resetForm();
            return;
        }

        const res = await submitOrderApi.request({
            action: "CreateCustomerOrder",
            customer_order_details: {
                city_name: "", customer_name: localOrder.customerName, customer_phone: localOrder.customerPhone,
                destination_latitude: 0, destination_longitude: 0, draft_id: draftId, farness: "",
                order_channel: Platform.OS === 'web' ? "WEB" : "ANDROID", order_origin: Platform.OS === 'web' ? "WEB" : Platform.OS.toUpperCase(),
                delivery_method: deliveryMethod, shipping_amount: (shippingCost || "0.00"), payment_method: selectedPaymentMethodId,
                payment_account_number: localOrder.paymentAccountNumber, credit_due_date: localOrder.dueDate, vendor_session_id: localOrder.vendor_session_id,
                order_items: orderItemsPayload
            }
        });

        const srv = res?.data?.data || res?.data;
        const rNum = srv?.order_number || srv?.customer_order_details?.order_number || "";
        const msg = res?.data?.message || res?.message || "Order registered successfully.";
        const errs = res?.data?.errors || res?.errors;

        if (res?.ok || res?.status === 200 || res?.status === 201) {
            if (db?.upsertOrder) await db.upsertOrder({ ...localOrder, synced: true, order_number: rNum });
            setBannerRefCode(rNum || draftId);
            setShowSuccessBanner(true);
            onSubmitOrder?.({ items, totalAmount: computedTotals.grandTotal, orderNumber: rNum });
            await resetForm();
            Alert.alert("Success", msg);
        } else {
            const errorMsg = errs ? (typeof errs === 'object' ? JSON.stringify(errs) : errs) : msg;
            Alert.alert("Submission Failed", `⚠️ ${errorMsg}`);
        }
    };

    return { showSuccessBanner, setShowSuccessBanner, bannerRefCode, submitWorkflow };
}
