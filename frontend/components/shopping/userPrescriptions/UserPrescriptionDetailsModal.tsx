// components/shopping/userPrescriptions/UserPrescriptionDetailsModal.tsx
//
// Customer's prescription: image, digitized medicines and the quotation of the
// ONE pharmacy handling it. The customer picks which medicines to buy (and,
// where partial purchase is allowed, how many: the rest can be bought later)
// and pays by mobile money. Unless the
// pharmacy insists on collection in person, the customer chooses collection
// (free) or delivery (they pay the shipping). After a payment the medicines go
// on the dosing schedule (/medications) and reminders are set: dose reminders
// 60 and 30 minutes before each dose, and — for partial purchases — calendar
// reminders 7, 3 and 1 day(s) before the medicine runs out.
// A digitized prescription that has no
// pharmacy yet can be sent by its owner to exactly ONE pharmacy ("Send to a
// pharmacy"); once it has a pharmacy it can't be sent anywhere else.

import { customerRxClient } from '@/api/retailerPrescriptionsApi';
import RecordPaymentModal from '@/components/common/RecordPaymentModal';
import { ForwardForQuotationSheet } from '@/components/retailers/retailerPrescriptions/ForwardForQuotationSheet';
import {
    allowsPartial,
    FOLLOW_UP_ADVICE,
    isPaidQuotation,
    itemTitle,
    kes,
    purchasesOf,
    quotationsOf,
    type Quotation,
    type QuoteLine,
} from '@/components/retailers/retailerPrescriptions/prescriptionsConfig';
import { useAuth } from '@/context/AuthContext';
import { PRESCRIPTION_ORDER_PAYMENT_CONFIG, type RecordPaymentConfig } from '@/hooks/useRecordPayment';
import { MEDICATIONS_ROUTE, syncMedicationReminders } from '@/utils/medicationReminders';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import type { PrescriptionNormalized } from './UserPrescriptionsList';
import { resolveImage } from './UserPrescriptionsWebView';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Fulfilment = 'PICKUP' | 'DELIVERY';

/** Priced checkout for one pharmacy (backend: PreviewPrescriptionCheckout). */
interface CheckoutPreview {
    delivery_method?: Fulfilment;
    items_total?: string;
    shipping_cost?: string;
    total?: string;
    /** What delivery would add, when the customer may choose it. */
    delivery_cost?: string | null;
    distance_km?: string | null;
    delivery_available?: boolean;
    delivery_error?: string | null;
    error?: string;
}

/** How the patient gets the medicines from this pharmacy. */
function fulfilmentText(q: Quotation): string {
    if (q.pickup_required) return `Collect in person at the pharmacy${q.pickup_reason ? `: ${q.pickup_reason}` : ''}. No delivery fee.`;
    if (q.delivery_available) return 'Delivery or collection: you choose when paying. Delivery adds shipping.';
    return 'Collect in person at the pharmacy';
}

/** Units of a medicine bought from this quotation. */
const boughtFrom = (q: Quotation, itemId: string) =>
    purchasesOf(q).reduce((n, p) => n + p.lines.filter((l) => String(l.prescription_item) === String(itemId)).reduce((m, l) => m + (Number(l.quantity) || 0), 0), 0);

interface Props {
    item: PrescriptionNormalized | null;
    onClose: () => void;
    onProceedToDispense?: (item: PrescriptionNormalized) => void;
    /** After a payment: refresh this prescription. */
    onChanged?: () => void;
    /** After sending it to a pharmacy: the updated prescription. */
    onForwarded?: (prescription: any) => void;
}

/** One chosen offer per medicine. */
interface Pick {
    quotationId: string;
    lineId: string;
    quantity: number;
}

export function UserPrescriptionDetailsModal({ item, onClose, onProceedToDispense, onChanged, onForwarded }: Props) {
    const { theme } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const [activeTab, setActiveTab] = useState<'image' | 'details'>('details');
    /** Chosen fulfilment per quotation (default: collect). */
    const [methods, setMethods] = useState<Record<string, Fulfilment>>({});
    const [previews, setPreviews] = useState<Record<string, CheckoutPreview>>({});
    const [pricing, setPricing] = useState(false);
    const [reminderNote, setReminderNote] = useState<string | null>(null);
    const paidRef = useRef(false);
    const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
    const [picks, setPicks] = useState<Record<string, Pick>>({});
    const [payingQuotation, setPayingQuotation] = useState<Quotation | null>(null);
    const [forwardOpen, setForwardOpen] = useState(false);

    useEffect(() => {
        setPicks({});
        setMethods({});
        setPreviews({});
        setReminderNote(null);
    }, [item?.id]);

    const items: any[] = useMemo(() => (item as any)?.prescription_items ?? (item as any)?.items ?? [], [item]);
    const quotations = useMemo(() => quotationsOf(item), [item]);
    const quoted = quotations.filter((q) => q.status === 'QUOTED' || q.status === 'CHECKOUT' || q.status === 'FULFILLED');
    /** Every paid purchase (each its own quotation + order), newest first. */
    const purchases = useMemo(
        () =>
            quotations
                .flatMap((q) => purchasesOf(q).map((p) => ({ ...p, entity_title: q.entity_title })))
                .sort((a, b) => String(b.paid_at || b.created || '').localeCompare(String(a.paid_at || a.created || ''))),
        [quotations]
    );
    const requested = quotations.filter((q) => q.status === 'REQUESTED');

    /** Offers for a medicine from quotations the customer can still buy from. */
    const offersFor = useCallback(
        (itemId: string) =>
            quoted
                .filter((q) => !isPaidQuotation(q))
                .map((q) => ({ quotation: q, line: q.lines.find((l) => String(l.prescription_item) === String(itemId)) }))
                .filter((o): o is { quotation: Quotation; line: QuoteLine } => !!o.line),
        [quoted]
    );

    /** A medicine still to buy (prescribed quantity not yet bought). */
    const stillToBuy = (med: any) => {
        const required = Number(med?.required_unit_quantity) || 0;
        return !required || (Number(med?.bought_quantity) || 0) < required;
    };
    const defaultPick = (med: any, quotation: Quotation, line: QuoteLine): Pick => {
        const remaining = remainingFor(med);
        return { quotationId: quotation.id, lineId: line.id, quantity: allowsPartial(med) ? Math.max(1, Math.min(line.quantity, remaining || line.quantity)) : line.quantity };
    };

    // One pharmacy handles the prescription, so there's nothing to compare:
    // pre-select every quoted medicine still to buy, so the Pay button shows
    // straight away. The customer can still untick any of them. Runs once per
    // prescription (and again after a payment, for what's left).
    const autoPickedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!item?.id || autoPickedRef.current === String(item.id)) return;
        const next: Record<string, Pick> = {};
        for (const med of items) {
            if (!stillToBuy(med)) continue;
            const offer = offersFor(med.id)[0];
            if (offer) next[med.id] = defaultPick(med, offer.quotation, offer.line);
        }
        if (!Object.keys(next).length) return; // nothing quoted yet: try again when it is
        autoPickedRef.current = String(item.id);
        setPicks(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item?.id, items, offersFor]);

    const togglePick = (med: any, quotation: Quotation, line: QuoteLine) => {
        setPicks((p) => {
            const next = { ...p };
            if (next[med.id]?.lineId === line.id) delete next[med.id];
            else next[med.id] = defaultPick(med, quotation, line);
            return next;
        });
    };

    const setPickQty = (medId: string, qty: number) => setPicks((p) => (p[medId] ? { ...p, [medId]: { ...p[medId], quantity: qty } } : p));

    // Checkout groups: one per pharmacy.
    const groups = useMemo(() => {
        const byQ: Record<string, { quotation: Quotation; lines: { line: QuoteLine; quantity: number }[]; total: number }> = {};
        for (const [, pick] of Object.entries(picks)) {
            const q = quotations.find((x) => x.id === pick.quotationId);
            const line = q?.lines.find((l) => l.id === pick.lineId);
            if (!q || !line) continue;
            byQ[q.id] ??= { quotation: q, lines: [], total: 0 };
            byQ[q.id].lines.push({ line, quantity: pick.quantity });
            byQ[q.id].total += (Number(line.unit_price) || 0) * pick.quantity;
        }
        return Object.values(byQ);
    }, [picks, quotations]);

    const methodFor = useCallback(
        (q: Quotation): Fulfilment => (!q.pickup_required && q.delivery_available && methods[q.id] === 'DELIVERY' ? 'DELIVERY' : 'PICKUP'),
        [methods]
    );

    // Price the checkout (medicines + delivery, if chosen) on the server.
    const groupsKey = groups
        .map((g) => `${g.quotation.id}:${methodFor(g.quotation)}:${g.lines.map((l) => `${l.line.id}x${l.quantity}`).sort().join(',')}`)
        .sort()
        .join('|');
    const groupsRef = useRef(groups);
    groupsRef.current = groups;
    const methodForRef = useRef(methodFor);
    methodForRef.current = methodFor;
    useEffect(() => {
        if (!groupsKey) {
            setPreviews({});
            setPricing(false);
            return;
        }
        let cancelled = false;
        setPricing(true);
        const timer = setTimeout(async () => {
            const next: Record<string, CheckoutPreview> = {};
            await Promise.all(
                groupsRef.current.map(async (g) => {
                    try {
                        const res = await customerRxClient.post({
                            action: 'PreviewPrescriptionCheckout',
                            quotation: g.quotation.id,
                            lines: g.lines.map((l) => ({ order_item: l.line.id, quantity: l.quantity })),
                            delivery_method: methodForRef.current(g.quotation),
                        });
                        next[g.quotation.id] =
                            res.ok && res.data?.response_code === 0 && res.data?.checkout
                                ? res.data.checkout
                                : { error: (Array.isArray(res.data?.errors) && res.data.errors[0]) || res.data?.response_message || "Couldn't price this purchase." };
                    } catch {
                        next[g.quotation.id] = { error: "Couldn't reach the server. Check your connection." };
                    }
                })
            );
            if (!cancelled) {
                setPreviews(next);
                setPricing(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [groupsKey]);

    const payConfig: RecordPaymentConfig | null = useMemo(() => {
        if (!payingQuotation) return null;
        const group = groups.find((g) => g.quotation.id === payingQuotation.id);
        const lines = (group?.lines ?? []).map((l) => ({ order_item: l.line.id, quantity: l.quantity }));
        return {
            ...PRESCRIPTION_ORDER_PAYMENT_CONFIG,
            buildPaymentPayload: (ctx) => ({
                action: 'PayPrescriptionQuotation',
                quotation: payingQuotation.id,
                lines,
                delivery_method: methodFor(payingQuotation),
                payment_method: String(ctx.selectedMethod.id),
                mobile_money_phone: ctx.mobileNumber || '',
            }),
        };
    }, [payingQuotation, groups, methodFor]);

    /** A payment went through: set dose reminders and (partial purchases) refill reminders in the calendar. */
    const onPaid = useCallback(() => {
        paidRef.current = true;
        onChanged?.();
        // The schedule is built right after the payment is confirmed: give it a moment.
        setTimeout(() => {
            syncMedicationReminders({ ask: true })
                .then(({ schedule, doses, calendar }) => {
                    if (!schedule?.medicines.length) return;
                    const parts: string[] = [];
                    if (doses.status === 'ok' && doses.scheduled) parts.push('You’ll be reminded 1 hour and 30 minutes before each dose.');
                    else if (doses.status === 'denied') parts.push('Turn on notifications for WaziPOS to get dose reminders.');
                    const partial = schedule.medicines.some((m) => m.is_partial);
                    if (partial && calendar.status === 'ok' && calendar.medicines) parts.push('Refill reminders were added to your calendar 7, 3 and 1 day(s) before your medicine runs out.');
                    else if (partial && calendar.status === 'denied') parts.push('Allow calendar access to get refill reminders in your calendar.');
                    else if (partial) parts.push('You’ll be notified 7, 3 and 1 day(s) before your medicine runs out.');
                    setReminderNote(['Your medication schedule is ready.', ...parts].join(' '));
                })
                .catch(() => undefined);
        }, 2500);
    }, [onChanged]);

    /** Server-priced total for a checkout group (falls back to the medicines total while pricing). */
    const checkoutState = (g: (typeof groups)[number]) => {
        const method = methodFor(g.quotation);
        const preview = previews[g.quotation.id];
        const priced = !!preview && !preview.error && preview.delivery_method === method;
        return {
            method,
            priced,
            total: priced ? Number(preview?.total) || 0 : g.total,
            blocked: !!preview?.error || (pricing && !priced),
        };
    };

    const openSchedule = useCallback(() => {
        const id = item?.id;
        onClose();
        router.push((id ? `${MEDICATIONS_ROUTE}?prescription=${id}` : MEDICATIONS_ROUTE) as any);
    }, [item?.id, onClose, router]);

    if (!item) return null;

    const digitized = item.status === 'DIGITIZED';
    /** Every medicine is bought: nothing left to buy, quote or edit. */
    const dispensed = item.status === 'DISPENSED';
    const longTerm = !!(item as any).has_long_term_items || items.some((m) => (Number(m.days) || 0) >= 28);
    // Only a digitized prescription with no pharmacy yet can be sent to one.
    const canSendToPharmacy = digitized && !(item as any).entity && quotations.length === 0;
    const queued = item.status === 'QUEUING';
    const heroThumb = resolveImage(item.images?.[0]) ?? null;
    const aiPending = item.ai_extraction_status === 'PENDING' || item.ai_extraction_status === 'PROCESSING';
    const anyBought = items.some((m) => (Number(m.bought_quantity) || 0) > 0);

    const ImagePanel = (
        <Pressable
            onPress={() => heroThumb && setIsImageViewerVisible(true)}
            className="flex-1 w-full h-full min-h-[300px] relative items-center justify-center border-b md:border-b-0 md:border-r"
            style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
        >
            {heroThumb ? (
                <>
                    <Image source={{ uri: heroThumb }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    <View className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-black/60 flex-row items-center">
                        <Ionicons name="expand" size={16} color="#fff" />
                        <Text className="text-white text-xs ml-1.5 font-bold">Tap to zoom</Text>
                    </View>
                </>
            ) : (
                <View className="items-center justify-center">
                    <Ionicons name="document-text" size={64} color={theme.textSubtle} />
                    <Text className="mt-3 text-sm uppercase tracking-widest" style={{ color: theme.textSubtle, fontFamily: theme.font.bold }}>
                        No image attached
                    </Text>
                </View>
            )}
        </Pressable>
    );

    const statusText = queued
        ? aiPending
            ? 'Reading your prescription…'
            : 'Waiting to be digitized. You’ll be notified when it’s ready.'
        : digitized
            ? quoted.length
                ? quoted.every((q) => q.status === 'FULFILLED')
                    ? `You’ve bought everything ${quoted[0].entity_title} quoted.`
                    : `${quoted[0].entity_title} has sent its quotation. Choose the medicines to buy.`
                : requested.length
                    ? `Waiting for ${requested[0].entity_title} to send its quotation.`
                    : 'Digitized. Send it to a pharmacy to get prices.'
            : dispensed
                ? 'Fully dispensed: you’ve bought every medicine on this prescription.'
                : `Status: ${item.status}`;
    const settled = digitized || dispensed;

    const checkoutCards = groups.map((g) => (
        <CheckoutCard
            key={g.quotation.id}
            quotation={g.quotation}
            lineCount={g.lines.length}
            itemsTotal={g.total}
            method={methodFor(g.quotation)}
            preview={previews[g.quotation.id]}
            pricing={pricing}
            onMethod={(m) => setMethods((all) => ({ ...all, [g.quotation.id]: m }))}
            // Phones pay from the sticky footer bar; wide screens from the card itself.
            onPay={isLarge ? () => setPayingQuotation(g.quotation) : undefined}
        />
    ));

    const DetailsPanel = (
        <ScrollView className="flex-1 w-full" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View className="mb-6">
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20 }}>{item.patient_name}</Text>
                <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 14 }}>
                    {item.patient_gender} · DOB: {item.patient_date_of_birth}
                </Text>
            </View>

            <View className="flex-row rounded-xl p-3 mb-6 items-center" style={{ backgroundColor: settled ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.12)' }}>
                <Ionicons name={dispensed ? 'bag-check' : digitized ? 'checkmark-done-circle' : aiPending ? 'sparkles' : 'time-outline'} size={20} color={settled ? '#059669' : '#b45309'} />
                <Text className="ml-2 flex-1" style={{ color: settled ? '#059669' : '#b45309', fontFamily: theme.font.bold, fontSize: 13 }}>
                    {statusText}
                </Text>
            </View>

            {dispensed && longTerm ? (
                <View className="flex-row rounded-xl p-3 mb-6 items-start" style={{ backgroundColor: 'rgba(59,130,246,0.10)' }}>
                    <Ionicons name="calendar-outline" size={20} color="#2563eb" />
                    <Text className="ml-2 flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {FOLLOW_UP_ADVICE}
                    </Text>
                </View>
            ) : null}

            {/* Each quoting pharmacy's collect-in-person / delivery decision */}
            {quoted.length ? (
                <View className="gap-2 mb-6">
                    {quoted.map((q) => {
                        const delivers = !q.pickup_required && !!q.delivery_available;
                        return (
                            <View key={q.id} className="flex-row items-center rounded-xl p-3 border" style={{ borderColor: theme.border }}>
                                <Ionicons name={delivers ? 'bicycle-outline' : 'storefront-outline'} size={18} color={theme.primary} />
                                <View className="ml-2 flex-1">
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                        {q.entity_title}
                                    </Text>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{fulfilmentText(q)}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ) : null}

            {reminderNote || anyBought ? (
                <Pressable onPress={openSchedule} className="flex-row items-center rounded-xl p-3 mb-6" style={{ backgroundColor: `${theme.primary}12` }}>
                    <Ionicons name="alarm-outline" size={20} color={theme.primary} />
                    <Text className="ml-2 flex-1" style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {reminderNote || 'See when to take each medicine and confirm every dose.'}
                    </Text>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>Open schedule</Text>
                </Pressable>
            ) : null}

            <Text className="uppercase tracking-widest mb-3" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>
                Medicines ({items.length})
            </Text>

            {items.length === 0 ? (
                <View className="p-6 items-center rounded-xl border border-dashed" style={{ borderColor: theme.border }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No medicines yet.</Text>
                </View>
            ) : (
                items.map((med: any) => (
                    <MedicineOffers
                        key={med.id}
                        med={med}
                        offers={offersFor(med.id)}
                        paidFrom={quotations.filter((q) => boughtFrom(q, med.id) > 0 || (isPaidQuotation(q) && q.lines.some((l) => String(l.prescription_item) === String(med.id))))}
                        pick={picks[med.id]}
                        remaining={remainingFor(med)}
                        onToggle={(q, l) => togglePick(med, q, l)}
                        onQty={(n) => setPickQty(med.id, n)}
                    />
                ))
            )}

            {/* Phones: checkout scrolls with the medicines (a fixed footer would squeeze the list). */}
            {!isLarge && groups.length ? (
                <View className="mt-2 gap-2.5">
                    <Text className="uppercase tracking-widest" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>
                        Checkout
                    </Text>
                    {checkoutCards}
                </View>
            ) : null}

            {purchases.length ? (
                <View className="mt-4">
                    <Text className="uppercase tracking-widest mb-3" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>
                        Purchases ({purchases.length})
                    </Text>
                    {purchases.map((p) => {
                        const when = p.paid_at || p.created;
                        return (
                            <View key={p.id} className="rounded-xl border p-3 mb-2" style={{ borderColor: theme.border }}>
                                <View className="flex-row items-center">
                                    <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                        {p.entity_title}
                                    </Text>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(p.total)}</Text>
                                </View>
                                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {[
                                        when ? new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
                                        p.delivery_method === 'DELIVERY' ? `Delivered · ${kes(p.shipping_cost)} shipping` : 'Collected in person',
                                        p.reference_number ? `Ref ${p.reference_number}` : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </Text>
                                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    {p.lines
                                        .map((l) => `${l.quantity} × ${itemTitle(items.find((m) => String(m.id) === String(l.prescription_item)))}`)
                                        .join(', ')}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            ) : null}
        </ScrollView>
    );

    return (
        <>
            <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
                <View className="flex-1 bg-black/55 items-center justify-center p-0 md:p-4">
                    <View
                        // A definite height on wide screens: the details scroll inside it and the
                        // checkout footer (Pay button) always stays on screen.
                        className="w-full h-full md:h-[90%] md:max-w-[1200px] md:rounded-2xl border-0 md:border overflow-hidden flex-col"
                        style={{ backgroundColor: theme.panel, borderColor: theme.border }}
                    >
                        <View className="flex-row items-center justify-between p-4 border-b z-10" style={{ borderBottomColor: theme.border, backgroundColor: theme.panel }}>
                            <View className="flex-1">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }} numberOfLines={1}>
                                    Prescription
                                </Text>
                                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }}>
                                    {items.length} medicine{items.length === 1 ? '' : 's'} · {quoted.length} quotation{quoted.length === 1 ? '' : 's'}
                                </Text>
                            </View>
                            <Pressable onPress={onClose} hitSlop={10} className="p-2 bg-black/5 rounded-full">
                                <Ionicons name="close" size={20} color={theme.textDark} />
                            </Pressable>
                        </View>

                        {isLarge ? (
                            <View className="flex-row flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                                <View className="w-[40%] border-r" style={{ borderColor: theme.border }}>
                                    {ImagePanel}
                                </View>
                                <View className="w-[60%] flex-1" style={{ minHeight: 0 }}>{DetailsPanel}</View>
                            </View>
                        ) : (
                            <View className="flex-1 flex-col">
                                <View className="flex-row border-b" style={{ borderBottomColor: theme.border, backgroundColor: theme.surfaceAlt }}>
                                    {(['image', 'details'] as const).map((tab) => (
                                        <Pressable
                                            key={tab}
                                            onPress={() => setActiveTab(tab)}
                                            className="flex-1 py-3 items-center border-b-2"
                                            style={{ borderBottomColor: activeTab === tab ? theme.primary : 'transparent' }}
                                        >
                                            <Text className="uppercase tracking-widest text-xs" style={{ fontFamily: theme.font.bold, color: activeTab === tab ? theme.primary : theme.textDark }}>
                                                {tab === 'image' ? 'Image' : 'Medicines & quotes'}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <View className="flex-1">{activeTab === 'image' ? ImagePanel : DetailsPanel}</View>
                            </View>
                        )}

                        {/* Checkout: one payment per pharmacy */}
                        <View className="p-4 border-t gap-3" style={{ borderTopColor: theme.border, backgroundColor: theme.panel }}>
                            {groups.length && isLarge ? (
                                <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 10 }}>
                                    {checkoutCards}
                                </ScrollView>
                            ) : null}
                            {groups.length && !isLarge ? (
                                // Phones: a slim, always-visible pay bar; the full card is in the list above.
                                <View className="gap-2">
                                    {groups.map((g) => {
                                        const s = checkoutState(g);
                                        return (
                                            <Pressable
                                                key={g.quotation.id}
                                                onPress={() => setPayingQuotation(g.quotation)}
                                                disabled={s.blocked}
                                                className="flex-row items-center px-4 py-3 rounded-xl"
                                                style={{ backgroundColor: theme.primary, opacity: s.blocked ? 0.5 : 1 }}
                                            >
                                                <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                                                <Text className="ml-2 flex-1 text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                                    Pay by mobile money · {s.method === 'DELIVERY' ? 'delivery' : 'collect'}
                                                </Text>
                                                {pricing && !s.priced ? (
                                                    <ActivityIndicator size="small" color="#fff" />
                                                ) : (
                                                    <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 14 }}>
                                                        {kes(s.total)}
                                                    </Text>
                                                )}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                            {!groups.length && items.some((m) => stillToBuy(m) && offersFor(m.id).length > 0) ? (
                                // Nothing selected (e.g. the customer unticked everything): say how to pay.
                                <View className="flex-row items-center px-4 py-3 rounded-xl" style={{ backgroundColor: `${theme.primary}12` }}>
                                    <Ionicons name="hand-left-outline" size={16} color={theme.primary} />
                                    <Text className="ml-2 flex-1" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>
                                        Select a medicine above to pay by mobile money
                                    </Text>
                                </View>
                            ) : null}
                            <View className="flex-row justify-end gap-3">
                                <Pressable onPress={onClose} className="px-5 py-2.5 rounded-xl border" style={{ borderColor: theme.border }}>
                                    <Text className="uppercase tracking-wide" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 13 }}>
                                        Close
                                    </Text>
                                </Pressable>
                                {canSendToPharmacy ? (
                                    <Pressable onPress={() => setForwardOpen(true)} className="px-5 py-2.5 rounded-xl border flex-row items-center" style={{ borderColor: theme.primary }}>
                                        <Ionicons name="return-up-forward-outline" size={16} color={theme.primary} />
                                        <Text className="ml-1.5" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>
                                            Send to a pharmacy
                                        </Text>
                                    </Pressable>
                                ) : null}
                                {onProceedToDispense ? (
                                    <Pressable onPress={() => (onProceedToDispense(item), onClose())} className="px-6 py-2.5 rounded-xl" style={{ backgroundColor: theme.primary }}>
                                        <Text className="uppercase tracking-wide text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                                            Proceed to dispense
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {payingQuotation && payConfig ? (
                <RecordPaymentModal
                    isOpen
                    orderId={payingQuotation.id}
                    orderRef={payingQuotation.entity_title}
                    config={payConfig}
                    onlineOnly
                    onClose={() => {
                        setPayingQuotation(null);
                        // Keep the choices if nothing was paid, so the customer can retry.
                        if (paidRef.current) {
                            setPicks({});
                            // After the refresh, pre-select whatever is still left to buy.
                            autoPickedRef.current = null;
                        }
                        paidRef.current = false;
                        onChanged?.();
                    }}
                    onRefreshParentLedger={onPaid}
                />
            ) : null}

            <ForwardForQuotationSheet
                visible={forwardOpen}
                prescription={item}
                client={customerRxClient}
                onClose={() => setForwardOpen(false)}
                onForwarded={(fresh) => onForwarded?.(fresh)}
            />

            <Modal visible={isImageViewerVisible} transparent animationType="fade" onRequestClose={() => setIsImageViewerVisible(false)}>
                <View className="flex-1 bg-black/95">
                    <Pressable onPress={() => setIsImageViewerVisible(false)} className="absolute top-12 right-6 z-50 p-3 rounded-full bg-white/10">
                        <Ionicons name="close" size={28} color="#fff" />
                    </Pressable>
                    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }} maximumZoomScale={4} minimumZoomScale={1} centerContent>
                        {heroThumb ? <Image source={{ uri: heroThumb }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 }} resizeMode="contain" /> : null}
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

/** Units still to buy (prescribed minus already paid), or 0 when the prescribed quantity is unknown. */
function remainingFor(med: any): number {
    const required = Number(med?.required_unit_quantity) || 0;
    return required ? Math.max(0, required - (Number(med?.bought_quantity) || 0)) : 0;
}

/** One pharmacy's checkout: fulfilment choice, priced totals, and (when `onPay` is given) the pay button. */
function CheckoutCard({
    quotation,
    lineCount,
    itemsTotal,
    method,
    preview,
    pricing,
    onMethod,
    onPay,
}: {
    quotation: Quotation;
    lineCount: number;
    itemsTotal: number;
    method: Fulfilment;
    preview?: CheckoutPreview;
    pricing: boolean;
    onMethod: (m: Fulfilment) => void;
    /** Omitted on phones, where the sticky footer bar is the pay button. */
    onPay?: () => void;
}) {
    const { theme } = useAuth();
    const priced = !!preview && !preview.error && preview.delivery_method === method;
    const canChoose = !quotation.pickup_required && !!quotation.delivery_available && preview?.delivery_available !== false;
    const shipping = priced ? Number(preview?.shipping_cost) || 0 : 0;
    const total = priced ? Number(preview?.total) || 0 : itemsTotal;
    const deliveryCost = preview?.delivery_cost != null ? Number(preview.delivery_cost) || 0 : null;
    const blocked = !!preview?.error || (pricing && !priced);

    const option = (key: Fulfilment, icon: keyof typeof Ionicons.glyphMap, title: string, sub: string) => {
        const on = method === key;
        return (
            <Pressable
                onPress={() => onMethod(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                className="flex-1 flex-row items-center rounded-xl px-3 py-2"
                style={{ borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? `${theme.primary}10` : 'transparent' }}
            >
                <Ionicons name={icon} size={18} color={on ? theme.primary : theme.textDark} />
                <View className="ml-2 flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                        {sub}
                    </Text>
                </View>
            </Pressable>
        );
    };

    return (
        <View className="rounded-xl border p-3 gap-2" style={{ borderColor: theme.border, backgroundColor: theme.surfaceAlt }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                {quotation.entity_title} · {lineCount} item{lineCount === 1 ? '' : 's'}
            </Text>

            {canChoose ? (
                <View className="flex-row gap-2">
                    {option('PICKUP', 'storefront-outline', 'I’ll collect', 'No delivery fee')}
                    {option(
                        'DELIVERY',
                        'bicycle-outline',
                        'Deliver to me',
                        deliveryCost != null ? `+ ${kes(deliveryCost)}${preview?.distance_km ? ` · ${Number(preview.distance_km).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : ''}` : 'Shipping added'
                    )}
                </View>
            ) : (
                <View className="flex-row items-start">
                    <Ionicons name="storefront-outline" size={16} color={theme.textDark} />
                    <Text className="ml-2 flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {quotation.pickup_required
                            ? `The pharmacy asks you to collect in person${quotation.pickup_reason ? `: ${quotation.pickup_reason}` : ' for advice on your medicines'}. No delivery fee.`
                            : preview?.delivery_error || 'Collect in person at the pharmacy. Delivery isn’t available for this prescription.'}
                    </Text>
                </View>
            )}

            {preview?.error ? (
                <Text style={{ color: '#dc2626', fontFamily: theme.font.medium, fontSize: 12 }}>{preview.error}</Text>
            ) : (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    Medicines {kes(itemsTotal)}
                    {method === 'DELIVERY' ? ` + delivery ${priced ? kes(shipping) : '…'}` : ''}
                </Text>
            )}

            {onPay ? (
                <Pressable
                    onPress={onPay}
                    disabled={blocked}
                    className="flex-row items-center px-4 py-3 rounded-xl"
                    style={{ backgroundColor: theme.primary, opacity: blocked ? 0.5 : 1 }}
                >
                    <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                    <Text className="ml-2 flex-1 text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                        Pay by mobile money
                    </Text>
                    {pricing && !priced ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 14 }}>
                            {kes(total)}
                        </Text>
                    )}
                </Pressable>
            ) : (
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>
                    Total {pricing && !priced ? '…' : kes(total)}
                </Text>
            )}
        </View>
    );
}

function MedicineOffers({
    med,
    offers,
    paidFrom,
    pick,
    remaining,
    onToggle,
    onQty,
}: {
    med: any;
    offers: { quotation: Quotation; line: QuoteLine }[];
    paidFrom: Quotation[];
    pick?: Pick;
    remaining: number;
    onToggle: (q: Quotation, l: QuoteLine) => void;
    onQty: (n: number) => void;
}) {
    const { theme } = useAuth();
    const partial = allowsPartial(med);
    const bought = Number(med.bought_quantity) || 0;
    const required = Number(med.required_unit_quantity) || 0;
    const fullyBought = required > 0 && bought >= required;

    return (
        <View className="rounded-xl border p-3 mb-3" style={{ backgroundColor: theme.panel, borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>
                {itemTitle(med)}
            </Text>
            <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                {[med.dose ? `Dose ${med.dose}` : '', med.days ? `${med.days} days` : '', required ? `Prescribed ${required}` : ''].filter(Boolean).join(' · ') || 'No dosing details'}
                {' · '}
                {partial ? 'can be bought in part' : 'full dose only'}
            </Text>
            {bought ? (
                <Text className="mt-1" style={{ color: '#059669', fontFamily: theme.font.bold, fontSize: 12 }}>
                    {bought} bought{paidFrom.length ? ` from ${paidFrom[0].entity_title}` : ''}
                    {fullyBought ? ' · complete' : required ? ` · ${Math.max(0, required - bought)} left to buy` : ''}
                </Text>
            ) : null}

            {fullyBought ? null : offers.length === 0 ? (
                <Text className="mt-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                    Not quoted yet.
                </Text>
            ) : (
                <View className="mt-2 gap-2">
                    {offers.map(({ quotation, line }) => {
                        const on = pick?.lineId === line.id;
                        const unit = Number(line.unit_price) || 0;
                        return (
                            <View key={line.id}>
                                <Pressable
                                    onPress={() => onToggle(quotation, line)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: on }}
                                    className="flex-row items-center rounded-xl px-3 py-2.5"
                                    style={{ borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? `${theme.primary}10` : theme.surfaceAlt }}
                                >
                                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? theme.primary : theme.textDark} />
                                    <View className="flex-1 ml-2 min-w-0">
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                            {quotation.entity_title}
                                        </Text>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                                            {[line.product_title, line.batch ? `batch ${line.batch}` : '', line.expiry_date ? `exp ${line.expiry_date}` : ''].filter(Boolean).join(' · ')}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{kes(unit)}</Text>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>× {line.quantity} available</Text>
                                    </View>
                                </Pressable>
                                {on && partial && pick ? (
                                    <QtyStepper
                                        value={pick.quantity}
                                        max={Math.min(line.quantity, remaining || line.quantity)}
                                        onChange={onQty}
                                        unitPrice={unit}
                                    />
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

function QtyStepper({ value, max, onChange, unitPrice }: { value: number; max: number; onChange: (n: number) => void; unitPrice: number }) {
    const { theme } = useAuth();
    const btn = (icon: 'remove' | 'add', disabled: boolean, next: number) => (
        <Pressable
            onPress={() => onChange(next)}
            disabled={disabled}
            className="w-9 h-9 rounded-lg items-center justify-center"
            style={{ backgroundColor: theme.surfaceAlt, opacity: disabled ? 0.4 : 1 }}
            accessibilityLabel={icon === 'add' ? 'More' : 'Fewer'}
        >
            <Ionicons name={icon} size={16} color={theme.text} />
        </Pressable>
    );
    return (
        <View className="flex-row items-center gap-2 mt-2 ml-7">
            {btn('remove', value <= 1, value - 1)}
            <Text style={{ minWidth: 32, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{value}</Text>
            {btn('add', value >= max, value + 1)}
            <Text className="ml-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                of {max} · {kes(value * unitPrice)}
            </Text>
        </View>
    );
}
