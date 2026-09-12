import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
interface OrderMobileCardListProps { filteredOrders: any[]; theme: any; isDarkMode: boolean; onSelect: (order: any) => void; }
export const OrderMobileCardList: React.FC<OrderMobileCardListProps> = ({ filteredOrders, theme, isDarkMode, onSelect }) => (
    <View className="flex md:hidden flex-col space-y-4 w-full">
        {filteredOrders.map((order, idx) => {
            const itemsList = Array.isArray(order.customerOrderItems) ? order.customerOrderItems : (Array.isArray(order.order_items) ? order.order_items : []);
            const totalItemsCount = itemsList.reduce((acc: number, item: any) => acc + (Number(item.purchased_quantity) || 0), 0);
            const totalAmount = itemsList.reduce((acc: number, item: any) => acc + (Number(item.purchased_quantity || 0) * Number(item.unit_selling_price || item.item_final_price || item.price || 0)) - Number(item.item_discount || 0), 0);
            const orderDisplayPrice = totalAmount + (Number(order.shippingCost || order.shipping_amount) || 0);
            const isSynced = order.synced === "TRUE" || order.synced === true || order.synced === 1;
            const hasBeenPaid = String(order.is_paid).trim().toLowerCase() === 'true';
            const inferredPaymentMethodTitle = () => {
                if (order.paymentAccountNumber?.trim().length > 0 || String(order.selectedPaymentMethodId || order.payment_method).toLowerCase().includes('money')) return "MOBILE MONEY";
                if (!hasBeenPaid) return "CREDIT LEDGER";
                return "CASH PAYMENT";
            };
            const formattedDateTimeString = () => {
                const ts = order.updatedAt || order.updated || order.created;
                if (!ts) return 'Pending';
                try { const dateObj = new Date(ts); return `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; } catch { return 'Pending'; }
            };
            return (
                <View key={order.draft_id || order.draftId || idx} style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }} className="p-4 border rounded-2xl shadow-sm flex-col">
                    <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2 flex-col">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{order.order_number || order.draftId || "AWAITING SYNC"}</Text>
                            <Text style={{ fontFamily: theme.font.regular, fontSize: 10, color: '#94a3b8' }} className="mt-0.5">{formattedDateTimeString()}</Text>
                        </View>
                        <View className="flex-row space-x-1.5">
                            <View className={`px-2 py-0.5 rounded-full border ${isSynced ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: isSynced ? '#10b981' : '#f43f5e' }} className="font-bold uppercase tracking-wider">{isSynced ? "Synced" : "Local Cache"}</Text>
                            </View>
                            <View className={`px-2 py-0.5 rounded-full border ${hasBeenPaid ? 'bg-blue-500/10 border-blue-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: hasBeenPaid ? '#3b82f6' : '#f59e0b' }} className="font-bold uppercase tracking-wider">{hasBeenPaid ? "Paid" : "Unpaid"}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={{ backgroundColor: theme.background, borderColor: isDarkMode ? '#334155' : '#f1f5f9' }} className="mt-2.5 p-2 rounded-xl border flex-row justify-between items-center">
                        <View className="flex-col flex-1 pr-2">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Customer Account</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5" numberOfLines={1}>{order.customerName || order.customer_name || "Walk-in Retail Client"}</Text>
                        </View>
                        <View className="flex-col items-end">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Channel</Text>
                            <Text style={{ fontFamily: theme.font.mono, fontSize: 10, color: theme.textDark }} className="mt-0.5 font-bold uppercase tracking-wide">{inferredPaymentMethodTitle()}</Text>
                        </View>
                    </View>
                    <View className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex-row justify-between items-center">
                        <View className="flex-col">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Scope Summary</Text>
                            <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textDark }} className="mt-0.5">{totalItemsCount} total items</Text>
                        </View>
                        <View className="items-end flex-col">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Value Total</Text>
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: isDarkMode ? '#10b981' : '#059669' }} className="mt-0.5 font-bold">KES {orderDisplayPrice.toFixed(2)}</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => onSelect(order)} style={{ backgroundColor: theme.primary }} className="w-full h-9 rounded-xl items-center justify-center mt-3 active:opacity-90">
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: '#ffffff' }} className="font-bold uppercase tracking-wider">Inspect Invoice details</Text>
                    </TouchableOpacity>
                </View>
            );
        })}
    </View>
);
