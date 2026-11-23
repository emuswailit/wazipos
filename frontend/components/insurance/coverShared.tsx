// components/insurance/coverShared.tsx
//
// What the WaziPOS Cover screens share: each policy's look, the live quote hook
// (re-prices as the form changes), and the quote card — premium, what you can claim,
// the excess, and "if this happens, you get…" examples in plain words.

import insuranceApi, { type ClaimStatus, type CoverProduct, type PolicyStatus, type Quote } from '@/api/insuranceApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { Bike, CheckCircle2, ChevronDown, ChevronUp, HandCoins, Package, ShieldCheck, Store, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;
export const kes = (n: number | null | undefined) => `KES ${Math.round(Number(n || 0)).toLocaleString('en-KE')}`;

export const PRODUCT_META: Record<CoverProduct, { name: string; icon: any; colors: [string, string]; who: string; short: string }> = {
    SAFE_PARCEL: { name: 'SafeParcel', icon: Package, colors: ['#2a6ff3', '#22b8f0'], who: 'Anyone buying with delivery', short: 'Goods covered on the way' },
    RIDER_SHIELD: { name: 'RiderShield', icon: Bike, colors: ['#f97316', '#f59e0b'], who: 'Riders & drivers', short: 'Accident cover per ride day' },
    DUKA_COVER: { name: 'DukaCover', icon: Store, colors: ['#10b981', '#14b8a6'], who: 'Shops, wholesalers, restaurants', short: 'Stock & cash: fire, burglary' },
    TRADE_GUARD: { name: 'TradeGuard', icon: HandCoins, colors: ['#8b5cf6', '#6366f1'], who: 'Businesses selling on credit', short: '80% back if they don’t pay' },
    TILL_GUARD: { name: 'TillGuard', icon: ShieldCheck, colors: ['#ec4899', '#8b5cf6'], who: 'Businesses with staff', short: 'Staff theft & M-Pesa fraud' },
};

export const POLICY_STATUS: Record<PolicyStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
    INTEREST: { label: 'Pre-registered', tone: 'info' },
    AWAITING_PAYMENT: { label: 'Awaiting payment', tone: 'warning' },
    ACTIVE: { label: 'Active', tone: 'success' },
    EXPIRED: { label: 'Ended', tone: 'info' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
    FAILED: { label: 'Payment failed', tone: 'danger' },
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
    SUBMITTED: { label: 'Submitted', tone: 'info' },
    IN_REVIEW: { label: 'In review', tone: 'warning' },
    APPROVED: { label: 'Approved', tone: 'success' },
    REJECTED: { label: 'Declined', tone: 'danger' },
    PAID: { label: 'Paid', tone: 'success' },
};

export const gradientBg = (a: string, b: string, angle = 135): any => (isWeb ? { backgroundImage: `linear-gradient(${angle}deg, ${a}, ${b})` } : { backgroundColor: a });

export function fmtWhen(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Re-prices on every change (debounced) — the server's engine is the only price. */
export function useLiveQuote(product: CoverProduct | null, inputs: Record<string, any>, enabled = true) {
    const { isOnline } = useNetworkStatus();
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);
    const key = JSON.stringify(inputs);

    useEffect(() => {
        if (!product || !enabled) return;
        if (!isOnline) {
            setError("You're offline — connect to get a live price.");
            return;
        }
        const mine = ++seq.current;
        setLoading(true);
        const t = setTimeout(async () => {
            const res: any = await insuranceApi.quote(product, inputs).catch(() => null);
            if (mine !== seq.current) return;
            setLoading(false);
            if (isServerOk(res)) {
                setQuote(res.data.quote);
                setError(null);
            } else setError(describeResponse(res, 'Could not price this cover.').message);
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product, key, enabled, isOnline]);

    return { quote, loading, error };
}

/** Premium · cover · excess, then "if this happens you get". */
export function QuoteCard({ quote, loading, compact }: { quote: Quote | null; loading?: boolean; compact?: boolean }) {
    const { theme } = useAuth();
    const [more, setMore] = useState(false);
    if (!quote) return <View style={{ paddingVertical: 24, alignItems: 'center' }}>{loading ? <ActivityIndicator color={theme.primary} /> : null}</View>;
    const meta = PRODUCT_META[quote.product];
    return (
        <View style={{ gap: 12 }}>
            <View style={[{ borderRadius: 20, padding: 16, overflow: 'hidden' }, gradientBg(meta.colors[0], meta.colors[1])]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.semibold, fontSize: 12 }}>You pay</Text>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 30, letterSpacing: -0.6 }}>
                            {kes(quote.premium)}
                            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}> {quote.period === 'per month' ? '/ month' : `· ${quote.period}`}</Text>
                        </Text>
                        {quote.saving ? <Text style={{ color: '#fff', fontFamily: theme.font.semibold, fontSize: 12 }}>You save {kes(quote.saving)}</Text> : null}
                    </View>
                    {loading ? <ActivityIndicator color="#fff" /> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <Stat label="Claim up to" value={kes(quote.cover)} />
                    <Stat label="Excess" value={quote.excess ? kes(quote.excess) : 'None'} />
                </View>
            </View>

            <View style={{ borderRadius: 16, backgroundColor: theme.surfaceAlt, padding: 14, gap: 10 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>If this happens, you get</Text>
                {quote.scenarios.map((s) => (
                    <View key={s.risk} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>{s.risk}</Text>
                        <Text style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 14 }}>{kes(s.you_get)}</Text>
                    </View>
                ))}
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5 }}>Excess: {quote.excess_text}</Text>
            </View>

            {!compact ? (
                <>
                    <View style={{ gap: 6 }}>
                        {quote.covers.map((c) => (
                            <Line key={c} ok text={c} />
                        ))}
                        {quote.excludes.map((c) => (
                            <Line key={c} text={c} />
                        ))}
                    </View>
                    <Pressable onPress={() => setMore((m) => !m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, ...pointer }}>
                        {more ? <ChevronUp size={15} color={theme.primary} /> : <ChevronDown size={15} color={theme.primary} />}
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>How this price is worked out</Text>
                    </Pressable>
                    {more ? (
                        <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.surfaceAlt, gap: 4 }}>
                            {quote.breakdown.map((b) => (
                                <Text key={b} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{b}</Text>
                            ))}
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12, marginTop: 4 }}>{quote.claim_window}</Text>
                        </View>
                    ) : null}
                </>
            ) : null}
        </View>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.semibold, fontSize: 11 }}>{label}</Text>
            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{value}</Text>
        </View>
    );
}

function Line({ text, ok }: { text: string; ok?: boolean }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            {ok ? <CheckCircle2 size={15} color={theme.success} style={{ marginTop: 2 }} /> : <XCircle size={15} color={theme.textMuted} style={{ marginTop: 2 }} />}
            <Text style={{ flex: 1, color: ok ? theme.text : theme.textMuted, fontFamily: theme.font.regular, fontSize: 13, lineHeight: 18 }}>{ok ? text : `Not covered: ${text}`}</Text>
        </View>
    );
}
