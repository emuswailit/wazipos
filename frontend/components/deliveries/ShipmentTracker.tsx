// components/deliveries/ShipmentTracker.tsx
//
// Delivery of one order (a retailer order or a customer order), for both sides.
//   Buyer (retailer / customer):  tracking number, the delivery CODE to give whoever
//                      delivers, and each leg's progress.
//   Seller (wholesaler):
//     - paid, not dispatched yet  -> Dispatch: allocate the in-town leg to one of
//       your delivery persons (if the distance and weight allow) or a rider —
//       yours or a partner company's; it pays them their rate, the buyer's price
//       does not change;
//     - under way                 -> move legs on (LegActions) or reassign;
//     - waiting at the courier's office -> confirm collection with the buyer's code.

import deliveriesApi, { apiError, isOk, MODE_LABELS, type DeliveryAgent, type OrderLink, type Shipment, type ShipmentLeg, type AllocatableAgent } from '@/api/deliveriesApi';
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
                        onPick={async (choice) => {
                            const res: any = await deliveriesApi.dispatchOrder(link, choice.agent, { vehicle: choice.vehicle, dispatch_office: choice.dispatchOffice });
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
                    onPick={async (choice) => {
                        const res: any = await deliveriesApi.assignShipmentLeg(leg.id, choice.agent, choice.vehicle);
                        if (!isOk(res)) return apiError(res, 'Could not reassign.');
                        onChanged(res.data?.shipment);
                        return null;
                    }}
                />
            ) : null}
        </View>
    );
}

export interface AllocationChoice {
    agent: string;
    vehicle?: string;
    dispatchOffice?: string;
}

/**
 * Who takes this leg. The seller sees its own delivery persons and partners'
 * riders / drivers — with one of their fleet vehicles where they keep a fleet
 * (joining a trip already loading on it) — each with what the leg pays them and
 * why someone can't. Courier deliveries also offer the courier's dispatch offices
 * near the seller's premises. A partner company's staff see their own people.
 */
function AgentPicker({
    leg,
    sellerId,
    actionLabel,
    onPick,
}: {
    leg: ShipmentLeg;
    sellerId?: string;
    actionLabel: string;
    onPick: (choice: AllocationChoice) => Promise<string | null>;
}) {
    const { theme, border } = useListTokens();
    const [rows, setRows] = useState<{ key: string; agent: string; vehicle?: string; name: string; note?: string; ok: boolean; own?: boolean }[] | null>(null);
    const [offices, setOffices] = useState<{ id: string; title: string; distance_km: string; current: boolean }[]>([]);
    const [office, setOffice] = useState<string | undefined>(undefined);
    // The person named when the order was made (if any) is preselected.
    const [pick, setPick] = useState<string | null>(leg.agent ? `${leg.agent}|` : null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const fallback = () => {
            const partner = leg.provider && leg.provider !== sellerId ? leg.provider : undefined;
            return deliveriesApi.getDeliveryAgents(partner).then((res: any) => {
                if (!alive) return;
                if (isOk(res))
                    setRows(
                        (res.data?.agents ?? [])
                            .filter((a: DeliveryAgent) => a.is_active && a.mode === leg.mode)
                            .map((a: DeliveryAgent) => ({ key: `${a.id}|`, agent: a.id, name: a.name, ok: true, own: true })),
                    );
                else setError(apiError(res, 'Could not load delivery persons.'));
            });
        };
        deliveriesApi
            .getAllocatableAgents(leg.id)
            .then((res: any) => {
                if (!alive) return;
                if (!isOk(res)) return fallback();
                const data = res.data?.data ?? {};
                const list: AllocatableAgent[] = data.agents ?? [];
                setOffices(data.dispatch_offices ?? []);
                setRows(
                    list.map((r) => ({
                        key: `${r.agent}|${r.vehicle ?? ''}`,
                        agent: r.agent,
                        vehicle: r.vehicle ?? undefined,
                        name: `${r.name || r.phone || 'Delivery person'}${r.vehicle_label ? ` · ${r.vehicle_label}` : ''}`,
                        ok: r.ok,
                        own: r.own,
                        note: r.ok
                            ? `${r.mode_label}${r.own ? '' : ` · ${r.provider_title}`}${!r.own && r.km_away != null ? ` · ${Number(r.km_away).toLocaleString()} km ${r.live_location ? 'away' : 'from base'}` : ''} · KES ${Number(r.cost).toLocaleString()}${r.trip ? ' · joins the trip loading' : r.vehicle_on_trip ? ' · vehicle out now' : ''}`
                            : r.reason ?? undefined,
                    })),
                );
            })
            .catch(() => alive && setError('Could not reach the server.'));
        return () => {
            alive = false;
        };
    }, [leg.id, leg.provider, leg.mode, sellerId]);

    const submit = async () => {
        const row = rows?.find((r) => r.key === pick) ?? rows?.find((r) => pick && r.agent === pick.split('|')[0]);
        if (!row) return;
        setBusy(true);
        setError(null);
        const err = await onPick({ agent: row.agent, vehicle: row.vehicle, dispatchOffice: office });
        if (err) setError(err);
        setBusy(false);
    };

    const chip = (key: string, on: boolean, title: string, note: string | undefined, onPress: () => void, disabled = false) => (
        <Pressable
            key={key}
            disabled={disabled}
            onPress={onPress}
            className="rounded-xl px-3 py-1.5 justify-center"
            style={{ opacity: disabled ? 0.55 : 1, borderWidth: 1, borderColor: on ? theme.primary : border, backgroundColor: on ? `${theme.primary}14` : 'transparent' }}
        >
            <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{title}</Text>
            {note ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{note}</Text> : null}
        </Pressable>
    );

    return (
        <View style={{ gap: 6 }}>
            {offices.length ? (
                <>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>DROP AT THE COURIER'S OFFICE</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                        {offices.map((o) => chip(o.id, office ? office === o.id : o.current, o.title, `${Number(o.distance_km).toLocaleString()} km from you`, () => setOffice(o.id)))}
                    </View>
                </>
            ) : null}
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>
                WHO TAKES IT · {MODE_LABELS[leg.mode].toUpperCase()} PLANNED
            </Text>
            {rows === null ? (
                <ActivityIndicator size="small" color={theme.primary} />
            ) : rows.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    No one can take this right now: none of your people or vehicles fit, and no WaziPOS rider or driver is available nearby. Add people or fleet vehicles in Delivery settings, or try again shortly.
                </Text>
            ) : (
                <>
                    {[
                        { title: 'YOUR PEOPLE & FLEET', list: rows.filter((r) => r.own) },
                        { title: 'WAZIPOS RIDERS & DRIVERS NEAR YOU', list: rows.filter((r) => !r.own) },
                    ]
                        .filter((g) => g.list.length)
                        .map((g) => (
                            <View key={g.title} style={{ gap: 4 }}>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 10.5, letterSpacing: 0.4 }}>{g.title}</Text>
                                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                                    {g.list.map((r) => chip(r.key, pick === r.key, r.name, r.note, () => setPick(r.key), !r.ok))}
                                </View>
                            </View>
                        ))}
                </>
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
