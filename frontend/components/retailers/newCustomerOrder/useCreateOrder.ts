// useCreateOrder.ts

import { useAuth } from '@/context/AuthContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { dbInstance } from '@/databases/db';
import { CustomerOrder } from '@/databases/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { OrderLineItem } from './types';
import { useBarcodeStream } from './useBarcodeStream';
import { useFulfillmentWorkflow } from './useFulfillmentWorkflow';
import { useInventoryAdjustment } from './useInventoryAdjustment';
import { useLineItemMutations } from './useLineItemMutations';
import { useOrderCalculations } from './useOrderCalculations';
import { useOrderPersistence } from './useOrderPersistence';
import { useOrderSubmission } from './useOrderSubmission';
import { useOrderSubmissionWorkflow } from './useOrderSubmissionWorkflow';

const NATIVE_CUSTOMER_ORDERS_KEY =
    'wazipos_customer_orders_payload';

export function useCreateOrder(submitOrderApi?: any) {
    const { user } = useAuth();
    const { isOnline } = useNetworkStatus();
    const { retailerReceipts, triggerManualFetch } =
        useInventorySync();
    const { paymentMethodsList } = usePaymentMethodsSync();

    const [localStats, setLocalStats] = useState({
        syncedCount: 0,
        unsyncedCount: 0,
    });

    const [lineItems, setLineItems] = useState<OrderLineItem[]>(
        () => [
            {
                id: '1',
                selectedProduct: null,
                selectedProductTitle: '',
                quantity: 1,
                price: 0,
                discount: 0,
                searchQuery: '',
                isDropdownOpen: false,
                calculatedLineAmount: 0,
            },
        ]
    );

    const [bannerState, setBannerState] = useState({
        visible: false,
        type: 'success' as 'success' | 'danger',
        title: '',
        subtitle: '',
    });

    const triggerBanner = (
        type: 'success' | 'danger',
        title: string,
        subtitle: string
    ) => setBannerState({ visible: true, type, title, subtitle });

    const {
        hydrateCachedDatabaseRows,
        saveLinesToStorage,
        persistFinalCustomerOrder,
        clearStorageActiveLines,
        forceImmediateSyncQueuePass,
    } = useOrderPersistence(submitOrderApi, triggerManualFetch);

    const { deductLocalInventoryStock } = useInventoryAdjustment(
        triggerManualFetch
    );

    const { submitOrderToRemote } = useOrderSubmission(
        submitOrderApi,
        isOnline
    );

    const ffw = useFulfillmentWorkflow(
        deductLocalInventoryStock,
        clearStorageActiveLines,
        setLineItems
    );

    const refreshLocalOrderStatistics = useCallback(async () => {
        try {
            const allOrders: CustomerOrder[] =
                Platform.OS === 'web'
                    ? dbInstance?.customerOrders
                        ? await dbInstance.customerOrders.toArray()
                        : []
                    : JSON.parse(
                        (await AsyncStorage.getItem(
                            NATIVE_CUSTOMER_ORDERS_KEY
                        )) || '[]'
                    );

            let syncs = 0;
            let unsyncs = 0;
            for (const o of allOrders) {
                if (o.synced === 'TRUE') {
                    syncs++;
                } else {
                    unsyncs++;
                }
            }
            setLocalStats({
                syncedCount: syncs,
                unsyncedCount: unsyncs,
            });
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        hydrateCachedDatabaseRows(setLineItems);
        refreshLocalOrderStatistics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        refreshLocalOrderStatistics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerState.visible, ffw.isMomoPolling]);

    useEffect(() => {
        if (bannerState.visible) {
            const t = setTimeout(
                () =>
                    setBannerState((p) => ({
                        ...p,
                        visible: false,
                    })),
                4000
            );
            return () => clearTimeout(t);
        }
    }, [bannerState.visible]);

    const { processedLineItems, totals, isBlankRowPresent } =
        useOrderCalculations(lineItems);

    const {
        handleUpdateRow,
        handleSelectProduct,
        handleAddRow,
        handleDeleteRow,
    } = useLineItemMutations(setLineItems, saveLinesToStorage);

    /**
     * Called by LineItemRow when its search input gains focus.
     * Atomically closes every OTHER row's dropdown in a single
     * state update.
     */
    const handleSearchFocused = useCallback(
        (focusedRowId: string) => {
            setLineItems((prev) => {
                let changed = false;
                const next = prev.map((row) => {
                    if (
                        row.id !== focusedRowId &&
                        row.isDropdownOpen
                    ) {
                        changed = true;
                        return {
                            ...row,
                            isDropdownOpen: false,
                        };
                    }
                    return row;
                });
                return changed ? next : prev;
            });
        },
        []
    );

    const { handleBarcodeScannedContinuously } = useBarcodeStream(
        retailerReceipts,
        setLineItems,
        saveLinesToStorage
    );

    const {
        handleSaveOrder,
        handleMomoVerificationFinished,
    } = useOrderSubmissionWorkflow({
        user,
        isOnline,
        paymentMethodsList,
        selectedPaymentMethodId: ffw.selectedPaymentMethodId,
        paymentDetails: ffw.paymentDetails,
        deliveryMethod: ffw.deliveryMethod,
        processedLineItems,
        submitOrderToRemote,
        deductLocalInventoryStock,
        triggerBanner,
        ...ffw,
        persistFinalCustomerOrder,
        clearStorageActiveLines,
        forceImmediateSyncQueuePass,
        setLineItems,
        refreshLocalOrderStatistics,
    });

    return {
        retailerReceipts,
        paymentMethodsList,
        ...ffw,
        bannerState,
        lineItems: processedLineItems,
        isBlankRowPresent,
        handleUpdateRow,
        handleSelectProduct,
        handleAddRow,
        handleDeleteRow,
        handleSearchFocused,
        handleSaveOrder,
        handleBarcodeScannedContinuously,
        handleMomoVerificationFinished: async (
            s: boolean,
            m: string
        ) => await handleMomoVerificationFinished(s, m),
        totals,
        localStats,
    };
}