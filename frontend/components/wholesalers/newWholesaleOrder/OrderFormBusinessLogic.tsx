// components/wholesalers/newWholesaleOrder/OrderFormBusinessLogic.tsx

import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { router } from 'expo-router';
import React from 'react';
import { useWholesaleOrderForm } from './useWholesaleOrderForm';

interface OrderFormBusinessLogicProps {
    user: any;
    productsCatalog?: any[];
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
        commitOrder,
    } = useWholesaleOrderForm({
        onSubmitFinished,
        onRowsCountChange,
    });

    /* -------- Toast helper -------- */
    const triggerNotificationToast = (msg: string) => {
        setSubmitToast(msg);
        setTimeout(() => setSubmitToast(null), 5000);
    };

    /* -------- Save draft (local only) -------- */
    const handleSaveDraftManual = async () => {
        if (!selectedRetailer) {
            const msg =
                '⚠️ Assign a client customer to declare a draft.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }
        await clearActiveDraftSession();
        setMpesaNumber('');
        triggerNotificationToast(
            '💾 Draft session saved locally.'
        );
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

        try {
            setIsSubmitting(true);

            /* ---- Persist locally ---- */
            const order = await commitOrder({
                retailerId: (selectedRetailer as any)
                    .remote_id,
                retailerTitle: selectedRetailer.title,
                paymentMethodId:
                    selectedPaymentMethod.id,
                paymentMethodTitle:
                    selectedPaymentMethod.title,
                mpesaNumber,
                notes,
                userId: String(user?.id ?? ''),
            });

            setSyncStatus('syncing');

            /* ---- Notify parent ---- */
            if (onSubmitFinished) {
                onSubmitFinished(
                    (selectedRetailer as any).remote_id,
                    notes,
                    order.order_items
                );
            }

            triggerNotificationToast(
                '✅ Order saved — syncing in background'
            );

            /* ---- Reset and navigate ---- */
            await clearActiveDraftSession();
            router.replace(
                '/(wholesalers)/newWholesaleOrder'
            );
        } catch (e: any) {
            console.error(
                '[OrderFormBusinessLogic] submit failed',
                e
            );
            setSyncStatus('error');
            const msg =
                e?.message ??
                'Failed to save order locally.';
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
                handleSaveDraftManual,
                handleSubmit,

                /* Toast */
                submitToast,
            })}
        </>
    );
}