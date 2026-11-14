// components/retailers/wholesaleDiscovery/WholesalerCard.tsx
//
// One wholesaler in the discovery list. Tapping opens that wholesaler's
// marketplace. When searching by product, the matching items and their
// prices are listed on the card.

import type { DiscoveredWholesaler } from '@/api/wholesaleDiscoveryApi';
import { useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

const PHARMA = { label: 'Pharmaceutical', color: '#0ea5e9' };
const GENERAL = { label: 'General', color: '#8b5cf6' };

const kes = (v: unknown) => `KES ${(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function formatDistance(km: number | null | undefined): string | null {
    if (km == null) return null;
    if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function initials(title: string) {
    const words = title.trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'W';
}

export function WholesalerCard({ item, onOpen, highlightProducts }: { item: DiscoveredWholesaler; onOpen: () => void; highlightProducts?: boolean }) {
    const { theme, cardBorder, cardShadow, chipBg } = useListTokens();
    const type = item.entity_type === 'PharmaceuticalWholesaler' ? PHARMA : GENERAL;
    const distance = formatDistance(item.distance_km);
    const place = [item.town, item.sub_county?.title, item.county?.title].filter(Boolean).join(' · ');
    const extraMatches = item.product_match_count - item.product_matches.length;

    return (
        <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}'s marketplace`}
            className="rounded-2xl border p-3.5"
            style={({ pressed }) => ({
                backgroundColor: theme.panel,
                borderColor: cardBorder,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
                ...cardShadow,
                ...webPointer,
            })}
        >
            <View className="flex-row items-center gap-3">
                {item.image ? (
                    <Image source={{ uri: item.image }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: chipBg }} />
                ) : (
                    <View className="items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: `${type.color}18` }}>
                        <Text style={{ color: type.color, fontFamily: theme.font.bold, fontSize: 17 }}>{initials(item.title)}</Text>
                    </View>
                )}

                <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                        <Text className="flex-shrink" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>
                            {item.title}
                        </Text>
                        {item.is_verified ? <Ionicons name="checkmark-circle" size={15} color="#10b981" accessibilityLabel="Verified" /> : null}
                    </View>
                    <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                        {place || 'Location not set'}
                    </Text>
                    <View className="flex-row items-center flex-wrap gap-1.5 mt-1.5">
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${type.color}14` }}>
                            <Text style={{ color: type.color, fontFamily: theme.font.bold, fontSize: 10.5 }}>{type.label}</Text>
                        </View>
                        {distance ? (
                            <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: chipBg }}>
                                <Ionicons name="navigate" size={10} color={theme.textDark} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 10.5 }}>{distance}</Text>
                            </View>
                        ) : null}
                        <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: chipBg }}>
                            <Ionicons name="cube-outline" size={10} color={theme.textDark} />
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 10.5 }}>
                                {item.products_in_stock.toLocaleString()} in stock
                            </Text>
                        </View>
                    </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.textDark} />
            </View>

            {highlightProducts && item.product_matches.length ? (
                <View className="mt-3 pt-3 gap-1.5" style={{ borderTopWidth: 1, borderTopColor: cardBorder }}>
                    {item.product_matches.map((m) => (
                        <View key={m.product} className="flex-row items-center gap-2">
                            <Ionicons name="pricetag-outline" size={12} color={theme.primary} />
                            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                                {m.title}
                            </Text>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>
                                {kes(m.unit_price)}
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>/{m.unit || 'unit'}</Text>
                            </Text>
                        </View>
                    ))}
                    {extraMatches > 0 ? (
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>
                            +{extraMatches} more matching product{extraMatches === 1 ? '' : 's'}
                        </Text>
                    ) : null}
                </View>
            ) : null}
        </Pressable>
    );
}

export default WholesalerCard;
