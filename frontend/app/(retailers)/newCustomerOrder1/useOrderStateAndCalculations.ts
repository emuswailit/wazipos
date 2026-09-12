import { db } from '@/databases/db';
import { useEffect, useMemo, useState } from 'react';
import { OrderLineItem } from './types';
export function useOrderStateAndCalculations(paymentMethodsList: any[]) {
    const [lineItems, setLineItems] = useState<OrderLineItem[]>(() => [
        { id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }
    ]);
    const [selectedPaymentMethodId, setSelectedPaymentMethodMethodId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [shippingCost, setShippingCost] = useState('');
    const [paymentAccountNumber, setPaymentAccountNumber] = useState('');
    useEffect(() => {
        const load = async () => { try { const saved = await db.getLineItems(); if (saved?.length > 0) setLineItems(saved); } catch (e) { } };
        load();
    }, []);
    useEffect(() => { if (db?.saveLineItems && lineItems.length > 0) db.saveLineItems(lineItems).catch(() => { }); }, [lineItems]);
    const actPay = useMemo(() => paymentMethodsList.find(i => i.id === selectedPaymentMethodId), [selectedPaymentMethodId, paymentMethodsList]);
    const isCreditSelected = useMemo(() => actPay?.title?.toUpperCase().includes('CREDIT') || false, [actPay]);
    const isMobileMoneySelected = useMemo(() => actPay?.title?.toUpperCase().includes('MOBILE MONEY') || actPay?.title?.toUpperCase().includes('MPESA') || false, [actPay]);
    const handleAddNewItem = () => setLineItems(p => [...p, { id: String(Math.max(0, ...p.map(i => Number(i.id) || 0)) + 1), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }]);
    const handleDeleteItem = (id: string) => setLineItems(p => { const n = p.filter(i => i.id !== id); return n.length === 0 ? [{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }] : n; });
    const updateLineItem = (id: string, u: Partial<OrderLineItem>) => setLineItems(p => p.map(i => i.id === id ? { ...i, ...u } : i));
    const resetForm = async () => { setLineItems([{ id: '1', selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false }]); setSelectedPaymentMethodMethodId(''); setCustomerName(''); setCustomerPhone(''); setDueDate(''); setDeliveryMethod(''); setShippingCost(''); setPaymentAccountNumber(''); if (db?.clearLineItems) await db.clearLineItems(); };
    const computedTotals = useMemo(() => {
        let gross = 0;
        const list = lineItems.map(i => {
            let prc = Number(i.price || 0);
            try { if (typeof i.selectedProduct === 'string') prc = Number(JSON.parse(i.selectedProduct)?.price || 0); } catch { }
            const amt = Math.max(0, (prc * (Number(i.quantity) || 0)) - (i.discount || 0));
            gross += amt; return { ...i, calculatedLineAmount: amt };
        });
        return { lineItemsWithTotals: list, grandTotal: gross + (deliveryMethod === 'DELIVERY' ? (parseFloat(shippingCost) || 0) : 0) };
    }, [lineItems, deliveryMethod, shippingCost]);
    return { lineItems, setLineItems, selectedPaymentMethodId, setSelectedPaymentMethodMethodId, customerName, setCustomerName, customerPhone, setCustomerPhone, dueDate, setDueDate, deliveryMethod, setDeliveryMethod, shippingCost, setShippingCost, paymentAccountNumber, setPaymentAccountNumber, isCreditSelected, isMobileMoneySelected, computedTotals, handleAddNewItem, handleDeleteItem, updateLineItem, resetForm };
}
