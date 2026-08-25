import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

interface WholesaleOrdersHistoryProps {
    theme: any;
    orders: any[];
    onReloadOrder: (order: any) => void;
}

export default function WholesaleOrdersHistory({ theme, orders = [], onReloadOrder }: WholesaleOrdersHistoryProps) {
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    if (!orders || orders.length === 0) {
        return (
            <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full p-8 rounded-xl border items-center justify-center mt-6">
                <Text style={{ color: theme.textDark }} className="text-sm font-semibold italic">No localized order transactions logged in history indexes.</Text>
            </View>
        );
    }

    if (!isLargeScreen) {
        return (
            <View className="w-full mt-8 gap-y-3">
                <Text style={{ color: theme.text }} className="text-lg font-black px-1">Recent Transactions History (Tap to Reload)</Text>
                {orders.map((order) => (
                    <Pressable
                        key={order.id}
                        onPress={() => onReloadOrder(order)}
                        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                    >
                        <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-4 rounded-xl border shadow-sm flex-col gap-y-2">
                            <View className="flex-row justify-between items-center">
                                <Text style={{ color: theme.text }} className="text-sm font-black w-2/3" numberOfLines={1}>{order.retailer_name}</Text>
                                <View style={{ backgroundColor: order.sync_status === 'SYNCED' ? '#22c55e20' : '#f59e0b20' }} className="px-2 py-0.5 rounded-md">
                                    <Text style={{ color: order.sync_status === 'SYNCED' ? '#22c55e' : '#f59e0b' }} className="text-[10px] font-black uppercase tracking-wider">{order.sync_status}</Text>
                                </View>
                            </View>
                            <Text style={{ color: theme.textDark }} className="text-xxs font-mono opacity-60">REF: {order.draft_id}</Text>
                            <View className="flex-row justify-between items-center mt-1 pt-2 border-t border-dashed" style={{ borderTopColor: theme.border }}>
                                <Text style={{ color: theme.textDark }} className="text-xs font-semibold">{order.item_count} items via {order.payment_method_title}</Text>
                                <Text style={{ color: theme.primary }} className="text-sm font-extrabold">KES {order.final_price_total.toFixed(2)}</Text>
                            </View>
                        </View>
                    </Pressable>
                ))}
            </View>
        );
    }

    const renderTableRows = () => (
        <>
            {orders.map((order) => (
                <Pressable key={order.id} onPress={() => onReloadOrder(order)}>
                    {({ pressed }) => (
                        <View
                            style={{ borderBottomColor: theme.border, backgroundColor: pressed ? `${theme.primary}10` : 'transparent' }}
                            className="flex-row items-center px-4 py-3 border-b hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                            <Text style={{ color: theme.text }} className="flex-2 text-xs font-bold" numberOfLines={1}>{order.retailer_name}</Text>
                            <Text style={{ color: theme.textDark }} className="flex-1 text-xxs font-mono truncate">{order.draft_id}</Text>
                            <Text style={{ color: theme.text }} className="flex-1 text-xs font-medium text-center">{order.item_count}</Text>
                            <Text style={{ color: theme.textDark }} className="flex-1 text-xxs font-bold text-center uppercase tracking-wide">{order.payment_method_title}</Text>
                            <View className="flex-1 items-center justify-center">
                                <View style={{ backgroundColor: order.sync_status === 'SYNCED' ? '#22c55e15' : '#f59e0b15' }} className="px-2.5 py-0.5 rounded-md">
                                    <Text style={{ color: order.sync_status === 'SYNCED' ? '#22c55e' : '#f59e0b' }} className="text-[10px] font-black tracking-widest">{order.sync_status}</Text>
                                </View>
                            </View>
                            <Text style={{ color: theme.primary }} className="flex-1 text-xs font-black text-right">KES {order.final_price_total.toFixed(2)}</Text>
                        </View>
                    )}
                </Pressable>
            ))}
        </>
    );

    return (
        <View className="w-full mt-8 flex-col gap-y-3">
            <Text style={{ color: theme.text }} className="text-lg font-black">Recent Transactions Ledger History (Click Row to Reload)</Text>
            <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="w-full rounded-xl border shadow-sm overflow-hidden">
                <View style={{ backgroundColor: theme.background }} className="flex-row px-4 py-3 border-b" style={{ borderBottomColor: theme.border }}>
                    <Text style={{ color: theme.textDark }} className="flex-2 text-xs font-black uppercase tracking-wider">Retailer / Client</Text>
                    <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider">Reference Node</Text>
                    <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Lines</Text>
                    <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Settlement</Text>
                    <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-center">Sync Matrix</Text>
                    <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-black uppercase tracking-wider text-right">Billing Gross</Text>
                </View>
                {Platform.OS === 'web' ? (
                    <ScrollView className="w-full max-h-80" nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                        {renderTableRows()}
                    </ScrollView>
                ) : (
                    <View className="w-full">
                        {renderTableRows()}
                    </View>
                )}
            </View>
        </View>
    );
}
