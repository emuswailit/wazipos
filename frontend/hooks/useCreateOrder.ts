// hooks/useCreateOrder.ts

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { storageService } from '@/components/retailers/customerOrders/storageService';
import { RetailerReceipt } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import deliveriesApi from '@/api/deliveriesApi';
import { useStaffDelivery } from '@/components/deliveries/StaffDeliveryPlanner';
import type { LatLng } from '@/components/common/locationPinShared';
import { SaleUnit, partLabel, sellsInParts } from '@/utils/parts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface OrderLineItem {
    id: string; selectedProduct: string | null; selectedProductTitle: string;
    quantity: number; price: number; discount: number; searchQuery: string; isDropdownOpen: boolean; calculatedLineAmount: number;
    /** Whole units (default) or parts — tots, kg, pieces (utils/parts.ts). quantity is then in parts. */
    saleUnit?: SaleUnit;
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

/** What to take off the device's stock for a line (whole units or parts). */
function toDeduction(item: any) {
    const qty = Number(item.quantity || 1);
    return item.saleUnit === 'PART'
        ? { retailer_receipt: String(item.selectedProduct), purchased_quantity: 0, sale_unit: 'PART' as SaleUnit, part_quantity: qty }
        : { retailer_receipt: String(item.selectedProduct), purchased_quantity: qty };
}

/** One line for CreateCustomerOrder: the line discount is sent per unit (the server multiplies by quantity). */
function toOrderItem(item: any) {
    const qty = Number(item.quantity || 1);
    if (item.saleUnit === 'PART') {
        // Parts: the server prices the line from the receipt's part price.
        return {
            retailer_receipt: String(item.selectedProduct),
            sale_unit: 'PART',
            part_quantity: qty,
            purchased_quantity: 0,
            unit_selling_price: Number(item.price || 0),
            final_unit_selling_price: Number(item.price || 0),
            item_discount: qty > 0 ? Number(item.discount || 0) / qty : 0,
        };
    }
    return {
        retailer_receipt: String(item.selectedProduct),
        purchased_quantity: qty,
        unit_selling_price: Number(item.price || 0),
        final_unit_selling_price: Number(item.price || 0),
        item_discount: qty > 0 ? Number(item.discount || 0) / qty : 0,
    };
}

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

    const pendingOrderItemsRef = useRef<{ retailer_receipt: string; purchased_quantity: number; sale_unit?: SaleUnit; part_quantity?: number }[]>([]);

    // Local calendar date (toISOString() is UTC, which is "yesterday" in Nairobi before 3am).
    const getTodayString = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    // Fulfilment: the customer takes it now / collects it, or one of the shop's
    // priced deliveries to where the customer is (pinned on the map).
    const delivery = useStaffDelivery();
    const [destination, setDestination] = useState<LatLng | null>(null);
    const entityId = String((user as any)?.entity_id || (user as any)?.entity || '');
    const shopCenter = useMemo<LatLng | null>(() => {
        const lat = Number((user as any)?.entity_latitude);
        const lng = Number((user as any)?.entity_longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { latitude: lat, longitude: lng } : null;
    }, [user]);

    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
    const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState({ mobileMoneyNumber: '', customerName: '', customerPhone: '', dueDate: getTodayString() });

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

    // Delivery options for the current lines + pinned destination.
    const pricedLines = useMemo(
        () => processedLineItems
            .filter((i) => i.selectedProduct && Number(i.quantity) > 0)
            .map((i) => ({ retailer_receipt: String(i.selectedProduct), purchased_quantity: i.saleUnit === 'PART' ? 1 : Number(i.quantity) || 1 })),
        [processedLineItems]
    );
    const deliveryOptionsKey = `${destination ? `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}` : ''}|${pricedLines.map((l) => `${l.retailer_receipt}x${l.purchased_quantity}`).join(',')}`;
    const loadDeliveryOptions = useMemo(
        () => destination && pricedLines.length && entityId
            ? () => deliveriesApi.getCustomerDeliveryOptions({
                entity: entityId,
                destination_latitude: destination.latitude,
                destination_longitude: destination.longitude,
                order_items: pricedLines,
            })
            : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [deliveryOptionsKey, entityId]
    );
    const deliveryNotReadyHint = !pricedLines.length ? 'Add items to price delivery.' : "Pin the customer's location to see delivery options.";

    const totals = useMemo(() => {
        const shipping = delivery.fee;
        const finalTotal = Math.max(0, subtotal - totalDiscount) + shipping;
        return { subtotal: Math.max(0, subtotal - totalDiscount), shippingCost: shipping, total: finalTotal, totalDiscount };
    }, [subtotal, totalDiscount, delivery.fee]);

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
        delivery.reset();
        setDestination(null);
        resetWsState();
        setSuccessMessage("Payment successful!");
    }, [delivery.reset]);

    const handleUpdateRow = useCallback((id: string, updates: Partial<OrderLineItem>) => {
        setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const handleSelectProduct = useCallback((id: string, prod: RetailerReceipt) => {
        const receiptId = prod?.remote_id ?? prod?.remote_key ?? '';
        const productSellingPrice = Number(prod?.unit_selling_price ?? (prod as any)?.price ?? 0);
        setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, selectedProduct: receiptId ? String(receiptId) : null, selectedProductTitle: prod?.title || '', searchQuery: prod?.title || '', price: productSellingPrice, quantity: 1, discount: 0, isDropdownOpen: false, saleUnit: 'FULL' as SaleUnit } : item));
    }, []);

    /** Switch a line between whole units and parts; the price follows the receipt. */
    const handleSetSaleUnit = useCallback((id: string, unit: SaleUnit) => {
        setLineItems((prev) => prev.map((item) => {
            if (item.id !== id) return item;
            const receipt: any = retailerReceipts.find((r) => String(r.remote_id ?? (r as any).remote_key ?? '') === String(item.selectedProduct));
            if (!receipt) return item;
            if (unit === 'PART') {
                if (!sellsInParts(receipt)) return item;
                const partPrice = Number(receipt.part_selling_price) || 0;
                if (partPrice <= 0) {
                    setErrorMessage(`Set a price per ${partLabel(receipt)} for ${receipt.title} in Inventory before selling it in parts.`);
                    return item;
                }
                return { ...item, saleUnit: 'PART', price: partPrice, quantity: 1, discount: 0 };
            }
            return { ...item, saleUnit: 'FULL', price: Number(receipt.unit_selling_price ?? 0), quantity: 1, discount: 0 };
        }));
    }, [retailerReceipts]);

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
            const idx = prev.findIndex((item) => item.selectedProduct === receiptId && item.saleUnit !== 'PART');
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
        // Offline, only CASH sales are taken (saved on this device, synced when back online).
        const isOfflineAllowed = methodTitle === 'CASH';

        if (!isOnline && !isOfflineAllowed) {
            setErrorMessage("You're offline: only CASH sales can be saved now. They sync automatically when the connection is back.");
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

        const wantsDelivery = delivery.method === 'DELIVERY' && !isRetryingPayment;
        if (wantsDelivery) {
            if (!isOnline) {
                setErrorMessage("Delivery needs an internet connection (it is priced by the server). Switch to pickup or reconnect.");
                return;
            }
            if (!destination) {
                setErrorMessage("Pin the customer's location for delivery.");
                return;
            }
            if (!delivery.option) {
                setErrorMessage("Choose a delivery option.");
                return;
            }
            if (!paymentDetails?.customerPhone?.trim()) {
                setErrorMessage("Enter the customer's phone for the delivery.");
                return;
            }
        }

        setIsSaving(true);

        try {
            const momoNumber = formatPhoneForJamboPay(paymentDetails?.mobileMoneyNumber || '');

            if (!isOnline && isOfflineAllowed) {
                const itemsToDeduct = processedLineItems
                    .filter(item => item.selectedProduct)
                    .map((item: any) => toDeduction(item));

                const draftId = `draft-${Date.now()}`;
                const nowIso = new Date().toISOString();
                const lines = processedLineItems.filter((item: any) => item.selectedProduct);

                // Exactly what the online path sends, so the uploader can send it unchanged.
                const uploadPayload = {
                    draft_id: draftId,
                    customer_name: paymentDetails?.customerName || 'Walk-in Customer',
                    customer_phone: paymentDetails?.customerPhone || momoNumber || '',
                    credit_due_date: null, // offline sales are CASH only
                    payment_method: selectedPaymentMethodId,
                    payment_account_number: momoNumber,
                    // Offline orders are always collected (delivery is priced online).
                    delivery_method: 'PICKUP',
                    order_channel: Platform.OS === 'web' ? 'WEB' : 'ANDROID',
                    order_origin: 'STAFF',
                    order_items: lines.map((item: any) => toOrderItem(item)),
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
                        purchased_quantity: item.saleUnit === 'PART' ? 0 : Number(item.quantity || 1),
                        sale_unit: item.saleUnit === 'PART' ? 'PART' : 'FULL',
                        part_quantity: item.saleUnit === 'PART' ? Number(item.quantity || 1) : 0,
                        item_price_total: String(item.calculatedLineAmount ?? 0),
                    })),
                    created: nowIso,
                    upload_payload: uploadPayload,
                    synced: false,
                };

                await saveOrderLocally(localOrder);
                await deductLocalInventory(itemsToDeduct);

                setSuccessMessage("Saved offline as a cash sale — it will sync when you're back online.");
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
                    .map((item: any) => toOrderItem(item));

                const draftId = `draft-${Date.now()}`;
                const payload = {
                    action: "CreateCustomerOrder",
                    customer_order_details: {
                        draft_id: draftId,
                        customer_name: paymentDetails?.customerName || 'Walk-in Customer',
                        customer_phone: paymentDetails?.customerPhone || momoNumber || '',
                        credit_due_date: methodTitle === 'CREDIT' ? paymentDetails?.dueDate || null : null,

                        payment_method: selectedPaymentMethodId,
                        payment_account_number: momoNumber,
                        order_channel: Platform.OS === 'web' ? 'WEB' : 'ANDROID',
                        order_origin: 'STAFF',
                        order_items: orderItemsPayload,
                        // Fulfilment: the option is re-priced server-side (its total is the fee).
                        delivery_method: wantsDelivery ? 'DELIVERY' : 'PICKUP',
                        ...(wantsDelivery && destination && delivery.option
                            ? {
                                delivery_option: delivery.option.key,
                                delivery_agent: delivery.agentId,
                                destination_latitude: destination.latitude,
                                destination_longitude: destination.longitude,
                                recipient_name: paymentDetails?.customerName || 'Customer',
                                recipient_phone: paymentDetails?.customerPhone || '',
                            }
                            : {}),
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

                        const itemsToDeduct = processedLineItems
                            .filter(item => item.selectedProduct)
                            .map((item: any) => toDeduction(item));

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
                            delivery.reset();
                            setDestination(null);
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
        submitApi, isRetryingPayment, orderToRetry, delivery, destination,
        paymentMethodsList, totals, deductLocalInventory, triggerManualFetch
    ]);

    return {
        retailerReceipts, paymentMethodsList, triggerManualFetch, isSyncing: false, lastSyncedTime: "",
        isPaymentSyncing: isPaymentSyncing || false,
        selectedPaymentMethodId, setSelectedPaymentMethodId,
        isBottomSheetVisible, setIsBottomSheetVisible,
        isScannerOpen, setIsScannerOpen,
        paymentDetails, setPaymentDetails,
        lineItems: processedLineItems, isBlankRowPresent, totals,
        errorMessage, setErrorMessage, successMessage, setSuccessMessage, isSaving,
        handleUpdateRow, handleSelectProduct, handleSetSaleUnit, handleAddRow, handleDeleteRow, handleSearchFocused,
        handleSaveOrder, handleBarcodeScannedContinuously,

        // Fulfilment
        delivery, destination, setDestination, shopCenter,
        loadDeliveryOptions, deliveryOptionsKey, deliveryNotReadyHint,

        wsStatus, wsDescription, resetWsState,
        isRetryingPayment, handleRetryPayment,
        handlePaymentSuccess
    };
}

