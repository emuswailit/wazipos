// utils/medicationReminders.ts
//
// Reminders for medicines bought on a prescription:
//
//   • Dose reminders — local notifications 60 and 30 minutes before each dose
//     (expo-notifications). Only the next DOSE_SLOTS dose times are scheduled
//     (phones cap pending notifications); they're re-synced whenever the
//     schedule is loaded, a dose is confirmed or a purchase is paid.
//   • Refill reminders — events in the phone's calendar 7, 3 and 1 day(s)
//     before a partly-bought medicine runs out (expo-calendar). The backend
//     also pushes these, so they still arrive if the calendar is refused.
//
// Both modules are native-only and are loaded lazily, so this file is safe to
// import on web (where everything here is a no-op).

import { customerRxClient } from '@/api/retailerPrescriptionsApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/* ------------------------------------------------------------------ */
/* Types (backend: retailers/utils/prescription_schedule.py)           */
/* ------------------------------------------------------------------ */

export interface RefillReminder {
    days_before: number;
    /** YYYY-MM-DD */
    date: string;
}

export interface Medicine {
    prescription_item: string;
    prescription: string;
    patient_name: string;
    title: string;
    dose: string;
    frequency_title: string;
    route_title: string;
    instruction: string;
    unit_of_issue: string;
    days: number | null;
    /** Prescribed for a month or longer: check for a follow-up appointment with the prescriber. */
    is_long_term?: boolean;
    doses_per_day: number;
    total_doses: number;
    supplied_doses: number;
    administered_doses: number;
    doses_left: number;
    required_unit_quantity: number;
    bought_quantity: number;
    balance_quantity: number;
    allow_partial_purchase: boolean;
    /** Only part of the prescribed quantity is bought: a refill is due before `runs_out_at`. */
    is_partial: boolean;
    runs_out_at: string | null;
    next_dose_at: string | null;
    refill_reminders: RefillReminder[];
}

export interface Dose {
    id: string;
    prescription_item: string;
    /** Wall-clock time without an offset: YYYY-MM-DDTHH:MM:SS */
    scheduled_at: string;
    is_administered: boolean;
    administered_at: string | null;
    comment: string;
}

export interface MedicationSchedule {
    medicines: Medicine[];
    doses: Dose[];
    now: string;
    timezone: string;
    from: string;
    to: string;
    dose_reminder_minutes: number[];
    refill_reminder_days: number[];
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Dose times are wall-clock times: read them in the phone's own time zone. */
export function parseWallTime(value: string | null | undefined): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value ?? ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

export const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function fetchMedicationSchedule(prescriptionId?: string): Promise<MedicationSchedule | null> {
    const res = await customerRxClient.post({ action: 'GetMedicationSchedule', ...(prescriptionId ? { prescription: prescriptionId } : {}) });
    if (res.ok && res.data?.response_code === 0 && res.data?.schedule) return res.data.schedule as MedicationSchedule;
    return null;
}

/* ------------------------------------------------------------------ */
/* Native modules (lazy)                                               */
/* ------------------------------------------------------------------ */

const isWeb = Platform.OS === 'web';

let notificationsModule: any | null | undefined;
function getNotifications(): any | null {
    if (notificationsModule !== undefined) return notificationsModule;
    notificationsModule = null;
    if (!isWeb) {
        try {
            notificationsModule = require('expo-notifications');
        } catch {
            notificationsModule = null;
        }
    }
    return notificationsModule;
}

let calendarModule: any | null | undefined;
function getCalendar(): any | null {
    if (calendarModule !== undefined) return calendarModule;
    calendarModule = null;
    if (!isWeb) {
        try {
            // Not in Expo Go: needs a development / production build.
            calendarModule = require('expo-calendar');
        } catch {
            calendarModule = null;
        }
    }
    return calendarModule;
}

export const doseRemindersSupported = () => !!getNotifications();
export const calendarRemindersSupported = () => !!getCalendar();

/* ------------------------------------------------------------------ */
/* Dose reminders (local notifications)                                */
/* ------------------------------------------------------------------ */

const DOSE_KIND = 'dose-reminder';
const DOSE_CHANNEL = 'medication';
/** Dose times scheduled ahead; × 2 reminders each stays under iOS's cap of 64 pending notifications. */
const DOSE_SLOTS = 25;
export const MEDICATIONS_ROUTE = '/medications';

let handlerSet = false;
function ensureForegroundHandler(N: any) {
    if (handlerSet) return;
    handlerSet = true;
    try {
        N.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
    } catch {
        /* handler unsupported here: reminders still show when the app is in the background */
    }
}

async function notificationsAllowed(N: any, ask: boolean): Promise<boolean> {
    try {
        if (Platform.OS === 'android') {
            // Android 13+ only shows the permission prompt once a channel exists.
            await N.setNotificationChannelAsync(DOSE_CHANNEL, {
                name: 'Medication reminders',
                importance: N.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
            });
        }
        let settings = await N.getPermissionsAsync();
        const ok = (s: any) => !!s?.granted || s?.ios?.status === N.IosAuthorizationStatus?.PROVISIONAL;
        if (!ok(settings) && ask && settings?.canAskAgain !== false) {
            settings = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
        }
        return ok(settings);
    } catch {
        return false;
    }
}

export type ReminderStatus = 'ok' | 'denied' | 'unsupported';

export interface DoseReminderResult {
    status: ReminderStatus;
    /** Notifications now pending. */
    scheduled: number;
}

/**
 * Replace the pending dose reminders with ones for the next doses of `schedule`.
 * `ask`: prompt for the notification permission if it isn't granted yet.
 */
async function syncDoseReminders(schedule: MedicationSchedule, ask = false): Promise<DoseReminderResult> {
    const N = getNotifications();
    if (!N) return { status: 'unsupported', scheduled: 0 };
    ensureForegroundHandler(N);
    if (!(await notificationsAllowed(N, ask))) return { status: 'denied', scheduled: 0 };

    try {
        const pending: any[] = await N.getAllScheduledNotificationsAsync();
        await Promise.all(
            pending
                .filter((p) => p?.content?.data?.kind === DOSE_KIND)
                .map((p) => N.cancelScheduledNotificationAsync(p.identifier).catch(() => undefined))
        );

        const titles = new Map(schedule.medicines.map((m) => [m.prescription_item, m]));
        const now = Date.now();
        // Medicines due at the same time share one reminder.
        const slots = new Map<number, string[]>();
        for (const dose of schedule.doses) {
            if (dose.is_administered) continue;
            const at = parseWallTime(dose.scheduled_at)?.getTime();
            if (!at || at <= now) continue;
            const med = titles.get(dose.prescription_item);
            const label = med ? (med.dose ? `${med.title} (${med.dose})` : med.title) : 'Your medicine';
            slots.set(at, [...(slots.get(at) ?? []), label]);
        }
        const offsets = schedule.dose_reminder_minutes?.length ? schedule.dose_reminder_minutes : [60, 30];
        let scheduled = 0;
        for (const at of [...slots.keys()].sort((a, b) => a - b).slice(0, DOSE_SLOTS)) {
            const names = slots.get(at) ?? [];
            const due = formatTime(new Date(at));
            for (const minutes of offsets) {
                const fireAt = at - minutes * 60_000;
                if (fireAt <= now + 5_000) continue;
                await N.scheduleNotificationAsync({
                    content: {
                        title: minutes >= 60 ? `Medicine due in ${minutes / 60 === 1 ? '1 hour' : `${Math.round(minutes / 60)} hours`}` : `Medicine due in ${minutes} minutes`,
                        body: `${names.join(', ')} — take at ${due}. Tap to confirm once taken.`,
                        sound: true,
                        data: { kind: DOSE_KIND, url: MEDICATIONS_ROUTE, due_at: at },
                    },
                    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt), channelId: DOSE_CHANNEL },
                });
                scheduled += 1;
            }
        }
        return { status: 'ok', scheduled };
    } catch (e) {
        if (__DEV__) console.warn('[medicationReminders] dose reminders failed', e);
        return { status: 'ok', scheduled: 0 };
    }
}

/** Remove every pending dose reminder (on logout). */
export async function clearDoseReminders(): Promise<void> {
    const N = getNotifications();
    if (!N) return;
    try {
        const pending: any[] = await N.getAllScheduledNotificationsAsync();
        await Promise.all(
            pending
                .filter((p) => p?.content?.data?.kind === DOSE_KIND)
                .map((p) => N.cancelScheduledNotificationAsync(p.identifier).catch(() => undefined))
        );
    } catch {
        /* nothing to clear */
    }
}

/** Calls `onOpen` when the user taps a dose reminder. Returns an unsubscribe function. */
export function onDoseReminderTapped(onOpen: () => void): () => void {
    const N = getNotifications();
    if (!N) return () => undefined;
    ensureForegroundHandler(N);
    try {
        const sub = N.addNotificationResponseReceivedListener((response: any) => {
            if (response?.notification?.request?.content?.data?.kind === DOSE_KIND) onOpen();
        });
        return () => sub?.remove?.();
    } catch {
        return () => undefined;
    }
}

/* ------------------------------------------------------------------ */
/* Refill reminders (phone calendar)                                   */
/* ------------------------------------------------------------------ */

const CALENDAR_STORE_KEY = 'wazipos.refillCalendarEvents.v1';
const REFILL_HOUR = 9;

/** `${prescription_item}|${runs_out_at}` → calendar event ids created for it. */
type CalendarStore = Record<string, string[]>;

async function readStore(): Promise<CalendarStore> {
    try {
        const raw = await AsyncStorage.getItem(CALENDAR_STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function writeStore(store: CalendarStore) {
    try {
        await AsyncStorage.setItem(CALENDAR_STORE_KEY, JSON.stringify(store));
    } catch {
        /* worst case: reminders are added again next time */
    }
}

async function calendarAllowed(C: any, ask: boolean): Promise<boolean> {
    try {
        let perm = await C.getCalendarPermissions();
        if (!perm?.granted && ask && perm?.canAskAgain !== false) perm = await C.requestCalendarPermissions();
        return !!perm?.granted;
    } catch {
        return false;
    }
}

/** A calendar on the phone that events can be written to (created if there is none). */
async function writableCalendar(C: any): Promise<any | null> {
    if (Platform.OS === 'ios') {
        try {
            const def = C.getDefaultCalendarSync();
            if (def) return def;
        } catch {
            /* fall through to the list */
        }
    }
    try {
        const all: any[] = await C.getCalendars(C.EntityTypes.EVENT);
        const writable = all.filter((c) => c?.allowsModifications !== false && (!c?.accessLevel || ['owner', 'editor', 'contributor', 'root'].includes(String(c.accessLevel))));
        const pick = writable.find((c) => c?.isPrimary) ?? writable.find((c) => c?.title === 'WaziPOS') ?? writable[0];
        if (pick) return pick;
    } catch {
        /* try creating one */
    }
    try {
        return await C.createCalendar({
            title: 'WaziPOS',
            name: 'wazipos',
            color: '#4f46e5',
            entityType: C.EntityTypes.EVENT,
            source: { isLocalAccount: true, name: 'WaziPOS' },
            ownerAccount: 'WaziPOS',
            accessLevel: C.CalendarAccessLevel?.OWNER ?? 'owner',
        });
    } catch {
        return null;
    }
}

async function deleteEvents(C: any, ids: string[]) {
    for (const id of ids) {
        try {
            const event = await C.ExpoCalendarEvent.get(id);
            await event?.delete?.();
        } catch {
            /* already removed by the user */
        }
    }
}

export interface RefillCalendarResult {
    status: ReminderStatus;
    /** Events added by this call. */
    created: number;
    /** Medicines that have refill reminders in the calendar after this call. */
    medicines: number;
}

/**
 * Keep the phone calendar in step with the partly-bought medicines: an event
 * 7, 3 and 1 day(s) before each runs out; events of medicines that were
 * refilled (or whose run-out date moved) are removed.
 * `ask`: prompt for calendar access if it isn't granted yet.
 */
async function syncRefillCalendar(schedule: MedicationSchedule, ask = false): Promise<RefillCalendarResult> {
    const C = getCalendar();
    if (!C) return { status: 'unsupported', created: 0, medicines: 0 };
    const due = schedule.medicines.filter((m) => m.is_partial && m.runs_out_at && m.refill_reminders?.length);
    const store = await readStore();
    if (!due.length && !Object.keys(store).length) return { status: 'ok', created: 0, medicines: 0 };
    if (!(await calendarAllowed(C, ask))) return { status: 'denied', created: 0, medicines: 0 };

    const wanted = new Map(due.map((m) => [`${m.prescription_item}|${m.runs_out_at}`, m]));
    let created = 0;
    try {
        for (const key of Object.keys(store)) {
            if (wanted.has(key)) continue;
            await deleteEvents(C, store[key]);
            delete store[key];
        }

        const missing = [...wanted.entries()].filter(([key]) => !store[key]);
        if (missing.length) {
            const calendar = await writableCalendar(C);
            if (!calendar) return { status: 'denied', created: 0, medicines: Object.keys(store).length };
            const now = Date.now();
            for (const [key, med] of missing) {
                const runsOut = parseWallTime(med.runs_out_at);
                const ids: string[] = [];
                for (const reminder of med.refill_reminders) {
                    const day = parseWallTime(reminder.date);
                    if (!day) continue;
                    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), REFILL_HOUR, 0, 0);
                    if (start.getTime() <= now) continue; // that day has passed
                    const inDays = reminder.days_before === 1 ? 'tomorrow' : `in ${reminder.days_before} days`;
                    const event = await calendar.createEvent({
                        title: `Refill ${med.title}: runs out ${inDays}`,
                        notes:
                            `Your ${med.title} for ${med.patient_name} runs out` +
                            `${runsOut ? ` on ${runsOut.toDateString()} at ${formatTime(runsOut)}` : ''}. ` +
                            `${med.balance_quantity} of the prescribed ${med.required_unit_quantity} are still to buy. ` +
                            'Open WaziPOS → Prescriptions to buy the rest.',
                        startDate: start,
                        endDate: new Date(start.getTime() + 30 * 60_000),
                        allDay: false,
                        alarms: [{ relativeOffset: 0 }],
                    });
                    if (event?.id) ids.push(String(event.id));
                }
                created += ids.length;
                // Stored even when empty (every reminder day has passed) so it isn't retried on each sync.
                store[key] = ids;
            }
        }
        await writeStore(store);
        return { status: 'ok', created, medicines: Object.values(store).filter((ids) => ids.length).length };
    } catch (e) {
        if (__DEV__) console.warn('[medicationReminders] calendar sync failed', e);
        await writeStore(store);
        return { status: 'ok', created, medicines: Object.values(store).filter((ids) => ids.length).length };
    }
}

/* ------------------------------------------------------------------ */
/* Everything at once                                                  */
/* ------------------------------------------------------------------ */

interface ReminderSyncResult {
    schedule: MedicationSchedule | null;
    doses: DoseReminderResult;
    calendar: RefillCalendarResult;
}

/**
 * Sync both kinds of reminders with `schedule` (fetched when not given).
 * `ask`: prompt for missing permissions — pass true only from a user action.
 */
export async function syncMedicationReminders(options: { schedule?: MedicationSchedule | null; ask?: boolean } = {}): Promise<ReminderSyncResult> {
    const ask = !!options.ask;
    let schedule = options.schedule ?? null;
    if (!schedule) {
        try {
            schedule = await fetchMedicationSchedule();
        } catch {
            schedule = null;
        }
    }
    if (!schedule) {
        return { schedule: null, doses: { status: doseRemindersSupported() ? 'ok' : 'unsupported', scheduled: 0 }, calendar: { status: calendarRemindersSupported() ? 'ok' : 'unsupported', created: 0, medicines: 0 } };
    }
    const doses = await syncDoseReminders(schedule, ask);
    const calendar = await syncRefillCalendar(schedule, ask);
    return { schedule, doses, calendar };
}
