// components/retailers/forecast/ForecastDetailsModal.tsx

import { useAuth } from '@/context/AuthContext';
import {
    RetailerForecastDailyRow,
    RetailerForecastNormalized,
} from '@/databases/types';
import React, { useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Props
 * ======================================================= */
interface Props {
    forecast: RetailerForecastNormalized | null;
    onClose: () => void;
}

/* =========================================================
 * Modal
 * ======================================================= */
export function ForecastDetailsModal({ forecast, onClose }: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [dailyExpanded, setDailyExpanded] = useState(false);

    const hasDaily = (forecast?.daily?.length ?? 0) > 0;
    const hasOffers = (forecast?.wholesaler_offers?.length ?? 0) > 0;
    const hasCampaigns = (forecast?.wholesaler_campaigns?.length ?? 0) > 0;

    const dailyRows = useMemo(
        () => (dailyExpanded ? forecast?.daily ?? [] : (forecast?.daily ?? []).slice(0, 7)),
        [forecast, dailyExpanded]
    );

    if (!forecast) return null;

    return (
        <Modal
            visible={!!forecast}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[900px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{ backgroundColor: theme.panel, borderColor }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                                numberOfLines={1}
                            >
                                {forecast.product_title}
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Forecast details · run {forecast.created}
                            </Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={10} className="p-1.5">
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                        {/* ---------------- Summary ---------------- */}
                        <SectionTitle label="Summary" />
                        <View
                            className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                            style={{ backgroundColor: subBg }}
                        >
                            <SummaryCell
                                label="Total forecast"
                                value={`${forecast.total_forecast.toFixed(1)} u`}
                            />
                            <SummaryCell
                                label="P10 – P90"
                                value={`${forecast.total_p10.toFixed(1)} – ${forecast.total_p90.toFixed(1)}`}
                            />
                            <SummaryCell
                                label="Avg daily"
                                value={forecast.avg_daily_forecast.toFixed(2)}
                            />
                            <SummaryCell
                                label="Days covered"
                                value={String(forecast.days_covered)}
                            />
                            <SummaryCell
                                label="Suggested qty"
                                value={String(forecast.required_quantity)}
                            />
                        </View>

                        {/* ---------------- Demand profile ---------------- */}
                        {(forecast.demand_pattern ||
                            forecast.demand_cv != null ||
                            forecast.history_days != null) ? (
                            <>
                                <SectionTitle label="Demand profile" />
                                <View
                                    className="rounded-xl p-3 flex-row flex-wrap gap-3 mb-4"
                                    style={{ backgroundColor: subBg }}
                                >
                                    {forecast.demand_pattern ? (
                                        <PatternBadge pattern={forecast.demand_pattern} />
                                    ) : null}
                                    {forecast.history_days != null ? (
                                        <SummaryCell
                                            label="History"
                                            value={`${forecast.history_days}d`}
                                        />
                                    ) : null}
                                    {forecast.demand_cv != null ? (
                                        <SummaryCell
                                            label="Variability (CV)"
                                            value={forecast.demand_cv.toFixed(2)}
                                        />
                                    ) : null}
                                    {forecast.zero_demand_pct != null ? (
                                        <SummaryCell
                                            label="Zero-demand days"
                                            value={`${(forecast.zero_demand_pct * 100).toFixed(0)}%`}
                                        />
                                    ) : null}
                                    {forecast.trend_direction ? (
                                        <SummaryCell
                                            label="Trend"
                                            value={
                                                forecast.trend_pct != null
                                                    ? `${forecast.trend_direction} (${(forecast.trend_pct * 100).toFixed(0)}%)`
                                                    : forecast.trend_direction
                                            }
                                        />
                                    ) : null}
                                </View>
                            </>
                        ) : null}

                        {/* ---------------- Daily forecast ---------------- */}
                        {hasDaily ? (
                            <>
                                <View className="flex-row items-center justify-between mb-2">
                                    <SectionTitle label="Daily forecast" inline />
                                    {forecast.daily.length > 7 ? (
                                        <Pressable
                                            onPress={() => setDailyExpanded((v) => !v)}
                                        >
                                            <Text
                                                className="uppercase tracking-wide"
                                                style={{
                                                    color: theme.primary,
                                                    fontFamily: theme.font.bold,
                                                    fontSize: 10,
                                                }}
                                            >
                                                {dailyExpanded ? 'Collapse' : `Show all (${forecast.daily.length})`}
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </View>

                                {/* Header row */}
                                <View
                                    className="flex-row rounded-xl border px-3 py-2 mb-1"
                                    style={{ backgroundColor: subBg, borderColor }}
                                >
                                    <Text style={styles.headerCell(theme)} flex={1.4}>Date</Text>
                                    <Text style={styles.headerCell(theme)} flex={1}>Point</Text>
                                    <Text style={styles.headerCell(theme)} flex={1}>P10</Text>
                                    <Text style={styles.headerCell(theme)} flex={1}>P90</Text>
                                    <Text style={styles.headerCell(theme)} flex={1.4}>Model</Text>
                                </View>

                                {/* Data rows */}
                                {dailyRows.map((d) => (
                                    <DailyRow
                                        key={`${d.forecast_date}-${d.horizon_days}`}
                                        row={d}
                                    />
                                ))}
                            </>
                        ) : (
                            <>
                                <SectionTitle label="Daily forecast" />
                                <View
                                    className="rounded-xl p-4 items-center mb-4"
                                    style={{ backgroundColor: subBg }}
                                >
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.medium,
                                            fontSize: theme.fontSize.sm,
                                        }}
                                    >
                                        Daily breakdown not available (include_daily was off).
                                    </Text>
                                </View>
                            </>
                        )}

                        {/* ---------------- Offers summary ---------------- */}
                        <SectionTitle label={`Offers (${forecast.wholesaler_offers.length})`} />
                        {hasOffers ? (
                            forecast.wholesaler_offers.slice(0, 5).map((o) => (
                                <View
                                    key={o.receipt_id}
                                    className="rounded-xl border p-3 mb-2"
                                    style={{ backgroundColor: subBg, borderColor }}
                                >
                                    <View className="flex-row justify-between items-center mb-1.5">
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 13,
                                                flex: 1,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {o.wholesaler_title || 'Unknown'}
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily: theme.font.bold,
                                                fontSize: 13,
                                            }}
                                        >
                                            KES {o.effective_unit_price}
                                        </Text>
                                    </View>

                                    <View className="flex-row flex-wrap gap-1.5 mt-1">
                                        {o.price_discount_percent > 0 ? (
                                            <MiniBadge
                                                label={`${o.price_discount_percent.toFixed(0)}% off`}
                                                tone="success"
                                            />
                                        ) : null}
                                        {o.quantity_discount ? (
                                            <MiniBadge
                                                label={`Buy ${o.quantity_discount.limit_quantity} get ${o.quantity_discount.awarded_quantity}`}
                                                tone="success"
                                            />
                                        ) : null}
                                        <MiniBadge label={`${o.current_quantity} in stock`} />
                                        {o.days_to_expiry != null ? (
                                            <MiniBadge
                                                label={`${o.days_to_expiry}d expiry`}
                                                tone={o.days_to_expiry < 60 ? 'warning' : 'default'}
                                            />
                                        ) : null}
                                    </View>
                                </View>
                            ))
                        ) : (
                            <EmptyBlock message="No offers available." />
                        )}

                        {forecast.wholesaler_offers.length > 5 ? (
                            <Text
                                className="text-[11px] mt-1 mb-3"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    opacity: 0.7,
                                }}
                            >
                                +{forecast.wholesaler_offers.length - 5} more offers
                            </Text>
                        ) : null}

                        {/* ---------------- Campaigns summary ---------------- */}
                        <SectionTitle label={`Campaigns (${forecast.wholesaler_campaigns.length})`} />
                        {hasCampaigns ? (
                            forecast.wholesaler_campaigns.map((c) => (
                                <View
                                    key={c.campaign_id}
                                    className="rounded-xl border p-3 mb-2"
                                    style={{ backgroundColor: subBg, borderColor }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: theme.font.bold,
                                            fontSize: 13,
                                            marginBottom: 4,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {c.campaign_title}
                                    </Text>
                                    <View className="flex-row flex-wrap gap-1.5">
                                        <MiniBadge label={c.wholesaler_title} />
                                        {c.published_bonus_quantity > 0 ? (
                                            <MiniBadge
                                                label={`+${c.published_bonus_quantity} bonus`}
                                                tone="success"
                                            />
                                        ) : null}
                                        <MiniBadge
                                            label={`Ends in ${c.days_remaining}d`}
                                            tone={c.days_remaining <= 7 ? 'warning' : 'default'}
                                        />
                                    </View>
                                </View>
                            ))
                        ) : (
                            <EmptyBlock message="No active campaigns for this product." />
                        )}
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                Close
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Daily row
 * ======================================================= */
function DailyRow({ row }: { row: RetailerForecastDailyRow }) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    return (
        <View
            className="flex-row rounded-xl border px-3 py-2 mb-1"
            style={{ borderColor }}
        >
            <Text style={{ flex: 1.4, color: theme.text, fontFamily: theme.font.medium, fontSize: 11 }}>
                {row.forecast_date}
            </Text>
            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 11 }}>
                {row.point_forecast.toFixed(1)}
            </Text>
            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>
                {row.p10 != null ? row.p10.toFixed(1) : '—'}
            </Text>
            <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>
                {row.p90 != null ? row.p90.toFixed(1) : '—'}
            </Text>
            <Text style={{ flex: 1.4, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>
                {row.model_name}
            </Text>
        </View>
    );
}

/* =========================================================
 * Small pieces
 * ======================================================= */
function SectionTitle({ label, inline }: { label: string; inline?: boolean }) {
    const { theme } = useAuth();
    return (
        <Text
            className="uppercase tracking-widest mb-2"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
                marginTop: inline ? 0 : 8,
            }}
        >
            {label}
        </Text>
    );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ minWidth: 100 }}>
            <Text
                className="uppercase tracking-wide"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                }}
            >
                {label}
            </Text>
            <Text
                className="mt-0.5"
                numberOfLines={1}
                style={{
                    color: theme.text,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {value}
            </Text>
        </View>
    );
}

function PatternBadge({ pattern }: { pattern: string }) {
    const { theme } = useAuth();
    const isGood = ['stable', 'seasonal', 'trending_up'].includes(pattern);
    const bg = isGood ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)';
    const color = isGood ? '#10b981' : '#f59e0b';
    return (
        <View
            className="px-2 py-0.5 rounded-md self-start"
            style={{ backgroundColor: bg }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{ color, fontFamily: theme.font.bold, fontSize: 10 }}
            >
                {pattern.replace('_', ' ')}
            </Text>
        </View>
    );
}

function MiniBadge({
    label,
    tone = 'default',
}: {
    label: string;
    tone?: 'default' | 'success' | 'warning';
}) {
    const { theme, isDarkMode } = useAuth();
    const bg =
        tone === 'success' ? 'rgba(16,185,129,0.15)'
            : tone === 'warning' ? 'rgba(251,191,36,0.15)'
                : isDarkMode ? '#0f172a' : '#f8fafc';
    const border =
        tone === 'success' ? 'rgba(16,185,129,0.3)'
            : tone === 'warning' ? 'rgba(251,191,36,0.3)'
                : isDarkMode ? '#334155' : '#e2e8f0';
    const color =
        tone === 'success' ? '#10b981'
            : tone === 'warning' ? '#f59e0b'
                : theme.textDark;

    return (
        <View
            className="px-2 py-0.5 rounded-md border"
            style={{ backgroundColor: bg, borderColor: border }}
        >
            <Text
                className="uppercase tracking-wide"
                style={{ color, fontFamily: theme.font.bold, fontSize: 10 }}
            >
                {label}
            </Text>
        </View>
    );
}

function EmptyBlock({ message }: { message: string }) {
    const { theme, isDarkMode } = useAuth();
    return (
        <View
            className="rounded-xl p-4 items-center mb-3"
            style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}
        >
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.medium,
                    fontSize: theme.fontSize.sm,
                }}
            >
                {message}
            </Text>
        </View>
    );
}

/* =========================================================
 * Inline styles
 * ======================================================= */
const styles = {
    headerCell: (theme: any) => ({
        color: theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
    }),
};