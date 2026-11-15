// components/deliveries/ShipmentTracker.tsx
//
// Delivery of one order (a retailer order or a customer order), for both sides.
//   Buyer (retailer / customer):  tracking number, the delivery CODE to give whoever
//                      delivers, and each leg's progress.
//   Seller (wholesaler):
//     - paid, not dispatched yet  -> Dispatch: pick a delivery person of the
//       provider (and mode) the buyer paid for;
//     - under way                 -> move legs on (LegActions) or reassign;
//     - waiting at the courier's office -> confirm collection with the buyer's code.

import deliveriesApi, { apiError, isOk, MODE_LABELS, type DeliveryAgent, type OrderLink, type Shipment, type ShipmentLeg } from '@/api/deliveriesApi';
import { SheetButton, formatDateTime, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { formatKES } from '@/components/retailers/retailerRequisitions/primitives';
import { LegActions } from './LegActions';

const STATUS_TEXT: Record<string, string> = {
    QUOTED: 'Waiting to be dispatched',
    CONFIRMED: 'Dispatched',
    IN_TRANSIT: 'On the way',
    AWAITING_PICKUP: 'Ready for collection at the courier office',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery failed',
    CANCELLED: 'Cancelled',
};

const LEG_TITLES: Record<string, string> = {
    LOCAL: 'Delivery to the shop',
    HANDOVER: "To the courier's office",
    TRANSIT: 'Courier to the destination office',
    LAST_MILE: 'Last mile',
};

const LEG_STATUS: Record<string, { text: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
    PENDING: { text: 'Not started', color: '#94a3b8', icon: 'ellipse-outline' },
    ASSIGNED: { text: 'Assigned', color: '#3b82f6', icon: 'person-circle-outline' },
    PICKED_UP: { text: 'Picked up', color: '#8b5cf6', icon: 'cube-outline' },
    HANDED_OVER: { text: 'Handed over', color: '#10b981', icon: 'checkmark-circle' },
    DELIVERED: { text: 'Delivered', color: '#10b981', icon: 'checkmark-circle' },
    FAILED: { text: 'Failed', color: '#f43f5e', icon: 'close-circle' },
    CANCELLED: { text: 'Cancelled', color: '#94a3b8', icon: 'remove-circle-outline' },
};

interface Props {
    /** The order this delivery belongs to. */
    link: OrderLink;
    /** Changes when the order changes (e.g. its "updated" time): reloads the delivery. */
    version?: string | null;
    /** wholesaler = the seller (also a retailer selling to customers); retailer = the buyer. */
    viewer: 'retailer' | 'wholesaler';
    /** Order paid (dispatch needs it). */
    paid: boolean;
    /** Reload the order list (status / delivered_at changed). */
    onOrderChanged: () => void;
}

export function ShipmentTracker({ link, version, viewer, paid, onOrderChanged }: Props) {
    const linkKey = JSON.stringify(link);
    const { theme, border, chipBg } = useListTokens();
    const isSeller = viewer === 'wholesaler';
    const [shipment, setShipment] = useState<Shipment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res: any = await deliveriesApi.getShipment(JSON.parse(linkKey));
            if (isOk(res)) setShipment(res.data?.shipment ?? null);
            else setError(apiError(res, 'Could not load the delivery.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, [linkKey]);

    // Reload when the order changes (payment, dispatch, delivery pushed live).
    useEffect(() => {
        void load();
    }, [load, version]);

    const changed = (next?: Shipment) => {
        if (next) setShipment(next);
        else void load();
        onOrderChanged();
    };

    if (loading) {
        return (
            <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Loading delivery…</Text>
            </View>
        );
    }
    if (error) return <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text>;
    if (!shipment) return null;

    const firstPersonLeg = shipment.legs.find((l) => l.kind !== 'TRANSIT');

    return (
        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 10 }}>
            <View className="flex-row items-center gap-2">
                <Ionicons name="navigate-circle-outline" size={18} color={theme.primary} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{STATUS_TEXT[shipment.status] ?? shipment.status}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        {shipment.method === 'COURIER' ? 'By courier' : 'Direct delivery'} · KES {formatKES(shipment.total_cost)}
                        {shipment.tracking_number ? ` · ${shipment.tracking_number}` : ''}
                    </Text>
                </View>
            </View>

            {/* The buyer's code: they give it to whoever hands the goods over. */}
            {!isSeller && shipment.delivery_code && shipment.status !== 'DELIVERED' ? (
                <View className="rounded-xl px-3 py-2.5 items-center" style={{ backgroundColor: `${theme.primary}10` }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10.5, letterSpacing: 0.6 }}>YOUR DELIVERY CODE</Text>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 26, letterSpacing: 6 }}>{shipment.delivery_code}</Text>
                    <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        Give it only when you have the goods in hand.
                    </Text>
                </View>
            ) : null}

            {/* Legs */}
            <View style={{ gap: 8 }}>
                {shipment.legs.map((leg) => (
                    <LegRow key={leg.id} leg={leg} isSeller={isSeller} shipmentActive={['CONFIRMED', 'IN_TRANSIT'].includes(shipment.status)} onChanged={changed} chipBg={chipBg} />
                ))}
            </View>

            {/* Seller: dispatch once paid */}
            {isSeller && shipment.status === 'QUOTED' && firstPersonLeg ? (
                paid ? (
                    <AgentPicker
                        leg={firstPersonLeg}
                        sellerId={shipment.entity}
                        actionLabel="Dispatch"
                        onPick={async (agentId) => {
                            const res: any = await deliveriesApi.dispatchOrder(link, agentId);
                            if (!isOk(res)) return apiError(res, 'Could not dispatch the order.');
                            changed(res.data?.shipment);
                            return null;
                        }}
                    />
                ) : (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Dispatch once the order is paid.</Text>
                )
            ) : null}

            {/* Seller / courier: buyer collects at the destination office */}
            {isSeller && shipment.status === 'AWAITING_PICKUP' ? <CollectionConfirm shipmentId={shipment.id} onDone={changed} /> : null}

            {shipment.delivered_at ? (
                <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 12.5 }}>Delivered · {formatDateTime(shipment.delivered_at)}</Text>
            ) : null}
        </View>
    );
}

function LegRow({
    leg,
    isSeller,
    shipmentActive,
    onChanged,
    chipBg,
}: {
    leg: ShipmentLeg;
    isSeller: boolean;
    shipmentActive: boolean;
    onChanged: (s?: Shipment) => void;
    chipBg: string;
}) {
    const { theme } = useListTokens();
    const [open, setOpen] = useState(false);
    const st = LEG_STATUS[leg.status] ?? LEG_STATUS.PENDING;
    const who = leg.kind === 'TRANSIT' ? leg.provider_title : leg.agent_name ? `${leg.agent_name} · ${leg.provider_title}` : leg.provider_title;
    const where = leg.kind === 'TRANSIT'
        ? `${leg.origin_collection_point_title ?? ''} → ${leg.destination_collection_point_title ?? ''}`
        : leg.destination_collection_point_title ?? null;
    const canAct = isSeller && shipmentActive && ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(leg.status);
    const canReassign = isSeller && shipmentActive && leg.kind !== 'TRANSIT' && ['PENDING', 'ASSIGNED'].includes(leg.status);

    return (
        <View className="rounded-xl p-2.5" style={{ backgroundColor: chipBg, gap: 6 }}>
            <View className="flex-row items-start gap-2">
                <Ionicons name={st.icon} size={18} color={st.color} style={{ marginTop: 1 }} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{LEG_TITLES[leg.kind] ?? leg.kind}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={2}>
                        {[who, MODE_LABELS[leg.mode], `${Number(leg.distance_km).toLocaleString()} km`, where].filter(Boolean).join(' · ')}
                    </Text>
                    {leg.waybill_number ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>Waybill {leg.waybill_number}</Text>
                    ) : null}
                </View>
                <View className="items-end">
                    <Text style={{ color: st.color, fontFamily: theme.font.bold, fontSize: 11.5 }}>{st.text}</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>KES {formatKES(leg.cost)}</Text>
                </View>
            </View>
            {canAct || canReassign ? (
                <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6}>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{open ? 'Hide actions' : 'Update this leg'}</Text>
                </Pressable>
            ) : null}
            {open && canAct ? <LegActions leg={leg} onChanged={onChanged} /> : null}
            {open && canReassign ? (
                <AgentPicker
                    leg={leg}
                    actionLabel="Reassign"
                    onPick={async (agentId) => {
                        const res: any = await deliveriesApi.assignShipmentLeg(leg.id, agentId);
                        if (!isOk(res)) return apiError(res, 'Could not reassign.');
                        onChanged(res.data?.shipment);
                        return null;
                    }}
                />
            ) : null}
        </View>
    );
}

/** Delivery persons of the leg's provider who use the planned mode. */
function AgentPicker({
    leg,
    sellerId,
    actionLabel,
    onPick,
}: {
    leg: ShipmentLeg;
    sellerId?: string;
    actionLabel: string;
    onPick: (agentId: string) => Promise<string | null>;
}) {
    const { theme, border } = useListTokens();
    const [agents, setAgents] = useState<DeliveryAgent[] | null>(null);
    const [pick, setPick] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        // Own staff when the provider is the seller; otherwise the partner company's.
        const partner = leg.provider && leg.provider !== sellerId ? leg.provider : undefined;
        deliveriesApi
            .getDeliveryAgents(partner)
            .then((res: any) => {
                if (!alive) return;
                if (isOk(res)) setAgents((res.data?.agents ?? []).filter((a: DeliveryAgent) => a.is_active && a.mode === leg.mode));
                else setError(apiError(res, 'Could not load delivery persons.'));
            })
            .catch(() => alive && setError('Could not reach the server.'));
        return () => {
            alive = false;
        };
    }, [leg.provider, leg.mode, sellerId]);

    const submit = async () => {
        if (!pick) return;
        setBusy(true);
        setError(null);
        const err = await onPick(pick);
        if (err) setError(err);
        setBusy(false);
    };

    return (
        <View style={{ gap: 6 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>
                {leg.provider_title?.toUpperCase()} · {MODE_LABELS[leg.mode].toUpperCase()}
            </Text>
            {agents === null ? (
                <ActivityIndicator size="small" color={theme.primary} />
            ) : agents.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    No active delivery person using {MODE_LABELS[leg.mode].toLowerCase()}. Add one in Delivery settings.
                </Text>
            ) : (
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {agents.map((a) => (
                        <Pressable
                            key={a.id}
                            onPress={() => setPick(a.id)}
                            className="rounded-full px-3 h-9 justify-center"
                            style={{ borderWidth: 1, borderColor: pick === a.id ? theme.primary : border, backgroundColor: pick === a.id ? `${theme.primary}14` : 'transparent' }}
                        >
                            <Text style={{ color: pick === a.id ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{a.name}</Text>
                        </Pressable>
                    ))}
                </View>
            )}
            <SheetButton label={actionLabel} icon="paper-plane-outline" onPress={submit} loading={busy} disabled={!pick} grow />
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
        </View>
    );
}

function CollectionConfirm({ shipmentId, onDone }: { shipmentId: string; onDone: (s?: Shipment) => void }) {
    const { theme, border } = useListTokens();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await deliveriesApi.confirmShipmentCollected(shipmentId, code.trim());
            if (isOk(res)) onDone(res.data?.shipment);
            else setError(apiError(res, 'Could not confirm collection.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <View style={{ gap: 6 }}>
            <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Buyer's 6-digit code"
                placeholderTextColor={theme.textDark}
                keyboardType="number-pad"
                maxLength={6}
                className="rounded-xl px-3"
                style={{ height: 42, borderWidth: 1, borderColor: border, color: theme.text, fontFamily: theme.font.bold, fontSize: 14, letterSpacing: 4 }}
            />
            <SheetButton label="Confirm collected" icon="checkmark-done" onPress={submit} loading={busy} disabled={code.trim().length < 6} grow />
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
        </View>
    );
}
