import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

// 1. TYPINGS & INTERFACES
interface OrderItem {
    id: string;
    client: string;
    itemsCount: number;
    total: number;
    status: "Pending" | "Completed" | "Processing" | "Cancelled";
    date: string;
}

// 2. MOCK DATA
const MOCK_ORDERS: OrderItem[] = [
    { id: "ORD-9921", client: "Wazipos Wholesalers", itemsCount: 45, total: 1250.00, status: "Completed", date: "2026-08-01" },
    { id: "ORD-8812", client: "Test Retailer 2", itemsCount: 12, total: 340.50, status: "Processing", date: "2026-07-31" },
    { id: "ORD-7743", client: "Alba General Stores", itemsCount: 8, total: 195.00, status: "Pending", date: "2026-07-30" },
    { id: "ORD-6610", client: "Nairobi Supermarket", itemsCount: 89, total: 4200.00, status: "Completed", date: "2026-07-28" },
    { id: "ORD-5541", client: "Mombasa Traders", itemsCount: 3, total: 65.00, status: "Cancelled", date: "2026-07-25" },
];

export default function ClientOrdersScreen() {
    const { width } = useWindowDimensions();
    const { tab } = useLocalSearchParams<{ tab?: string }>();

    // Responsive Breakpoint: Desktop/Web mode if viewport width is >= 768px
    const isLargeScreen = width >= 768;

    // Status Badge Class Allocator
    const getStatusClasses = (status: OrderItem["status"]) => {
        switch (status) {
            case "Completed": return { bg: "bg-green-500/15", text: "text-green-500" };
            case "Processing": return { bg: "bg-blue-500/15", text: "text-blue-500" };
            case "Pending": return { bg: "bg-yellow-500/15", text: "text-yellow-500" };
            case "Cancelled": return { bg: "bg-red-500/15", text: "text-red-500" };
        }
    };

    return (
        <View className="flex-1 bg-slate-900 p-4">

            {/* HEADER SECTION */}
            <View className="flex-row justify-between items-center mb-5 flex-wrap gap-2">
                <Text className="text-2xl font-extrabold text-white tracking-wide">Client Orders Ledger</Text>
                {tab && (
                    <View className="bg-white/10 py-1 px-2 rounded-md">
                        <Text className="text-slate-400 text-xs font-bold">Active Tab: {tab.toUpperCase()}</Text>
                    </View>
                )}
            </View>

            {/* CONDITIONAL RESPONSIVE RENDER WRAPPER */}
            {isLargeScreen ? (
                /* --- DESKTOP / WEB VIEW: RENDER A DATA TABLE --- */
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View className="flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-[760px]">

                        {/* TABLE HEADER */}
                        <View className="flex-row items-center px-4 py-3.5 bg-slate-950 border-b-2 border-slate-600">
                            <Text className="w-[100px] text-slate-400 font-bold text-xs uppercase tracking-wider">Order ID</Text>
                            <Text className="w-[220px] text-slate-400 font-bold text-xs uppercase tracking-wider">Client Name</Text>
                            <Text className="w-[90px] text-slate-400 font-bold text-xs uppercase tracking-wider text-center">Items</Text>
                            <Text className="w-[120px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">Total Value</Text>
                            <Text className="w-[130px] text-slate-400 font-bold text-xs uppercase tracking-wider text-center">Status</Text>
                            <Text className="w-[120px] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">Date</Text>
                        </View>

                        {/* TABLE BODY */}
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {MOCK_ORDERS.map((order) => {
                                const badge = getStatusClasses(order.status);
                                return (
                                    <View key={order.id} className="flex-row items-center px-4 py-3.5 border-b border-slate-700 hover:bg-slate-700/50">
                                        <Text className="w-[100px] text-white font-bold text-sm">{order.id}</Text>
                                        <Text className="w-[220px] text-slate-200 text-sm" numberOfLines={1}>{order.client}</Text>
                                        <Text className="w-[90px] text-slate-200 text-sm text-center">{order.itemsCount}</Text>
                                        <Text className="w-[120px] text-slate-200 text-sm text-right">${order.total.toFixed(2)}</Text>
                                        <View className="w-[130px] items-center justify-center">
                                            <View className={`py-1 px-3 rounded-full ${badge.bg}`}>
                                                <Text className={`text-xs font-bold ${badge.text}`}>{order.status}</Text>
                                            </View>
                                        </View>
                                        <Text className="w-[120px] text-slate-400 text-sm text-right">{order.date}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </ScrollView>
            ) : (
                /* --- MOBILE SCREEN VIEW: RENDER A COMPACT LIST OF CARDS --- */
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
                    {MOCK_ORDERS.map((order) => {
                        const badge = getStatusClasses(order.status);
                        return (
                            <TouchableOpacity key={order.id} activeOpacity={0.8} className="bg-slate-800 rounded-xl p-4 border border-slate-700">

                                {/* CARD TOP BANNER */}
                                <View className="flex-row justify-between items-center mb-2.5">
                                    <Text className="text-white font-black text-base">{order.id}</Text>
                                    <View className={`py-1 px-2.5 rounded-full ${badge.bg}`}>
                                        <Text className={`text-xs font-bold ${badge.text}`}>{order.status}</Text>
                                    </View>
                                </View>

                                {/* CARD BODY CONTENT */}
                                <Text className="text-slate-200 text-base font-semibold mb-3.5" numberOfLines={1}>{order.client}</Text>

                                {/* CARD ACCOUNTING BREAKDOWN FOOTER */}
                                <View className="flex-row justify-between items-center border-t border-white/5 pt-2.5">
                                    <View>
                                        <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Qty</Text>
                                        <Text className="text-white text-sm font-medium">{order.itemsCount} items</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Total Amount</Text>
                                        <Text className="text-blue-500 text-sm font-bold">${order.total.toFixed(2)}</Text>
                                    </View>
                                </View>

                                <Text className="text-slate-600 text-[10px] mt-2 text-right font-medium">{order.date}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}
