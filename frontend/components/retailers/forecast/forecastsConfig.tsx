// components/retailers/forecast/forecastsConfig.tsx
//
// How a demand forecast row (one product, its predicted demand and the best
// wholesaler offers) is shown in lists and details.

import { AdminBadgePill, CellText, textOr, useListTokens, webNoOutline, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import type { RetailerForecastNormalized } from '@/databases/types';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

export type ForecastFilter = 'ALL' | 'OFFERS' | 'NO_OFFERS' | 'IN_BASKET';

const bestOfferOf = (f: RetailerForecastNormalized) => f.wholesaler_offers?.[0] ?? null;

export const units = (n: number | null | undefined) => `${Math.round(Number(n) || 0).toLocaleString()}`;

export function formatKES(raw: string | number | null | undefined): string {
    const n = Number(raw ?? 0);
    return `KES ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function forecastBadges(f: RetailerForecastNormalized, inBasket: boolean): AdminBadge[] {
    const best = bestOfferOf(f);
    const out: AdminBadge[] = [];
    if (inBasket) out.push({ label: 'In basket', tone: 'warning', icon: 'basket-outline' });
    if (!f.has_offers && !f.has_campaigns) out.push({ label: 'No offers', tone: 'neutral' });
    if (best?.price_discount_percent && best.price_discount_percent > 0) out.push({ label: `${best.price_discount_percent.toFixed(0)}% off`, tone: 'success' });
    if (best?.in_placement) out.push({ label: 'Consignment', tone: 'violet' });
    if (f.has_campaigns) out.push({ label: `${f.wholesaler_campaigns.length} campaign${f.wholesaler_campaigns.length === 1 ? '' : 's'}`, tone: 'info', icon: 'megaphone-outline' });
    return out;
}

/** Builds the list config; `inBasket` marks rows already in the request basket. */
export function makeForecastsConfig(inBasket: (f: RetailerForecastNormalized) => boolean): AdminListConfig<RetailerForecastNormalized> {
    return {
        title: 'Forecasts',
        noun: ['product', 'products'],
        icon: 'trending-up-outline',
        searchPlaceholder: 'Search product or wholesaler…',
        emptyTitle: 'No forecasts yet',
        emptyMessage: 'Forecasts appear once there is enough sales history to predict demand.',
        keyOf: (f, i) => `${f.remote_id || 'forecast'}-${i}`,
        titleOf: (f) => textOr(f.product_title, 'Unknown product'),
        subtitleOf: (f) => {
            const best = bestOfferOf(f);
            return best ? `Best: ${textOr(best.wholesaler_title, 'Wholesaler')} · ${formatKES(best.effective_unit_price)}` : 'No wholesaler offers';
        },
        avatarOf: (f) => ({ icon: 'trending-up-outline', color: f.has_offers ? '#10b981' : f.has_campaigns ? '#f59e0b' : '#64748b' }),
        badgesOf: (f) => forecastBadges(f, inBasket(f)),
        metricOf: (f) => ({ value: units(f.required_quantity), label: 'to order' }),
        metaOf: (f) => `${units(f.total_forecast)} forecast · ${f.avg_daily_forecast.toFixed(1)}/day`,
        metaIcon: 'stats-chart-outline',
        primaryColumn: { label: 'Product', flex: 2.4 },
        columns: [
            {
                key: 'forecast',
                label: 'Forecast',
                flex: 0.9,
                align: 'right',
                render: (f) => (
                    <CellText strong align="right">
                        {units(f.total_forecast)}
                    </CellText>
                ),
            },
            { key: 'range', label: 'P10–P90', flex: 1, align: 'right', render: (f) => <CellText align="right">{`${units(f.total_p10)}–${units(f.total_p90)}`}</CellText> },
            { key: 'best', label: 'Best offer', flex: 1.8, render: (f) => <BestOfferCell f={f} /> },
            {
                key: 'expiry',
                label: 'Expiry',
                flex: 0.7,
                align: 'right',
                render: (f) => {
                    const d = bestOfferOf(f)?.days_to_expiry;
                    return <CellText align="right">{d != null ? `${d}d` : '—'}</CellText>;
                },
            },
            {
                key: 'qty',
                label: 'To order',
                flex: 0.8,
                align: 'right',
                render: (f) => (
                    <CellText strong align="right">
                        {units(f.required_quantity)}
                    </CellText>
                ),
            },
        ],
    };
}

function BestOfferCell({ f }: { f: RetailerForecastNormalized }) {
    const { theme } = useListTokens();
    const best = bestOfferOf(f);
    if (!best) return <CellText>{f.has_campaigns ? 'Campaigns only' : '—'}</CellText>;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                {textOr(best.wholesaler_title, 'Wholesaler')}
            </Text>
            {best.price_discount_percent > 0 ? <AdminBadgePill badge={{ label: `${best.price_discount_percent.toFixed(0)}%`, tone: 'success' }} /> : null}
        </View>
    );
}

/** "Min units / day" numeric filter for the list toolbar / phone filters sheet. */
export function MinDailyFilter({ value, onChange, variant }: { value: number; onChange: (v: number) => void; variant: 'web' | 'mobile' }) {
    const { theme, chipBg } = useListTokens();
    const [text, setText] = useState(value > 0 ? String(value) : '');
    useEffect(() => {
        setText((t) => (Number(t || 0) === value ? t : value > 0 ? String(value) : ''));
    }, [value]);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 14, backgroundColor: chipBg, width: variant === 'mobile' ? '100%' : 180 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Min / day</Text>
            <TextInput
                value={text}
                onChangeText={(t) => {
                    const clean = t.replace(/[^0-9.]/g, '');
                    setText(clean);
                    const n = Number(clean);
                    onChange(Number.isFinite(n) && n > 0 ? n : 0);
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="Any"
                placeholderTextColor={theme.textDark}
                accessibilityLabel="Minimum forecast units per day"
                style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 13, textAlign: 'right', ...webNoOutline }}
            />
        </View>
    );
}
