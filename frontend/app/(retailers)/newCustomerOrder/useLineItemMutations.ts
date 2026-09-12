import { OrderLineItem } from './types';
export function useLineItemMutations(setLineItems: React.Dispatch<React.SetStateAction<OrderLineItem[]>>, saveLinesToStorage: (lines: OrderLineItem[]) => Promise<void>) {
    const handleUpdateRow = (id: string, updates: Partial<OrderLineItem>) => {
        setLineItems(prev => { const next = prev.map(item => (item.id === id ? { ...item, ...updates } : item)); saveLinesToStorage(next); return next; });
    };
    const handleSelectProduct = (id: string, prod: any) => {
        const productSellingPrice = Number(prod.unit_selling_price || prod.price || 0);
        setLineItems(prev => {
            const next = prev.map(item => (item.id === id ? { ...item, selectedProduct: String(prod.id || prod.key), selectedProductTitle: prod.title || '', searchQuery: prod.title || '', price: productSellingPrice, quantity: 1, discount: 0, isDropdownOpen: false } : item));
            saveLinesToStorage(next); return next;
        });
    };
    const handleAddRow = () => {
        setLineItems(prev => { const next = [...prev, { id: Date.now().toString(), selectedProduct: null, selectedProductTitle: '', quantity: 1, price: 0, discount: 0, searchQuery: '', isDropdownOpen: false, calculatedLineAmount: 0 }]; saveLinesToStorage(next); return next; });
    };
    const handleDeleteRow = (id: string) => {
        setLineItems(prev => { const next = prev.filter(i => i.id !== id); saveLinesToStorage(next); return next; });
    };
    return { handleUpdateRow, handleSelectProduct, handleAddRow, handleDeleteRow };
}
