// components/credit/CreditOffer.tsx
//
// "Lipa Baadaye with WaziPOS Credit" — the inline opt-in on any order's payment step.
// Collapsed: one line ("A lender pays now — repay in 7, 14 or 28 days"). Open: each
// lender's price for 7 / 14 / 28 days with the full cost of credit (interest, admin fee,
// excise duty, APR, due date), then
//   · the buyer themselves: tick the terms → the order is paid at once;
//   · the seller's staff: send the buyer an SMS code with the terms → enter it → paid.
// Renders nothing when the order can't be financed (already paid, no lender, etc.).

import creditApi, { type CreditKind, type CreditOffers, type Facility, type Tenor } from '@/api/creditApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PrimaryCTA } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { Building2, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, HandCoins, MessageSquareText, Square, SquareCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
const kes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString('en-KE')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const VIOLET = '#8b5cf6';

interface Props {
    kind: CreditKind;
    orderId: string | null | undefined;
    /** The order was paid by the loan. */
    onPaid?: (f: Facility) => void;
    /** Start expanded (e.g. in a dedicated sheet). */
    defaultOpen?: boolean;
}

export default function CreditOffer({ kind, orderId, onPaid, defaultOpen }: Props) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [offers, setOffers] = useState<CreditOffers | null>(null);
    const [open, setOpen] = useState(!!defaultOpen);
    const [lenderId, setLenderId] = useState<string | null>(null);
    const [tenor, setTenor] = useState<Tenor>(14);
    const [terms, setTerms] = useState(false);
    const [phone, setPhone] = useState('');
    const [consent, setConsent] = useState<{ consent_id: string; phone: string } | null>(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paid, setPaid] = useState<Facility | null>(null);

    useEffect(() => {
        if (!orderId || !isOnline) return;
        let live = true;
        creditApi
            .offers(kind, String(orderId))
            .then((res: any) => {
                if (!live || !isServerOk(res)) return;
                const o: CreditOffers = res.data.offers;
                setOffers(o);
                if (o.lenders.length) setLenderId(o.lenders[0].lender_id);
            })
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [kind, orderId, isOnline]);

    if (!orderId || !offers) return null;
    if (paid || offers.facility) {
        const f = paid ?? offers.facility!;
        return (
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: `${theme.success}14`, marginBottom: 12 }}>
                <CheckCircle2 size={18} color={theme.success} />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>
                    Paid with WaziPOS Credit by {f.lender.name} · {kes(f.total_due)} due {day(f.due_date)}
                </Text>
            </View>
        );
    }
    if (!offers.eligible) return null;

    const lender = offers.lenders.find((l) => l.lender_id === lenderId) ?? offers.lenders[0];
    const q = lender.quotes.find((x) => x.tenor === tenor) ?? lender.quotes[0];
    const cheapest = Math.min(...offers.lenders.map((l) => l.quotes[0].charges));

    const fail = (res: any, fallback: string) => setError(describeResponse(res, fallback).message);

    const sendCode = async () => {
        setBusy(true);
        setError(null);
        const res: any = await creditApi.requestConsent({ order_kind: kind, order_id: String(orderId), lender_id: lender.lender_id, tenor, phone: phone.trim() || undefined }).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            setConsent(res.data.consent);
            toast.info('Code sent', `Ask the customer for the code sent to ${res.data.consent.phone}.`);
        } else fail(res, 'The code was not sent.');
    };

    const borrow = async () => {
        if (offers.mode === 'self' && !terms) return setError('Tick that you accept the loan terms.');
        if (offers.mode === 'consent' && (!consent || code.trim().length < 6)) return setError('Enter the 6-digit code the customer received.');
        setBusy(true);
        setError(null);
        const res: any = await creditApi
            .borrow({ order_kind: kind, order_id: String(orderId), lender_id: lender.lender_id, tenor, accept_terms: true, consent_id: consent?.consent_id, consent_code: code.trim() || undefined })
            .catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            const f: Facility = res.data.facility;
            setPaid(f);
            toast.success('Order paid', `${f.lender.name} paid ${kes(f.principal)}. Repay ${kes(f.total_due)} by ${day(f.due_date)}.`);
            onPaid?.(f);
        } else fail(res, 'The loan was not approved.');
    };

    return (
        <View style={{ borderRadius: 18, borderWidth: 1.5, borderColor: open ? VIOLET : `${VIOLET}55`, backgroundColor: `${VIOLET}0d`, marginBottom: 14, overflow: 'hidden' }}>
            <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...pointer }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' }}>
                    <HandCoins size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>Lipa Baadaye · WaziPOS Credit</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {offers.mode === 'self' ? 'A lender pays this order now' : `Let ${offers.borrower.name || 'the customer'} pay later`} — repay in 7, 14 or 28 days from {kes(cheapest)} extra
                    </Text>
                </View>
                {open ? <ChevronUp size={18} color={VIOLET} /> : <ChevronDown size={18} color={VIOLET} />}
            </Pressable>

            {open ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
                    {offers.lenders.length > 1 ? (
                        <View style={{ gap: 6 }}>
                            {offers.lenders.map((l) => {
                                const on = l.lender_id === lender.lender_id;
                                return (
                                    <Pressable key={l.lender_id} onPress={() => setLenderId(l.lender_id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: on ? VIOLET : theme.border, backgroundColor: theme.panel, ...pointer }}>
                                        <Building2 size={16} color={on ? VIOLET : theme.textMuted} />
                                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>{l.name}</Text>
                                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>{l.regulator}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ) : (
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Lender: <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>{lender.name}</Text> · {lender.regulator} licence {lender.licence}
                        </Text>
                    )}

                    {/* 7 / 14 / 28 */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {lender.quotes.map((x) => {
                            const on = x.tenor === tenor;
                            return (
                                <Pressable key={x.tenor} onPress={() => setTenor(x.tenor)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: on ? VIOLET : theme.border, backgroundColor: on ? `${VIOLET}14` : theme.panel, alignItems: 'center', ...pointer }}>
                                    <Text style={{ color: on ? VIOLET : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{x.tenor} days</Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 11.5 }}>+{kes(x.charges)}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Key facts */}
                    <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.panel, gap: 6 }}>
                        <Row label={`${lender.name} pays the seller`} value={kes(q.principal)} />
                        <Row label={`Interest (${q.rate_pct}% for ${q.tenor} days)`} value={kes(q.interest)} />
                        <Row label="Admin fee" value={kes(q.admin_fee)} />
                        <Row label="Excise duty on the fee" value={kes(q.excise)} />
                        <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 2 }} />
                        <Row label="You repay" value={kes(q.total)} strong />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <CalendarClock size={13} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>By {day(q.due_date)} · APR {Math.round(q.apr)}% · repay early or in parts</Text>
                        </View>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5 }}>Late: {q.late_fee}.</Text>
                    </View>

                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5 }}>
                        WaziScore {offers.score.score} · limit available {kes(offers.available_limit)}. Repayments go straight to {lender.name} by M-Pesa / Airtel Money.
                    </Text>

                    {offers.mode === 'self' ? (
                        <Pressable onPress={() => setTerms((t) => !t)} accessibilityRole="checkbox" accessibilityState={{ checked: terms }} style={{ flexDirection: 'row', gap: 10, ...pointer }}>
                            {terms ? <SquareCheck size={20} color={VIOLET} /> : <Square size={20} color={theme.textMuted} />}
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.regular, fontSize: 12.5, lineHeight: 18 }}>
                                I agree to repay {kes(q.total)} to {lender.name} by {day(q.due_date)}{lender.terms ? ' and accept its terms' : ''}. Late repayment may be reported to credit bureaus.
                            </Text>
                        </Pressable>
                    ) : !consent ? (
                        <>
                            <CustomTextField label="Customer's phone (on WaziPOS)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Leave empty to use the order's phone" />
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }}>
                                The customer gets an SMS with these terms and a code. Entering the code is their agreement.
                            </Text>
                        </>
                    ) : (
                        <CustomTextField label={`Code sent to ${consent.phone}`} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6 digits" />
                    )}

                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    {offers.mode === 'consent' && !consent ? (
                        <PrimaryCTA label="Send the customer a consent code" icon={MessageSquareText} onPress={() => void sendCode()} loading={busy} />
                    ) : (
                        <PrimaryCTA label={`Pay ${kes(q.principal)} now · repay ${kes(q.total)}`} icon={HandCoins} onPress={() => void borrow()} loading={busy} />
                    )}
                    {busy ? <ActivityIndicator color={VIOLET} /> : null}
                </View>
            ) : null}
        </View>
    );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ flex: 1, color: strong ? theme.text : theme.textMuted, fontFamily: strong ? theme.font.bold : theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: strong ? 16 : 13 }}>{value}</Text>
        </View>
    );
}
