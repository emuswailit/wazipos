import { useAuth } from "@/context/AuthContext";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { StatusBar, Text, TextInput, View, useWindowDimensions } from "react-native";
import WholesaleOrderDetails from "./WholesaleOrderDetails";
import WholesaleOrdersList, { WholesaleOrder } from "./WholesaleOrdersList";
export default function WholesaleOrdersScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedOrder, setSelectedOrder] = useState<WholesaleOrder | null>(null);
    const mockOrders: WholesaleOrder[] = useMemo(() => [
        {
            id: "ORD-9081",
            invoiceNumber: "INV-2026-0041",
            buyerName: "MEGA PHARMACY DISTRIBUTORS LTD",
            orderDate: "2026-04-18 11:20:00",
            totalAmount: 184500,
            paymentStatus: "PAID",
            fulfillmentStatus: "DELIVERED",
            items: [
                { id: "1", sku: "WHL-AMPIX-500", title: "AMPIMOX 500MG CAPSULES", qty: 20, unitPrice: 4200, subtotal: 84000 },
                { id: "2", sku: "WHL-CCOOK-3L", title: "CAPTAIN COOK COOKING OIL 3 LITRES", qty: 20, unitPrice: 2450, subtotal: 49000 },
                { id: "3", sku: "WHL-PANAD-EXT", title: "PANADOL EXTRA ADVANCE TABLETS", qty: 28, unitPrice: 1850, subtotal: 51500 }
            ]
        },
        {
            id: "ORD-9082",
            invoiceNumber: "INV-2026-0042",
            buyerName: "ALBA ENTERPRISES WHOLESALE CORP",
            orderDate: "2026-04-19 09:14:00",
            totalAmount: 42000,
            paymentStatus: "PENDING",
            fulfillmentStatus: "PROCESSING",
            items: [
                { id: "1", sku: "WHL-AMPIX-500", title: "AMPIMOX 500MG CAPSULES", qty: 10, unitPrice: 4200, subtotal: 42000 }
            ]
        },
        {
            id: "ORD-9083",
            invoiceNumber: "INV-2026-0043",
            buyerName: "COASTAL RETAIL PHARMACIES HUB",
            orderDate: "2026-04-19 14:02:00",
            totalAmount: 14700,
            paymentStatus: "OVERDUE",
            fulfillmentStatus: "HOLD",
            items: [
                { id: "1", sku: "WHL-PANAD-EXT", title: "PANADOL EXTRA ADVANCE TABLETS", qty: 8, unitPrice: 1850, subtotal: 14700 }
            ]
        }
    ], []);
    const filteredOrders = useMemo(() => {
        return mockOrders.filter(item =>
            item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.buyerName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [mockOrders, searchQuery]);
    const formatHumanDate = (dateString: string) => {
        if (!dateString) return "N/A";
        try {
            const dateObj = new Date(dateString.replace(" ", "T"));
            return dateObj.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
        } catch { return dateString; }
    };
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";
    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6">
                {/* 🌟 FIXED: Triggers the clean setSelectedOrder state update block smoothly below */}
                {selectedOrder ? (
                    <WholesaleOrderDetails routeItem={selectedOrder} onClose={() => setSelectedOrder(null)} theme={theme} formatDateHandler={formatHumanDate} />
                ) : (
                    <View className="flex-1">
                        <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                            <View className="flex-1 pr-4">
                                <View className="flex-row items-center gap-x-2">
                                    <Text style={{ color: isDarkMode ? "#ffffff" : theme.primary }} className="text-2xl font-black tracking-tight">Wholesale Orders</Text>
                                    <View style={{ backgroundColor: theme.primary + "15" }} className="px-2 py-0.5 rounded-lg border border-slate-700/5">
                                        <Text style={{ color: theme.primary }} className="text-xs font-black">{filteredOrders.length} {filteredOrders.length === 1 ? "Order" : "Orders"}</Text>
                                    </View>
                                </View>
                                <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Audit volume commercial client invoices, dispatch stages, and settlement balances.</Text>
                            </View>
                            <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                                <TextInput className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none" style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }} placeholder="Search by ID, invoice, client..." placeholderTextColor="#94A3B8" value={searchQuery} onChangeText={setSearchQuery} />
                            </View>
                        </View>
                        {filteredOrders.length === 0 ? (
                            <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                                <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No matching bulk distribution entries loaded.</Text>
                            </View>
                        ) : (
                            <View className="flex-1">
                                <WholesaleOrdersList items={filteredOrders} isLargeScreen={width >= 768} theme={theme} cardBorderClass={cardBorderColor} formatDateHandler={formatHumanDate} onOpenDetailsTrigger={(item) => setSelectedOrder(item)} />
                            </View>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}
