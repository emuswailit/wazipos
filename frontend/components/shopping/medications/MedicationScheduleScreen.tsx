// components/shopping/medications/MedicationScheduleScreen.tsx
//
// The customer's medicines bought on prescriptions: every calculated dose
// (administration), which they confirm each time they take it, plus how long
// each medicine lasts. Partly-bought medicines show when they run out and the
// refill reminders (7, 3 and 1 day(s) before).
//
// Reminders (utils/medicationReminders.ts) are re-synced here on load and
// after each confirmation: notifications 60 and 30 minutes before a dose, and
// refill events in the phone's calendar.

import { customerRxClient } from '@/api/retailerPrescriptionsApi';
import { useAuth } from '@/context/AuthContext';
import {
    calendarRemindersSupported,
    doseRemindersSupported,
    fetchMedicationSchedule,
    formatTime,
    parseWallTime,
    syncMedicationReminders,
    type Dose,
    type DoseReminderResult,
    type MedicationSchedule,
    type Medicine,
    type RefillCalendarResult,
} from '@/utils/medicationReminders';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

/** A dose can be confirmed from an hour before its time (enforced by the backend too). */
const CONFIRM_EARLY_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayLabel(dayStart: number, today: number): string {
    const diff = Math.round((dayStart - today) / DAY_MS);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return new Date(dayStart).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

const shortDate = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');

function daysUntil(d: Date | null, now: number): number | null {
    return d ? Math.round((startOfDay(d) - startOfDay(new Date(now))) / DAY_MS) : null;
}

export default function MedicationScheduleScreen() {
    const { theme } = useAuth();
    const router = useRouter();
    const { prescription: param } = useLocalSearchParams<{ prescription?: string }>();
    const prescriptionId = (Array.isArray(param) ? param[0] : param) || undefined;

    const [schedule, setSchedule] = useState<MedicationSchedule | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyDose, setBusyDose] = useState<string | null>(null);
    const [doseError, setDoseError] = useState<{ id: string; text: string } | null>(null);
    const [doseReminders, setDoseReminders] = useState<DoseReminderResult | null>(null);
    const [calendar, setCalendar] = useState<RefillCalendarResult | null>(null);
    const [settingUp, setSettingUp] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    /** Reminders always cover every prescription, whatever this screen is filtered to. */
    const syncReminders = useCallback(async (ask: boolean, shown?: MedicationSchedule | null) => {
        const result = await syncMedicationReminders({ schedule: prescriptionId ? null : shown, ask });
        setDoseReminders(result.doses);
        setCalendar(result.calendar);
    }, [prescriptionId]);

    const load = useCallback(
        async (isRefresh = false) => {
            if (isRefresh) setRefreshing(true);
            setError(null);
            try {
                const fresh = await fetchMedicationSchedule(prescriptionId);
                if (!fresh) setError("Couldn't load your medication schedule.");
                else {
                    setSchedule(fresh);
                    void syncReminders(false, fresh);
                }
            } catch {
                setError("Couldn't reach the server. Check your connection.");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [prescriptionId, syncReminders]
    );

    useEffect(() => {
        void load();
    }, [load]);

    const turnOnReminders = async () => {
        setSettingUp(true);
        try {
            await syncReminders(true, schedule);
        } finally {
            setSettingUp(false);
        }
    };

    const setTaken = async (dose: Dose, taken: boolean) => {
        setBusyDose(dose.id);
        setDoseError(null);
        try {
            const res = await customerRxClient.post({ action: 'ConfirmPrescriptionAdministration', administration: dose.id, is_administered: taken });
            const result = res.data?.result;
            if (res.ok && res.data?.response_code === 0 && result?.dose) {
                const next: MedicationSchedule | null = schedule && {
                    ...schedule,
                    doses: schedule.doses.map((d) => (d.id === result.dose.id ? result.dose : d)),
                    medicines: schedule.medicines.map((m) => (result.medicine && m.prescription_item === result.medicine.prescription_item ? result.medicine : m)),
                };
                setSchedule(next);
                // A confirmed dose no longer needs its reminders.
                void syncReminders(false, next);
            } else {
                setDoseError({ id: dose.id, text: (Array.isArray(res.data?.errors) && res.data.errors[0]) || res.data?.response_message || 'That did not work.' });
            }
        } catch {
            setDoseError({ id: dose.id, text: "Couldn't reach the server. Check your connection." });
        } finally {
            setBusyDose(null);
        }
    };

    const medicines = schedule?.medicines ?? [];
    const byItem = useMemo(() => new Map(medicines.map((m) => [m.prescription_item, m])), [medicines]);

    /** Doses grouped by day; days before today only keep what was missed. */
    const days = useMemo(() => {
        const today = startOfDay(new Date(now));
        const groups = new Map<number, { dose: Dose; at: Date }[]>();
        for (const dose of schedule?.doses ?? []) {
            const at = parseWallTime(dose.scheduled_at);
            if (!at) continue;
            const day = startOfDay(at);
            if (day < today && dose.is_administered) continue;
            groups.set(day, [...(groups.get(day) ?? []), { dose, at }]);
        }
        return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([day, rows]) => ({ day, label: dayLabel(day, today), rows }));
    }, [schedule, now]);

    const partial = medicines.filter((m) => m.is_partial);
    const dueNow = (schedule?.doses ?? []).filter((d) => {
        const at = parseWallTime(d.scheduled_at)?.getTime();
        return !d.is_administered && !!at && at <= now;
    }).length;

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background }}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    const notificationsOn = doseReminders?.status === 'ok';
    const calendarOn = calendar?.status === 'ok';
    const needsSetup =
        (doseRemindersSupported() && doseReminders?.status === 'denied') || (partial.length > 0 && calendarRemindersSupported() && calendar?.status === 'denied');

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="px-4 pt-3 pb-3 border-b" style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }}>
                <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}>My medicines</Text>
                        <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                            {medicines.length === 0
                                ? 'Medicines you buy on a prescription appear here.'
                                : dueNow
                                    ? `${dueNow} dose${dueNow === 1 ? '' : 's'} to confirm`
                                    : 'Confirm each dose when you take it.'}
                        </Text>
                    </View>
                    <Pressable onPress={() => void load(true)} disabled={refreshing} className="px-3 py-1.5 rounded-full" style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.5 : 1 }}>
                        <Text className="uppercase tracking-widest text-white" style={{ fontFamily: theme.font.bold, fontSize: 10 }}>
                            {refreshing ? '...' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>
                {prescriptionId ? (
                    <Pressable onPress={() => router.setParams({ prescription: undefined } as any)} className="flex-row items-center mt-2">
                        <Ionicons name="funnel-outline" size={13} color={theme.primary} />
                        <Text className="ml-1.5" style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>
                            Showing one prescription · show all
                        </Text>
                    </Pressable>
                ) : null}
            </View>

            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 820, alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
            >
                {error ? (
                    <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: theme.dangerSoft }}>
                        <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 13 }}>{error}</Text>
                    </View>
                ) : null}

                {medicines.length === 0 && !error ? (
                    <View className="items-center rounded-xl border border-dashed p-8" style={{ borderColor: theme.border }}>
                        <Ionicons name="medkit-outline" size={40} color={theme.textSubtle} />
                        <Text className="mt-3 text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13.5 }}>
                            No medicines yet. Once you pay for medicines on a prescription, your doses and reminders show up here.
                        </Text>
                        <Pressable onPress={() => router.push('/userPrescriptions' as any)} className="mt-4 px-5 py-2.5 rounded-xl" style={{ backgroundColor: theme.primary }}>
                            <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                                My prescriptions
                            </Text>
                        </Pressable>
                    </View>
                ) : null}

                {/* Reminder status */}
                {medicines.length > 0 ? (
                    <View className="rounded-xl border p-3 mb-5 gap-2" style={{ borderColor: theme.border, backgroundColor: theme.panel }}>
                        <StatusLine
                            icon="notifications-outline"
                            ok={notificationsOn}
                            text={
                                !doseRemindersSupported()
                                    ? 'Dose reminders work in the WaziPOS phone app.'
                                    : notificationsOn
                                        ? 'You’re reminded 1 hour and 30 minutes before each dose.'
                                        : 'Dose reminders are off: notifications aren’t allowed for WaziPOS.'
                            }
                        />
                        {partial.length > 0 ? (
                            <StatusLine
                                icon="calendar-outline"
                                ok={calendarOn}
                                text={
                                    !calendarRemindersSupported()
                                        ? 'You’ll be notified 7, 3 and 1 day(s) before a medicine runs out.'
                                        : calendarOn
                                            ? 'Refill reminders are in your calendar 7, 3 and 1 day(s) before a medicine runs out.'
                                            : 'Refill reminders aren’t in your calendar yet: calendar access isn’t allowed.'
                                }
                            />
                        ) : null}
                        {needsSetup ? (
                            <Pressable onPress={() => void turnOnReminders()} disabled={settingUp} className="self-start px-4 py-2 rounded-lg mt-1" style={{ backgroundColor: theme.primary, opacity: settingUp ? 0.6 : 1 }}>
                                <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12.5 }}>
                                    {settingUp ? 'Setting up…' : 'Turn on reminders'}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                {/* Supply per medicine */}
                {medicines.length > 0 ? (
                    <>
                        <SectionTitle text={`Medicines (${medicines.length})`} />
                        {medicines.map((m) => (
                            <MedicineCard key={m.prescription_item} med={m} now={now} onBuyRest={() => router.push(`/userPrescriptions?prescription=${m.prescription}` as any)} />
                        ))}
                    </>
                ) : null}

                {/* Doses */}
                {medicines.length > 0 ? (
                    <View className="mt-3">
                        <SectionTitle text="Doses" />
                        {days.length === 0 ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No doses in the next two weeks.</Text>
                        ) : (
                            days.map((group) => (
                                <View key={group.day} className="mb-4">
                                    <Text className="mb-2" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                                        {group.label}
                                    </Text>
                                    <View className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.panel }}>
                                        {group.rows.map(({ dose, at }, i) => (
                                            <DoseRow
                                                key={dose.id}
                                                dose={dose}
                                                at={at}
                                                med={byItem.get(dose.prescription_item)}
                                                now={now}
                                                first={i === 0}
                                                busy={busyDose === dose.id}
                                                error={doseError?.id === dose.id ? doseError.text : null}
                                                onToggle={(taken) => void setTaken(dose, taken)}
                                            />
                                        ))}
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

function SectionTitle({ text }: { text: string }) {
    const { theme } = useAuth();
    return (
        <Text className="uppercase tracking-widest mb-3" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11 }}>
            {text}
        </Text>
    );
}

function StatusLine({ icon, ok, text }: { icon: keyof typeof Ionicons.glyphMap; ok: boolean; text: string }) {
    const { theme } = useAuth();
    return (
        <View className="flex-row items-start">
            <Ionicons name={icon} size={16} color={ok ? theme.success : theme.textDark} />
            <Text className="ml-2 flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                {text}
            </Text>
        </View>
    );
}

function MedicineCard({ med, now, onBuyRest }: { med: Medicine; now: number; onBuyRest: () => void }) {
    const { theme } = useAuth();
    const runsOut = parseWallTime(med.runs_out_at);
    const left = daysUntil(runsOut, now);
    const progress = med.supplied_doses ? Math.min(1, med.administered_doses / med.supplied_doses) : 0;
    const finished = med.doses_left === 0;
    const urgent = med.is_partial && left !== null && left <= 3;
    const dosing = [med.dose ? `Dose ${med.dose}` : '', med.frequency_title, med.route_title, med.days ? `${med.days} days` : ''].filter(Boolean).join(' · ');
    const upcomingReminders = med.refill_reminders
        .map((r) => ({ ...r, at: parseWallTime(r.date) }))
        .filter((r) => r.at && startOfDay(r.at) >= startOfDay(new Date(now)));

    return (
        <View className="rounded-xl border p-3 mb-3" style={{ backgroundColor: theme.panel, borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>
                {med.title}
            </Text>
            <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                {[med.patient_name, dosing].filter(Boolean).join(' · ')}
            </Text>
            {med.instruction ? (
                <Text className="mt-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {med.instruction}
                </Text>
            ) : null}

            <View className="h-2 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: theme.surfaceAlt }}>
                <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: theme.success }} />
            </View>
            <Text className="mt-1.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                {med.administered_doses} of {med.supplied_doses} doses taken
                {finished ? '' : ` · ${med.doses_left} left`}
                {runsOut && !finished ? ` · lasts until ${shortDate(runsOut)}, ${formatTime(runsOut)}` : ''}
            </Text>

            {med.is_long_term ? (
                <View className="flex-row items-start mt-2">
                    <Ionicons name="calendar-outline" size={14} color={theme.primary} />
                    <Text className="ml-1.5 flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        Long-term medicine: check whether you have a follow-up appointment with your prescriber before it finishes.
                    </Text>
                </View>
            ) : null}

            {med.is_partial ? (
                <View className="rounded-lg p-2.5 mt-3" style={{ backgroundColor: urgent ? theme.dangerSoft : 'rgba(245,158,11,0.12)' }}>
                    <Text style={{ color: urgent ? theme.danger : '#b45309', fontFamily: theme.font.bold, fontSize: 12.5 }}>
                        {left === null
                            ? 'Partly bought'
                            : left < 0
                                ? 'This supply has run out'
                                : left === 0
                                    ? 'Runs out today'
                                    : `Runs out in ${left} day${left === 1 ? '' : 's'}`}
                        {` · bought ${med.bought_quantity} of ${med.required_unit_quantity}`}
                    </Text>
                    <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {upcomingReminders.length
                            ? `Refill reminders: ${upcomingReminders.map((r) => shortDate(r.at)).join(', ')}.`
                            : 'Buy the rest now so you don’t miss a dose.'}
                    </Text>
                    <Pressable onPress={onBuyRest} className="self-start px-3.5 py-2 rounded-lg mt-2" style={{ backgroundColor: theme.primary }}>
                        <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12.5 }}>
                            Buy the remaining {med.balance_quantity}
                        </Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}

function DoseRow({
    dose,
    at,
    med,
    now,
    first,
    busy,
    error,
    onToggle,
}: {
    dose: Dose;
    at: Date;
    med?: Medicine;
    now: number;
    first: boolean;
    busy: boolean;
    error: string | null;
    onToggle: (taken: boolean) => void;
}) {
    const { theme } = useAuth();
    const time = at.getTime();
    const taken = dose.is_administered;
    const canConfirm = time - now <= CONFIRM_EARLY_MS;
    const overdue = !taken && time < now - CONFIRM_EARLY_MS;
    const takenAt = dose.administered_at ? new Date(dose.administered_at) : null;

    return (
        <View className="px-3 py-3" style={{ borderTopWidth: first ? 0 : 1, borderTopColor: theme.border }}>
            <View className="flex-row items-center">
                <Text style={{ width: 52, color: overdue ? theme.danger : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{formatTime(at)}</Text>
                <View className="flex-1 min-w-0 pr-2">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={2}>
                        {med?.title ?? 'Medicine'}
                    </Text>
                    <Text style={{ color: overdue ? theme.danger : theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                        {[
                            med?.dose ? `Take ${med.dose}` : '',
                            med?.route_title,
                            taken ? `taken${takenAt && !isNaN(takenAt.getTime()) ? ` at ${formatTime(takenAt)}` : ''}` : overdue ? 'not confirmed' : '',
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                </View>
                {busy ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                ) : taken ? (
                    <Pressable onPress={() => onToggle(false)} accessibilityLabel="Taken. Tap to undo" hitSlop={8} className="flex-row items-center px-3 py-2 rounded-lg" style={{ backgroundColor: theme.successSoft }}>
                        <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                        <Text className="ml-1.5" style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 12.5 }}>
                            Taken
                        </Text>
                    </Pressable>
                ) : canConfirm ? (
                    <Pressable onPress={() => onToggle(true)} className="px-3.5 py-2 rounded-lg" style={{ backgroundColor: theme.primary }}>
                        <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12.5 }}>
                            Confirm taken
                        </Text>
                    </Pressable>
                ) : (
                    <Text style={{ color: theme.textSubtle, fontFamily: theme.font.medium, fontSize: 12 }}>Upcoming</Text>
                )}
            </View>
            {error ? (
                <Text className="mt-1.5" style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
}
