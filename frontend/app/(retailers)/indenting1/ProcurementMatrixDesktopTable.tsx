import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
export default function ProcurementMatrixDesktopTable({ items, selectedOffers, onToggleOfferSelection, theme }: any) {
    return (
        <View className="hidden md:flex border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm mb-4">
            <View className="flex-row items-center py-3 px-5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[30%] uppercase tracking-wider text-slate-400">Product Title & EAN</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[12%] uppercase tracking-wider text-slate-400 text-center">On Hand</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[12%] uppercase tracking-wider text-slate-400 text-center">Velocity</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[12%] uppercase tracking-wider text-slate-400 text-center">Forecast</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[30%] uppercase tracking-wider text-slate-400 pl-4 border-l border-slate-100 dark:border-slate-800">Supplier Offer Line</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="w-[4%] uppercase tracking-wider text-slate-400 text-center">Check</Text>
            </View>
            {items.map((item: any, idx: number) => {
                const offer = item?.wholesaler_procurement_offers;
                const isChecked = selectedOffers[item?.product_id] === offer?.wholesaler_receipt_id;
                const isSelectable = Number(item?.predicted_purchase_units || 0) > 0;
                return (
                    <View key={item?.product_id || String(idx)} className={`flex-row items-center py-2.5 px-5 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 ${!isSelectable ? 'opacity-40' : ''}`}>
                        <View className="w-[30%] pr-2">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} numberOfLines={1}>{item?.title || "UNSPECIFIED"}</Text>
                            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">EAN: {item?.bar_code || 'N/A'}</Text>
                        </View>
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textDark }} className="w-[12%] text-center">{item?.metrics_in_units?.total_physical_stock || 0} U</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="w-[12%] text-center text-indigo-600 dark:text-indigo-400">{(item?.metrics_in_units?.average_daily_sales || 0).toFixed(1)}/d</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className={`w-[12%] text-center ${isSelectable ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>{isSelectable ? `+${item.predicted_purchase_units} U` : '0 U'}</Text>
                        <View className="w-[30%] pl-4 flex-row justify-between items-center border-l border-slate-100 dark:border-slate-800">
                            {offer ? (
                                <>
                                    <View className="flex-1 pr-2">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Supplier</Text>
                                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.text }} className="mt-0.5" numberOfLines={1}>{offer.supplier_name}</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400 uppercase">Cost</Text>
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-emerald-600 dark:text-emerald-400 mt-0.5">KES {Number(offer.unit_pricing?.final_unit_selling_price || 0).toFixed(2)}</Text>
                                    </View>
                                </>
                            ) : <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm }} className="text-slate-400 italic">No contracts matched.</Text>}
                        </View>
                        <View className="w-[4%] items-center justify-center">
                            {offer && isSelectable && (
                                <TouchableOpacity onPress={() => onToggleOfferSelection(item, offer.wholesaler_receipt_id)} style={{ backgroundColor: isChecked ? theme.primary : 'transparent', borderColor: isChecked ? theme.primary : '#cbd5e1' }} className="w-4 h-4 rounded-md border flex items-center justify-center active:scale-90">{isChecked && <Text className="text-white text-[8px] font-black">✓</Text>}</TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}
