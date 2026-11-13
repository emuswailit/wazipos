// components/wholesalers/newWholesaleOrder/OrderFormBusinessLogic.tsx

import { useNetworkStatus } from '@/context/NetworkMonitorContext';

import React from 'react';
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

        isScannerOpen,
        setIsScanningOpen,
        processBarcodeScanResult,
        wholesalerReceipts,
    } = useWholesaleOrderForm({
        onSubmitFinished,
        onRowsCountChange,
    });

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

        /* ---- Payment guard ---- */
        if (!selectedPaymentMethod) {
            const msg =
                '⚠️ Please select a payment method before submitting.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }

        /* ---- Mobile Money offline guard ---- */
        const isMobileMoney = String(
            selectedPaymentMethod?.title ?? ''
        )
            .toUpperCase()
            .includes('MOBILE');

        if (isMobileMoney && !isOnline) {
            const msg =
                '⚠️ Mobile Money requires an internet connection. Connect or switch to CASH / CREDIT.';
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
                paymentMethodId: selectedPaymentMethod.id,
                mobileMoneyPhone: isMobileMoney ? mpesaNumber : null,
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
                    ? `✅ Success: order ${result.reference} created`
                    : '✅ Success: order created'
            );

            await clearActiveDraftSession();
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