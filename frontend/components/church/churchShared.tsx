// components/church/churchShared.tsx
//
// What the church screens share: date / time formatting, announcement, programme and
// event cards, sharing a church link, and useChurchAdmin() — the church an official is
// managing (AdminHome), remembered on this device when they help run more than one.

import churchesApi, { type AdminHome, type Announcement, type ChurchEvent, type ScheduleItem } from '@/api/churchesApi';
import { toast } from '@/components/common/Toast';
import { InlineNotice } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarDays, Clock, MapPin, Pin, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, Text, View } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;

/* ------------------------------------------------------------ formatting */

export function fmtDate(iso?: string | null, withYear = true) {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

export function fmtDateTime(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

/** "2026-12-25T10:00" in local time, for date-time inputs. */
export function toLocalInput(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local "YYYY-MM-DD" + "HH:MM" -> ISO string with the device's offset. */
export function joinDateTime(dateStr: string, timeStr: string) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
    return isNaN(d.getTime()) ? '' : d.toISOString();
}

export const todayIso = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ------------------------------------------------------------ small parts */

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
    const { theme } = useAuth();
    return <View style={[{ backgroundColor: theme.panel, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 10 }, style]}>{children}</View>;
}

export function SectionHeading({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 18, marginBottom: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{title}</Text>
                {hint ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5, marginTop: 2 }}>{hint}</Text> : null}
            </View>
            {right}
        </View>
    );
}

export function Chip({ label, color }: { label: string; color: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: `${color}1a`, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 11 }} numberOfLines={1}>{label}</Text>
        </View>
    );
}

export function Meta({ icon: Icon, text }: { icon: any; text: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
            <Icon size={13} color={theme.textMuted} strokeWidth={2.2} />
            <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, flexShrink: 1 }}>{text}</Text>
        </View>
    );
}

export function EmptyNote({ icon: Icon, title, text, action }: { icon: any; title: string; text?: string; action?: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={24} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5, textAlign: 'center' }}>{title}</Text>
            {text ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 380 }}>{text}</Text> : null}
            {action}
        </View>
    );
}

export function Loading() {
    const { theme } = useAuth();
    return <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />;
}

/* ------------------------------------------------------------ announcements, programme, events */

export function AnnouncementCard({ a, footer }: { a: Announcement; footer?: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                {a.pinned ? <Pin size={15} color={theme.primary} style={{ marginTop: 2 }} /> : null}
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{a.title}</Text>
                {a.audience === 'MEMBERS' ? <Chip label="Members" color={theme.warning} /> : null}
            </View>
            {a.from_denomination ? <Chip label={`From ${a.from_denomination}`} color={theme.success} /> : null}
            <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 14, lineHeight: 20 }}>{a.body}</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>
                {fmtDate(a.publish_at || a.created)}
                {a.expires_at ? ` · until ${fmtDate(a.expires_at)}` : ''}
            </Text>
            {footer}
        </Card>
    );
}

/** The weekly programme grouped by day (Monday first). */
export function ScheduleList({ items, onPress }: { items: ScheduleItem[]; onPress?: (s: ScheduleItem) => void }) {
    const { theme } = useAuth();
    const days = useMemo(() => {
        const map = new Map<number, ScheduleItem[]>();
        items.forEach((s) => map.set(s.day, [...(map.get(s.day) ?? []), s]));
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [items]);
    if (!items.length) return null;
    return (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
            {days.map(([day, rows], i) => (
                <View key={day} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: theme.border, flexDirection: 'row', gap: 12 }}>
                    <Text style={{ width: 86, color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>{rows[0].day_label}</Text>
                    <View style={{ flex: 1, gap: 8 }}>
                        {rows.map((s) => (
                            <Pressable key={s.id} disabled={!onPress} onPress={() => onPress?.(s)} style={onPress ? pointer : undefined}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 14, opacity: s.is_active ? 1 : 0.5 }}>
                                    {s.starts}
                                    {s.ends ? `–${s.ends}` : ''} · {s.title}
                                </Text>
                                {s.venue || s.group || s.notes ? (
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }} numberOfLines={2}>
                                        {[s.venue, s.group?.name, s.notes].filter(Boolean).join(' · ')}
                                    </Text>
                                ) : null}
                            </Pressable>
                        ))}
                    </View>
                </View>
            ))}
        </Card>
    );
}

export function EventCard({ e, footer }: { e: ChurchEvent; footer?: React.ReactNode }) {
    const { theme } = useAuth();
    const d = new Date(e.starts_at);
    return (
        <Card style={{ flexDirection: 'row', gap: 14, opacity: e.is_cancelled ? 0.6 : 1 }}>
            <View style={{ width: 54, height: 58, borderRadius: 14, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11, textTransform: 'uppercase' }}>{isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-KE', { month: 'short' })}</Text>
                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 20 }}>{isNaN(d.getTime()) ? '' : d.getDate()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, textDecorationLine: e.is_cancelled ? 'line-through' : 'none' }}>{e.title}</Text>
                    {e.is_cancelled ? <Chip label="Cancelled" color={theme.danger} /> : null}
                    {e.audience === 'MEMBERS' ? <Chip label="Members" color={theme.warning} /> : null}
                    {e.group ? <Chip label={e.group.name} color={theme.primary} /> : null}
                    {e.from_denomination ? <Chip label={e.from_denomination} color={theme.success} /> : null}
                </View>
                <Meta icon={Clock} text={`${fmtDateTime(e.starts_at)}${e.ends_at ? ` – ${fmtTime(e.ends_at)}` : ''}`} />
                {e.venue ? <Meta icon={MapPin} text={e.venue} /> : null}
                {e.leader ? <Meta icon={User} text={e.leader} /> : null}
                {e.description ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5 }} numberOfLines={4}>{e.description}</Text> : null}
                {footer}
            </View>
        </Card>
    );
}

export function ThisWeek({ schedule, events }: { schedule: ScheduleItem[]; events: ChurchEvent[] }) {
    const weekEnd = Date.now() + 7 * 86400000;
    const soon = events.filter((e) => new Date(e.starts_at).getTime() <= weekEnd);
    if (!schedule.length && !soon.length) return <EmptyNote icon={CalendarDays} title="No programme yet" text="The church hasn't posted its weekly programme." />;
    return (
        <View style={{ gap: 10 }}>
            <ScheduleList items={schedule} />
            {soon.map((e) => (
                <EventCard key={e.id} e={e} />
            ))}
        </View>
    );
}

/* ------------------------------------------------------------ sharing */

export const churchLink = (code: string) => `https://wazipos.co.ke/church/${code}`;

export async function shareChurch(church: { code: string | null; title: string }) {
    if (!church.code) return;
    const url = churchLink(church.code);
    try {
        if (isWeb) {
            const nav: any = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.share) {
                await nav.share({ title: church.title, text: `${church.title} — notices and weekly programme`, url });
                return;
            }
            if (nav?.clipboard?.writeText) {
                await nav.clipboard.writeText(url);
                toast.success('Link copied', 'Anyone can open it to see the public notices and programme.');
                return;
            }
            toast.info('Share this link', url, { duration: 0 });
            return;
        }
        await Share.share({ message: `${church.title} — notices and weekly programme: ${url}`, url, title: church.title });
    } catch (e: any) {
        if (String(e?.name) === 'AbortError') return;
        toast.warning("Couldn't open sharing", url);
    }
}

/* ------------------------------------------------------------ the church an official manages */

const PICK_KEY = 'wazipos_church_admin_pick';
const HOME_KEY = 'wazipos_church_admin_home';
let picked: string | null = null;

export interface ChurchAdminState {
    home: AdminHome | null;
    church: string | null;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    pick: (id: string) => void;
    api: ReturnType<typeof churchesApi.admin>;
}

export function useChurchAdmin(): ChurchAdminState {
    const { user } = useAuth() as any;
    const scope = String(user?.id || '');
    const [home, setHome] = useState<AdminHome | null>(null);
    const [church, setChurch] = useState<string | null>(picked);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async (want: string | null) => {
            setError(null);
            const res: any = await churchesApi.admin(want)('AdminHome').catch(() => null);
            if (isServerOk(res)) {
                const h: AdminHome = res.data.home;
                setHome(h);
                setChurch(h.church.id);
                picked = h.church.id;
                AsyncStorage.setItem(`${HOME_KEY}:${scope}`, JSON.stringify(h)).catch(() => undefined);
                AsyncStorage.setItem(`${PICK_KEY}:${scope}`, h.church.id).catch(() => undefined);
            } else {
                setError(res ? describeResponse(res, 'Could not open your church.').message : "You're offline. Showing what's saved on this device.");
            }
            setLoading(false);
        },
        [scope],
    );

    useEffect(() => {
        let live = true;
        (async () => {
            const [savedPick, savedHome] = await Promise.all([
                picked ? Promise.resolve(picked) : AsyncStorage.getItem(`${PICK_KEY}:${scope}`).catch(() => null),
                AsyncStorage.getItem(`${HOME_KEY}:${scope}`).catch(() => null),
            ]);
            if (!live) return;
            if (savedHome) {
                try {
                    const h = JSON.parse(savedHome) as AdminHome;
                    if (!savedPick || h.church.id === savedPick) setHome(h);
                } catch {
                    /* ignore a bad saved copy */
                }
            }
            await load(savedPick || null);
        })();
        return () => {
            live = false;
        };
    }, [load, scope]);

    const api = useMemo(() => churchesApi.admin(church), [church]);
    return {
        home,
        church,
        loading,
        error,
        reload: () => load(church),
        pick: (id: string) => {
            picked = id;
            setLoading(true);
            void load(id);
        },
        api,
    };
}

/** Wraps an admin screen: loading, "not an official" message, and a church switcher. */
export function ChurchAdminGate({ state, children }: { state: ChurchAdminState; children: (home: AdminHome) => React.ReactNode }) {
    const { theme } = useAuth();
    if (!state.home) {
        if (state.loading) return <Loading />;
        return (
            <View style={{ padding: 24 }}>
                <InlineNotice tone="warning" message={state.error || "You don't help run any church on WaziPOS."} />
            </View>
        );
    }
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {state.error ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <InlineNotice tone="warning" message={state.error} />
                </View>
            ) : null}
            {children(state.home)}
        </View>
    );
}

/** Pills to switch church, for officials who help run more than one. */
export function ChurchSwitcher({ state }: { state: ChurchAdminState }) {
    const { theme } = useAuth();
    const list = state.home?.churches ?? [];
    if (list.length < 2) return null;
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {list.map((c) => {
                const on = c.id === state.church;
                return (
                    <Pressable
                        key={c.id}
                        onPress={() => !on && state.pick(c.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{ paddingHorizontal: 12, height: 34, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surfaceAlt, ...pointer }}
                    >
                        <Text style={{ color: on ? '#fff' : theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>{c.title}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Standard result handling for admin writes: toast + returns the payload, or null. */
export async function runWrite<T = any>(promise: Promise<any>, key: string, success: string, fallback = 'That did not work.'): Promise<{ data: T | null; error: string | null }> {
    const res: any = await promise.catch(() => null);
    if (isServerOk(res)) {
        toast.success(success);
        return { data: res.data[key] as T, error: null };
    }
    return { data: null, error: res ? describeResponse(res, fallback).message : "You're offline. Connect and try again." };
}
