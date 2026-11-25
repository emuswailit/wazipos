// components/church/denomination/denominationShared.tsx
//
// useDenomination(): the denomination a head-office person is running (DenominationHome),
// remembered on this device when they run more than one (WaziPOS admins can open any).

import churchesApi, { type DenominationHome } from '@/api/churchesApi';
import { InlineNotice } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Loading, pointer } from '../churchShared';

const PICK_KEY = 'wazipos_denomination_pick';
let picked: string | null = null;

/** Open a given denomination next time a head-office screen loads (e.g. from the admin desk). */
export function pickDenomination(id: string) {
    picked = id;
}

export interface DenominationState {
    home: DenominationHome | null;
    org: string | null;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    pick: (id: string) => void;
    api: (action: string, data?: Record<string, any>) => Promise<any>;
}

export function useDenomination(): DenominationState {
    const { user } = useAuth() as any;
    const scope = String(user?.id || '');
    const [home, setHome] = useState<DenominationHome | null>(null);
    const [org, setOrg] = useState<string | null>(picked);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (want: string | null) => {
            setError(null);
            const res: any = await churchesApi.hq(want)('DenominationHome').catch(() => null);
            if (isServerOk(res)) {
                const h: DenominationHome = res.data.home;
                setHome(h);
                setOrg(h.organization.id);
                picked = h.organization.id;
                AsyncStorage.setItem(`${PICK_KEY}:${scope}`, h.organization.id).catch(() => undefined);
            } else setError(res ? describeResponse(res, 'Could not open the denomination.').message : "You're offline. Connect to manage the denomination.");
            setLoading(false);
        },
        [scope],
    );

    useEffect(() => {
        (async () => {
            const saved = picked ?? (await AsyncStorage.getItem(`${PICK_KEY}:${scope}`).catch(() => null));
            await load(saved || null);
        })();
    }, [load, scope]);

    const api = useMemo(() => churchesApi.hq(org), [org]);
    return {
        home,
        org,
        loading,
        error,
        reload: () => load(org),
        pick: (id: string) => {
            picked = id;
            setLoading(true);
            void load(id);
        },
        api,
    };
}

/** Loading / "not head office" / denomination switcher around a head-office screen. */
export function DenominationGate({ state, children }: { state: DenominationState; children: (home: DenominationHome) => React.ReactNode }) {
    const { theme } = useAuth();
    if (!state.home) {
        if (state.loading) return <Loading />;
        return (
            <View style={{ padding: 24 }}>
                <InlineNotice tone="warning" message={state.error || "You don't run any denomination on WaziPOS."} />
            </View>
        );
    }
    const list = state.home.organizations;
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {list.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 12 }} style={{ flexGrow: 0 }}>
                    {list.map((o) => {
                        const on = o.id === state.org;
                        return (
                            <Pressable key={o.id} onPress={() => !on && state.pick(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 12, height: 34, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surfaceAlt, ...pointer }}>
                                <Text style={{ color: on ? '#fff' : theme.text, fontFamily: theme.font.semibold, fontSize: 13 }} numberOfLines={1}>{o.title}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            ) : null}
            {state.error ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <InlineNotice tone="warning" message={state.error} />
                </View>
            ) : null}
            {children(state.home)}
        </View>
    );
}
