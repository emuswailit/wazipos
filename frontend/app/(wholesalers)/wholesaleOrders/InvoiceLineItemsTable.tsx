import { Image, Text, View } from 'react-native';

interface InvoiceLineItemsTableProps {
    theme: any;
    items: any[];
}

export default function InvoiceLineItemsTable({ theme, items = [] }: InvoiceLineItemsTableProps) {
    return (
        <View style={{ borderColor: theme.border }} className="border rounded-xl overflow-hidden mb-6 w-full">
            <View style={{ backgroundColor: theme.background, borderBottomColor: theme.border }} className="flex-row px-3 py-2.5 border-b w-full">
                <View className="w-[42%]"><Text style={{ color: theme.textDark }} className="text-[10px] font-black uppercase">Product Specification</Text></View>
                <View className="w-[14%]"><Text style={{ color: theme.textDark }} className="text-[10px] font-black uppercase text-center">Qty</Text></View>
                <View className="w-[22%]"><Text style={{ color: theme.textDark }} className="text-[10px] font-black uppercase text-right">Price</Text></View>
                <View className="w-[22%]"><Text style={{ color: theme.textDark }} className="text-[10px] font-black uppercase text-right">Gross Total</Text></View>
            </View>
            {items.map((item: any, idx: number) => {
                const hasImage = Array.isArray(item.images) && item.images.length > 0;
                const imgUrl = hasImage ? (item.images[0].thumbnail || item.images[0].image) : null;
                return (
                    <View key={item.id || idx} style={{ borderBottomColor: theme.border, backgroundColor: theme.panel }} className="flex-row items-center px-3 py-3 border-b w-full">
                        <View className="w-[42%] flex-row items-center gap-x-2 pr-1">
                            {imgUrl && (
                                <Image source={{ uri: imgUrl }} style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: theme.background }} />
                            )}
                            <View className="flex-1">
                                <Text style={{ color: theme.text }} className="text-xs font-bold" numberOfLines={2}>{item.product_title || item.title}</Text>
                                {item.batch && <Text style={{ color: theme.textDark }} className="text-[9px] font-mono opacity-50">Batch: {item.batch}</Text>}
                            </View>
                        </View>
                        <View className="w-[14%] items-center">
                            <Text style={{ color: theme.text }} className="text-xs font-bold text-center">{item.purchased_quantity || item.unit_quantity || 0}</Text>
                        </View>
                        <View className="w-[22%] items-end">
                            <Text style={{ color: theme.textDark }} className="text-xs font-medium text-right">KES {parseFloat(item.item_net_price || item.item_price || 0).toFixed(2)}</Text>
                        </View>
                        <View className="w-[22%] items-end">
                            <Text style={{ color: theme.text }} className="text-xs font-black text-right">KES {parseFloat(item.item_price_total || 0).toFixed(2)}</Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
}
