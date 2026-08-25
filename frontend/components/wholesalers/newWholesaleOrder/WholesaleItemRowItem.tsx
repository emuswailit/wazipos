import { useAuth } from '@/context/AuthContext';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProductCatalogItem, WholesaleItemRow } from '../../../app/(wholesalers)/newWholesaleOrder/types';

interface WholesaleItemRowItemProps {
    row: WholesaleItemRow;
    index: number;
    productsCatalog: ProductCatalogItem[];
    onUpdateRow: (id: string, updatedFields: Partial<WholesaleItemRow>) => void;
    onPopulateRow: (id: string, product: ProductCatalogItem, overrideQty?: string) => void;
    onRemoveRow: (id: string) => void;
    onScanTrigger: () => void;
}

export default function WholesaleItemRowItem({ row, index, productsCatalog, onUpdateRow, onPopulateRow, onRemoveRow, onScanTrigger }: WholesaleItemRowItemProps) {
    const { theme } = useAuth();
    const query = row.productSearchQuery || '';
    const rowFilteredProducts = query.trim() === ''
        ? productsCatalog
        : productsCatalog.filter(p => p.title.toLowerCase().includes(query.toLowerCase()));

    const adjustQuantityByDelta = (delta: number) => {
        const currentQty = parseFloat(row.purchased_quantity) || 0;
        const fallbackQty = Math.max(0, currentQty + delta);
        onUpdateRow(row.id, { purchased_quantity: fallbackQty.toString() });
    };

    const handleDiscountChange = (text: string) => {
        onUpdateRow(row.id, { item_price_discount: text });
    };

    const handleDiscountBlur = () => {
        const val = parseFloat(row.item_price_discount) || 0;
        onUpdateRow(row.id, { item_price_discount: val.toFixed(2) });
    };

    return (
        <View className="p-3 mb-2 rounded-xl border-2 flex-col relative z-10" style={{ borderColor: theme.isDarkMode ? '#475569' : '#a1a1aa', backgroundColor: theme.background + '25' }}>
            <View className="flex-row justify-between items-center mb-2 pb-1.5 border-b border-gray-300/60">
                <Text className="text-xs font-bold" style={{ color: theme.textDark }}>Item Group #{index + 1}</Text>
                <TouchableOpacity onPress={() => onRemoveRow(row.id)} className="w-7 h-7 bg-red-50 rounded-md items-center justify-center border border-red-300" activeOpacity={0.6}>
                    <Text className="text-red-600 font-bold text-xs">🗑️</Text>
                </TouchableOpacity>
            </View>
            <View className="flex-row flex-wrap -mx-2">
                <View className="w-full md:w-1/2 px-2 mb-2 relative z-20">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Wholesaler Receipt (Product lookup) *</Text>
                    <TextInput className="border rounded-md p-2 text-sm bg-white text-[#1c1c1e]" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }} placeholder="Click to browse or type to filter..." value={row.productSearchQuery || row.wholesaler_receipt} onChangeText={(txt) => onUpdateRow(row.id, { productSearchQuery: txt, showProductSuggestions: true, wholesaler_receipt: '' })} onFocus={() => onUpdateRow(row.id, { showProductSuggestions: true })} />
                    {row.showProductSuggestions && (
                        <View className="absolute left-2 right-2 top-14 rounded-md shadow-lg border-2 max-h-36 overflow-hidden z-30" style={{ backgroundColor: theme.panel, borderColor: theme.isDarkMode ? '#475569' : '#a1a1aa' }}>
                            {rowFilteredProducts.length === 0 ? (
                                <View className="p-2"><Text style={{ color: theme.textDark }} className="text-xs italic">No product matches found</Text></View>
                            ) : (
                                <ScrollView nestedScrollEnabled={false} keyboardShouldPersistTaps="handled">
                                    {rowFilteredProducts.map((prod) => (
                                        <TouchableOpacity key={prod.id} className="p-2 border-b border-gray-200" onPress={() => onPopulateRow(row.id, prod)}>
                                            <Text style={{ color: theme.text }} className="text-sm font-medium">{prod.title} (KES {prod.item_price.toFixed(2)})</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    )}
                </View>
                <View className="w-full md:w-1/2 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Barcode Key</Text>
                    <View className="flex-row items-center border rounded-md bg-white" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }}>
                        <TextInput className="flex-1 p-2 text-sm text-[#1c1c1e]" placeholder="Scan or key" value={row.bar_code} onChangeText={(txt) => onUpdateRow(row.id, { bar_code: txt })} />
                        <TouchableOpacity className="px-3 py-2 bg-blue-500 rounded-r-md" onPress={onScanTrigger}><Text className="text-white text-xs font-bold">📷</Text></TouchableOpacity>
                    </View>
                </View>
                <View className="w-full md:w-1/4 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Purchased Qty *</Text>
                    <View className="flex-row flex-nowrap items-center bg-white border rounded-md overflow-hidden h-10 w-full" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }}>
                        <TouchableOpacity onPress={() => adjustQuantityByDelta(-1)} className="w-10 h-full bg-gray-100 active:bg-gray-200 border-r border-gray-200 justify-center items-center min-w-[40px]"><Text className="font-extrabold text-base text-zinc-700">-</Text></TouchableOpacity>
                        <TextInput className="flex-1 h-full text-sm text-center font-bold bg-white p-0 m-0 text-[#1c1c1e] min-w-[40px]" keyboardType="numeric" placeholder="0" value={row.purchased_quantity} onChangeText={(txt) => onUpdateRow(row.id, { purchased_quantity: txt })} />
                        <TouchableOpacity onPress={() => adjustQuantityByDelta(1)} className="w-10 h-full bg-gray-100 active:bg-gray-200 border-l border-gray-200 justify-center items-center min-w-[40px]"><Text className="font-extrabold text-base text-zinc-700">+</Text></TouchableOpacity>
                    </View>
                </View>
                <View className="w-1/2 md:w-1/5 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Discount (KES)</Text>
                    <TextInput className="border rounded-md p-2 text-sm bg-white h-10 text-[#1c1c1e]" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }} keyboardType="numeric" placeholder="0.00" value={row.item_price_discount} onChangeText={handleDiscountChange} onBlur={handleDiscountBlur} />
                </View>
                <View className="w-1/2 md:w-1/5 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Unit Price</Text>
                    <View className="border rounded-md p-2 h-10 justify-center bg-gray-100" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }}><Text className="text-sm font-semibold text-zinc-800">KES {row.item_price.toFixed(2)}</Text></View>
                </View>
                <View className="w-1/2 md:w-1/5 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Available Stock</Text>
                    <View className="border rounded-md p-2 h-10 justify-center bg-gray-100" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }}><Text className="text-sm bg-gray-100 italic text-zinc-600">{row.available || 'N/A'}</Text></View>
                </View>
                <View className="w-1/2 md:w-1/5 px-2 mb-2">
                    <Text className="text-xs font-medium mb-1" style={{ color: theme.textDark }}>Total Cost</Text>
                    <View className="border rounded-md p-2 bg-green-50 h-10 justify-center items-end" style={{ borderColor: theme.isDarkMode ? '#475569' : '#d1d1d6' }}><Text className="text-sm font-bold text-green-700">KES {row.item_price_total.toFixed(2)}</Text></View>
                </View>
            </View>
        </View>
    );
}
