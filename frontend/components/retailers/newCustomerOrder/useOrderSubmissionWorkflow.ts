// useOrderSubmissionWorkflow.ts

import { dbInstance } from '@/databases/db';
import {
    CustomerOrder,
    CustomerOrderItemLine,
} from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { triggerLocalPushNotification } from './notificationHelper';

const isWeb = Platform.OS === 'web';

const NATIVE_CUSTOMER_ORDERS_KEY =
    'wazipos_customer_orders_payload';

/* ---------------------------------------------------------
 * Item mapping
 *
 * Converts the create-order line items into the payload the
 * server expects (CustomerOrderItemLine) — or, when `full` is
 * true, into the richer CustomerOrderItem shape that's stored
 * on the persisted queue.
 * ------------------------------------------------------- */

function mapItems(
    arr: any[],
    draftId: string,
    full = false
): any[] {
    return arr.map((i: any) => {
        const qty =
            Number(
                i.quantity ?? i.purchased_quantity ?? 1
            ) || 1;
        const unitPrice = Number(
            i.price ?? i.unit_selling_price ?? 0
        );
        const discount = Number(
            i.discount ?? i.item_discount ?? 0
        );

        const base: CustomerOrderItemLine = {
            retailer_receipt: String(
                i.selectedProduct ??
                i.retailer_receipt ??
                ''
            ),
            purchased_quantity: qty,
            unit_selling_price: unitPrice.toFixed(2),
            final_unit_selling_price: (
                unitPrice -
                discount / qty
            ).toFixed(2),
            item_discount: discount.toFixed(2),
        };

        if (!full) return base;

        return {
            ...base,
            customer_order_draft_id: draftId,
            product_name:
                i.selectedProductTitle ||
                i.product_name ||
                'Product',
            status: 'OPEN',
            quantity_discount_id: null,
            quantity_discount_name: null,
            price_discount_id: null,
            price_discount_name: null,
        };
    });
}

/* ---------------------------------------------------------
 * Build a CustomerOrder for persistence.
 *
 * The client doesn't know the server-assigned fields yet
 * (order_price_total, is_packed, order_items, ...), so we
 * default them. normalizeOrder in OrdersSyncContext will
 * overwrite them once the server responds.
 * ------------------------------------------------------- */

function buildOrder(
    draft: string,
    num: string,
    synced: boolean,
    paid: boolean,
    uuid: string,
    items: any[],
    ctx: {
        user?: any;
        paymentDetails: any;
        deliveryMethod: any;
        selectedPaymentMethodId: any;
        paymentMethodsList: any[];
    }
): CustomerOrder {
    const {
        user,
        paymentDetails,
        deliveryMethod,
        selectedPaymentMethodId,
        paymentMethodsList,
    } = ctx;

    const methodTitle = String(
        paymentMethodsList.find(
            (m: any) => m.id === selectedPaymentMethodId
        )?.title || ''
    ).toUpperCase();

    const isCredit = methodTitle === 'CREDIT';
    const nowIso = new Date().toISOString();

    return {
        // ---- Local persistence ----
        cached_at: nowIso,

        // ---- Server identity ----
        remote_id: String(uuid || ''),
        draft_id: draft,

        // ---- Local queue state ----
        synced: synced ? 'TRUE' : 'FALSE',

        // ---- Local form fields (preserved for the sync pass) ----
        customerName:
            paymentDetails.customerName ||
            'Walk-in Customer',
        customerPhone: paymentDetails.customerPhone || '',
        deliveryMethod,
        shippingCost: 0,
        selectedPaymentMethodId: String(
            selectedPaymentMethodId || ''
        ),
        paymentAccountNumber:
            paymentDetails.mobileMoneyNumber || '',
        dueDate:
            !paid && isCredit
                ? paymentDetails.dueDate
                : undefined,
        customerOrderItems: items,

        // ---- Server content (defaults — normalizeOrder fills later) ----
        status: 'OPEN',
        reference_number: null,
        psp_reference_number: '',
        provider_reference_number: null,
        employee: null,
        order_number: num,
        order_type: 'NORMAL',
        payment_account_number:
            paymentDetails.mobileMoneyNumber || '',
        order_price_discount_total: 0,
        order_net_price_total: '0.00',
        order_origin: isWeb ? 'WEB' : 'ANDROID',
        order_price_total: '0.00',
        order_tax_total: 0,
        shipping_cost: '0.00',
        is_quoted: 'false',
        is_paid: paid ? 'true' : 'false',
        paid_at: paid ? nowIso : '',
        due_date: isCredit
            ? paymentDetails.dueDate || ''
            : '',
        is_delivered: 'false',
        is_delivered_string: '',
        is_packed_string: '',
        delivered_at: '',
        delivered_by: null,
        is_packed: 'false',
        packed_at: '',
        packed_by: null,
        is_received: 'false',
        received_at: '',
        received_by: null,
        delivery_method: String(deliveryMethod || ''),
        customer: null,
        coupon: null,
        entity: '',
        entity_title: '',
        vendor: String(user?.id || ''),
        user: String(user?.id || ''),
        phone: '',
        email: '',
        bodaboda_latitude: null,
        bodaboda_longitude: null,
        origin_latitude: null,
        origin_longitude: null,
        destination_latitude: null,
        destination_longitude: null,
        created: nowIso,
        updated: nowIso,
        owner: String(user?.id || ''),
        customer_name:
            paymentDetails.customerName ||
            'Walk-in Customer',
        customer_phone: paymentDetails.customerPhone || '',
        recipient_name: null,
        recipient_phone: null,
        selected_payment_method: String(
            selectedPaymentMethodId || ''
        ),
        selected_payment_method_title: methodTitle,
        payment_status: paid ? 'SUCCESS' : 'PENDING',
        payment_description: '',
        order_items: [],
        images: [],
        shipping_address: null,
        origin_point: null,
        destination_point: null,
        farness: '0.00',
        bodaboda: null,
        bodaboda_title: '',
        bodaboda_farness: '',
        city_name: null,

        // ---- Derived convenience ----
        total_amount: '0.00',
        fulfillment_status: paid ? 'PAID' : 'PENDING',
        updated_at: nowIso,
    };
}

/* ---------------------------------------------------------
 * Hook
 * ------------------------------------------------------- */

export function useOrderSubmissionWorkflow({
    user,
    isOnline,
    paymentMethodsList,
    selectedPaymentMethodId,
    paymentDetails,
    deliveryMethod,
    processedLineItems,
    submitOrderToRemote,
    deductLocalInventoryStock,
    triggerBanner,
    setMomoActiveDraftId,
    setMomoActiveOrderNumber,
    setMomoActiveDraftItems,
    setIsMomoPolling,
    persistFinalCustomerOrder,
    clearStorageActiveLines,
    forceImmediateSyncQueuePass,
    setLineItems,
    resetFulfillmentForm,
    setIsBottomSheetVisible,
    setPaymentDetails,
    setSelectedPaymentMethodId,
    setDeliveryMethod,
    getTodayString,
    momoActiveDraftId,
    momoActiveOrderNumber,
    momoActiveItems,
    refreshLocalOrderStatistics,
}: any) {
    const buildCtx = {
        user,
        paymentDetails,
        deliveryMethod,
        selectedPaymentMethodId,
        paymentMethodsList,
    };

    /* ---------------------------------------------------------
     * Save order
     * ------------------------------------------------------- */

    const handleSaveOrder = async () => {
        try {
            const activeMethodTitle =
                paymentMethodsList
                    .find(
                        (m: any) =>
                            m.id === selectedPaymentMethodId
                    )
                    ?.title?.toUpperCase() || '';

            if (
                activeMethodTitle === 'MOBILE MONEY' &&
                !isOnline
            ) {
                return triggerBanner(
                    'danger',
                    'Checkout Rejected',
                    'No internet connection detected. MOBILE MONEY orders cannot be buffered offline.'
                );
            }

            const draftId = `${user?.id || 'unknown_vendor'
                }:${Date.now()}`;
            const orderNum = `ORD-${Math.floor(
                100000 + Math.random() * 900000
            )}`;
            const payload = mapItems(
                processedLineItems,
                draftId
            );

            const res = await submitOrderToRemote({
                paymentDetails,
                selectedPaymentMethodId: String(
                    selectedPaymentMethodId
                ),
                deliveryMethod,
                activeMethodTitle,
                generatedDraftId: draftId,
                orderItemsPayload: payload,
            });

            if (activeMethodTitle === 'MOBILE MONEY') {
                if (res?.ok) {
                    setMomoActiveDraftId(draftId);
                    setMomoActiveOrderNumber(orderNum);
                    setMomoActiveDraftItems(payload);
                    setIsMomoPolling(true);
                } else {
                    triggerBanner(
                        'danger',
                        res?.errors
                            ? 'Server Transaction Refused'
                            : 'Verification Blocked',
                        res?.errors
                            ? Array.isArray(res.errors)
                                ? res.errors.join(', ')
                                : String(res.errors)
                            : 'M-Pesa validation streams require active server handshakes.'
                    );
                }
                return;
            }

            const ok = !!res?.ok;
            const srv = res?.data?.data || res?.data;
            const uuid = String(
                srv?.id ||
                srv?.order_id ||
                srv?.remote_id ||
                srv?.customer_order_details?.id ||
                ''
            );

            if (ok) {
                await deductLocalInventoryStock(payload);
                triggerBanner(
                    'success',
                    'Order Saved Remotely',
                    `Reference number signature #${orderNum} stored successfully.`
                );
                await triggerLocalPushNotification(
                    '✨ Order Created Successfully',
                    `Order #${orderNum} has been verified and synced with the backend matrix.`
                );
            } else {
                triggerBanner(
                    'success',
                    'Saved to Local Cache',
                    `Reference number #${orderNum} cached securely for auto-sync.`
                );
                await triggerLocalPushNotification(
                    '🗒️ Order Saved Locally',
                    `Order #${orderNum} has been buffered into offline memory storage.`
                );
            }

            if (persistFinalCustomerOrder) {
                await persistFinalCustomerOrder(
                    buildOrder(
                        draftId,
                        orderNum,
                        ok,
                        false,
                        uuid,
                        mapItems(
                            processedLineItems,
                            draftId,
                            true
                        ),
                        buildCtx
                    ),
                    draftId
                );
            }

            await clearStorageActiveLines();
            if (isOnline && !ok)
                forceImmediateSyncQueuePass();

            setLineItems([
                {
                    id: Date.now().toString(),
                    selectedProduct: null,
                    selectedProductTitle: '',
                    quantity: 1,
                    price: 0,
                    discount: 0,
                    searchQuery: '',
                    isDropdownOpen: false,
                    calculatedLineAmount: 0,
                },
            ]);
            resetFulfillmentForm();
            if (refreshLocalOrderStatistics)
                await refreshLocalOrderStatistics();
        } catch (e) {
            console.error(
                '🚨 [WORKFLOW FAILURE]: handleSaveOrder block crash:',
                e
            );
        }
    };

    /* ---------------------------------------------------------
     * MoMo verification finished
     * ------------------------------------------------------- */

    const handleMomoVerificationFinished = async (
        success: boolean,
        msg: string,
        triggerManualFetch?: () => Promise<void>
    ) => {
        setIsMomoPolling(false);
        if (!success) return;

        try {
            if (persistFinalCustomerOrder) {
                await persistFinalCustomerOrder(
                    buildOrder(
                        momoActiveDraftId,
                        momoActiveOrderNumber,
                        true,
                        true,
                        momoActiveDraftId,
                        mapItems(
                            momoActiveItems,
                            momoActiveDraftId,
                            true
                        ),
                        buildCtx
                    ),
                    momoActiveDraftId
                );
            }

            if (isWeb) {
                const match =
                    await dbInstance.customerOrders
                        .where('draft_id')
                        .equals(momoActiveDraftId)
                        .first();
                if (match?.id !== undefined) {
                    await dbInstance.customerOrders.update(
                        match.id,
                        {
                            synced: 'TRUE',
                            is_paid: 'true',
                        }
                    );
                }
            } else {
                const raw = await AsyncStorage.getItem(
                    NATIVE_CUSTOMER_ORDERS_KEY
                );
                const fullList: CustomerOrder[] = raw
                    ? JSON.parse(raw)
                    : [];
                const match = fullList.find(
                    (x) => x.draft_id === momoActiveDraftId
                );
                if (match) {
                    match.synced = 'TRUE';
                    match.is_paid = 'true';
                }
                await AsyncStorage.setItem(
                    NATIVE_CUSTOMER_ORDERS_KEY,
                    JSON.stringify(fullList)
                );
            }

            if (triggerManualFetch)
                await triggerManualFetch();
            if (refreshLocalOrderStatistics)
                await refreshLocalOrderStatistics();
        } catch (e) {
            console.error(
                '🚨 [WORKFLOW MOBILE MONEY UPDATER CRASH]:',
                e
            );
        }
    };

    return {
        handleSaveOrder,
        handleMomoVerificationFinished,
    };
}