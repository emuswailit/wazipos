// components/retailers/retailerPrescriptions/WholesaleSourcesPanel.tsx
//
// Pharmacy-side alert in the digitizing workspace: for every medicine the
// pharmacy can't fully supply from its own unexpired stock, the pharmaceutical
// wholesalers that have it in stock and the unit price each offers (cheapest
// first). One pharmacy handles a prescription end to end, so it sources what it
// lacks instead of the prescription going to other pharmacies.
// Backend action: GetPrescriptionWholesaleSources.

import { pharmacyRxClient } from '@/api/retailerPrescriptionsApi';
import { useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { kes } from './prescriptionsConfig';

interface WholesaleOffer {
    wholesaler: string;
    wholesaler_title: string;
    unit_price: string;
    available_quantity: number;
    product_title: string;
    unit?: string | null;
    expiry_date?: string | null;
}

interface ItemSources {
    prescription_item: string;
    item_title: string;
    required_unit_quantity: number;
    in_stock_quantity: number;
    sources: WholesaleOffer[];
}

interface Props {
    prescriptionId: string;
    /** Changes whenever the medicines or the pharmacy's quotation change, to re-check. */
    refreshKey: string;
}

const AMBER = { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)' };

export function WholesaleSourcesPanel({ prescriptionId, refreshKey }: Props) {
    const { theme, divider } = useListTokens();
    const router = useRouter();
    const [items, setItems] = useState<ItemSources[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        pharmacyRxClient
            .post({ action: 'GetPrescriptionWholesaleSources', prescription_id: prescriptionId })
            .then((res) => {
                if (cancelled) return;
                setItems(res.ok && res.data?.response_code === 0 && Array.isArray(res.data.items) ? res.data.items : []);
            })
            .catch(() => !cancelled && setItems([]))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [prescriptionId, refreshKey]);

    if (!items.length) {
        return loading ? <ActivityIndicator size="small" color={AMBER.fg} style={{ alignSelf: 'flex-start' }} /> : null;
    }

    return (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: AMBER.border, backgroundColor: AMBER.bg, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="alert-circle" size={18} color={AMBER.fg} />
                <Text style={{ flex: 1, color: AMBER.fg, fontFamily: theme.font.bold, fontSize: 14 }}>
                    {items.length} medicine{items.length === 1 ? '' : 's'} to source
                </Text>
                {loading ? <ActivityIndicator size="small" color={AMBER.fg} /> : null}
            </View>

            {items.map((it) => (
                <View key={it.prescription_item} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: divider }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={2}>
                        {it.item_title}
                    </Text>
                    <Text style={{ color: theme.textMuted ?? theme.text, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {it.required_unit_quantity ? `Prescribed ${it.required_unit_quantity}` : 'No quantity set'} · you have {it.in_stock_quantity}
                    </Text>
                    {it.sources.length ? (
                        it.sources.map((o) => (
                            <View key={o.wholesaler} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="business-outline" size={14} color={theme.text} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }} numberOfLines={1}>
                                        {o.wholesaler_title}
                                    </Text>
                                    <Text style={{ color: theme.textMuted ?? theme.text, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                                        {o.product_title} · {o.available_quantity.toLocaleString()} in stock
                                        {o.expiry_date ? ` · exp ${o.expiry_date}` : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                                    {kes(o.unit_price)}
                                    <Text style={{ fontFamily: theme.font.medium, fontSize: 11 }}>/{o.unit || 'unit'}</Text>
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ color: AMBER.fg, fontFamily: theme.font.medium, fontSize: 12 }}>
                            No pharmaceutical wholesaler has it in stock right now.
                        </Text>
                    )}
                </View>
            ))}

            <Pressable
                onPress={() => router.push('/wholesaleMarketplace?tab=wholesaleMarketplace' as any)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: AMBER.fg, ...webPointer }}
            >
                <Ionicons name="cart-outline" size={16} color={AMBER.fg} />
                <Text style={{ color: AMBER.fg, fontFamily: theme.font.bold, fontSize: 13 }}>Open wholesale marketplace</Text>
            </Pressable>
        </View>
    );
}

