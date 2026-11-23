// components/billing/TokenBanner.tsx — slim status bar for business staff (replaces the
// monthly SubscriptionBanner). Shows only when there is something to know:
// awaiting approval, free month counting down, tokens low / empty / till paused.
// Taps open Billing. Last copy is kept on the device so it shows offline too.

import billingApi, { type BillingStatus } from '@/api/billingApi';
import { useAuth } from '@/context/AuthContext';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight, Clock, Coins, Gift, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const CACHE = 'wazipos_billing_v1';
const NO_BILLING = new Set(['', 'Default', 'Bank', 'Insurance', 'Telco']);

export function TokenBanner() {
    const { theme, user } = useAuth() as any;
    const [s, setS] = useState<BillingStatus | null>(null);
    const [hidden, setHidden] = useState(false);
    const entityType: string = user?.entity_type || '';
    const applies = !!user && !NO_BILLING.has(entityType);

    useEffect(() => {
        if (!applies) return;
        let live = true;
        const pull = async () => {
            const res: any = await billingApi.status().catch(() => null);
            if (live && isServerOk(res)) {
                setS(res.data.billing);
                AsyncStorage.setItem(CACHE, JSON.stringify(res.data.billing)).catch(() => undefined);
            }
        };
        AsyncStorage.getItem(CACHE)
            .then((raw) => {
                if (raw && live) setS((cur) => cur ?? JSON.parse(raw));
            })
            .catch(() => undefined);
        void pull();
        const t = setInterval(() => void pull(), 5 * 60 * 1000);
        return () => {
            live = false;
            clearInterval(t);
        };
    }, [applies, user?.entity]);

    if (!applies || !s || hidden || s.entity?.id !== String(user?.entity ?? s.entity?.id)) return null;

    let tone: 'info' | 'success' | 'warning' | 'danger' | null = null;
    let Icon = Coins;
    let text = '';
    const bal = Number(s.balance) || 0;
    if (s.mode === 'SETUP') {
        tone = 'info';
        Icon = Clock;
        text = s.approval === 'PENDING' ? 'Waiting for WaziPOS approval — your free month starts when approved' : 'Finish setting up your business and submit it for approval';
    } else if (s.mode === 'TRIAL') {
        tone = 'success';
        Icon = Gift;
        text = `Free month · ${s.trial_days_left ?? 0} day${s.trial_days_left === 1 ? '' : 's'} left · ${s.month.orders} orders so far`;
    } else if (s.mode === 'TOKENS') {
        if (!s.can_operate) {
            tone = 'danger';
            Icon = AlertTriangle;
            text = s.blocked_reason || 'Out of tokens — top up to keep selling';
        } else if (bal <= 0) {
            tone = 'danger';
            Icon = AlertTriangle;
            text = `Out of tokens (${bal.toFixed(0)}) — top up now`;
        } else if (s.is_low) {
            tone = 'warning';
            text = `${bal.toFixed(0)} tokens left — top up soon`;
        }
    }
    if (!tone) return null;

    const color = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : tone === 'success' ? theme.success : theme.primary;
    const bg = tone === 'danger' ? theme.dangerSoft : tone === 'warning' ? theme.warningSoft : tone === 'success' ? theme.successSoft : theme.primarySoft;
    const target = s.mode === 'SETUP' ? '/(tabs)/business' : '/billing';

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 7, gap: 8 }}>
            <Pressable onPress={() => router.push(target as any)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={text}>
                <Icon size={15} color={color} />
                <Text style={{ flex: 1, color, fontFamily: theme.font.bold, fontSize: 12.5 }} numberOfLines={1}>
                    {text}
                </Text>
                <ChevronRight size={15} color={color} />
            </Pressable>
            {tone !== 'danger' ? (
                <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Hide">
                    <X size={14} color={color} />
                </Pressable>
            ) : null}
        </View>
    );
}
