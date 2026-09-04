import retailersApi from '@/api/retailersApi';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext'; // 🚀 TAPS NATIVELY INTO YOUR GLOBAL CONTEXT DRIVER
import { db } from '@/databases/db';
import useApi from '@/hooks/useApi';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { OrderLineItem } from './types';

export function useUniversalOrderCreator(activeUserSession: any, onSubmitOrder?: (payload: { items: any[]; totalAmount: number }) => void) {
    const submitOrderApi = useApi(retailersApi.retailStaffAction);
    const { paymentMethodsList, isPaymentSyncing } = usePaymentMethodsSync(); // 🚀 CLEANLY EXTRACTED

    const [lineItems, setLineItems] = useState<OrderLineItem[]>(() => [
        { id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }
    ]);
    const [selectedPaymentMethodId, setSelectedPaymentMethodMethodId] = useState<string>('');
    const [customerName, setCustomerName] = useState<string>('');
    const [customerPhone, setCustomerPhone] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [deliveryMethod, setDeliveryMethod] = useState<string>('');
    const [shippingCost, setShippingCost] = useState<string>('');
    const [paymentAccountNumber, setPaymentAccountNumber] = useState<string>('');

    useEffect(() => {
        const loadSavedState = async () => {
            try {
                if (db?.getLineItems) {
                    const saved = await db.getLineItems();
                    if (saved && saved.length > 0) setLineItems(saved);
                }
            } catch (e) { }
        };
        loadSavedState();
    }, []);

    // 🚀 FIXED REAL-TIME INTERCEPTOR: Every modification to the line items writes to storage in the background automatically
    useEffect(() => {
        if (db?.saveLineItems && lineItems.length > 0) {
            db.saveLineItems(lineItems).catch(err => console.error(err));
        }
    }, [lineItems]);

    const isCreditSelected = useMemo(() => {
        const m = paymentMethodsList.find(i => i.id === selectedPaymentMethodId);
        return m?.title?.toUpperCase().includes('CREDIT') || false;
    }, [selectedPaymentMethodId, paymentMethodsList]);

    const isMobileMoneySelected = useMemo(() => {
        const m = paymentMethodsList.find(i => i.id === selectedPaymentMethodId);
        return m?.title?.toUpperCase().includes('MOBILE MONEY') || m?.title?.toUpperCase().includes('MPESA') || false;
    }, [selectedPaymentMethodId, paymentMethodsList]);

    const handleAddNewItem = () => {
        setLineItems((prev) => {
            const ids = prev.map(i => Number(i.id) || 0);
            const nextId = Math.max(0, ...ids) + 1;
            return [...prev, { id: String(nextId), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }];
        });
    };

    const handleDeleteItem = (targetId: string) => {
        setLineItems((prev) => {
            let next = prev.filter(i => i.id !== targetId);
            if (next.length === 0) next = [{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }];
            return next;
        });
    };

    const updateLineItem = (id: string, updates: Partial<OrderLineItem>) => {
        setLineItems((prev) => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    };

    const setLineItemsWithContext = (action: any) => {
        setLineItems((prev) => typeof action === 'function' ? action(prev) : action);
    };

    const computedTotals = useMemo(() => {
        let gross = 0;
        const list = lineItems.map(i => {
            let innerPriceValue = 0;
            if (typeof i.selectedProduct === 'string') {
                try {
                    const parsed = JSON.parse(i.selectedProduct);
                    innerPriceValue = Number(parsed?.price || 0);
                } catch {
                    innerPriceValue = Number(i.price || 0);
                }
            } else {
                innerPriceValue = Number(i.price || 0);
            }
            const base = innerPriceValue;
            const qty = Number(i.quantity) || 0;
            const amount = Math.max(0, (base * qty) - (i.discount || 0));
            gross += amount; return { ...i, calculatedLineAmount: amount };
        });
        gross += deliveryMethod === 'DELIVERY' ? (parseFloat(shippingCost) || 0) : 0;
        return { lineItemsWithTotals: list, grandTotal: gross };
    }, [lineItems, deliveryMethod, shippingCost]);

    const handleFormSubmission = async () => {
        const items = computedTotals.lineItemsWithTotals.filter(i => i.selectedProduct !== null && (Number(i.quantity) || 0) > 0);
        if (items.length === 0) return;
        if (!selectedPaymentMethodId || !deliveryMethod) return alert("⚠️ Missing payment/delivery channels.");
        if (isCreditSelected && (!customerName.trim() || !customerPhone.trim() || !dueDate.trim())) return alert("⚠️ Credit fields mandatory.");
        if (isMobileMoneySelected && !paymentAccountNumber.trim()) return alert("⚠️ Phone required.");

        const payload = {
            action: "CreateCustomerOrder",
            customer_order_details: {
                city_name: "", customer_name: isCreditSelected ? customerName.trim() : "Walk-in Retail Customer", customer_phone: customerPhone.trim(),
                destination_latitude: 0.0, destination_longitude: 0.0, draft_id: `draft-${Date.now()}`, farness: "", order_channel: Platform.OS === 'web' ? "WEB" : "ANDROID",
                order_origin: Platform.OS === 'web' ? "WEB" : Platform.OS.toUpperCase(), delivery_method: deliveryMethod, shipping_amount: deliveryMethod === 'DELIVERY' ? (shippingCost || "0.00") : "0.00",
                payment_method: selectedPaymentMethodId, payment_account_number: paymentAccountNumber.trim(), credit_due_date: isCreditSelected ? dueDate.trim() : null, vendor_session_id: activeUserSession?.id || "unknown_vendor",
                order_items: items.map(i => {
                    const totalLineQty = Number(i.quantity) || 1;
                    let targetReceiptKey = "";
                    if (typeof i.selectedProduct === 'string') {
                        try {
                            const parsed = JSON.parse(i.selectedProduct);
                            targetReceiptKey = parsed?.key || parsed?.id || "";
                        } catch {
                            targetReceiptKey = i.selectedProduct;
                        }
                    }
                    return {
                        purchased_quantity: totalLineQty, retailer_receipt: targetReceiptKey, unit_of_issue: "PIECE",
                        final_unit_selling_price: Math.max(0, ((i.calculatedLineAmount || 0) / totalLineQty)).toFixed(2), item_discount: (i.discount || 0).toFixed(2)
                    };
                })
            }
        };

        console.log("[PAYLOAD]:", payload);
        const res = await submitOrderApi.request(payload);
        if (res?.ok || res?.status === 200 || res?.status === 201) {
            alert("🎉 Order registered successfully!");
            if (onSubmitOrder) onSubmitOrder({ items, totalAmount: computedTotals.grandTotal });
            setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }]);
            if (db?.clearLineItems) await db.clearLineItems();
            setCustomerName(''); setCustomerPhone(''); setDueDate(''); setPaymentAccountNumber(''); setShippingCost(''); setDeliveryMethod('');
        } else {
            alert("⚠️ Submission failed.");
        }
    };

    return {
        lineItems, selectedPaymentMethodId, setSelectedPaymentMethodMethodId, customerName, setCustomerName, customerPhone, setCustomerPhone, dueDate, setDueDate,
        deliveryMethod, setDeliveryMethod, shippingCost, setShippingCost, paymentAccountNumber, setPaymentAccountNumber, paymentMethodsList, isCreditSelected, isMobileMoneySelected,
        computedTotals, handleAddNewItem, handleDeleteItem, updateLineItem, handleFormSubmission, setLineItems: setLineItemsWithContext, isSubmitting: submitOrderApi.loading || isPaymentSyncing
    };
}
