// components/retailers/forecast/ForecastDetailsModal.tsx
//
// Forecast details on the shared details sheet: demand summary and profile,
// daily forecast (bars with the P10–P90 band), offers and campaigns.

import { AdminBadgePill, AdminDetailsSheet, SheetButton, formatDate, textOr, useListTokens, useSheetIsWide, webPointer, type AdminBadge } from '@/components/common/listScreen';
import type { RetailerForecastDailyRow, RetailerForecastNormalized } from '@/databases/types';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatKES, units } from './forecastsConfig';

interface Props {
    forecast: RetailerForecastNormalized | null;
    onClose: () => void;
    /** Opens the offers picker (shown when the product has offers or campaigns). */
    onViewOffers?: (f: RetailerForecastNormalized) => void;
    /** Opens the supply request picker (shown when there are no offers). */
    onRequestSupply?: (f: RetailerForecastNormalized) => void;
}

const GOOD_PATTERNS = ['stable', 'seasonal', 'trending_up'];
const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function ForecastDetailsModal({ forecast, onClose, onViewOffers, onRequestSupply }: Props) {
    const wide = useSheetIsWide();

    if (!forecast) {
        return <AdminDetailsSheet visible={false} onClose={onClose} heading="" icon="trending-up-outline" title="" sections={[]} />;
    }

    const f = forecast;
    const hasSupply = f.has_offers || f.has_campaigns;
    const badges: AdminBadge[] = [];
    if (f.demand_pattern) badges.push({ label: humanize(f.demand_pattern), tone: GOOD_PATTERNS.includes(f.demand_pattern) ? 'success' : 'warning' });
    if (f.trend_direction) {
        const pct = f.trend_pct != null ? ` ${(f.trend_pct * 100).toFixed(0)}%` : '';
        const up = /up/i.test(f.trend_direction);
        badges.push({ label: `${humanize(f.trend_direction)}${pct}`, tone: up ? 'success' : /down/i.test(f.trend_direction) ? 'danger' : 'neutral', icon: up ? 'trending-up' : /down/i.test(f.trend_direction) ? 'trending-down' : 'remove' });
    }

    const action = hasSupply
        ? onViewOffers
            ? <SheetButton label="View offers" icon="pricetags-outline" onPress={() => (onClose(), onViewOffers(f))} grow={!wide} />
            : null
        : onRequestSupply
            ? <SheetButton label="Request supply" icon="paper-plane-outline" onPress={() => (onClose(), onRequestSupply(f))} grow={!wide} />
            : null;

    return (
        <AdminDetailsSheet
            visible={!!forecast}
            onClose={onClose}
            heading="Demand forecast"
            icon="trending-up-outline"
            title={textOr(f.product_title, 'Unknown product')}
            subtitle={`Forecast run ${formatDate(f.created)} · ${f.days_covered} day${f.days_covered === 1 ? '' : 's'}`}
            avatar={{ icon: 'trending-up-outline', color: hasSupply ? '#10b981' : '#64748b' }}
            badges={badges}
            stats={[
                { label: 'To order', value: units(f.required_quantity), color: '#6366f1' },
                { label: 'Forecast', value: units(f.total_forecast) },
                { label: 'Per day', value: f.avg_daily_forecast.toFixed(1) },
            ]}
            sections={[
                {
                    title: 'Demand',
                    icon: 'stats-chart-outline',
                    fields: [
                        { label: 'Likely range (P10–P90)', value: `${units(f.total_p10)} – ${units(f.total_p90)}` },
                        { label: 'Days covered', value: String(f.days_covered) },
                        { label: 'Sales history', value: f.history_days != null ? `${f.history_days} days` : '' },
                        { label: 'Variability (CV)', value: f.demand_cv != null ? f.demand_cv.toFixed(2) : '' },
                        { label: 'Days with no sales', value: f.zero_demand_pct != null ? `${(f.zero_demand_pct * 100).toFixed(0)}%` : '' },
                    ],
                },
                { title: 'Daily forecast', icon: 'calendar-outline', children: <DailyBars rows={f.daily ?? []} /> },
                { title: `Offers (${f.wholesaler_offers.length})`, icon: 'pricetags-outline', children: <Offers f={f} /> },
                ...(f.wholesaler_campaigns.length > 0 ? [{ title: `Campaigns (${f.wholesaler_campaigns.length})`, icon: 'megaphone-outline' as const, children: <Campaigns f={f} /> }] : []),
            ]}
            actions={action}
        />
    );
}

/* ------------------------------------------------------------------ */

function Empty({ text }: { text: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: chipBg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>{text}</Text>
        </View>
    );
}

/** One bar per day: solid = point forecast, faint band = P10–P90. */
function DailyBars({ rows }: { rows: RetailerForecastDailyRow[] }) {
    const { theme, chipBg, divider } = useListTokens();
    const [expanded, setExpanded] = useState(false);
    const shown = useMemo(() => (expanded ? rows : rows.slice(0, 7)), [rows, expanded]);
    const max = useMemo(() => Math.max(1, ...rows.map((r) => Math.max(r.p90 ?? 0, r.point_forecast ?? 0))), [rows]);

    if (rows.length === 0) return <Empty text="Daily breakdown is not available for this forecast." />;

    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 8, backgroundColor: chipBg }}>
            {shown.map((r) => {
                const lo = Math.max(0, (r.p10 ?? r.point_forecast) / max) * 100;
                const hi = Math.max(0, (r.p90 ?? r.point_forecast) / max) * 100;
                const pt = Math.max(0, r.point_forecast / max) * 100;
                return (
                    <View key={`${r.forecast_date}-${r.horizon_days}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ width: 56, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                            {shortDay(r.forecast_date)}
                        </Text>
                        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: divider, overflow: 'hidden' }}>
                            <View style={{ position: 'absolute', left: `${lo}%`, width: `${Math.max(0, hi - lo)}%`, top: 0, bottom: 0, backgroundColor: `${theme.primary}33` }} />
                            <View style={{ width: `${pt}%`, height: '100%', borderRadius: 5, backgroundColor: theme.primary }} />
                        </View>
                        <Text style={{ width: 40, textAlign: 'right', color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{r.point_forecast.toFixed(1)}</Text>
                    </View>
                );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>
                    Units per day · band shows P10–P90{shown[0]?.model_name ? ` · ${shown[0].model_name}` : ''}
                </Text>
                {rows.length > 7 ? (
                    <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} style={webPointer}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{expanded ? 'Show less' : `Show all ${rows.length}`}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

function shortDay(raw: string): string {
    const d = new Date(String(raw).replace(' ', 'T'));
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function Offers({ f }: { f: RetailerForecastNormalized }) {
    const { theme, chipBg } = useListTokens();
    if (f.wholesaler_offers.length === 0) return <Empty text="No wholesaler offers for this product yet." />;
    const shown = f.wholesaler_offers.slice(0, 5);
    return (
        <View style={{ gap: 8 }}>
            {shown.map((o, i) => (
                <View key={o.receipt_id} style={{ borderRadius: 16, padding: 12, gap: 6, backgroundColor: chipBg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                            {textOr(o.wholesaler_title, 'Wholesaler')}
                        </Text>
                        {i === 0 ? <AdminBadgePill badge={{ label: 'Best', tone: 'primary', icon: 'star' }} /> : null}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(o.effective_unit_price)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {o.price_discount_percent > 0 ? <AdminBadgePill badge={{ label: `${o.price_discount_percent.toFixed(0)}% off`, tone: 'success' }} /> : null}
                        {o.quantity_discount ? <AdminBadgePill badge={{ label: `Buy ${o.quantity_discount.limit_quantity} get ${o.quantity_discount.awarded_quantity}`, tone: 'success' }} /> : null}
                        <AdminBadgePill badge={{ label: `${units(o.current_quantity)} in stock`, tone: 'neutral' }} />
                        {o.days_to_expiry != null ? <AdminBadgePill badge={{ label: `Expires in ${o.days_to_expiry}d`, tone: o.days_to_expiry < 60 ? 'warning' : 'neutral' }} /> : null}
                        {o.in_placement ? <AdminBadgePill badge={{ label: 'Consignment', tone: 'violet' }} /> : null}
                    </View>
                </View>
            ))}
            {f.wholesaler_offers.length > shown.length ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 4 }}>+{f.wholesaler_offers.length - shown.length} more in View offers</Text>
            ) : null}
        </View>
    );
}

function Campaigns({ f }: { f: RetailerForecastNormalized }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ gap: 8 }}>
            {f.wholesaler_campaigns.map((c) => (
                <View key={c.campaign_id} style={{ borderRadius: 16, padding: 12, gap: 6, backgroundColor: chipBg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                            {textOr(c.campaign_title, 'Campaign')}
                        </Text>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(c.published_unit_price)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <AdminBadgePill badge={{ label: textOr(c.wholesaler_title, 'Wholesaler'), tone: 'neutral' }} />
                        {c.published_bonus_quantity > 0 ? <AdminBadgePill badge={{ label: `+${c.published_bonus_quantity} bonus`, tone: 'success' }} /> : null}
                        <AdminBadgePill badge={{ label: `${c.days_remaining}d left`, tone: c.days_remaining <= 3 ? 'warning' : 'info' }} />
                        {c.opted_in ? <AdminBadgePill badge={{ label: 'Opted in', tone: 'success', icon: 'checkmark' }} /> : null}
                    </View>
                </View>
            ))}
        </View>
    );
}
