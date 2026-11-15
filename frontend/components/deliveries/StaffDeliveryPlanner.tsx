// components/deliveries/StaffDeliveryPlanner.tsx
//
// Seller staff making an order on someone's behalf (wholesaler -> retailer
// order, or a shop's counter/phone order): Pickup or Delivery. Delivery shows
// every priced option (own delivery person, delivery company, or person to the
// courier's office + courier) and lets staff name the delivery person now —
// optional; it can also be picked at dispatch. The chosen option's total is
// the delivery fee; the server re-prices it when the order is saved.

import deliveriesApi, { apiError, isOk, MODE_LABELS, type DeliveryAgent, type DeliveryOption } from '@/api/deliveriesApi';
import { useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useDeliveryAvailability } from './useDeliveryAvailability';

export type StaffFulfilment = 'PICKUP' | 'DELIVERY';

export interface StaffDeliveryState {
    method: StaffFulfilment;
    setMethod: (m: StaffFulfilment) => void;
    option: DeliveryOption | null;
    setOption: (o: DeliveryOption | null) => void;
    agentId: string | null;
    setAgentId: (id: string | null) => void;
    /** Delivery fee of the chosen option (0 for pickup). */
    fee: number;
    reset: () => void;
}

export function useStaffDelivery(): StaffDeliveryState {
    const [method, setMethodRaw] = useState<StaffFulfilment>('PICKUP');
    const [option, setOptionRaw] = useState<DeliveryOption | null>(null);
    const [agentId, setAgentId] = useState<string | null>(null);
    const setOption = useCallback((o: DeliveryOption | null) => {
        setOptionRaw(o);
        setAgentId(null);
    }, []);
    const setMethod = useCallback((m: StaffFulfilment) => {
        setMethodRaw(m);
        if (m === 'PICKUP') {
            setOptionRaw(null);
            setAgentId(null);
        }
    }, []);
    const reset = useCallback(() => {
        setMethodRaw('PICKUP');
        setOptionRaw(null);
        setAgentId(null);
    }, []);
    const fee = method === 'DELIVERY' && option ? Number(option.total) || 0 : 0;
    return { method, setMethod, option, setOption, agentId, setAgentId, fee, reset };
}

type Props = {
    state: StaffDeliveryState;
    /** Fetches the priced options; null while something is missing (see notReadyHint). */
    loadOptions: (() => Promise<any>) | null;
    /** Reload the options when this changes (items, buyer, destination). */
    optionsKey: string;
    /** Why options can't be priced yet (e.g. "Pick the retailer first"). */
    notReadyHint?: string;
    /** Shown above the options (e.g. the customer location picker). */
    destinationSlot?: React.ReactNode;
    pickupLabel?: string;
};

export function StaffDeliveryPlanner({ state, loadOptions, optionsKey, notReadyHint, destinationSlot, pickupLabel = 'Pickup' }: Props) {
    const { theme, border, chipBg } = useListTokens();
    const availability = useDeliveryAvailability({});
    const [options, setOptions] = useState<DeliveryOption[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Delivery is only for businesses with a location; fall back to pickup.
    useEffect(() => {
        if (!availability.loading && !availability.available && state.method === 'DELIVERY') state.setMethod('PICKUP');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availability.loading, availability.available, state.method]);

    const wantsDelivery = state.method === 'DELIVERY';
    useEffect(() => {
        if (!wantsDelivery || !loadOptions) {
            setOptions(null);
            setError(null);
            return;
        }
        let alive = true;
        setLoading(true);
        setError(null);
        const t = setTimeout(() => {
            loadOptions()
                .then((res: any) => {
                    if (!alive) return;
                    if (isOk(res)) {
                        const list: DeliveryOption[] = res.data?.delivery?.options ?? [];
                        setOptions(list);
                        // Keep the choice only if it is still offered (re-priced).
                        const still = state.option ? list.find((o) => o.key === state.option!.key) : null;
                        if (state.option && !still) state.setOption(null);
                        else if (still && still.total !== state.option?.total) state.setOption(still);
                    } else {
                        setOptions([]);
                        setError(apiError(res, 'Could not load delivery options.'));
                        state.setOption(null);
                    }
                })
                .catch((e: any) => alive && setError(e?.message || 'Could not reach the server.'))
                .finally(() => alive && setLoading(false));
        }, 350);
        return () => {
            alive = false;
            clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wantsDelivery, optionsKey, !!loadOptions]);

    const segment = (m: StaffFulfilment, label: string, icon: keyof typeof Ionicons.glyphMap, disabled = false) => {
        const active = state.method === m;
        return (
            <Pressable
                key={m}
                onPress={() => !disabled && state.setMethod(m)}
                disabled={disabled}
                className="flex-1 flex-row items-center justify-center gap-1.5 h-10 rounded-lg"
                style={{ backgroundColor: active ? theme.panel : 'transparent', opacity: disabled ? 0.4 : 1, borderWidth: active ? 1 : 0, borderColor: border }}
            >
                <Ionicons name={icon} size={15} color={active ? theme.primary : theme.textDark} />
                <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{label}</Text>
            </Pressable>
        );
    };

    return (
        <View style={{ gap: 10 }}>
            <View className="flex-row p-1 rounded-xl" style={{ backgroundColor: chipBg, gap: 4 }}>
                {segment('PICKUP', pickupLabel, 'storefront-outline')}
                {segment('DELIVERY', 'Delivery', 'bicycle-outline', !availability.available)}
            </View>
            {!availability.loading && !availability.available && availability.reason ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{availability.reason}</Text>
            ) : null}

            {wantsDelivery ? (
                <View style={{ gap: 8 }}>
                    {destinationSlot}
                    {!loadOptions ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{notReadyHint || 'Add items to see delivery options.'}</Text>
                    ) : loading && !options ? (
                        <View className="flex-row items-center gap-2">
                            <ActivityIndicator size="small" color={theme.primary} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Pricing delivery…</Text>
                        </View>
                    ) : error ? (
                        <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text>
                    ) : options && options.length === 0 ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            No delivery option reaches this destination. Add delivery persons, rates or courier partners in Delivery settings.
                        </Text>
                    ) : (
                        (options ?? []).map((opt) => <OptionCard key={opt.key} option={opt} active={state.option?.key === opt.key} onPress={() => state.setOption(opt)} />)
                    )}
                    {state.option ? <AgentChooser option={state.option} value={state.agentId} onChange={state.setAgentId} /> : null}
                </View>
            ) : null}
        </View>
    );
}

function OptionCard({ option, active, onPress }: { option: DeliveryOption; active: boolean; onPress: () => void }) {
    const { theme, border } = useListTokens();
    const courier = option.method === 'COURIER';
    const via = courier ? option.legs.find((l) => l.kind === 'TRANSIT')?.provider_title : option.legs[0]?.provider_title;
    return (
        <Pressable
            onPress={onPress}
            className="rounded-xl p-2.5"
            style={{ borderWidth: 1.5, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}0d` : 'transparent', gap: 4 }}
        >
            <View className="flex-row items-center gap-2">
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? theme.primary : theme.textDark} />
                <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                    {courier ? `Courier · ${via || 'courier'}` : `Direct · ${via || 'delivery'}`}
                </Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>KES {Number(option.total).toLocaleString()}</Text>
            </View>
            {option.legs.map((leg, i) => (
                <Text key={i} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, paddingLeft: 26 }} numberOfLines={2}>
                    {leg.label}
                    {leg.to_title ? ` (${leg.to_title})` : ''} · {leg.provider_title} · {leg.mode_label.toLowerCase()} · {Number(leg.distance_km).toLocaleString()} km · KES {Number(leg.cost).toLocaleString()}
                </Text>
            ))}
        </Pressable>
    );
}

/** Delivery persons of the option's first (non-courier) leg who use its mode. */
function AgentChooser({ option, value, onChange }: { option: DeliveryOption; value: string | null; onChange: (id: string | null) => void }) {
    const { theme, border } = useListTokens();
    const leg = useMemo(() => option.legs.find((l) => l.kind !== 'TRANSIT') ?? null, [option]);
    const [agents, setAgents] = useState<DeliveryAgent[] | null>(null);
    const [mine, setMine] = useState<string | null>(null);

    useEffect(() => {
        if (!leg) return;
        let alive = true;
        setAgents(null);
        // Own delivery persons first; if the provider is a partner company, theirs.
        deliveriesApi
            .getDeliveryAgents()
            .then(async (own: any) => {
                const ownAgents: DeliveryAgent[] = isOk(own) ? own.data?.agents ?? [] : [];
                const ownEntity = ownAgents[0]?.entity ?? null;
                if (alive) setMine(ownEntity);
                let list = ownAgents;
                if (leg.provider && ownEntity !== leg.provider) {
                    const res: any = await deliveriesApi.getDeliveryAgents(leg.provider);
                    list = isOk(res) ? res.data?.agents ?? [] : [];
                }
                if (alive) setAgents(list.filter((a) => a.is_active && a.mode === leg.mode));
            })
            .catch(() => alive && setAgents([]));
        return () => {
            alive = false;
        };
    }, [leg]);

    if (!leg) return null;
    return (
        <View style={{ gap: 6 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>
                DELIVERY PERSON · {String(leg.provider_title || '').toUpperCase()} · {(MODE_LABELS as any)[leg.mode]?.toUpperCase?.() ?? leg.mode_label.toUpperCase()}
                {mine && leg.provider !== mine ? ' (PARTNER)' : ''}
            </Text>
            {agents === null ? (
                <ActivityIndicator size="small" color={theme.primary} />
            ) : agents.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    No active delivery person for this mode — pick one at dispatch, or add one in Delivery settings.
                </Text>
            ) : (
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {[{ id: null as string | null, name: 'Decide at dispatch' }, ...agents.map((a) => ({ id: a.id as string | null, name: a.name }))].map((a) => {
                        const active = value === a.id;
                        return (
                            <Pressable
                                key={a.id ?? 'later'}
                                onPress={() => onChange(a.id)}
                                className="rounded-full px-3 h-8 justify-center"
                                style={{ borderWidth: 1, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}14` : 'transparent' }}
                            >
                                <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{a.name}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}
        </View>
    );
}
