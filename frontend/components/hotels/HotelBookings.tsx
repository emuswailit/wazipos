// components/hotels/HotelBookings.tsx
//
// The front desk: stays to come, guests in house and past stays. Confirm a
// booking, check the guest in and out, take payment (cash / card at the desk,
// or an M-Pesa prompt to the guest's phone), and book a room for a walk-in or
// phone guest. Hotels only. Refreshes every 30 s.

import { errorText, isOk } from '@/api/diningApi';
import hotelApi, { isoDate, prettyDate, STAY_META, type RoomBooking, type StayStatus } from '@/api/hotelApi';
import { AdminBadgePill, AdminListView, AdminSheet, ChoiceChips, SheetButton, useListTokens, type AdminListConfig } from '@/components/common/listScreen';
import type { PageSize } from '@/components/common/PaginationBar';
import { kes, when } from '@/components/restaurants/shared';
import { useAuth } from '@/context/AuthContext';
import { usePaymentMethodsSync } from '@/context/PaymentMethodsSyncContext';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import RoomBooker from './RoomBooker';
import { RoomPayment } from './RoomPayment';

type Filter = 'ALL' | 'ARRIVING' | 'NEW' | 'IN_HOUSE' | 'LEAVING' | 'DONE';

const stay = (b: RoomBooking) => `${prettyDate(b.checkin_date)} → ${prettyDate(b.checkout_date)} · ${b.nights} night${b.nights === 1 ? '' : 's'}`;
const pill = (b: RoomBooking) => <AdminBadgePill badge={{ label: STAY_META[b.status]?.label ?? b.status_label, tone: STAY_META[b.status]?.tone ?? 'neutral' }} />;

const config: AdminListConfig<RoomBooking> = {
    title: 'Stays',
    noun: ['stay', 'stays'],
    icon: 'bed-outline',
    searchPlaceholder: 'Search guest, phone, room, reference…',
    addLabel: 'New booking',
    emptyTitle: 'No stays here',
    emptyMessage: 'Bookings from guests and the ones you take at the desk appear here.',
    keyOf: (b) => b.id,
    titleOf: (b) => b.guest_name || 'Guest',
    subtitleOf: (b) => [b.room_title, stay(b), b.reference].filter(Boolean).join(' · '),
    avatarOf: (b) => ({ uri: b.room_image_url, icon: 'bed-outline' }),
    badgesOf: (b) => [
        { label: STAY_META[b.status]?.label ?? b.status_label, tone: STAY_META[b.status]?.tone ?? 'neutral' },
        ...(b.status === 'CANCELLED' || b.status === 'NO_SHOW' ? [] : [b.is_paid ? ({ label: 'Paid', tone: 'success' } as const) : ({ label: 'Not paid', tone: 'warning' } as const)]),
    ],
    metaOf: (b) => (b.created ? `Booked ${when(b.created)}` : null),
    metaIcon: 'time-outline',
    metricOf: (b) => ({ value: kes(b.total), label: `${b.guests} guest${b.guests === 1 ? '' : 's'}` }),
    primaryColumn: { label: 'Guest', flex: 1.8 },
    columns: [
        { key: 'room', label: 'Room', flex: 1.1, render: (b) => b.room_title || '—' },
        { key: 'in', label: 'Check-in', flex: 1, render: (b) => prettyDate(b.checkin_date) },
        { key: 'out', label: 'Check-out', flex: 1, render: (b) => prettyDate(b.checkout_date) },
        { key: 'nights', label: 'Nights', flex: 0.6, render: (b) => String(b.nights) },
        { key: 'status', label: 'Status', flex: 1, render: pill },
        { key: 'due', label: 'Due', flex: 0.9, align: 'right', render: (b) => (Number(b.amount_due) > 0 ? kes(b.amount_due) : 'Paid') },
        { key: 'total', label: 'Total', flex: 0.9, align: 'right', render: (b) => kes(b.total) },
    ],
};

export default function HotelBookings() {
    const { width } = useWindowDimensions();
    const { user } = useAuth() as any;
    const [open, setOpen] = useState<RoomBooking[]>([]);
    const [done, setDone] = useState<RoomBooking[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [booking, setBooking] = useState(false);
    const [lastSynced, setLastSynced] = useState<string | undefined>();
    const today = isoDate(new Date());

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [a, b]: any[] = await Promise.all([hotelApi.bookings('open'), hotelApi.bookings('done')]);
            if (isOk(a)) {
                setOpen(a.data.room_bookings ?? []);
                setError(null);
                setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else setError(errorText(a, 'Could not load stays.'));
            if (isOk(b)) setDone(b.data.room_bookings ?? []);
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(
        useCallback(() => {
            void load();
            const t = setInterval(load, 30000);
            return () => clearInterval(t);
        }, [load]),
    );

    const groups = useMemo(
        () => ({
            NEW: open.filter((b) => b.status === 'BOOKED'),
            ARRIVING: open.filter((b) => b.status !== 'CHECKED_IN' && b.checkin_date <= today),
            IN_HOUSE: open.filter((b) => b.status === 'CHECKED_IN'),
            LEAVING: open.filter((b) => b.status === 'CHECKED_IN' && b.checkout_date <= today),
        }),
        [open, today],
    );
    const filtered = useMemo(() => {
        const base = filter === 'DONE' ? done : filter === 'ALL' ? open : groups[filter];
        const q = query.trim().toLowerCase();
        return q ? base.filter((b) => `${b.reference} ${b.guest_name ?? ''} ${b.guest_phone ?? ''} ${b.room_title ?? ''}`.toLowerCase().includes(q)) : base;
    }, [open, done, groups, filter, query]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const selected = [...open, ...done].find((b) => b.id === selectedId) ?? null;

    const replace = (b: RoomBooking) => {
        const live = ['BOOKED', 'CONFIRMED', 'CHECKED_IN'].includes(b.status);
        setOpen((prev) => (live ? (prev.some((x) => x.id === b.id) ? prev.map((x) => (x.id === b.id ? b : x)) : [b, ...prev]) : prev.filter((x) => x.id !== b.id)));
        setDone((prev) => (live ? prev.filter((x) => x.id !== b.id) : [b, ...prev.filter((x) => x.id !== b.id)]));
    };

    if (booking) {
        return (
            <RoomBooker
                entity={String(user?.entity_id || user?.entity || '')}
                mode="staff"
                onBack={() => setBooking(false)}
                backLabel="Stays"
                onBooked={(b) => {
                    replace(b);
                    setBooking(false);
                    setSelectedId(b.id); // straight to payment / check-in
                }}
            />
        );
    }

    return (
        <>
            <AdminListView<RoomBooking, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel="Live · every 30 s"
                sourceTone="server"
                lastSyncedTime={lastSynced}
                error={error}
                items={filtered.slice(pageStart, pageEnd)}
                allItems={filtered}
                onOpenCreate={() => setBooking(true)}
                onPressItem={(b) => setSelectedId(b.id)}
                rowActions={(b) => [{ icon: 'open-outline', label: 'Open stay', onPress: () => setSelectedId(b.id), tone: 'primary' }]}
                stats={[
                    { label: 'Arriving', value: String(groups.ARRIVING.length), color: groups.ARRIVING.length ? '#3b82f6' : undefined },
                    { label: 'In house', value: String(groups.IN_HOUSE.length) },
                    { label: 'Leaving', value: String(groups.LEAVING.length), color: groups.LEAVING.length ? '#d97706' : undefined },
                    { label: 'To confirm', value: String(groups.NEW.length) },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All open', icon: 'apps-outline', count: open.length },
                        { key: 'NEW', label: 'To confirm', icon: 'notifications-outline', count: groups.NEW.length },
                        { key: 'ARRIVING', label: 'Arriving', icon: 'log-in-outline', count: groups.ARRIVING.length },
                        { key: 'IN_HOUSE', label: 'In house', icon: 'bed-outline', count: groups.IN_HOUSE.length },
                        { key: 'LEAVING', label: 'Leaving', icon: 'log-out-outline', count: groups.LEAVING.length },
                        { key: 'DONE', label: 'Past', icon: 'archive-outline', count: done.length },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                }}
            />
            <StaySheet booking={selected} onClose={() => setSelectedId(null)} onChanged={replace} today={today} />
        </>
    );
}

/** One stay: who, when, what's due, and what to do next. */
function StaySheet({ booking, onClose, onChanged, today }: { booking: RoomBooking | null; onClose: () => void; onChanged: (b: RoomBooking) => void; today: string }) {
    const { theme, border } = useListTokens();
    const { paymentMethodsList } = usePaymentMethodsSync();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [methodId, setMethodId] = useState<string>('');
    useEffect(() => setError(null), [booking?.id]);

    // At the desk: cash, card, bank… or mobile money (an M-Pesa prompt). Never credit.
    const methods = useMemo(() => {
        const list = (paymentMethodsList ?? []).filter((m: any) => m?.active !== false && String(m?.title ?? '').toUpperCase() !== 'CREDIT');
        const rank = (t: string) => (t === 'CASH' ? 0 : t === 'MOBILE MONEY' ? 1 : 2);
        return [...list].sort((a: any, b: any) => rank(String(a.title).toUpperCase()) - rank(String(b.title).toUpperCase()));
    }, [paymentMethodsList]);
    useEffect(() => {
        if (!methodId && methods.length) setMethodId(String(methods[0].id));
    }, [methods, methodId]);
    if (!booking) return null;

    const method: any = methods.find((m: any) => String(m.id) === methodId);
    const isMomo = String(method?.title ?? '').toUpperCase() === 'MOBILE MONEY';
    const due = Number(booking.amount_due);
    const live = ['BOOKED', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status);

    const act = async (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        setError(null);
        try {
            const res: any = await fn();
            if (isOk(res)) onChanged(res.data.room_booking);
            else setError(errorText(res, 'That did not work.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };
    const move = (status: StayStatus, label: string, icon: any, variant: 'primary' | 'secondary' | 'danger' = 'primary', disabled = false) => (
        <SheetButton key={status} label={label} icon={icon} variant={variant} loading={busy === status} disabled={disabled || (!!busy && busy !== status)} onPress={() => void act(status, () => hotelApi.updateBooking(booking.id, status))} />
    );
    const row = (label: string, value: string) => (
        <View className="flex-row justify-between" style={{ gap: 12 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{label}</Text>
            <Text className="flex-1 text-right" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{value}</Text>
        </View>
    );
    const early = booking.checkin_date > today;

    return (
        <AdminSheet visible onClose={onClose} title={booking.guest_name || 'Guest'} subtitle={[booking.room_title, booking.reference].filter(Boolean).join(' · ')} icon="bed-outline" width={560}>
            <View style={{ gap: 14 }}>
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {pill(booking)}
                    {live || booking.status === 'CHECKED_OUT' ? <AdminBadgePill badge={booking.is_paid ? { label: 'Paid', tone: 'success', icon: 'checkmark-circle' } : { label: 'Not paid', tone: 'warning' }} /> : null}
                    <AdminBadgePill badge={{ label: booking.origin === 'STAFF' ? 'Taken at the desk' : 'Booked in the app', tone: 'neutral' }} />
                </View>
                <View className="rounded-2xl p-3" style={{ gap: 8, borderWidth: 1, borderColor: border }}>
                    {row('Stay', stay(booking))}
                    {row('Guests', String(booking.guests))}
                    {row('Phone', booking.guest_phone || '—')}
                    {row('Rate', `${kes(booking.nightly_rate)} × ${booking.nights}`)}
                    {row('Total', kes(booking.total))}
                    {Number(booking.paid) > 0 ? row('Paid', kes(booking.paid)) : null}
                    {due > 0 && live ? row('Due', kes(due)) : null}
                    {booking.notes ? row('Requests', booking.notes) : null}
                </View>

                {live && due > 0 ? (
                    <View className="rounded-2xl p-3" style={{ gap: 12, borderWidth: 1, borderColor: border }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Take payment · {kes(due)}</Text>
                        {methods.length ? (
                            <ChoiceChips<string> label="Paid by" options={methods.map((m: any) => ({ value: String(m.id), label: String(m.title).charAt(0) + String(m.title).slice(1).toLowerCase() }))} value={methodId} onChange={setMethodId} />
                        ) : null}
                        {isMomo ? (
                            <RoomPayment booking={booking} defaultPhone={booking.guest_phone ?? ''} onPaid={onChanged} label={`Send M-Pesa prompt · ${kes(due)}`} />
                        ) : (
                            <SheetButton label={`Record payment · ${kes(due)}`} icon="checkmark" loading={busy === 'pay'} disabled={!!busy && busy !== 'pay'} onPress={() => void act('pay', () => hotelApi.recordPayment(booking.id, methodId || null))} />
                        )}
                    </View>
                ) : null}

                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{error}</Text> : null}

                <View style={{ gap: 8 }}>
                    {booking.status === 'BOOKED' ? move('CONFIRMED', 'Confirm booking', 'checkmark-done-outline') : null}
                    {booking.status === 'BOOKED' || booking.status === 'CONFIRMED'
                        ? move('CHECKED_IN', early ? `Check-in opens ${prettyDate(booking.checkin_date)}` : 'Check in', 'log-in-outline', booking.status === 'BOOKED' ? 'secondary' : 'primary', early)
                        : null}
                    {booking.status === 'CHECKED_IN' ? move('CHECKED_OUT', due > 0 ? 'Take payment to check out' : 'Check out', 'log-out-outline', 'primary', due > 0) : null}
                    {booking.status === 'BOOKED' || booking.status === 'CONFIRMED' ? (
                        <View className="flex-row" style={{ gap: 8 }}>
                            <View style={{ flex: 1 }}>{move('NO_SHOW', 'No show', 'eye-off-outline', 'secondary')}</View>
                            <View style={{ flex: 1 }}>{move('CANCELLED', 'Cancel booking', 'close-circle-outline', 'danger')}</View>
                        </View>
                    ) : null}
                </View>
            </View>
        </AdminSheet>
    );
}
