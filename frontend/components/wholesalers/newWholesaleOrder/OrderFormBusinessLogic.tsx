// components/wholesalers/newWholesaleOrder/OrderFormBusinessLogic.tsx

import { useAlert } from '@/components/common/AlertProvider';
import { toast } from '@/components/common/Toast';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';

import React, { useState } from 'react';
import { useWholesaleOrderForm } from './useWholesaleOrderForm';

interface OrderFormBusinessLogicProps {
    user: any;

    onSubmitFinished?: (
        retailerId: string,
        notes: string,
        items: any[]
    ) => void;
    onRowsCountChange?: (count: number) => void;
    children: (props: any) => React.ReactNode;
}

export default function OrderFormBusinessLogic({
    user,
    onSubmitFinished,
    onRowsCountChange,
    children,
}: OrderFormBusinessLogicProps) {
    const { isOnline } = useNetworkStatus();
    const { paymentMethodsList } = usePaymentMethodsSync();

    const {
        formRows,
        addFormRow,
        removeFormRow,
        updateRowState,
        clearActiveDraftSession,

        retailers,
        selectedRetailer,
        setSelectedRetailer,

        notes,
        setNotes,

        selectedPaymentMethod,
        setSelectedPaymentMethod,
        mpesaNumber,
        setMpesaNumber,

        isSubmitting,
        setIsSubmitting,
        isSyncLoading,
        syncStatus,
        setSyncStatus,
        submitToast,
        setSubmitToast,

        grandTotalCost,
        submitOrder,

        delivery,
        loadDeliveryOptions,
        deliveryOptionsKey,
        deliveryNotReadyHint,

        isScannerOpen,
        setIsScanningOpen,
        processBarcodeScanResult,
        wholesalerReceipts,
    } = useWholesaleOrderForm({
        onSubmitFinished,
        onRowsCountChange,
    });

    /* -------- The order just created: payment is taken on it -------- */
    const [createdOrder, setCreatedOrder] = useState<{ id: string; reference?: string } | null>(null);

    /* -------- Toast helper -------- */
    // Checks before submitting → a warning toast; results → success / offline toasts.
    const triggerNotificationToast = (msg: string) => {
        const clean = msg.replace(/^[^A-Za-z0-9]+/u, '').trim();
        if (/^success:/i.test(clean)) toast.success('Order created', clean.replace(/^success:\s*/i, ''));
        else if (/offline/i.test(clean) && /saved/i.test(clean)) toast.show({ tone: 'offline', title: 'Saved on this device', message: clean });
        else toast.warning('Check the order', clean);
    };
    const appAlert = useAlert();

    /* -------- Submit -------- */
    const handleSubmit = async () => {
        /* ---- Retailer guard ---- */
        if (!selectedRetailer) {
            const msg =
                '⚠️ Please select a retailer before submitting.';
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Fulfilment guard ---- */
        if (delivery.method === 'DELIVERY' && !delivery.option) {
            const msg = '⚠️ Choose a delivery option (or switch to pickup).';
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Row validity guard ---- */
        if (
            formRows.some(
                (row) =>
                    !row.selectedReceipt ||
                    !row.purchased_quantity
            )
        ) {
            const msg =
                '⚠️ Fill or remove unfinished product lines.';
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Receipt-id guard ---- */
        const rowsMissingReceiptId = formRows.filter(
            (row) => {
                if (!row.selectedReceipt) return false;
                const rid =
                    row.wholesaler_receipt_id ||
                    (row.selectedReceipt as any)
                        .remote_id ||
                    (row.selectedReceipt as any)
                        .remote_key ||
                    '';
                return !String(rid).trim();
            }
        );

        if (rowsMissingReceiptId.length > 0) {
            const msg =
                '⚠️ Some items are missing a receipt ID. Remove them or refresh inventory and pick again.';
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Offline: CASH sale the retailer collects, queued on this device ---- */
        let offlineCashMethodId: string | null = null;
        if (!isOnline) {
            const fail = (msg: string) => {
                triggerNotificationToast(msg);
            };
            if (delivery.method === 'DELIVERY') {
                return fail('⚠️ You are offline. Delivery is priced online — switch to "Retailer collects" to save this as a cash sale.');
            }
            const cash = (paymentMethodsList ?? []).find((m: any) => String(m?.title ?? '').toUpperCase() === 'CASH');
            if (!cash?.id) {
                return fail('⚠️ You are offline and the CASH payment method isn\'t saved on this device yet. Open the app once online, then try again.');
            }
            const short = formRows.find(
                (r) => r.selectedReceipt && r.available !== undefined && Number(r.purchased_quantity) > Number(r.available)
            );
            if (short) {
                return fail(`⚠️ Only ${short.available} in stock for ${(short.selectedReceipt as any)?.title ?? 'an item'}.`);
            }
            offlineCashMethodId = String(cash.id);
        }

        try {
            setIsSubmitting(true);
            setSyncStatus('syncing');

            const retailerId = String(
                (selectedRetailer as any).remote_id ?? ''
            );
            const submittedItems = formRows.filter((r) => r.selectedReceipt);

            const result = await submitOrder({
                retailerId,
                userId: String(user?.id ?? ''),
                offlineCashMethodId,
                retailerTitle: String((selectedRetailer as any)?.title ?? ''),
            });

            if (!result.ok) {
                setSyncStatus('error');
                appAlert('Order not created', String(result.message || 'The server did not accept the order.'), undefined, 'danger');
                return;
            }

            if (result.offline) {
                setSyncStatus('idle');
                onSubmitFinished?.(retailerId, notes, submittedItems);
                triggerNotificationToast('📴 Saved offline as a CASH sale — it will sync when you are back online');
                await clearActiveDraftSession();
                return;
            }

            setSyncStatus('ok');
            onSubmitFinished?.(retailerId, notes, submittedItems);
            triggerNotificationToast(
                result.reference
                    ? `✅ Success: order ${result.reference} created — take payment`
                    : '✅ Success: order created — take payment'
            );

            await clearActiveDraftSession();
            // Take payment now (any method: mobile money prompts the retailer's
            // phone; cash / credit are recorded). Closing it leaves the order unpaid.
            setCreatedOrder({ id: result.orderId, reference: result.reference });
        } catch (e: any) {
            console.error(
                '[OrderFormBusinessLogic] submit failed',
                e
            );
            setSyncStatus('error');
            const msg = e?.message ?? 'Failed to submit order.';
            appAlert('Order not created', msg, undefined, 'danger');
        } finally {
            setIsSubmitting(false);
        }
    };

    /* -------- Expose to render prop -------- */
    return (
        <>
            {children({
                /* Rows */
                formRows,
                addFormRow,
                removeFormRow,
                updateRowState,
                clearActiveDraftSession,

                /* Retailer */
                retailers,
                selectedRetailer,
                setSelectedRetailer,

                /* Notes */
                notes,
                setNotes,

                /* Payment */
                selectedPaymentMethod,
                setSelectedPaymentMethod,
                mpesaNumber,
                setMpesaNumber,

                /* Totals */
                grandTotalCost,

                /* Fulfilment */
                delivery,
                loadDeliveryOptions,
                deliveryOptionsKey,
                deliveryNotReadyHint,

                /* Connection (offline = CASH sales queued on this device) */
                isOnline,

                /* Payment on the created order */
                createdOrder,
                closeCreatedOrder: () => setCreatedOrder(null),

                /* Status */
                isSyncLoading,
                syncStatus,
                isSubmitting,

                /* Actions */
                handleSubmit,

                /* Scanner */
                isScannerOpen,
                setIsScanningOpen,
                processBarcodeScanResult,
                wholesalerReceipts,

                /* Toast */
                submitToast,
            })}
        </>
    );
}