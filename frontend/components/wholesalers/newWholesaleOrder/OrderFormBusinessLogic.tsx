import wholesalersApi from '@/api/wholesalersApi';
import { useApi } from '@/hooks/useApi';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useWholesaleOrderForm } from './useWholesaleOrderForm';

interface OrderFormBusinessLogicProps {
    user: any;
    productsCatalog: any[];
    onSubmitFinished?: (retailerId: string, notes: string, items: any[]) => void;
    onRowsCountChange?: (count: number) => void;
    children: (props: any) => React.ReactNode;
}

export default function OrderFormBusinessLogic({
    user,
    productsCatalog,
    onSubmitFinished,
    onRowsCountChange,
    children
}: OrderFormBusinessLogicProps) {
    const createOrderApi = useApi(wholesalersApi.wholesaleRetailerOrdersStaffAction);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
    const [mpesaNumber, setMpesaNumber] = useState('');
    const [submitToast, setSubmitToast] = useState<string | null>(null);
    const {
        selectedRetailer,
        setSelectedRetailer,
        notes,
        setNotes,
        formRows,
        addFormRow,
        removeFormRow,
        updateRowState,
        populateProductIntoRow,
        grandTotalCost,
        retailers,
        paymentMethods,
        isSyncLoading,
        syncStatus,
        setSyncStatus,
        clearActiveDraftSession
    } = useWholesaleOrderForm();

    useEffect(() => {
        if (paymentMethods && paymentMethods.length > 0 && !selectedPaymentMethod) {
            setSelectedPaymentMethod(paymentMethods);
        }
    }, [paymentMethods]);

    useEffect(() => {
        if (onRowsCountChange && formRows) onRowsCountChange(formRows.length);
    }, [formRows?.length, onRowsCountChange]);

    const triggerNotificationToast = (msg: string) => {
        setSubmitToast(msg);
        setTimeout(() => setSubmitToast(null), 5000);
    };

    const handleSaveDraftManual = async () => {
        if (!selectedRetailer) {
            const msg = '⚠️ Assign a client customer to declare a draft.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }
        await clearActiveDraftSession();
        setMpesaNumber('');
        triggerNotificationToast('💾 Draft session securely saved to local storage.');
    };

    const handleSubmit = async () => {
        if (!selectedRetailer || !selectedPaymentMethod) {
            const msg = '⚠️ Complete retailer and payment configurations.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }
        if (formRows.some(row => !row.wholesaler_receipt || !row.purchased_quantity)) {
            const msg = '⚠️ Fill or remove unfinished product lines.';
            alert(msg);
            triggerNotificationToast(msg);
            return;
        }
        const formattedOrderItems = formRows.map(row => {
            const realProduct = productsCatalog.find(p => p.title === row.wholesaler_receipt);
            const purchasedQtyNum = parseFloat(row.purchased_quantity) || 0;
            const discountAmountNum = parseFloat(row.item_price_discount) || 0;
            const unitPriceNum = realProduct ? realProduct.item_price : (row.item_price || 0);
            const computedNetPrice = parseFloat(Math.max(0, unitPriceNum - (purchasedQtyNum > 0 ? (discountAmountNum / purchasedQtyNum) : 0)).toFixed(2));
            return {
                wholesaler_receipt: realProduct ? realProduct.id : row.id,
                purchased_quantity: String(purchasedQtyNum),
                discount_quantity: "0",
                total_quantity: purchasedQtyNum,
                unit_of_issue: "LoosePackUnits",
                loose_pack_unit: "Piece",
                item_price: unitPriceNum,
                item_net_price: computedNetPrice,
                item_price_discount: discountAmountNum,
                item_price_total: row.item_price_total
            };
        });
        const currentIntegerTimestamp = Math.floor(Date.now() / 1000);
        const generatedDraftId = `${user?.id || 'unknown'}:${currentIntegerTimestamp}`;
        const structuredPayload = {
            action: "CreateStaffRetailerOrder",
            retailer_order_details: {
                retailer_id: selectedRetailer.key,
                draft_id: generatedDraftId,
                order_terms: "CASH",
                order_type: "NORMAL",
                payment_method_id: selectedPaymentMethod.id,
                mobile_money_phone: selectedPaymentMethod?.title === "MOBILE MONEY" ? mpesaNumber : null,
                final_price_total: grandTotalCost,
                order_items: formattedOrderItems
            }
        };
        console.log('====================================');
        console.log('🚀 [ORDER SUBMIT PAYLOAD LOG] OUTGOING REQUEST DATA:');
        console.log(JSON.stringify(structuredPayload, null, 2));
        console.log('====================================');
        const result = await createOrderApi.request(structuredPayload);
        console.log('====================================');
        console.log('🔍 [ORDER SUBMIT RESPONSE LOG] createOrderApi OUTCOME:');
        console.log('Status Code:', result.status);
        console.log('Network OK:', result.ok);
        console.log('Payload Data:', JSON.stringify(result.data, null, 2));
        console.log('====================================');
        const responseData = result.data as any;
        const responseCodeString = String(responseData?.response_code || '');

        if (result.ok && responseCodeString === '0') {
            setSyncStatus('SYNCED');
            const successMsg = responseData?.response_message || 'Wholesale order registered and verified on server successfully.';
            alert(`🎉 Order Created Successfully!\n\n${successMsg}`);
            const fallbackRetailerKey = selectedRetailer.key;
            await clearActiveDraftSession();
            if (onSubmitFinished) {
                onSubmitFinished(fallbackRetailerKey, notes, formRows);
            }
            router.replace('/(wholesalers)/newWholesaleOrder');
        } else {
            let combinedErrorMessage = responseData?.response_message || createOrderApi.errorMessage || 'Transaction validation exception occurred.';
            if (responseData?.errors) {
                const errorsPayload = responseData.errors;
                let detailedErrorStrings: string[] = [];
                if (Array.isArray(errorsPayload)) {
                    detailedErrorStrings = errorsPayload.map((err: any) => typeof err === 'string' ? err : JSON.stringify(err));
                } else if (typeof errorsPayload === 'object') {
                    Object.entries(errorsPayload).forEach(([fieldKey, errorValue]) => {
                        const formattedValue = Array.isArray(errorValue) ? errorValue.join(', ') : String(errorValue);
                        detailedErrorStrings.push(`${fieldKey}: ${formattedValue}`);
                    });
                }
                if (detailedErrorStrings.length > 0) {
                    combinedErrorMessage = `${combinedErrorMessage} -> ${detailedErrorStrings.join(' | ')}`;
                }
            }
            alert(`Wholesale Submission Error\n\n${combinedErrorMessage}`);
            triggerNotificationToast(`❌ Failed: ${combinedErrorMessage}`);
        }
    };

    return <>{children({ selectedRetailer, setSelectedRetailer, notes, setNotes, formRows, addFormRow, removeFormRow, updateRowState, populateProductIntoRow, grandTotalCost, retailers, paymentMethods, isSyncLoading, syncStatus, selectedPaymentMethod, setSelectedPaymentMethod, mpesaNumber, setMpesaNumber, handleSaveDraftManual, handleSubmit, clearActiveDraftSession, submitToast, isSubmitting: createOrderApi.loading })}</>;
}
