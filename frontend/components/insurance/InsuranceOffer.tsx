// components/insurance/InsuranceOffer.tsx
//
// The opportunistic "insure this" button, dropped into the moment it matters:
// a checkout with delivery (SafeParcel), a rider's day (RiderShield), a credit sale
// (TradeGuard), the shop guard screen (DukaCover / TillGuard). It asks the server for
// the exact price for *this* moment and shows it with what you'd get back — one tap
// opens the opt-in sheet already filled in. Says "Covered" when it already is, and
// renders nothing for people the cover isn't for.

import insuranceApi, { type CoverProduct, type Offer, type Policy } from '@/api/insuranceApi';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { isServerOk } from '@/utils/serverResponse';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { gradientBg, kes, PRODUCT_META, pointer } from './coverShared';
import OptInSheet, { type Subject } from './OptInSheet';

interface Props {
    product: CoverProduct;
    /** subject_kind / subject_id (what's covered) and inputs (value, amount, mode…). */
    context?: { subject_kind?: string; subject_id?: string; inputs?: Record<string, any> };
    subjectLabel?: string;
    /** Inputs the screen fixes (e.g. the order's goods value). */
    locked?: string[];
    source: string;
    /** Headline override, e.g. "Insure this delivery". */
    title?: string;
    variant?: 'card' | 'strip';
    onCovered?: (p: Policy) => void;
}

const HEADLINE: Record<CoverProduct, (q: any) => string> = {
    SAFE_PARCEL: (q) => `Insure this delivery for ${kes(q.premium)}`,
    RIDER_SHIELD: (q) => `Ride covered ${q.period === 'today' ? 'today' : `for ${q.period}`} — ${kes(q.premium)}`,
    DUKA_COVER: (q) => `Protect your stock for ${kes(q.premium)} a month`,
    TRADE_GUARD: (q) => `Insure this credit sale for ${kes(q.premium)}`,
    TILL_GUARD: (q) => `Cover staff theft & M-Pesa fraud — ${kes(q.premium)}/month`,
};
const SUB: Record<CoverProduct, (q: any) => string> = {
    SAFE_PARCEL: (q) => `Get back up to ${kes(q.scenarios?.[0]?.you_get ?? q.cover)} if it's stolen, lost or damaged on the way.`,
    RIDER_SHIELD: (q) => `Hospital bills up to KES 30,000 and ${kes(q.cover)} if the worst happens.`,
    DUKA_COVER: (q) => `Fire or a break-in? Claim up to ${kes(q.cover)}.`,
    TRADE_GUARD: (q) => `If they don't pay, you get ${kes(q.cover)} back.`,
    TILL_GUARD: (q) => `Claim up to ${kes(q.cover)} — SIM swap, fake M-Pesa, staff theft.`,
};

export default function InsuranceOffer({ product, context, subjectLabel, locked, source, title, variant = 'card', onCovered }: Props) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [offer, setOffer] = useState<Offer | null>(null);
    const [open, setOpen] = useState(false);
    const seq = useRef(0);
    const key = JSON.stringify(context ?? {});

    const load = () => {
        if (!isOnline) return;
        const mine = ++seq.current;
        insuranceApi
            .offer(product, context ?? {})
            .then((res: any) => mine === seq.current && isServerOk(res) && setOffer(res.data.offer))
            .catch(() => undefined);
    };

    useEffect(() => {
        const t = setTimeout(load, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product, key, isOnline]);

    if (!offer || !offer.eligible) return null;
    const meta = PRODUCT_META[product];

    if (offer.covered && offer.policy) {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: `${theme.success}14` }}>
                <ShieldCheck size={16} color={theme.success} />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 12.5 }} numberOfLines={2}>
                    {offer.policy.status === 'INTEREST' ? `${meta.name} pre-registered` : `${meta.name} · covered up to ${kes(offer.policy.cover)}`}
                </Text>
            </View>
        );
    }
    const q = offer.quote;
    if (!q) return null;
    const subject: Subject | null = context?.subject_kind && context?.subject_id ? { kind: context.subject_kind, id: context.subject_id, label: subjectLabel } : null;
    const Icon = meta.icon;

    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={title ?? HEADLINE[product](q)}
                style={[
                    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: variant === 'strip' ? 14 : 18, padding: variant === 'strip' ? 10 : 14, overflow: 'hidden', ...pointer },
                    variant === 'strip' ? { backgroundColor: `${meta.colors[0]}12`, borderWidth: 1, borderColor: `${meta.colors[0]}33` } : gradientBg(meta.colors[0], meta.colors[1]),
                ]}
            >
                <View style={{ width: variant === 'strip' ? 34 : 42, height: variant === 'strip' ? 34 : 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: variant === 'strip' ? `${meta.colors[0]}1f` : 'rgba(255,255,255,0.22)' }}>
                    <Icon size={variant === 'strip' ? 17 : 21} color={variant === 'strip' ? meta.colors[0] : '#fff'} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: variant === 'strip' ? theme.text : '#fff', fontFamily: theme.font.bold, fontSize: variant === 'strip' ? 13.5 : 15 }}>{title ?? HEADLINE[product](q)}</Text>
                    <Text numberOfLines={2} style={{ color: variant === 'strip' ? theme.textMuted : 'rgba(255,255,255,0.88)', fontFamily: theme.font.medium, fontSize: 12, marginTop: 2 }}>{SUB[product](q)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: variant === 'strip' ? meta.colors[0] : '#fff' }}>
                    <Text style={{ color: variant === 'strip' ? '#fff' : meta.colors[0], fontFamily: theme.font.bold, fontSize: 12.5 }}>{offer.sales_enabled ? 'Insure' : 'Opt in'}</Text>
                    <ChevronRight size={14} color={variant === 'strip' ? '#fff' : meta.colors[0]} strokeWidth={2.6} />
                </View>
            </Pressable>
            <OptInSheet
                visible={open}
                product={product}
                inputs={offer.inputs}
                subject={subject}
                locked={locked}
                source={source}
                onClose={() => setOpen(false)}
                onDone={(p) => {
                    onCovered?.(p);
                    load();
                }}
            />
        </>
    );
}

