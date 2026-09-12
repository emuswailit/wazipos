import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Theme } from './types';

interface CardProps { item: any; theme: Theme; selectedOffers: Record<string, string>; onToggleOfferSelection: (item: any, id: string) => void; }

function ProcurementItemCardComponent({ item, theme, selectedOffers, onToggleOfferSelection }: CardProps) {
    const offer = item?.wholesaler_procurement_offers;
    const isChecked = selectedOffers[item?.product_id] === offer?.wholesaler_receipt_id;
    const isSelectable = Number(item?.predicted_purchase_units || 0) > 0;
    const pillarStyle = "items-center flex-1 border-r border-slate-200/60 dark:border-slate-800/60";

    return (
        <View style={{ backgroundColor: theme.panel }} className={`p-4 border border-slate-100 dark:border-slate-800 rounded-2xl mb-4 flex-col shadow-sm ${!isSelectable ? 'opacity-40' : ''}`}>
            <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-3">
                    <Text className="font-bold text-sm text-slate-900 dark:text-slate-50" numberOfLines={2}>{item?.title || "UNSPECIFIED"}</Text>
                    <Text className="text-[10px] font-mono text-slate-400 mt-1 uppercase">EAN: {item?.bar_code || 'N/A'}</Text>
                </View>
                {offer && isSelectable && (
                    <TouchableOpacity onPress={() => onToggleOfferSelection(item, offer.wholesaler_receipt_id)} style={{ backgroundColor: isChecked ? theme.primary : 'transparent', borderColor: isChecked ? theme.primary : '#cbd5e1' }} className="w-6 h-6 rounded-lg border-2 flex items-center justify-center active:scale-90">{isChecked && <Text className="text-white text-xs font-black">✓</Text>}</TouchableOpacity>
                )}
            </View>
            <View className="mt-4 flex-row items-center justify-between bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100/50">
                <View className={pillarStyle}><Text className="text-[9px] font-bold text-slate-400 uppercase">On Hand</Text><Text className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">{item?.metrics_in_units?.total_physical_stock || 0} U</Text></View>
                <View className={pillarStyle}><Text className="text-[9px] font-bold text-slate-400 uppercase">Velocity</Text><Text className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{(item?.metrics_in_units?.average_daily_sales || 0).toFixed(1)}/d</Text></View>
                <View className="items-center flex-1"><Text className="text-[9px] font-bold text-slate-400 uppercase">Forecast</Text><Text className={`text-xs font-black mt-0.5 ${isSelectable ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>{isSelectable ? `+${item.predicted_purchase_units}` : '0'} U</Text></View>
            </View>
            {offer ? (
                <View className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex-row justify-between items-center">
                    <View className="flex-1 pr-2"><Text className="text-[10px] font-bold text-slate-400 uppercase">Supplier</Text><Text className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5" numberOfLines={1}>{offer.supplier_name}</Text></View>
                    <View className="items-end"><Text className="text-[10px] font-bold text-slate-400 uppercase">Cost</Text><Text className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">KES {Number(offer.unit_pricing?.final_unit_selling_price || 0).toFixed(2)}</Text></View>
                </View>
            ) : <View className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800"><Text className="text-xs italic text-slate-400 text-center">No listings matched.</Text></View>}
        </View>
    );
}

const ProcurementItemCard = React.memo(ProcurementItemCardComponent);
export default ProcurementItemCard;
