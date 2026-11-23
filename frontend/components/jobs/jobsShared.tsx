// components/jobs/jobsShared.tsx
//
// What the jobs screens share: type / status badges, the job card, saved jobs
// (kept on this device, so they open offline), sharing a job link, and the
// "came from a shared link → sign up → land on that job" hand-off.

import type { ApplicationStatus, EmploymentType, JobCard } from '@/api/jobsApi';
import { toast } from '@/components/common/Toast';
import { softShadow } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Bookmark, BookmarkCheck, CalendarClock, CheckCircle2, MapPin, ShieldCheck, Wallet } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, Share, Text, View } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;

export const TYPE_META: Record<EmploymentType, { label: string; color: string }> = {
    PERMANENT: { label: 'Permanent', color: '#2a6ff3' },
    LOCUM: { label: 'Locum', color: '#f97316' },
    CONTRACT: { label: 'Contract', color: '#8b5cf6' },
    INTERNSHIP: { label: 'Internship', color: '#14b8a6' },
    TEMPORARY: { label: 'Temporary', color: '#64748b' },
};

export const APP_STATUS_META: Record<ApplicationStatus, { label: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'muted' }> = {
    SUBMITTED: { label: 'Sent', tone: 'info' },
    SHORTLISTED: { label: 'Shortlisted', tone: 'info' },
    INTERVIEW: { label: 'Interview', tone: 'warning' },
    OFFERED: { label: 'Offer', tone: 'success' },
    HIRED: { label: 'Hired', tone: 'success' },
    REJECTED: { label: 'Not selected', tone: 'danger' },
    WITHDRAWN: { label: 'Withdrawn', tone: 'muted' },
};

export const PIPELINE: ApplicationStatus[] = ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED'];

export function fmtDate(iso?: string | null, withYear = false) {
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

/** "Closes today" / "3 days left" / "Closed". */
export function closesLabel(iso: string) {
    const end = new Date(`${iso}T23:59:59`);
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days < 1) return days === 0 ? 'Closes today' : 'Closed';
    if (days === 1) return 'Closes tomorrow';
    if (days <= 14) return `${days} days left`;
    return `Closes ${fmtDate(iso)}`;
}

export function toneColor(theme: any, tone: string) {
    return tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : tone === 'danger' ? theme.danger : tone === 'muted' ? theme.textMuted : theme.primary;
}

export function Badge({ label, color }: { label: string; color: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: `${color}1a`, justifyContent: 'center' }}>
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 11 }}>{label}</Text>
        </View>
    );
}

export function EntityAvatar({ title, logo, size = 46 }: { title: string; logo?: string | null; size?: number }) {
    const { theme } = useAuth();
    if (logo) return <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: theme.surfaceAlt }} />;
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: size * 0.38 }}>{String(title || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
    );
}

function Meta({ icon: Icon, text, color }: { icon: any; text: string; color?: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
            <Icon size={13} color={color ?? theme.textMuted} strokeWidth={2.2} />
            <Text numberOfLines={1} style={{ color: color ?? theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, flexShrink: 1 }}>{text}</Text>
        </View>
    );
}

export function JobCardView({ job, onPress, saved, onToggleSave }: { job: JobCard; onPress: () => void; saved?: boolean; onToggleSave?: () => void }) {
    const { theme } = useAuth();
    const type = TYPE_META[job.employment_type] ?? TYPE_META.PERMANENT;
    const closing = closesLabel(job.closes);
    const urgent = /today|tomorrow|^[1-3] days/.test(closing);
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${job.title} at ${job.entity.title}`}
            style={{ backgroundColor: theme.panel, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12, ...softShadow, ...pointer }}
        >
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <EntityAvatar title={job.entity.title} logo={job.entity.logo} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, letterSpacing: -0.2 }}>{job.title}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, marginTop: 2 }}>{job.entity.title}</Text>
                </View>
                {onToggleSave ? (
                    <Pressable onPress={onToggleSave} hitSlop={10} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save job'} style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: saved ? theme.primarySoft : theme.surfaceAlt, ...pointer }}>
                        {saved ? <BookmarkCheck size={17} color={theme.primary} strokeWidth={2.3} /> : <Bookmark size={17} color={theme.textMuted} strokeWidth={2.2} />}
                    </Pressable>
                ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge label={type.label} color={type.color} />
                {job.cadre ? <Badge label={job.cadre.title} color={theme.textMuted} /> : null}
                {job.requires_license ? <Badge label={job.license_body ? `${job.license_body} licence` : 'Licence needed'} color={theme.success} /> : null}
                {job.vacancies > 1 ? <Badge label={`${job.vacancies} positions`} color={theme.primary} /> : null}
            </View>

            <View style={{ gap: 6 }}>
                {job.location ? <Meta icon={MapPin} text={job.location} /> : null}
                {job.pay ? <Meta icon={Wallet} text={job.pay} color={theme.text} /> : null}
                {job.employment_type === 'LOCUM' && job.starts_on ? (
                    <Meta icon={CalendarClock} text={`${fmtDate(job.starts_on)}${job.ends_on ? ` – ${fmtDate(job.ends_on)}` : ''}${job.shift_hours ? ` · ${job.shift_hours}` : ''}`} />
                ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: urgent ? theme.warning : theme.textMuted, fontFamily: theme.font.semibold, fontSize: 12 }}>{closing}</Text>
                {job.applied ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <CheckCircle2 size={14} color={theme.success} strokeWidth={2.4} />
                        <Text style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 12 }}>Applied</Text>
                    </View>
                ) : job.min_experience_years ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <ShieldCheck size={14} color={theme.textMuted} strokeWidth={2.2} />
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{job.min_experience_years}+ yrs</Text>
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
}

/* ------------------------------------------------------------ sharing */

export const jobLink = (code: string) => `https://wazipos.co.ke/job/${code}`;

/** Native share sheet; on web the browser's share sheet, else copy the link. */
export async function shareJob(job: { code: string; title: string; entity: { title: string } }) {
    const url = jobLink(job.code);
    const message = `${job.title} at ${job.entity.title} — apply on WaziPOS Jobs: ${url}`;
    try {
        if (isWeb) {
            const nav: any = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.share) {
                await nav.share({ title: job.title, text: `${job.title} at ${job.entity.title}`, url });
                return;
            }
            if (nav?.clipboard?.writeText) {
                await nav.clipboard.writeText(url);
                toast.success('Link copied', 'Paste it anywhere — people sign up to WaziPOS to see the full job.');
                return;
            }
            toast.info('Share this link', url, { duration: 0 });
            return;
        }
        await Share.share({ message, url, title: job.title });
    } catch (e: any) {
        if (String(e?.name) === 'AbortError') return; // closed the share sheet
        toast.warning("Couldn't open sharing", url);
    }
}

/* ------------------------------------------------------- saved jobs */

const SAVED_KEY = 'wazipos_jobs_saved_v1';

/** Jobs bookmarked on this device (full cards, so the Saved tab works offline). */
export function useSavedJobs() {
    const [saved, setSaved] = useState<JobCard[]>([]);
    useEffect(() => {
        AsyncStorage.getItem(SAVED_KEY)
            .then((raw) => {
                if (raw) setSaved(JSON.parse(raw));
            })
            .catch(() => undefined);
    }, []);
    const persist = (next: JobCard[]) => {
        setSaved(next);
        AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)).catch(() => undefined);
    };
    const isSaved = useCallback((id: string) => saved.some((j) => j.id === id), [saved]);
    const toggle = useCallback(
        (job: JobCard) => {
            const exists = saved.some((j) => j.id === job.id);
            persist(exists ? saved.filter((j) => j.id !== job.id) : [job, ...saved].slice(0, 100));
            if (!exists) toast.success('Saved', 'Find it under Saved — even offline.', { duration: 2200 });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [saved],
    );
    return { saved, isSaved, toggle };
}

/* ------------------------------------------- shared link → sign up → job */

const PENDING_KEY = 'wazipos_pending_job_code';

export const rememberPendingJob = (code: string) => AsyncStorage.setItem(PENDING_KEY, code).catch(() => undefined);

/** Root layout: once someone who opened a shared job link signs in, take them to it. */
export function usePendingJobRedirect(user: any) {
    const router = useRouter();
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        AsyncStorage.getItem(PENDING_KEY)
            .then((code) => {
                if (!code || cancelled) return;
                AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
                setTimeout(() => router.push(`/jobs?code=${encodeURIComponent(code)}` as any), 600);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [user, router]);
}
