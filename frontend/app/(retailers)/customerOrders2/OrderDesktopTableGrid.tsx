import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import RecordCustomerPaymentModal from '../customerOrders1/RecordCustomerPaymentModal';

interface OrderDesktopTableGridProps { paginatedOrders: any[]; theme: any; onSelect: (order: any) => void; }
export const OrderDesktopTableGrid: React.FC<OrderDesktopTableGridProps> = ({ paginatedOrders, theme, onSelect }) => {
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [activeOrder, setActiveOrder] = useState<any | null>(null);
    return (
        <View className="hidden md:flex flex-col w-full border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-950 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[2.5] uppercase tracking-wider">Order Reference</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex- uppercase tracking-wider">Buyer Name</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[1.2] uppercase tracking-wider text-center">Density</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[1.5] uppercase tracking-wider text-center">Billing Strategy</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[1.5] uppercase tracking-wider text-right pr-4">Net Payable</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[1.5] uppercase tracking-wider text-center">Settlement Status</Text>
                <Text style={{ fontFamily: theme.font.bold, color: theme.textDark, fontSize: 13 }} className="flex-[1.2] uppercase tracking-wider text-right">Actions</Text>
            </View>
            {paginatedOrders.map((order, idx) => {
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
                const needsSettlementAction = !hasBeenPaid || order.status === 'PENDING' || order.status === 'OPEN';
                return (
                    <View key={order.draft_id || order.draftId || idx} className="flex-row items-center px-6 h-14 border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50/50">
                        <View className="flex-[2.5] pr-2 flex-col justify-center">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 14, color: theme.text }} numberOfLines={1}>{order.order_number || order.draftId || "AWAITING SYNC"}</Text>
                            <Text style={{ fontFamily: theme.font.regular, fontSize: 10, color: '#94a3b8' }} className="mt-0.5 truncate" numberOfLines={1}>{formattedDateTimeString()}</Text>
                        </View>
                        <Text style={{ fontFamily: theme.font.medium, fontSize: 14, color: theme.text }} className="flex- pr-2" numberOfLines={1}>{order.customerName || order.customer_name || "Walk-in Retail Client"}</Text>
                        <Text style={{ fontFamily: theme.font.mono, fontSize: 14, color: theme.textDark }} className="flex-[1.2] text-center font-mono">{totalItemsCount} Pcs</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 11, color: theme.textDark }} className="flex-[1.5] text-center font-bold uppercase tracking-wider opacity-80">{inferredPaymentMethodTitle()}</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 14, color: '#059669' }} className="flex-[1.5] text-right pr-4 font-bold">KES {orderDisplayPrice.toFixed(2)}</Text>
                        <View className="flex-[1.5] flex-row justify-center space-x-1.5">
                            <View className={`px-2 py-0.5 rounded-md ${isSynced ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}><Text style={{ color: isSynced ? '#10b981' : '#f43f5e', fontFamily: theme.font.bold, fontSize: 10 }} className="uppercase tracking-wider font-bold">{isSynced ? 'Synced' : 'Outbox'}</Text></View>
                            <View className={`px-2 py-0.5 rounded-md ${hasBeenPaid ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}><Text style={{ color: hasBeenPaid ? '#3b82f6' : '#f59e0b', fontFamily: theme.font.bold, fontSize: 10 }} className="uppercase tracking-wider font-bold">{hasBeenPaid ? 'Paid' : 'Unpaid'}</Text></View>
                        </View>
                        <View className="flex-[1.2] flex-row justify-end items-center gap-x-2">
                            {needsSettlementAction && (
                                <TouchableOpacity onPress={() => { setActiveOrder(order); setPayModalOpen(true); }} style={{ backgroundColor: `${theme.primary}15` }} className="px-2 py-1 rounded-lg border border-transparent active:opacity-60">
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 10, color: theme.primary }} className="font-bold uppercase tracking-wide">💳 Pay</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => onSelect(order)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 active:opacity-70"><Text style={{ fontFamily: theme.font.bold, fontSize: 13, color: theme.text }} className="font-bold">View</Text></TouchableOpacity>
                        </View>
                    </View>
                );
            })}
            {payModalOpen && activeOrder && (
                <RecordCustomerPaymentModal isOpen={payModalOpen} orderId={activeOrder.draftId || activeOrder.draft_id} orderRef={activeOrder.order_number || activeOrder.draftId || activeOrder.draft_id} onClose={() => { setPayModalOpen(false); setActiveOrder(null); }} />
            )}
        </View>
    );
};
