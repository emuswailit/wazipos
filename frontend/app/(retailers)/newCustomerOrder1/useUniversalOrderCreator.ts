import retailersApi from '@/api/retailersApi';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { db } from '@/databases/db';
import useApi from '@/hooks/useApi';
import { useEffect, useMemo, useState } from 'react';
import { useOrderFormSubmission } from './useOrderFormSubmission';

export function useUniversalOrderCreator(activeUserSession, onSubmitOrder) {
    const submitOrderApi = useApi(retailersApi.retailStaffAction);
    const { paymentMethodsList } = usePaymentMethodsSync();

    const [lineItems, setLineItems] = useState(() => [
        { id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }
    ]);

    const [selectedPaymentMethodId, setSelectedPaymentMethodMethodId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [shippingCost, setShippingCost] = useState('');
    const [paymentAccountNumber, setPaymentAccountNumber] = useState('');

    const { showSuccessBanner, setShowSuccessBanner, bannerRefCode, submitWorkflow } = useOrderFormSubmission(submitOrderApi, activeUserSession, onSubmitOrder);

    useEffect(() => {
        const load = async () => {
            const saved = await db.getLineItems();
            if (saved?.length) setLineItems(saved);
        };
        load();
    }, []);

    useEffect(() => {
        if (lineItems.length > 0) {
            db.saveLineItems(lineItems).catch(() => { });
        }
    }, [lineItems]);

    const actPay = useMemo(() => paymentMethodsList.find(i => i.id === selectedPaymentMethodId), [selectedPaymentMethodId, paymentMethodsList]);
    const isCredit = useMemo(() => actPay?.title?.toUpperCase().includes('CREDIT') || false, [actPay]);
    const isMobileMoney = useMemo(() => actPay?.title?.toUpperCase().includes('MOBILE MONEY') || actPay?.title?.toUpperCase().includes('MPESA') || false, [actPay]);

    const handleAddNewItem = () => setLineItems(p => [...p, { id: String(Math.max(0, ...p.map(i => Number(i.id) || 0)) + 1), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }]);

    const handleDeleteItem = (id) => setLineItems(p => {
        const n = p.filter(i => i.id !== id);
        return n.length === 0 ? [{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }] : n;
    });

    const updateLineItem = (id, u) => setLineItems(p => p.map(i => i.id === id ? { ...i, ...u } : i));

    const resetForm = async () => {
        setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }]);
        setSelectedPaymentMethodMethodId('');
        setCustomerName('');
        setCustomerPhone('');
        setDueDate('');
        setDeliveryMethod('');
        setShippingCost('');
        setPaymentAccountNumber('');
        await db.clearLineItems();
    };

    const computedTotals = useMemo(() => {
        let gross = 0;
        const list = lineItems.map(i => {
            let prc = Number(i.price || 0);
            try {
                if (typeof i.selectedProduct === 'string') {
                    const parsed = JSON.parse(i.selectedProduct);
                    prc = Number(parsed?.unit_selling_price || parsed?.price || prc);
                } else if (i.selectedProduct) {
                    prc = Number(i.selectedProduct?.unit_selling_price || i.selectedProduct?.price || prc);
                }
            } catch { }
            const amt = Math.max(0, (prc * (Number(i.quantity) || 0)) - (i.discount || 0));
            gross += amt;
            return { ...i, calculatedLineAmount: amt };
        });
        return { lineItemsWithTotals: list, grandTotal: gross + (deliveryMethod === 'DELIVERY' ? (parseFloat(shippingCost) || 0) : 0) };
    }, [lineItems, deliveryMethod, shippingCost]);

    const handleFormSubmission = () => submitWorkflow({
        computedTotals, selectedPaymentMethodId, deliveryMethod, isCredit,
        isMobileMoney, customerName, customerPhone, dueDate, shippingCost,
        paymentAccountNumber, resetForm
    });

    return {
        lineItems, setLineItems,
        selectedPaymentMethodId, setSelectedPaymentMethodMethodId,
        customerName, setCustomerName,
        customerPhone, setCustomerPhone,
        dueDate, setDueDate,
        deliveryMethod, setDeliveryMethod,
        shippingCost, setShippingCost,
        paymentAccountNumber, setPaymentAccountNumber,
        showSuccessBanner, setShowSuccessBanner, bannerRefCode,
        computedTotals, isCredit, isMobileMoney,
        handleAddNewItem, handleDeleteItem, updateLineItem, resetForm,
        handleFormSubmission, isLoading: submitOrderApi.loading
    };
}
