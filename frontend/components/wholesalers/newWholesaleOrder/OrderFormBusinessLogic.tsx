// components/wholesalers/newWholesaleOrder/OrderFormBusinessLogic.tsx

import { useNetworkStatus } from '@/context/NetworkMonitorContext';

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
    const triggerNotificationToast = (msg: string) => {
        setSubmitToast(msg);
        setTimeout(() => setSubmitToast(null), 5000);
    };

    /* -------- Submit -------- */
    const handleSubmit = async () => {
        /* ---- Retailer guard ---- */
        if (!selectedRetailer) {
            const msg =
                '⚠️ Please select a retailer before submitting.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Fulfilment guard ---- */
        if (delivery.method === 'DELIVERY' && !delivery.option) {
            const msg = '⚠️ Choose a delivery option (or switch to pickup).';
            alert(msg);
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
            alert(msg);
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
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Online guard (no offline queue) ---- */
        if (!isOnline) {
            const msg =
                '⚠️ You are offline. Connect to the internet to submit this order.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
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
            });

            if (!result.ok) {
                setSyncStatus('error');
                alert(`Wholesale Submission Error\n\n${result.message}`);
                triggerNotificationToast(`❌ Failed: ${result.message}`);
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
            alert(`Wholesale Submission Error\n\n${msg}`);
            triggerNotificationToast(`❌ Failed: ${msg}`);
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