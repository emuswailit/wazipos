// hooks/useCreateOrder.ts

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { storageService } from '@/components/retailers/customerOrders/storageService';
import { RetailerReceipt } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import { useLogistics } from '@/hooks/useLogistics';
import { useEmployees } from '@/hooks/useEmployees';
import { extractEnvelope } from '@/components/common/ApiResponseModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface OrderLineItem {
    id: string; selectedProduct: string | null; selectedProductTitle: string;
    quantity: number; price: number; discount: number; searchQuery: string; isDropdownOpen: boolean; calculatedLineAmount: number;
}

const formatPhoneForJamboPay = (phone: string) => {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) return '254' + clean.slice(1);
    if (clean.startsWith('254')) return clean;
    if (clean.startsWith('7') || clean.startsWith('1')) return '254' + clean;
    return clean;
};

// Offline orders are saved via storageService.addPendingOrder; anything left under the old
// 'wazipos_offline_customer_orders' key is migrated by services/customerOrderUploader.ts.

export function useCreateOrder() {
    const { user, token } = useAuth();
    const { isOnline } = useNetworkStatus();
    const { retailerReceipts, triggerManualFetch, deductLocalInventory } = useInventorySync();
    const { paymentMethodsList, isPaymentSyncing } = usePaymentMethodsSync();

    const submitApi = useApi(retailersApi.retailStaffAction);

    const [lineItems, setLineItems] = useState<OrderLineItem[]>(() => [
        { id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 },
    ]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [isRetryingPayment, setIsRetryingPayment] = useState(false);
    const [orderToRetry, setOrderToRetry] = useState<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [wsStatus, setWsStatus] = useState<string | null>(null);
    const [wsDescription, setWsDescription] = useState<string | null>(null);

    const pendingOrderItemsRef = useRef<{ retailer_receipt: string; purchased_quantity: number }[]>([]);

    // Local calendar date (toISOString() is UTC, which is "yesterday" in Nairobi before 3am).
    const getTodayString = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const [deliveryMethod, setDeliveryMethod] = useState<'PICKUP' | 'DELIVERY' | 'COURIER'>('PICKUP');
    const [isRetailerDelivery, setIsRetailerDelivery] = useState(false);
    const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
    const [selectedCollectionPoint, setSelectedCollectionPoint] = useState<any | null>(null);

    // 🟢 Employee Delivery State
    const [selectedDeliveryEmployeeId, setSelectedDeliveryEmployeeId] = useState<string | null>(null);
    const entityId = String((user as any)?.entity_id || (user as any)?.entity || '');
    const { employees: deliveryEmployees, isLoading: deliveryEmployeesLoading } = useEmployees(isRetailerDelivery && !!entityId); // fetch delivery staff only when retailer delivery is chosen

    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
    const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState({ mobileMoneyNumber: '', customerName: '', customerPhone: '', dueDate: getTodayString() });

    const [shippingCost, setShippingCost] = useState<number>(0);
    const [shippingLoading, setShippingLoading] = useState(false);
    const [shippingError, setShippingError] = useState<string | null>(null);

    const { activeCouriers, activeCouriersLoading, collectionPoints, pointsLoading } = useLogistics(deliveryMethod, selectedCourierId);

    /**
     * Store an order in the Customer Orders store (same place on web and native):
     *  - a server order (synced) is merged in as the server's version;
     *  - an offline order is saved as pending and uploaded later by
     *    uploadPendingCustomerOrders() (its record carries `upload_payload`).
     */
    const saveOrderLocally = async (orderRecord: any) => {
        try {
            const isSynced = orderRecord?.synced === true || String(orderRecord?.synced).toUpperCase() === 'TRUE';
            if (isSynced) {
                await storageService.syncIncomingOrders([orderRecord], { snapshot: false });
            } else {
                await storageService.addPendingOrder(orderRecord);
            }
        } catch (e) {
            console.error("Failed to save order locally:", e);
        }
    };

    const processedLineItems = useMemo(() => {
        return lineItems.map(item => {
            const quantity = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const discount = Number(item.discount) || 0;
            return { ...item, calculatedLineAmount: Math.max(0, (price * quantity) - discount) };
        });
    }, [lineItems]);

    const subtotal = useMemo(() => {
        let total = 0;
        processedLineItems.forEach(item => total += (item.price * item.quantity));
        return total;
    }, [processedLineItems]);

    const totalDiscount = useMemo(() => {
        let total = 0;
        processedLineItems.forEach(item => total += item.discount);
        return total;
    }, [processedLineItems]);

    const subtotalRef = useRef(subtotal);
    const totalDiscountRef = useRef(totalDiscount);
    useEffect(() => {
        subtotalRef.current = subtotal;
        totalDiscountRef.current = totalDiscount;
    }, [subtotal, totalDiscount]);

    useEffect(() => {
        if (deliveryMethod !== 'DELIVERY' || isRetailerDelivery || !selectedCollectionPoint) {
            setShippingCost(0);
            setShippingError(null);
            setShippingLoading(false);
            return;
        }

        const originLat = Number((user as any)?.entity_latitude) || 0.0;
        const originLng = Number((user as any)?.entity_longitude) || 0.0;

        if (originLat === 0 && originLng === 0) {
            setShippingError("Store location not set. Cannot calculate shipping.");
            setShippingLoading(false);
            return;
        }

        let cancelled = false;
        (async () => {
            setShippingLoading(true);
            setShippingError(null);
            try {
                const res = await submitApi.request({
                    action: "CalculateShippingRate",
                    entity: (user as any)?.entity_id || (user as any)?.entity,
                    origin_latitude: originLat,
                    origin_longitude: originLng,
                    destination_latitude: selectedCollectionPoint.latitude,
                    destination_longitude: selectedCollectionPoint.longitude,
                    delivery_method: 'DELIVERY',
                    order_total: Math.max(0, subtotalRef.current - totalDiscountRef.current),
                    is_retailer_delivery: false,
                }).catch((e: any) => {
                    console.warn("Shipping rate failed:", e?.message);
                    return { ok: false, data: { response_message: "Network error." } };
                });

                if (!cancelled) {
                    const env = extractEnvelope(res);
                    if (String(env.response_code) !== "0") {
                        setShippingError(env.response_message || "Failed to calculate shipping.");
                        setShippingCost(0);
                    } else {
                        setShippingCost(Number(res.data?.shipping_cost ?? res.data?.cost ?? 0));
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    setShippingError(err.message || "Connection error.");
                    setShippingCost(0);
                }
            } finally {
                if (!cancelled) setShippingLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [deliveryMethod, isRetailerDelivery, selectedCollectionPoint, submitApi.request, user]);

    const totals = useMemo(() => {
        const shipping = isRetailerDelivery ? 0 : (shippingCost || 0);
        const finalTotal = Math.max(0, subtotal - totalDiscount) + shipping;
        return { subtotal: Math.max(0, subtotal - totalDiscount), shippingCost: shipping, total: finalTotal, totalDiscount };
    }, [subtotal, totalDiscount, shippingCost, isRetailerDelivery]);

    const isBlankRowPresent = useMemo(() => lineItems.some(item => !item.selectedProduct), [lineItems]);

    const connectOrderWebSocket = useCallback((referenceNumber: string) => {
        if (!token || !referenceNumber) return;
        if (wsRef.current) wsRef.current.close();

        const wsUrl = `wss://api.wazipos.co.ke/ws/retailers/orders/payment/${referenceNumber}/?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => console.log("✅ WS CONNECTED for order:", referenceNumber);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.payment) {
                    setWsStatus(data.payment.status);
                    setWsDescription(data.payment.description || 'Processing...');
                    if (data.payment.status === 'FAILED') setIsRetryingPayment(true);
                }
            } catch (err) { console.error(err); }
        };
        ws.onclose = () => console.log("🔌 WS CLOSED");
        ws.onerror = () => {
            setWsStatus('ERROR');
            setWsDescription('Connection error occurred.');
        };
    }, [token]);

    useEffect(() => {
        if (wsStatus === 'SUCCESS' && pendingOrderItemsRef.current.length > 0) {
            deductLocalInventory(pendingOrderItemsRef.current);
            pendingOrderItemsRef.current = [];
            triggerManualFetch();
        }
    }, [wsStatus, deductLocalInventory, triggerManualFetch]);

    useEffect(() => {
        return () => { if (wsRef.current) wsRef.current.close(); };
    }, []);

    const resetWsState = () => {
        setWsStatus(null);
        setWsDescription(null);
    };

    const handleRetryPayment = () => {
        setIsRetryingPayment(true);
        setSelectedPaymentMethodId(null);
        setIsBottomSheetVisible(true);
        resetWsState();
    };

    const handlePaymentSuccess = useCallback(() => {
        setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
        setPaymentDetails({ mobileMoneyNumber: '', customerName: '', customerPhone: '', dueDate: getTodayString() });
        setSelectedPaymentMethodId(null);
        setOrderToRetry(null);
        setIsRetryingPayment(false);
        setSelectedCollectionPoint(null);
        resetWsState();
        setSuccessMessage("Payment successful!");
    }, []);

    const handleUpdateRow = useCallback((id: string, updates: Partial<OrderLineItem>) => {
        setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const handleSelectProduct = useCallback((id: string, prod: RetailerReceipt) => {
        const receiptId = prod?.remote_id ?? prod?.remote_key ?? '';
        const productSellingPrice = Number(prod?.unit_selling_price ?? (prod as any)?.price ?? 0);
        setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, selectedProduct: receiptId ? String(receiptId) : null, selectedProductTitle: prod?.title || '', searchQuery: prod?.title || '', price: productSellingPrice, quantity: 1, discount: 0, isDropdownOpen: false } : item));
    }, []);

    const handleAddRow = useCallback(() => {
        setLineItems((prev) => [...prev, { id: Date.now().toString(), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
    }, []);

    const handleDeleteRow = useCallback((id: string) => { setLineItems((prev) => prev.filter((i) => i.id !== id)); }, []);

    // Each scan adds the matching receipt as a line, or bumps its quantity if already present.
    const handleBarcodeScannedContinuously = useCallback((barcode: string) => {
        const code = barcode.trim();
        if (!code) return;
        const prod = retailerReceipts.find((r) => r.bar_code === code);
        if (!prod) return;
        const receiptId = String(prod.remote_id ?? prod.remote_key ?? '');
        if (!receiptId) return;
        const price = Number(prod.unit_selling_price ?? (prod as any)?.price ?? 0);
        setLineItems((prev) => {
            const idx = prev.findIndex((item) => item.selectedProduct === receiptId);
            if (idx !== -1) {
                return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item);
            }
            const row: OrderLineItem = { id: Date.now().toString(), selectedProduct: receiptId, selectedProductTitle: prod.title || '', quantity: 1, price, discount: 0, searchQuery: prod.title || '', isDropdownOpen: false, calculatedLineAmount: price };
            const onlyBlankRow = prev.length === 1 && prev[0].selectedProduct === null;
            return onlyBlankRow ? [row] : [...prev, row];
        });
    }, [retailerReceipts]);

    const handleSearchFocused = useCallback((focusedRowId: string) => {
        setLineItems((prev) => prev.map((row) => {
            if (row.id !== focusedRowId && row.isDropdownOpen) return { ...row, isDropdownOpen: false };
            return row;
        }));
    }, []);

    const handleSaveOrder = useCallback(async () => {
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!selectedPaymentMethodId) {
            setErrorMessage("Please select a payment method.");
            return;
        }

        const currentMethod = paymentMethodsList.find(m => m.id === selectedPaymentMethodId);
        const methodTitle = currentMethod?.title?.toUpperCase() || '';
        const isMobileMoney = methodTitle === 'MOBILE MONEY';
        const isOfflineAllowed = methodTitle === 'CASH' || methodTitle === 'CREDIT';

        if (!isOnline && !isOfflineAllowed) {
            setErrorMessage("Mobile Money requires an internet connection. Please connect to continue.");
            return;
        }

        // Credit sales need to know who owes the money, how to reach them, and when it's due.
        if (methodTitle === 'CREDIT' && !isRetryingPayment) {
            const missing: string[] = [];
            if (!paymentDetails?.customerName?.trim()) missing.push('customer name');
            if (!paymentDetails?.customerPhone?.trim()) missing.push('customer phone');
            if (!paymentDetails?.dueDate) missing.push('due date');
            if (missing.length) {
                setErrorMessage(`Credit orders need a ${missing.join(', ')}.`);
                return;
            }
            if (paymentDetails.dueDate < getTodayString()) {
                setErrorMessage("The due date can't be in the past.");
                return;
            }
        }

        if (deliveryMethod !== 'PICKUP' && !isRetailerDelivery) {
            if (!selectedCourierId) {
                setErrorMessage("Please select a courier/transporter.");
                return;
            }
            if (deliveryMethod === 'DELIVERY' && !selectedCollectionPoint) {
                setErrorMessage("Please select a drop-off point.");
                return;
            }
            if (shippingError && isOnline) {
                setErrorMessage(shippingError);
                return;
            }
        }

        if (deliveryMethod !== 'PICKUP' && isRetailerDelivery && !selectedDeliveryEmployeeId) {
            setErrorMessage("Please select a delivery staff member.");
            return;
        }

        setIsSaving(true);

        try {
            const momoNumber = formatPhoneForJamboPay(paymentDetails?.mobileMoneyNumber || '');

            if (!isOnline && isOfflineAllowed) {
                const itemsToDeduct = processedLineItems
                    .filter(item => item.selectedProduct)
                    .map((item: any) => ({
                        retailer_receipt: String(item.selectedProduct),
                        purchased_quantity: Number(item.quantity || 1),
                    }));

                const draftId = `draft-${Date.now()}`;
                const nowIso = new Date().toISOString();
                const lines = processedLineItems.filter((item: any) => item.selectedProduct);

                // Exactly what the online path sends, so the uploader can send it unchanged.
                const uploadPayload = {
                    draft_id: draftId,
                    customer_name: paymentDetails?.customerName || 'Walk-in Customer',
                    customer_phone: paymentDetails?.customerPhone || momoNumber || '',
                    credit_due_date: methodTitle === 'CREDIT' ? paymentDetails?.dueDate || null : null,
                    payment_method: selectedPaymentMethodId,
                    payment_account_number: momoNumber,
                    delivery_method: deliveryMethod || 'SELF',
                    order_channel: Platform.OS === 'web' ? 'WEB' : 'ANDROID',
                    order_origin: Platform.OS.toUpperCase(),
                    shipping_amount: String(totals.shippingCost),
                    order_items: lines.map((item: any) => ({
                        retailer_receipt: String(item.selectedProduct),
                        purchased_quantity: Number(item.quantity || 1),
                        unit_selling_price: Number(item.price || 0),
                        final_unit_selling_price: Number(item.price || 0),
                        item_discount: Number(item.discount || 0),
                    })),
                    is_retailer_delivery: isRetailerDelivery,
                    delivery_person: isRetailerDelivery ? selectedDeliveryEmployeeId : null,
                    courier_id: isRetailerDelivery ? null : selectedCourierId,
                    collection_point_id: (deliveryMethod === 'DELIVERY' && !isRetailerDelivery) ? selectedCollectionPoint?.id : null,
                };

                // Display fields in the server's shape, so the order looks right in the
                // Customer Orders list until the server's version replaces it.
                const localOrder = {
                    draft_id: draftId,
                    order_number: 'Pending upload',
                    status: 'PENDING',
                    is_paid: methodTitle === 'CASH' ? 'true' : 'false',
                    customer_name: uploadPayload.customer_name,
                    customer_phone: uploadPayload.customer_phone,
                    due_date: uploadPayload.credit_due_date,
                    selected_payment_method: selectedPaymentMethodId,
                    selected_payment_method_title: methodTitle,
                    delivery_method: uploadPayload.delivery_method,
                    total_amount: String(totals.total),
                    order_items: lines.map((item: any) => ({
                        title: item.selectedProductTitle || 'Product',
                        purchased_quantity: Number(item.quantity || 1),
                        item_price_total: String(item.calculatedLineAmount ?? 0),
                    })),
                    created: nowIso,
                    upload_payload: uploadPayload,
                    synced: false,
                };

                await saveOrderLocally(localOrder);
                await deductLocalInventory(itemsToDeduct);

                setSuccessMessage("Order saved offline successfully.");
                setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
                setSelectedPaymentMethodId(null);
                setIsBottomSheetVisible(false);
                setIsSaving(false);
                return;
            }

            if (isRetryingPayment) {
                if (!orderToRetry || !orderToRetry.id) {
                    setErrorMessage("Cannot retry: Original order details not found.");
                    setIsSaving(false);
                    return;
                }

                const payload = {
                    action: 'MakeCustomerOrderPayment',
                    customer_order: orderToRetry.id,
                    payment_method: selectedPaymentMethodId,
                    mobile_money_phone: momoNumber,
                };
                const res = await submitApi.request(payload).catch((e: any) => {
                    console.warn("Retry failed:", e?.message);
                    return { ok: false, data: { response_message: "Network error occurred." } };
                });

                if (res?.ok && String(res?.data?.response_code) === '0') {
                    const newOrder = res.data.customer_order;
                    if (newOrder) {
                        setOrderToRetry(newOrder);

                        if (isMobileMoney && newOrder.reference_number) {
                            setWsStatus('PENDING');
                            setWsDescription('Retrying payment. Waiting for confirmation...');
                            connectOrderWebSocket(newOrder.reference_number);
                        } else {
                            if (pendingOrderItemsRef.current.length > 0) {
                                await deductLocalInventory(pendingOrderItemsRef.current);
                                triggerManualFetch();
                                pendingOrderItemsRef.current = [];
                            }
                            setSelectedPaymentMethodId(null);
                            setOrderToRetry(null);
                            setIsRetryingPayment(false);
                            setIsBottomSheetVisible(false);
                            resetWsState();
                            setSuccessMessage("Order created successfully!");
                            setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
                        }
                    }
                    setIsBottomSheetVisible(false);
                } else {
                    setErrorMessage(res?.data?.errors?.join(' · ') || res?.data?.response_message || "Failed to process payment.");
                }
            } else {
                if (processedLineItems.length === 0 || (processedLineItems.length === 1 && !processedLineItems[0].selectedProduct)) {
                    setErrorMessage("Your cart is empty.");
                    setIsSaving(false);
                    return;
                }

                const orderItemsPayload = processedLineItems
                    .filter(item => item.selectedProduct)
                    .map((item: any) => ({
                        retailer_receipt: String(item.selectedProduct),
                        purchased_quantity: Number(item.quantity || 1),
                        unit_selling_price: Number(item.price || 0),
                        final_unit_selling_price: Number(item.price || 0),
                        item_discount: Number(item.discount || 0),
                    }));

                const draftId = `draft-${Date.now()}`;
                const payload = {
                    action: "CreateCustomerOrder",
                    customer_order_details: {
                        draft_id: draftId,
                        customer_name: paymentDetails?.customerName || 'Walk-in Customer',
                        customer_phone: paymentDetails?.customerPhone || momoNumber || '',
                        credit_due_date: paymentDetails?.dueDate || null,

                        payment_method: selectedPaymentMethodId,
                        payment_account_number: momoNumber,
                        delivery_method: deliveryMethod || 'SELF',
                        order_channel: Platform.OS === 'web' ? 'WEB' : 'ANDROID',
                        order_origin: Platform.OS.toUpperCase(),
                        shipping_amount: String(totals.shippingCost),
                        order_items: orderItemsPayload,

                        is_retailer_delivery: isRetailerDelivery,
                        delivery_person: isRetailerDelivery ? selectedDeliveryEmployeeId : null,
                        courier_id: isRetailerDelivery ? null : selectedCourierId,
                        collection_point_id: (deliveryMethod === 'DELIVERY' && !isRetailerDelivery) ? selectedCollectionPoint?.id : null,
                    }
                };

                const res = await submitApi.request(payload).catch((e: any) => {
                    console.warn("Order creation failed:", e?.message);
                    return { ok: false, data: { response_message: "Network error occurred." } };
                });

                if (res?.ok && String(res?.data?.response_code) === '0') {
                    const newOrder = res.data.customer_order;

                    if (newOrder) {
                        setOrderToRetry(newOrder);

                        const itemsToDeduct = orderItemsPayload.map((i: any) => ({
                            retailer_receipt: i.retailer_receipt,
                            purchased_quantity: i.purchased_quantity
                        }));

                        if (isMobileMoney && newOrder.reference_number) {
                            pendingOrderItemsRef.current = itemsToDeduct;
                            setWsStatus('PENDING');
                            setWsDescription('Order created. Waiting for payment confirmation...');
                            connectOrderWebSocket(newOrder.reference_number);
                        } else {
                            await saveOrderLocally({ ...newOrder, synced: true });
                            await deductLocalInventory(itemsToDeduct);
                            triggerManualFetch();

                            setSuccessMessage("Order created successfully!");
                            setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]);
                            setSelectedPaymentMethodId(null);
                        }
                    }
                    setIsBottomSheetVisible(false);
                } else {
                    setErrorMessage(res?.data?.errors?.join(' · ') || res?.data?.response_message || "Failed to create order.");
                }
            }
        } catch (err: any) {
            console.error("❌ SAVE ORDER ERROR:", err);
            setErrorMessage(err?.message || "Network error occurred.");
        } finally {
            setIsSaving(false);
        }
    }, [
        isOnline, processedLineItems, paymentDetails, selectedPaymentMethodId,
        deliveryMethod, submitApi, isRetryingPayment, orderToRetry,
        isRetailerDelivery, selectedCourierId, selectedCollectionPoint, selectedDeliveryEmployeeId,
        paymentMethodsList, totals.shippingCost, shippingError, deductLocalInventory, triggerManualFetch
    ]);

    return {
        retailerReceipts, paymentMethodsList, triggerManualFetch, isSyncing: false, lastSyncedTime: "",
        isPaymentSyncing: isPaymentSyncing || false,
        deliveryMethod, setDeliveryMethod,
        selectedPaymentMethodId, setSelectedPaymentMethodId,
        isBottomSheetVisible, setIsBottomSheetVisible,
        isScannerOpen, setIsScannerOpen,
        paymentDetails, setPaymentDetails,
        lineItems: processedLineItems, isBlankRowPresent, totals,
        errorMessage, setErrorMessage, successMessage, setSuccessMessage, isSaving,
        handleUpdateRow, handleSelectProduct, handleAddRow, handleDeleteRow, handleSearchFocused,
        handleSaveOrder, handleBarcodeScannedContinuously,

        isRetailerDelivery, setIsRetailerDelivery,
        selectedCourierId, setSelectedCourierId,
        selectedCollectionPoint, setSelectedCollectionPoint,
        couriers: activeCouriers,
        couriersLoading: activeCouriersLoading,
        collectionPoints,
        pointsLoading,

        deliveryEmployees, deliveryEmployeesLoading,
        selectedDeliveryEmployeeId, setSelectedDeliveryEmployeeId,

        shippingCost, shippingLoading, shippingError,

        wsStatus, wsDescription, resetWsState,
        isRetryingPayment, handleRetryPayment,
        handlePaymentSuccess
    };
}

