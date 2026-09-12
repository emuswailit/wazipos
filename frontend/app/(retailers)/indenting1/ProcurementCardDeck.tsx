import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
export default function ProcurementCardDeck({ items, selectedOffers, onToggleOfferSelection, theme }: any) {
    return (
        <View className="flex md:hidden flex-col gap-y-3">
            {items.map((item: any, idx: number) => {
                const offer = item?.wholesaler_procurement_offers;
                const isChecked = selectedOffers[item?.product_id] === offer?.wholesaler_receipt_id;
                const isSelectable = Number(item?.predicted_purchase_units || 0) > 0;
                return (
                    <View key={item?.product_id || String(idx)} style={{ backgroundColor: theme.panel }} className={`p-4 border rounded-2xl shadow-sm flex-col border-slate-100 dark:border-slate-800/80 ${!isSelectable ? 'opacity-50' : ''}`}>
                        <View className="flex-row justify-between items-start">
                            <View className="flex-1 pr-2">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{item?.title || "UNSPECIFIED"}</Text>
                                <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">EAN: {item?.bar_code || 'N/A'}</Text>
                            </View>
                            {offer && isSelectable && (
                                <TouchableOpacity onPress={() => onToggleOfferSelection(item, offer.wholesaler_receipt_id)} style={{ backgroundColor: isChecked ? theme.primary : 'transparent', borderColor: isChecked ? theme.primary : '#cbd5e1' }} className="w-5 h-5 rounded-md border flex items-center justify-center active:scale-90">{isChecked && <Text className="text-white text-[10px] font-black">✓</Text>}</TouchableOpacity>
                            )}
                        </View>
                        <View className="flex-row gap-2 mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/40 dark:border-slate-800/60 justify-between">
                            <View className="items-center flex-1"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">On Hand</Text><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5">{item?.metrics_in_units?.total_physical_stock || 0} U</Text></View>
                            <View className="items-center flex-1 border-x border-slate-200/60 dark:border-slate-800/60"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Velocity</Text><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-indigo-600 mt-0.5">{(item?.metrics_in_units?.average_daily_sales || 0).toFixed(1)}/d</Text></View>
                            <View className="items-center flex-1"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Forecast</Text><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-blue-600 mt-0.5">+{item?.predicted_purchase_units || 0} U</Text></View>
                        </View>
                        {offer ? (
                            <View className="mt-3 pt-2.5 border-t flex-row justify-between items-center border-slate-100 dark:border-slate-800/60">
                                <View className="flex-1 pr-2">
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Supplier contract</Text>
                                    <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5" numberOfLines={1}>{offer.supplier_name}</Text>
                                </View>
                                <View className="items-end">
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Unit Cost</Text>
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-emerald-600 mt-0.5">KES {Number(offer.unit_pricing?.final_unit_selling_price || 0).toFixed(2)}</Text>
                                </View>
                            </View>
                        ) : (
                            <View className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/60"><Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }} className="text-slate-400 italic">No wholesale contracts matched parameters.</Text></View>
                        )}
                    </View>
                );
            })}
        </View>
    );
}
