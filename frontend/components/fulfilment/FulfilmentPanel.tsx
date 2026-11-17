// components/fulfilment/FulfilmentPanel.tsx
//
// One paid order's road from the shelf to the buyer:
//   Waiting -> Preparing -> Packed -> Ready -> Collected (pickup) | Dispatch (delivery)
//
// Seller: moves it along — who prepared / packed it (any employee), package
// count and weight, then "Ready". Pickup orders are handed over with the
// collector's details and the buyer's pickup code (required for customer
// orders). Delivery orders are dispatched from the Delivery section once Ready.
// Buyer: sees the progress and, while it waits at the counter, the pickup code.

import { apiError, isOk, type OrderLink } from '@/api/deliveriesApi';
import fulfilmentApi, { STAGE_LABELS, type Fulfilment, type FulfilmentStage } from '@/api/fulfilmentApi';
import { formatDateTime, SheetButton, useListTokens } from '@/components/common/listScreen';
import { useAuth } from '@/context/AuthContext';
import { useEmployeesSync } from '@/context/EmployeesSyncContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

type Props = {
    link: OrderLink;
    viewer: 'seller' | 'buyer';
    /** The buyer collects (no delivery). */
    pickup: boolean;
    paid: boolean;
    /** Changes when the order changes (reloads the fulfilment). */
    version?: string;
    onChanged?: () => void;
};

const STEPS: { stage: FulfilmentStage; icon: keyof typeof Ionicons.glyphMap }[] = [
    { stage: 'PREPARING', icon: 'construct-outline' },
    { stage: 'PACKED', icon: 'cube-outline' },
    { stage: 'READY', icon: 'checkmark-done-outline' },
];
const ORDER: FulfilmentStage[] = ['PENDING', 'PREPARING', 'PACKED', 'READY', 'COLLECTED'];
const reached = (current: FulfilmentStage, step: FulfilmentStage) => ORDER.indexOf(current) >= ORDER.indexOf(step);

export function FulfilmentPanel({ link, viewer, pickup, paid, version, onChanged }: Props) {
    const { theme, border, chipBg } = useListTokens();
    const isSeller = viewer === 'seller';
    const isCustomer = 'customer_order' in link;

    const [f, setF] = useState<Fulfilment | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null); // Added to catch load failures

    const linkKey = JSON.stringify(link);

    const load = useCallback(async () => {
        try {
            const res: any = await fulfilmentApi.get(JSON.parse(linkKey));
            if (isOk(res)) {
                setF(res.data?.fulfilment ?? null);
                setLoadError(null);
            } else {
                setLoadError(apiError(res, 'Could not load preparation status.'));
            }
        } catch (e: any) {
            setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            setLoading(false);
        }
    }, [linkKey]);

    useEffect(() => {
        void load();
    }, [load, version]);

    const run = async (fn: () => Promise<any>, fallback: string) => {
        setBusy(true);
        setError(null);
        try {
            const res: any = await fn();
            if (!isOk(res)) {
                setError(apiError(res, fallback));
                return false;
            }
            setF(res.data?.fulfilment ?? null);
            setLoadError(null); // Clear any previous load errors since we now have fresh data
            onChanged?.();
            return true;
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
            return false;
        } finally {
            setBusy(false);
        }
    };

    const [resending, setResending] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const resendCode = async () => {
        setResending(true);
        setError(null);
        setNotice(null);
        try {
            const res: any = await fulfilmentApi.resendPickupCode(link);
            if (!isOk(res)) {
                setError(apiError(res, 'Could not send the pickup code.'));
                return;
            }
            setNotice(String(res.data?.response_message || 'Pickup code sent.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setResending(false);
        }
    };

    const stage: FulfilmentStage = f?.stage ?? 'PENDING';

    if (loading) {
        return (
            <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Loading preparation…</Text>
            </View>
        );
    }

    // Added: Show UI error if the initial fetch failed, instead of assuming PENDING
    if (loadError) {
        return (
            <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 10 }}>
                <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{loadError}</Text>
                <SheetButton
                    label="Try again"
                    icon="refresh"
                    onPress={() => {
                        setLoading(true);
                        void load();
                    }}
                />
            </View>
        );
    }

    const finalStep = pickup ? 'Collected' : 'Dispatch';
    const muted = { color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 } as const;

    return (
        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 10 }}>
            {/* Progress */}
            <View className="flex-row items-center" style={{ gap: 4 }}>
                {STEPS.map((s, i) => {
                    const done = reached(stage, s.stage);
                    return (
                        <React.Fragment key={s.stage}>
                            <View className="items-center" style={{ flex: 1, gap: 3 }}>
                                <View
                                    className="w-8 h-8 rounded-full items-center justify-center"
                                    style={{ backgroundColor: done ? theme.primary : chipBg }}
                                >
                                    <Ionicons name={s.icon} size={15} color={done ? '#fff' : theme.textDark} />
                                </View>
                                <Text style={{ color: done ? theme.text : theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>{STAGE_LABELS[s.stage]}</Text>
                            </View>
                            <View style={{ height: 2, flex: 0.5, backgroundColor: reached(stage, STEPS[i + 1]?.stage ?? 'COLLECTED') ? theme.primary : border }} />
                        </React.Fragment>
                    );
                })}
                <View className="items-center" style={{ flex: 1, gap: 3 }}>
                    <View
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: stage === 'COLLECTED' ? '#10b981' : chipBg }}
                    >
                        <Ionicons name={pickup ? 'hand-left-outline' : 'bicycle-outline'} size={15} color={stage === 'COLLECTED' ? '#fff' : theme.textDark} />
                    </View>
                    <Text style={{ color: stage === 'COLLECTED' ? theme.text : theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>{finalStep}</Text>
                </View>
            </View>

            {/* Who did what */}
            {f ? (
                <View style={{ gap: 2 }}>
                    {f.prepared_by_name ? <Text style={muted}>Prepared by {f.prepared_by_name}{f.preparing_at ? ` · ${formatDateTime(f.preparing_at)}` : ''}</Text> : null}
                    {f.packed_by_name ? (
                        <Text style={muted}>
                            Packed by {f.packed_by_name} · {f.package_count} package{f.package_count === 1 ? '' : 's'}
                            {f.package_weight_kg ? ` · ${Number(f.package_weight_kg)} kg` : ''}
                            {f.packed_at ? ` · ${formatDateTime(f.packed_at)}` : ''}
                        </Text>
                    ) : null}
                    {f.ready_at ? <Text style={muted}>Ready · {formatDateTime(f.ready_at)}</Text> : null}
                    {f.collected_at ? (
                        <Text style={{ ...muted, color: '#10b981', fontFamily: theme.font.bold }}>
                            Collected by {f.collector_name}
                            {f.collector_phone ? ` (${f.collector_phone})` : ''}
                            {f.collector_id_number ? ` · ID ${f.collector_id_number}` : ''} · {formatDateTime(f.collected_at)}
                            {f.handed_over_by_name ? ` · handed over by ${f.handed_over_by_name}` : ''}
                            {f.code_verified ? ' · code verified' : ''}
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* Buyer */}
            {!isSeller ? (
                stage === 'READY' && pickup && f?.pickup_code ? (
                    <View className="rounded-xl px-3 py-2.5 items-center" style={{ backgroundColor: `${theme.primary}10` }}>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10.5, letterSpacing: 0.6 }}>READY FOR COLLECTION · PICKUP CODE</Text>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 26, letterSpacing: 6 }}>{f.pickup_code}</Text>
                        <Text className="text-center" style={muted}>
                            Give it (or send it with whoever collects) only when the goods are handed over.
                        </Text>
                    </View>
                ) : stage === 'PENDING' ? (
                    <Text style={muted}>{paid ? 'Waiting to be prepared.' : 'Preparation starts once the order is paid.'}</Text>
                ) : null
            ) : null}

            {/* Seller actions */}
            {isSeller ? (
                !paid ? (
                    <Text style={muted}>Prepare the order once it is paid.</Text>
                ) : stage === 'PENDING' ? (
                    <StaffStep
                        label="Start preparing"
                        icon="construct-outline"
                        who="Who is preparing it?"
                        busy={busy}
                        onSubmit={(userId) => run(() => fulfilmentApi.startPreparing(link, userId), 'Could not start preparing.')}
                    />
                ) : stage === 'PREPARING' ? (
                    <PackStep busy={busy} onSubmit={(data) => run(() => fulfilmentApi.markPacked(link, data), 'Could not mark it packed.')} />
                ) : stage === 'PACKED' ? (
                    <View style={{ gap: 6 }}>
                        <Text style={muted}>
                            {pickup
                                ? 'Put it at the counter, then mark it ready — the buyer gets their pickup code.'
                                : 'Move it to dispatch, then mark it ready — you can then assign a delivery person.'}
                        </Text>
                        <SheetButton
                            label={pickup ? 'Ready for collection' : 'Ready for dispatch'}
                            icon="checkmark-done-outline"
                            loading={busy}
                            onPress={() => void run(() => fulfilmentApi.markReady(link), 'Could not mark it ready.')}
                        />
                    </View>
                ) : stage === 'READY' && pickup ? (
                    <View style={{ gap: 8 }}>
                        <CollectStep
                            codeRequired={isCustomer}
                            busy={busy}
                            onSubmit={(data) => run(() => fulfilmentApi.confirmCollection(link, data), 'Could not record the collection.')}
                        />
                        {/* The customer lost or never got the SMS: send the same code again. */}
                        <SheetButton
                            label="Resend pickup code"
                            icon="chatbubble-ellipses-outline"
                            variant="secondary"
                            loading={resending}
                            loadingLabel="Sending…"
                            disabled={busy}
                            onPress={() => void resendCode()}
                        />
                        {notice ? <Text style={{ color: '#10b981', fontFamily: theme.font.medium, fontSize: 12 }}>{notice}</Text> : null}
                    </View>
                ) : stage === 'READY' ? (
                    <Text style={muted}>Ready — assign a delivery person in the Delivery section to dispatch it.</Text>
                ) : null
            ) : null}

            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{error}</Text> : null}
        </View>
    );
}

/* ------------------------------------------------------------- staff picker */

function StaffChips({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
    const { theme, border } = useListTokens();
    const { user } = useAuth() as any;
    const { employeesList } = useEmployeesSync();
    const people = useMemo(() => {
        const seen = new Set<string>();
        return (employeesList ?? [])
            .filter((e: any) => e?.user_id && String(e.user_id) !== String(user?.id) && String(e.is_active ?? 'true').toLowerCase() !== 'false')
            .filter((e: any) => (seen.has(String(e.user_id)) ? false : (seen.add(String(e.user_id)), true)))
            .map((e: any) => ({ id: String(e.user_id), name: e.user_title || e.title || 'Employee' }));
    }, [employeesList, user?.id]);

    const chip = (id: string | null, label: string) => {
        const active = value === id;
        return (
            <Pressable
                key={id ?? 'me'}
                onPress={() => onChange(id)}
                className="px-3 h-8 rounded-full items-center justify-center"
                style={{ borderWidth: 1, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}14` : 'transparent' }}
            >
                <Text style={{ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{label}</Text>
            </Pressable>
        );
    };

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {chip(null, 'Me')}
            {people.map((p) => chip(p.id, p.name))}
        </ScrollView>
    );
}

function StaffStep({
    label,
    icon,
    who,
    busy,
    onSubmit,
}: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    who: string;
    busy: boolean;
    onSubmit: (userId: string | null) => Promise<boolean>;
}) {
    const { theme } = useListTokens();
    const [person, setPerson] = useState<string | null>(null);
    return (
        <View style={{ gap: 8 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>{who.toUpperCase()}</Text>
            <StaffChips value={person} onChange={setPerson} />
            <SheetButton label={label} icon={icon} loading={busy} onPress={() => void onSubmit(person)} />
        </View>
    );
}

/* ------------------------------------------------------------- inputs */

function Field({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
}: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'decimal-pad';
}) {
    const { theme, border, inputBg } = useListTokens();
    return (
        <View style={{ gap: 4, flex: 1, minWidth: 140 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.textDark}
                keyboardType={keyboardType}
                className="rounded-xl px-3 h-10"
                style={{ borderWidth: 1, borderColor: border, backgroundColor: inputBg, color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}
            />
        </View>
    );
}

function PackStep({
    busy,
    onSubmit,
}: {
    busy: boolean;
    onSubmit: (data: { packer?: string | null; package_count?: number; package_weight_kg?: string }) => Promise<boolean>;
}) {
    const { theme } = useListTokens();
    const [packer, setPacker] = useState<string | null>(null);
    const [count, setCount] = useState('1');
    const [weight, setWeight] = useState('');
    return (
        <View style={{ gap: 8 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>WHO PACKED IT?</Text>
            <StaffChips value={packer} onChange={setPacker} />
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Field label="Packages" value={count} onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" />
                <Field label="Weight (kg, optional)" value={weight} onChangeText={(v) => setWeight(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
            </View>
            <SheetButton
                label="Mark packed"
                icon="cube-outline"
                loading={busy}
                onPress={() => void onSubmit({ packer, package_count: Number(count) || 1, package_weight_kg: weight || undefined })}
            />
        </View>
    );
}

function CollectStep({
    codeRequired,
    busy,
    onSubmit,
}: {
    codeRequired: boolean;
    busy: boolean;
    onSubmit: (data: { collector_name: string; collector_phone?: string; collector_id_number?: string; pickup_code?: string }) => Promise<boolean>;
}) {
    const { theme } = useListTokens();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [idNo, setIdNo] = useState('');
    const [code, setCode] = useState('');
    const canSubmit = !!name.trim() && (!codeRequired || code.trim().length > 0);
    return (
        <View style={{ gap: 8 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                Hand it over: record who collected it{codeRequired ? ' and the pickup code the customer received' : ' (the pickup code is optional)'}.
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Field label="Collected by" value={name} onChangeText={setName} placeholder="Full name" />
                <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="07…" keyboardType="phone-pad" />
            </View>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Field label="ID number (optional)" value={idNo} onChangeText={setIdNo} />
                <Field label={codeRequired ? 'Pickup code' : 'Pickup code (optional)'} value={code} onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" />
            </View>
            <SheetButton
                label="Confirm collection"
                icon="hand-left-outline"
                loading={busy}
                disabled={!canSubmit}
                onPress={() =>
                    void onSubmit({
                        collector_name: name.trim(),
                        collector_phone: phone.trim() || undefined,
                        collector_id_number: idNo.trim() || undefined,
                        pickup_code: code.trim() || undefined,
                    })
                }
            />
        </View>
    );
}