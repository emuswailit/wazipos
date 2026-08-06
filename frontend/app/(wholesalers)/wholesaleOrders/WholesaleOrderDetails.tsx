import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { WholesaleOrder } from "./WholesaleOrdersList";
interface WholesaleOrderDetailsProps {
    routeItem: WholesaleOrder;
    onClose: () => void;
    theme: any;
    formatDateHandler: (dateString: string) => string;
}
export default function WholesaleOrderDetails({ routeItem, onClose, theme, formatDateHandler }: WholesaleOrderDetailsProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);
    };
    return (
        <View className="flex-1 w-full md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto h-full flex-col">
            <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-14 w-full border-b px-4 flex-row justify-between items-center rounded-xl shadow-xs mb-4">
                <View className="flex-row items-center">
                    <Text style={{ color: theme.text }} className="text-sm font-black truncate max-w-[240px]">Audit Invoice: {routeItem.id}</Text>
                </View>
                {/* 🍏 FIXED: Triggers the parent onClose callback instead of a non-existent state setter handler mapping path */}
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="py-1 px-3 bg-red-500/10 active:bg-red-500/20 rounded-lg"><Text className="text-red-500 font-extrabold text-xs">✕ Dismiss Invoice</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full">
                <View className="w-full flex-col gap-y-4">
                    <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-3">
                        <View className="w-full">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Purchasing Client</Text>
                            <Text style={{ color: theme.primary }} className="text-lg font-black text-left leading-snug">{routeItem.buyerName}</Text>
                        </View>
                        <View style={{ borderTopColor: theme.border }} className="w-full flex-row justify-between items-center pt-2.5 border-t flex-wrap gap-2">
                            <View className="items-start"><Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Statement Date</Text><Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{formatDateHandler(routeItem.orderDate)}</Text></View>
                            <View className="items-end web:items-start"><Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Reference Code</Text><Text style={{ color: theme.text }} className="text-[11px] font-semibold mt-0.5">{routeItem.invoiceNumber}</Text></View>
                        </View>
                    </View>
                    <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-5 rounded-2xl border shadow-sm w-full flex-col">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-3">Itemized Distribution Line Breakdown</Text>
                        <View className="flex-col gap-y-2">
                            {routeItem.items.map((line) => (
                                <View key={line.id} style={{ backgroundColor: theme.background }} className="p-3.5 rounded-xl flex-col border border-slate-700/5">
                                    <View className="flex-row justify-between items-start gap-x-2">
                                        <Text style={{ color: theme.text }} className="font-black text-sm flex-1">{line.title}</Text>
                                        <Text style={{ color: theme.primary }} className="font-bold text-sm whitespace-nowrap">{formatCurrency(line.subtotal)}</Text>
                                    </View>
                                    <View className="flex-row justify-between items-center mt-1.5 pt-1.5 border-t border-dashed border-slate-700/10">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] font-mono">SKU: {line.sku}</Text>
                                        <Text style={{ color: theme.textDark }} className="text-[11px] font-medium">{line.qty} items × {formatCurrency(line.unitPrice)}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View style={{ borderTopColor: theme.border }} className="mt-4 pt-4 flex-row justify-between items-center border-t">
                            <Text style={{ color: theme.textDark }} className="text-xs uppercase font-black tracking-wider">Invoice Statement Value</Text>
                            <Text style={{ color: theme.primary }} className="text-xl font-black">{formatCurrency(routeItem.totalAmount)}</Text>
                        </View>
                    </View>
                    <View className="w-full">
                        <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="w-full h-11 rounded-xl items-center justify-center shadow-sm active:opacity-90"><Text className="text-white font-black text-xs uppercase tracking-wider">Acknowledge Statement</Text></TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
