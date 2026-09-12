import { useMemo } from 'react';
import { OrderLineItem } from './types';
export function useOrderCalculations(lineItems: OrderLineItem[]) {
    const processedLineItems = useMemo(() => {
        return lineItems.map(item => {
            const basePrice = item.price || 0;
            const sub = basePrice * item.quantity;
            const amt = sub - item.discount;
            return { ...item, calculatedLineAmount: amt > 0 ? amt : 0 };
        });
    }, [lineItems]);
    const totals = useMemo(() => {
        let totalDiscount = 0, orderTotal = 0;
        processedLineItems.forEach(item => { totalDiscount += item.discount || 0; orderTotal += item.calculatedLineAmount || 0; });
        return { totalDiscount, orderTotal };
    }, [processedLineItems]);
    const isBlankRowPresent = useMemo(() => lineItems.some(i => i.selectedProduct === null), [lineItems]);
    return { processedLineItems, totals, isBlankRowPresent };
}
