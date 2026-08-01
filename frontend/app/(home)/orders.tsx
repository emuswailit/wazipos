import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

interface OrderItem {
    id: string;
    clientName: string;
    company: string;
    date: string;
    totalAmount: string;
    paymentStatus: "Settled" | "Pending" | "Overdue";
    itemsCount: number;
}

export default function OrdersDashboardScreen() {
    const { theme } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");

    const isCurrentlyDarkMode = theme.surface !== "#f8fafc";

    // Style color matrix mapping
    const masterTextColor = isCurrentlyDarkMode ? "#f8fafc" : "#0f172a";
    const subtleBorderColor = isCurrentlyDarkMode ? "#334155" : "#e2e8f0";
    const tableHeaderBg = isCurrentlyDarkMode ? "#1e293b" : "#f1f5f9";

    const sampleOrders: OrderItem[] = [
        { id: "ORD-2026-091", clientName: "Alice Kamau", company: "Nairobi Retailers Ltd", date: "2026-07-24", totalAmount: "KES 45,200.00", paymentStatus: "Settled", itemsCount: 14 },
        { id: "ORD-2026-092", clientName: "David Ochieng", company: "Kisumu Wholesalers", date: "2026-07-25", totalAmount: "KES 128,500.00", paymentStatus: "Pending", itemsCount: 42 },
        { id: "ORD-2026-093", clientName: "Mwajuma Ali", company: "Coast Logistics Hub", date: "2026-07-25", totalAmount: "KES 89,000.00", paymentStatus: "Overdue", itemsCount: 29 },
        { id: "ORD-2026-094", clientName: "Peter Mwangi", company: "Mount Kenya Agri-Stores", date: "2026-07-26", totalAmount: "KES 16,750.00", paymentStatus: "Settled", itemsCount: 5 },
    ];

    const getStatusStyles = (status: OrderItem["paymentStatus"]) => {
        switch (status) {
            case "Settled": return { bg: "bg-emerald-500/10", text: "text-emerald-500" };
            case "Pending": return { bg: "bg-amber-500/10", text: "text-amber-500" };
            case "Overdue": return { bg: "bg-red-500/10", text: "text-red-500" };
        }
    };

    const filteredOrders = sampleOrders.filter(order =>
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.company.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <View className="flex-1 p-6">
            <View className="mb-6 items-start">
                <Text style={{ color: isCurrentlyDarkMode ? "#ffffff" : theme.primary }} className="text-2xl font-black tracking-tight">
                    Client Orders Ledger
                </Text>
                <Text className="text-slate-400 text-xs mt-1 font-medium">
                    Monitor real-time mobile money settlements and commercial shipments.
                </Text>
            </View>

            <View className="mb-6 max-w-md">
                <TextInput
                    style={{ backgroundColor: isCurrentlyDarkMode ? "#1e293b" : theme.surface, borderColor: subtleBorderColor, color: masterTextColor }}
                    className="w-full rounded-xl px-4 h-[42px] border outline-none text-sm"
                    placeholder="🔍 Filter by Order ID, client name, or enterprise..." placeholderTextColor="#64748b"
                    value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none"
                />
            </View>

            {/* WEB DESKTOP SHEET VIEW */}
            <View className="hidden md:flex flex-1 rounded-2xl overflow-hidden border" style={{ borderColor: subtleBorderColor }}>
                <View style={{ backgroundColor: tableHeaderBg }} className="flex-row py-3 px-4 border-b" style={{ borderBottomColor: subtleBorderColor }}>
                    <Text className="flex-[1.5] text-slate-400 font-bold text-xs uppercase tracking-wider">Order ID</Text>
                    <Text className="flex-2 text-slate-400 font-bold text-xs uppercase tracking-wider">Client & Firm</Text>
                    <Text className="flex-1 text-slate-400 font-bold text-xs uppercase tracking-wider text-center">Items</Text>
                    <Text className="flex-[1.5] text-slate-400 font-bold text-xs uppercase tracking-wider">Date</Text>
                    <Text className="flex-[1.5] text-slate-400 font-bold text-xs uppercase tracking-wider text-right">Total Value</Text>
                    <Text className="flex-[1.5] text-slate-400 font-bold text-xs uppercase tracking-wider text-center">Status</Text>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    {filteredOrders.map((order) => {
                        const statusColor = getStatusStyles(order.paymentStatus);
                        return (
                            <View key={order.id} style={{ borderBottomColor: subtleBorderColor }} className="flex-row py-4 px-4 border-b items-center hover:bg-slate-50/5">
                                <Text style={{ color: theme.primary }} className="flex-[1.5] font-black text-sm">{order.id}</Text>
                                <View className="flex-2 items-start">
                                    <Text style={{ color: masterTextColor }} className="font-bold text-sm">{order.clientName}</Text>
                                    <Text className="text-slate-400 text-xs font-medium mt-0.5">{order.company}</Text>
                                </View>
                                <Text style={{ color: masterTextColor }} className="flex-1 text-center font-semibold text-sm">{order.itemsCount}</Text>
                                <Text className="flex-[1.5] text-slate-400 font-medium text-sm">{order.date}</Text>
                                <Text style={{ color: masterTextColor }} className="flex-[1.5] text-right font-black text-sm">{order.totalAmount}</Text>
                                <View className="flex-[1.5] items-center">
                                    <View className={`${statusColor.bg} px-3 py-1 rounded-full border border-current/10`}>
                                        <Text className={`${statusColor.text} text-xs font-bold`}>{order.paymentStatus}</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            </View>

            {/* MOBILE HIGH-DENSITY CARD VIEW */}
            <View className="flex md:hidden flex-1">
                <ScrollView showsVerticalScrollIndicator={false}>
                    {filteredOrders.map((order) => {
                        const statusColor = getStatusStyles(order.paymentStatus);
                        return (
                            <TouchableOpacity
                                key={order.id} activeOpacity={0.8}
                                style={{ backgroundColor: isCurrentlyDarkMode ? "#1e293b" : "#ffffff", borderColor: subtleBorderColor }}
                                className="w-full p-4 rounded-2xl border shadow-sm flex-col mb-3 items-start"
                            >
                                <View className="flex-row justify-between items-center w-full mb-3">
                                    <Text style={{ color: theme.primary }} className="font-black text-base">{order.id}</Text>
                                    <View className={`${statusColor.bg} px-3 py-1 rounded-full`}><Text className={`${statusColor.text} text-xs font-bold`}>{order.paymentStatus}</Text></View>
                                </View>
                                <Text style={{ color: masterTextColor }} className="font-bold text-base tracking-tight">{order.clientName}</Text>
                                <Text className="text-slate-400 text-xs font-medium mt-0.5">{order.company}</Text>
                                <View className="flex-row justify-between items-center w-full mt-4 pt-3 border-t border-slate-100/10">
                                    <Text className="text-slate-400 text-xs font-medium">Volume: <Text style={{ color: masterTextColor }} className="font-bold">{order.itemsCount} items</Text></Text>
                                    <Text style={{ color: masterTextColor }} className="font-black text-base">{order.totalAmount}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
}
