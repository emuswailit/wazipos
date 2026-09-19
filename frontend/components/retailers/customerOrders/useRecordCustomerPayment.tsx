// useRecordCustomerPayment.ts

import retailersApi from '@/api/retailersApi';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { CustomerOrder } from '@/databases/types';
import useApi from '@/hooks/useApi';
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { storageService } from './storageService';

export function useRecordCustomerPayment(
    orderId: string,
    onSuccessCallback: () => void
) {
    const {
        paymentMethodsList,
        isPaymentSyncing,
        triggerPaymentMethodsFetch,
    } = usePaymentMethodsSync();

    const submitPaymentApi = useApi(
        retailersApi.retailerOrdersAction
    );

    const [selectedMethod, setSelectedMethod] =
        useState<any>(null);
    const [mobileNumber, setMpesaNumber] = useState('');
    const [toastMessage, setToastMessage] = useState<
        string | null
    >(null);
    const [isPollingOpen, setIsPollingOpen] = useState(false);
    const [pollingError, setPollingError] = useState<
        string | null
    >(null);

    const isWeb = Platform.OS === 'web';

    useEffect(() => {
        if (
            !paymentMethodsList ||
            paymentMethodsList.length === 0
        ) {
            triggerPaymentMethodsFetch();
        }
    }, [paymentMethodsList, triggerPaymentMethodsFetch]);

    const executeSubmitPaymentReceipt = useCallback(async () => {
        if (!selectedMethod) {
            setToastMessage(
                'Error: Please select a settlement method.'
            );
            return;
        }

        const methodTitle = String(
            selectedMethod?.title || ''
        ).toUpperCase();

        const isMpesaChannel =
            methodTitle.includes('MOBILE MONEY') ||
            methodTitle.includes('MPESA');

        if (isMpesaChannel && !mobileNumber.trim()) {
            setToastMessage(
                'Error: M-Pesa phone number line is required.'
            );
            return;
        }

        const hasNet = isWeb
            ? navigator.onLine
            : (await Network.getNetworkStateAsync())
                .isConnected;

        if (!hasNet && isMpesaChannel) {
            Alert.alert(
                'Action Restricted',
                '🛑 Mobile Money payments cannot be initialized without active internet. Please switch to Cash.'
            );
            return;
        }

        /* ---------------------------------------------------
         * Match by remote_id (server UUID) first, then
         * draft_id (unsynced local draft). Never use `o.id`
         * here — it is the Dexie PK, not the server identity.
         * ------------------------------------------------- */
        const cachedOrdersList: CustomerOrder[] =
            await storageService.getAllOrders();

        const targetOrder = cachedOrdersList.find(
            (o) =>
                o.remote_id === orderId ||
                o.draft_id === orderId
        );

        if (!targetOrder) {
            Alert.alert(
                'System Error',
                '❌ The referenced order key record could not be found inside the local cache registers.'
            );
            return;
        }

        const serverOrderUuid = targetOrder.remote_id || '';

        /* ---------------------------------------------------
         * Offline branch — record locally, no network.
         * (MoMo is rejected above when offline.)
         * ------------------------------------------------- */
        if (!hasNet) {
            targetOrder.is_paid = 'true';
            targetOrder.selected_payment_method = String(
                selectedMethod.id
            );
            targetOrder.selected_payment_method_title =
                selectedMethod.title;
            targetOrder.synced = 'FALSE';
            targetOrder.updated = new Date().toISOString();

            await storageService.syncIncomingOrders([
                targetOrder,
            ]);
            Alert.alert(
                'Payment Recorded',
                '🎉 Payment preserved locally in device cache. Order marked as settled offline.'
            );
            onSuccessCallback();
            return;
        }

        /* ---------------------------------------------------
         * Online branch — the server needs the UUID.
         * ------------------------------------------------- */
        if (!serverOrderUuid) {
            Alert.alert(
                'Order Not Yet Synced',
                '⚠️ This order has not been assigned an order number by the server yet. Please wait for it to sync before recording a payment.'
            );
            return;
        }

        const payload = {
            action: 'MakeCustomerOrderPayment',
            payment_method: String(selectedMethod.id),
            mobile_money_phone: isMpesaChannel
                ? mobileNumber.trim()
                : '',
            customer_order: String(serverOrderUuid),
        };

        setToastMessage('Processing payment request...');
        if (isMpesaChannel) setIsPollingOpen(true);

        if (__DEV__) {
            console.log(
                '🚀 MakeCustomerOrderPayment request:',
                JSON.stringify(payload, null, 2)
            );
        }

        const res = await submitPaymentApi.request(payload);

        if (
            res?.ok ||
            res?.status === 200 ||
            res?.status === 201
        ) {
            targetOrder.is_paid = 'true';
            targetOrder.selected_payment_method = String(
                selectedMethod.id
            );
            targetOrder.selected_payment_method_title =
                selectedMethod.title;
            targetOrder.updated = new Date().toISOString();
            targetOrder.synced = 'TRUE';

            if (isMpesaChannel) {
                // Server vocabulary: "COMPLETE", not "COMPLETED".
                targetOrder.status = 'COMPLETE';
            } else {
                setToastMessage(
                    'Success: Payment processed successfully!'
                );
                Alert.alert(
                    'Payment Complete',
                    '✓ Payment receipt applied to ledger rows safely.'
                );
                onSuccessCallback();
            }

            await storageService.syncIncomingOrders([
                targetOrder,
            ]);
        } else {
            const serverErr =
                res?.data?.message ||
                res?.message ||
                'Gateway processing fault.';

            if (__DEV__) {
                console.error(
                    '❌ MakeCustomerOrderPayment failure:',
                    serverErr
                );
            }

            if (isMpesaChannel) {
                setPollingError(serverErr);
            } else {
                setToastMessage(`Error: ${serverErr}`);
                Alert.alert(
                    'Transaction Aborted',
                    `⚠️ ${serverErr}`
                );
            }
        }
    }, [
        selectedMethod,
        mobileNumber,
        orderId,
        isWeb,
        onSuccessCallback,
        submitPaymentApi,
    ]);

    return {
        paymentMethods: paymentMethodsList,
        selectedMethod,
        setSelectedMethod,
        mobileNumber,
        setMpesaNumber,
        toastMessage,
        isProcessing: submitPaymentApi.loading,
        isFetchLoading: isPaymentSyncing,
        isPollingOpen,
        setIsPollingOpen,
        pollingError,
        executeSubmitPaymentReceipt,
    };
}