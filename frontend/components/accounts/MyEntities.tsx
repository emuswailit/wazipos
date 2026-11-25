// components/accounts/MyEntities.tsx — "My businesses": strictly the businesses the
// signed-in user owns, and switching between them.
//
// Switching asks the user to sign in again (password, or an SMS code for Google /
// Facebook sign-ups). The server then makes the business current and returns fresh
// tokens; the app signs in with them so that business's roles, menus and settings
// load, and opens its home screen. Backend: authentication/utils/my_entities.py.
// The list is kept on the device so it opens offline (switching needs a connection).

import myEntitiesApi, { type MyEntities, type MyEntity } from '@/api/myEntitiesApi';
import { AdminSheet } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosCard, PosHeader, PrimaryCTA, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeftRight, Building2, Check, Eye, EyeOff, KeyRound, MapPin, Plus, Search, Store } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import ClearInputButton from '@/components/common/ClearInputButton';

const CACHE = 'wazipos_my_entities_v1';

const APPROVAL: Record<string, { tone: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
    SETUP: { tone: 'warning', label: 'Finish setup' },
    PENDING: { tone: 'info', label: 'Awaiting approval' },
    REJECTED: { tone: 'danger', label: 'Changes needed' },
};

export default function MyEntitiesScreen() {
    const { theme, user } = useAuth() as any;
    const { isOnline } = useNetworkStatus();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const [data, setData] = useState<MyEntities | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [q, setQ] = useState('');
    const [target, setTarget] = useState<MyEntity | null>(null);

    // Cache per signed-in user: never show another person's businesses.
    const cacheKey = `${CACHE}:${user?.id ?? user?.user_id ?? 'anon'}`;

    const load = useCallback(async () => {
        const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (raw) {
            try {
                setData((d) => d ?? JSON.parse(raw));
            } catch {
                /* stale copy */
            }
        }
        const res: any = await myEntitiesApi.list().catch(() => null);
        if (isServerOk(res)) {
            setData(res.data.my_entities);
            setError(null);
            AsyncStorage.setItem(cacheKey, JSON.stringify(res.data.my_entities)).catch(() => undefined);
        } else if (res) setError(describeResponse(res, 'Your businesses could not be loaded.').message);
    }, [cacheKey]);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const list = useMemo(() => {
        const term = q.trim().toLowerCase();
        const rows = data?.entities ?? [];
        return term ? rows.filter((e) => [e.title, e.type_label, e.town].filter(Boolean).join(' ').toLowerCase().includes(term)) : rows;
    }, [data, q]);
    const current = data?.entities.find((e) => e.current) ?? null;
    const cols = width >= 1100 ? 3 : width >= 700 ? 2 : 1;

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1180, width: '100%', alignSelf: 'center', gap: 14 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />}
            >
                <PosHeader
                    icon={Building2}
                    title="My businesses"
                    subtitle="Only the businesses you own. Switch to work in another one — you'll sign in again to confirm."
                    right={<SoftButton label="Add business" icon={Plus} onPress={() => router.push('/(tabs)/business' as any)} />}
                />
                {!isOnline ? <OfflineNotice title="Offline" message="Showing your saved list. Switching needs a connection." /> : null}

                {current ? (
                    <View style={{ borderRadius: 20, padding: 18, backgroundColor: theme.navy, gap: 4 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.65)', fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.8 }}>WORKING IN</Text>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 22 }} numberOfLines={1}>{current.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>
                            {[current.type_label, current.town].filter(Boolean).join(' · ')}
                        </Text>
                    </View>
                ) : data ? (
                    <InlineNotice tone="info" message="You're not working in any of your businesses right now. Pick one below." />
                ) : null}

                {data && data.entities.length > 3 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, height: 46 }}>
                        <Search size={16} color={theme.textMuted} />
                        <TextInput value={q} onChangeText={setQ} placeholder="Search your businesses" placeholderTextColor={theme.textMuted}
                            style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 15 }} />
                        <ClearInputButton value={q} onClear={() => setQ('')} />
                    </View>
                ) : null}

                {error ? <InlineNotice message={error} /> : null}
                {!data && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}

                {data && data.entities.length === 0 ? (
                    <PosCard style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
                        <Store size={30} color={theme.primary} />
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>You don't own a business yet</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>
                            Open one in a few steps — your first month is free.
                        </Text>
                        <PrimaryCTA label="Start selling" onPress={() => router.push('/(tabs)/business' as any)} style={{ alignSelf: 'stretch' }} />
                    </PosCard>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {list.map((e) => (
                        <View key={e.id} style={{ width: cols === 1 ? '100%' : `${100 / cols - 2}%` as any, flexGrow: 1 }}>
                            <EntityCard e={e} onSwitch={() => setTarget(e)} disabled={!isOnline} />
                        </View>
                    ))}
                </View>
            </ScrollView>

            <SwitchSheet
                target={target}
                confirmWith={data?.confirm_with ?? 'password'}
                phoneHint={data?.phone_hint ?? null}
                email={user?.email ?? ''}
                onClose={() => setTarget(null)}
            />
        </View>
    );
}

function EntityCard({ e, onSwitch, disabled }: { e: MyEntity; onSwitch: () => void; disabled: boolean }) {
    const { theme } = useAuth();
    const approval = e.approval && e.approval !== 'APPROVED' ? APPROVAL[e.approval] : null;
    return (
        <PosCard active={e.current} style={{ gap: 10, height: '100%' }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: e.current ? theme.successSoft : theme.primarySoft }}>
                    {e.current ? <Check size={20} color={theme.success} /> : <Store size={20} color={theme.primary} />}
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{e.title}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>{e.type_label}</Text>
                </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {e.is_active === false ? <StatusPill tone="danger" label="Deactivated" /> : null}
                {e.current ? <StatusPill tone="success" label="Working in" /> : null}
                {approval ? <StatusPill tone={approval.tone} label={approval.label} /> : e.is_verified ? <StatusPill tone="info" label="Verified" /> : null}
                {!e.has_location ? <StatusPill tone="warning" label="No location" /> : null}
            </View>
            {e.town || e.road ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MapPin size={13} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>{[e.road, e.town].filter(Boolean).join(', ')}</Text>
                </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {e.is_active === false ? (
                <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>Deactivated by WaziPOS. Contact support to reactivate it.</Text>
            ) : e.current ? (
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>You're working in this business.</Text>
            ) : (
                <SoftButton label="Switch to this business" icon={ArrowLeftRight} onPress={onSwitch} disabled={disabled} />
            )}
        </PosCard>
    );
}

function SwitchSheet({ target, confirmWith, phoneHint, email, onClose }: {
    target: MyEntity | null; confirmWith: 'password' | 'code'; phoneHint: string | null; email: string; onClose: () => void;
}) {
    const { theme, login } = useAuth() as any;
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [code, setCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [busy, setBusy] = useState<'send' | 'switch' | null>(null);
    const [err, setErr] = useState<string | null>(null);

    React.useEffect(() => {
        setPassword('');
        setCode('');
        setCodeSent(false);
        setErr(null);
        setShow(false);
    }, [target?.id]);

    const sendCode = async () => {
        if (!target) return;
        setBusy('send');
        setErr(null);
        const res: any = await myEntitiesApi.sendCode(target.id).catch(() => null);
        setBusy(null);
        if (isServerOk(res)) {
            setCodeSent(true);
            toast.success('Code sent', `Check the SMS on ${res.data.code?.sent_to ?? 'your phone'}.`);
        } else setErr(describeResponse(res, 'The code could not be sent.').message);
    };

    const confirm = async () => {
        if (!target) return;
        setBusy('switch');
        setErr(null);
        const res: any = await myEntitiesApi
            .switchTo(target.id, confirmWith === 'password' ? { password } : { code: code.trim() })
            .catch(() => null);
        if (!isServerOk(res)) {
            setBusy(null);
            setErr(describeResponse(res, 'Could not switch business.').message);
            return;
        }
        const access: string | undefined = res.data.switch?.tokens?.access;
        if (!access) {
            setBusy(null);
            setErr('The server did not return a new session. Please sign in again.');
            return;
        }
        try {
            // New session: the new business's roles, menus and settings load from these tokens.
            await login(access);
            toast.success('Switched', `You're now working in ${target.title}.`);
            onClose();
            router.replace('/(tabs)' as any);
        } catch (e: any) {
            setErr(e?.message || 'Could not start the new session.');
        } finally {
            setBusy(null);
        }
    };

    const ready = confirmWith === 'password' ? password.length > 0 : code.trim().length >= 6;
    const input = { flex: 1, height: 48, color: theme.text, fontFamily: theme.font.medium, fontSize: 16 } as const;

    return (
        <AdminSheet visible={!!target} onClose={onClose} title="Confirm it's you" subtitle={target ? `Switch to ${target.title}` : undefined} icon="key-outline" dismissible={!busy} width={460}>
            <View style={{ gap: 12 }}>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>
                    {confirmWith === 'password'
                        ? `Sign in again as ${email || 'yourself'} to switch. You'll get ${target?.title ?? 'this business'}'s menus and settings.`
                        : `Your account signs in with Google / Facebook, so we'll text a code to ${phoneHint ?? 'your phone'} instead.`}
                </Text>

                {confirmWith === 'password' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 12 }}>
                        <KeyRound size={16} color={theme.textMuted} />
                        <TextInput value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={theme.textMuted}
                            secureTextEntry={!show} autoCapitalize="none" autoComplete="current-password" textContentType="password"
                            onSubmitEditing={() => ready && !busy && void confirm()} style={input} />
                        <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
                            {show ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
                        </Pressable>
                    </View>
                ) : (
                    <View style={{ gap: 8 }}>
                        <SoftButton label={busy === 'send' ? 'Sending…' : codeSent ? 'Text me a new code' : 'Text me a code'} tone={codeSent ? 'neutral' : 'primary'} disabled={!!busy} onPress={() => void sendCode()} />
                        {codeSent ? (
                            <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" placeholderTextColor={theme.textMuted}
                                keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp"
                                style={{ height: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.bold, fontSize: 20, letterSpacing: 6 }} />
                        ) : null}
                    </View>
                )}

                {err ? <InlineNotice message={err} /> : null}
                <PrimaryCTA label={busy === 'switch' ? 'Switching…' : 'Sign in & switch'} icon={ArrowLeftRight} loading={busy === 'switch'} disabled={!ready || !!busy} onPress={() => void confirm()} />
            </View>
        </AdminSheet>
    );
}
