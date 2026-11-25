// components/billing/TokenBanner.tsx — slim status bar for business staff (replaces the
// monthly SubscriptionBanner). Shows only when there is something to know:
// awaiting approval, free month counting down, tokens low / empty / till paused.
// Always leads with the current shop (name · type) so staff know which business they're in;
// with no billing message the bar shows the shop alone. Taps open Billing. Last copy is kept on the device so it shows offline too.

import billingApi, { type BillingStatus } from '@/api/billingApi';
import { useAuth } from '@/context/AuthContext';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight, Clock, Coins, Gift, Store, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const CACHE = 'wazipos_billing_v1';
const NO_BILLING = new Set(['', 'Default', 'Bank', 'Insurance', 'Telco']);

/** "PharmaceuticalRetailer" -> "Pharmaceutical Retailer" */
const typeLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

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

    if (!applies) return null;
    // Billing status for another business (cached from before a switch) is ignored.
    const status = s && s.entity?.id === String(user?.entity ?? s.entity?.id) ? s : null;
    const shopTitle: string = user?.entity_title || status?.entity?.title || '';
    const shopType = typeLabel(entityType || status?.entity?.entity_type || '');

    let tone: 'info' | 'success' | 'warning' | 'danger' | null = null;
    let Icon = Coins;
    let text = '';
    const bal = Number(status?.balance) || 0;
    if (!status || hidden) {
        // no billing message: shop details only
    } else if (status.mode === 'SETUP') {
        tone = 'info';
        Icon = Clock;
        text = status.approval === 'PENDING' ? 'Waiting for WaziPOS approval — your free month starts when approved' : 'Finish setting up your business and submit it for approval';
    } else if (status.mode === 'TRIAL') {
        tone = 'success';
        Icon = Gift;
        text = `Free month · ${status.trial_days_left ?? 0} day${status.trial_days_left === 1 ? '' : 's'} left · ${status.month.orders} orders so far`;
    } else if (status.mode === 'TOKENS') {
        if (!status.can_operate) {
            tone = 'danger';
            Icon = AlertTriangle;
            text = status.blocked_reason || 'Out of tokens — top up to keep selling';
        } else if (bal <= 0) {
            tone = 'danger';
            Icon = AlertTriangle;
            text = `Out of tokens (${bal.toFixed(0)}) — top up now`;
        } else if (status.is_low) {
            tone = 'warning';
            text = `${bal.toFixed(0)} tokens left — top up soon`;
        }
    }
    if (!tone && !shopTitle) return null;

    const color = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : tone === 'success' ? theme.success : theme.primary;
    const bg = tone === 'danger' ? theme.dangerSoft : tone === 'warning' ? theme.warningSoft : tone === 'success' ? theme.successSoft : theme.primarySoft;
    const target = status?.mode === 'SETUP' ? '/(tabs)/business' : '/billing';
    const label = [shopTitle && `${shopTitle}${shopType ? ` (${shopType})` : ''}`, text].filter(Boolean).join(' — ');

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 7, gap: 8 }}>
            <Pressable onPress={() => router.push(target as any)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={label}>
                {shopTitle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: text ? '45%' : '100%' }}>
                        <Store size={15} color={color} />
                        <Text style={{ flexShrink: 1, color, fontSize: 12.5 }} numberOfLines={1}>
                            <Text style={{ fontFamily: theme.font.bold }}>{shopTitle}</Text>
                            {shopType ? <Text style={{ fontFamily: theme.font.regular, opacity: 0.8 }}>{` · ${shopType}`}</Text> : null}
                        </Text>
                    </View>
                ) : null}
                {shopTitle && text ? <View style={{ width: 1, alignSelf: 'stretch', marginVertical: 2, backgroundColor: color, opacity: 0.3 }} /> : null}
                {text ? (
                    <>
                        <Icon size={15} color={color} />
                        <Text style={{ flex: 1, color, fontFamily: theme.font.bold, fontSize: 12.5 }} numberOfLines={1}>
                            {text}
                        </Text>
                    </>
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                <ChevronRight size={15} color={color} />
            </Pressable>
            {tone && tone !== 'danger' ? (
                <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Hide">
                    <X size={14} color={color} />
                </Pressable>
            ) : null}
        </View>
    );
}
