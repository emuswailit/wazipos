// components/jobs/JobsBoard.tsx
//
// The WaziPOS jobs board — every signed-in user.
//   Browse:  search + job type chips, newest first, "load more". Offline-first: the
//            last list is saved on the device and filtered locally with no connection.
//   Saved:   bookmarks kept on this device (open offline).
//   Applied: the user's applications and where each one stands.
// ?code=<share code> opens that job straight away (shared links, after sign-up).

import jobsApi, { type EmploymentType, type JobApplication, type JobCard, type JobLookups } from '@/api/jobsApi';
import { useAlert } from '@/components/common/AlertProvider';
import { SearchField } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useCachedList } from '@/hooks/useCachedList';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Briefcase, ChevronRight, FileText, Inbox, Megaphone, SearchX } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import JobDetailsSheet from './JobDetailsSheet';
import { APP_STATUS_META, fmtDate, fmtDateTime, JobCardView, pointer, toneColor, TYPE_META, useSavedJobs } from './jobsShared';

type Tab = 'browse' | 'saved' | 'applications';
const FEED_KEY = 'wazipos_jobs_feed_v1';
const TYPES: ('' | EmploymentType)[] = ['', 'PERMANENT', 'LOCUM', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY'];

/* ---------------------------------------------------------------- feed */

function matches(j: JobCard, q: string, type: string) {
    if (type && j.employment_type !== type) return false;
    if (!q) return true;
    const hay = `${j.title} ${j.entity.title} ${j.designation ?? ''} ${j.cadre?.title ?? ''} ${j.location ?? ''}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function useJobsFeed(q: string, type: string) {
    const { isOnline } = useNetworkStatus();
    const [items, setItems] = useState<JobCard[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fromCache, setFromCache] = useState(false);
    const [syncedAt, setSyncedAt] = useState<string | null>(null);
    const cache = useRef<JobCard[]>([]);
    const seq = useRef(0);

    const fromSaved = useCallback(() => {
        const rows = cache.current.filter((j) => matches(j, q, type));
        setItems(rows);
        setCount(rows.length);
        setPages(1);
        setFromCache(true);
    }, [q, type]);

    const load = useCallback(
        async (nextPage = 1) => {
            const mine = ++seq.current;
            if (!isOnline) {
                fromSaved();
                setLoading(false);
                setError(cache.current.length ? null : "You're offline and no jobs are saved on this device yet.");
                return;
            }
            nextPage === 1 ? setRefreshing(true) : setLoading(true);
            try {
                const res: any = await jobsApi.browse({ q: q || undefined, employment_type: (type || undefined) as any, page: nextPage });
                if (mine !== seq.current) return;
                if (isServerOk(res)) {
                    const data = res.data.jobs;
                    setItems((prev) => (nextPage === 1 ? data.results : [...prev, ...data.results]));
                    setPage(data.page);
                    setPages(data.pages);
                    setCount(data.count);
                    setFromCache(false);
                    setError(null);
                    // Keep the unfiltered first page (merged with what we have) for offline use.
                    if (!q && !type && nextPage === 1) {
                        const at = new Date().toISOString();
                        cache.current = data.results;
                        setSyncedAt(at);
                        AsyncStorage.setItem(FEED_KEY, JSON.stringify({ items: data.results, synced_at: at })).catch(() => undefined);
                    }
                } else {
                    const d = describeResponse(res, 'Could not load jobs.');
                    if (cache.current.length) fromSaved();
                    setError(d.tone === 'offline' && cache.current.length ? null : d.message);
                }
            } finally {
                if (mine === seq.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [isOnline, q, type, fromSaved],
    );

    // Saved copy first, then the network.
    useEffect(() => {
        AsyncStorage.getItem(FEED_KEY)
            .then((raw) => {
                if (!raw) return;
                const saved = JSON.parse(raw);
                cache.current = saved.items ?? [];
                setSyncedAt(saved.synced_at ?? null);
                setItems((cur) => (cur.length ? cur : cache.current));
                setLoading(false);
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => void load(1), q ? 350 : 0);
        return () => clearTimeout(t);
    }, [load, q]);

    const markApplied = (id: string) => {
        setItems((rows) => rows.map((j) => (j.id === id ? { ...j, applied: true } : j)));
        cache.current = cache.current.map((j) => (j.id === id ? { ...j, applied: true } : j));
    };

    return { items, count, page, pages, loading, refreshing, error, fromCache, syncedAt, isOnline, refresh: () => load(1), more: () => load(page + 1), markApplied };
}

/* --------------------------------------------------------------- board */

export default function JobsBoard() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const router = useRouter();
    const params = useLocalSearchParams<{ code?: string; tab?: string }>();
    const appAlert = useAlert();
    const cols = width >= 1200 ? 3 : width >= 760 ? 2 : 1;

    const [tab, setTab] = useState<Tab>(params.tab === 'applications' ? 'applications' : params.tab === 'saved' ? 'saved' : 'browse');
    const [q, setQ] = useState('');
    const [type, setType] = useState<'' | EmploymentType>('');
    const feed = useJobsFeed(q.trim(), type);
    const { saved, isSaved, toggle } = useSavedJobs();
    const [open, setOpen] = useState<{ id?: string; code?: string; card?: JobCard } | null>(null);
    const [lookups, setLookups] = useState<JobLookups | null>(null);

    const apps = useCachedList<JobApplication>({
        key: 'job_applications',
        fetch: () => jobsApi.myApplications() as any,
        pick: (d) => d?.applications,
        enabled: tab === 'applications',
    });

    useEffect(() => {
        jobsApi.lookups().then((res: any) => isServerOk(res) && setLookups(res.data.lookups)).catch(() => undefined);
    }, []);

    // Shared link / notification → open that job.
    useEffect(() => {
        if (params.code) setOpen({ code: String(params.code) });
    }, [params.code]);

    const withdraw = (a: JobApplication) =>
        appAlert('Withdraw application?', `${a.advert.title} at ${a.advert.entity} will no longer see your application.`, [
            { text: 'Keep it', style: 'cancel' },
            {
                text: 'Withdraw',
                style: 'destructive',
                onPress: async () => {
                    const res: any = await jobsApi.withdraw(a.id);
                    if (isServerOk(res)) {
                        toast.success('Application withdrawn');
                        apps.patch((rows) => rows.map((r) => (r.id === a.id ? res.data.application : r)));
                    } else toast.fromResponse(res, 'Could not withdraw.');
                },
            },
        ]);

    const list = tab === 'saved' ? saved.filter((j) => matches(j, q.trim(), type)) : feed.items;
    const activeApps = useMemo(() => apps.items.filter((a) => a.status !== 'WITHDRAWN'), [apps.items]);

    const grid = (rows: JobCard[]) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
            {rows.map((j) => (
                <View key={j.id} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                    <JobCardView job={j} saved={isSaved(j.id)} onToggleSave={() => toggle(j)} onPress={() => setOpen({ id: j.id, card: j })} />
                </View>
            ))}
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1240, width: '100%', alignSelf: 'center' }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={tab === 'applications' ? apps.refreshing : feed.refreshing} onRefresh={() => void (tab === 'applications' ? apps.refresh() : feed.refresh())} tintColor={theme.primary} />}
            >
                <PosHeader
                    icon={Briefcase}
                    title="Jobs"
                    subtitle={tab === 'browse' ? (feed.count ? `${feed.count} open ${feed.count === 1 ? 'position' : 'positions'}` : 'Permanent posts and locum cover') : tab === 'saved' ? `${saved.length} saved on this device` : `${activeApps.length} active applications`}
                    right={
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <SoftButton label={width >= 520 ? 'My CV' : 'CV'} icon={FileText} onPress={() => router.push('/myCv' as any)} />
                            {lookups?.can_post ? <SoftButton label={width >= 520 ? 'Post a job' : 'Post'} icon={Megaphone} tone="navy" onPress={() => router.push('/jobAdverts' as any)} /> : null}
                        </View>
                    }
                />

                {/* Tabs */}
                <View style={{ flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 4, marginBottom: 14 }}>
                    {([['browse', 'Browse'], ['saved', `Saved${saved.length ? ` · ${saved.length}` : ''}`], ['applications', 'My applications']] as [Tab, string][]).map(([k, label]) => {
                        const on = tab === k;
                        return (
                            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.panel : 'transparent', ...pointer }}>
                                <Text numberOfLines={1} style={{ color: on ? theme.primary : theme.textMuted, fontFamily: theme.font.bold, fontSize: 13 }}>{label}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                {tab !== 'applications' ? (
                    <View style={{ gap: 10, marginBottom: 14 }}>
                        <SearchField variant="mobile" value={q} onChangeText={setQ} placeholder="Search role, business, town…" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {TYPES.map((t) => {
                                const on = type === t;
                                const color = t ? TYPE_META[t].color : theme.primary;
                                return (
                                    <Pressable key={t || 'all'} onPress={() => setType(t)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? color : theme.border, backgroundColor: on ? `${color}14` : theme.panel, justifyContent: 'center', ...pointer }}>
                                        <Text style={{ color: on ? color : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{t ? TYPE_META[t].label : 'All jobs'}</Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                ) : null}

                {tab === 'browse' ? (
                    <>
                        {feed.fromCache && !feed.isOnline ? (
                            <OfflineNotice title="Offline — saved jobs list" message={`Showing jobs saved on this device${feed.syncedAt ? ` (${fmtDateTime(feed.syncedAt)})` : ''}. Pull down to refresh when you're back online.`} />
                        ) : null}
                        {feed.error ? <View style={{ marginBottom: 12 }}><InlineNotice tone="danger" message={feed.error} /></View> : null}
                        {feed.loading && !feed.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
                        {!feed.loading && !feed.items.length && !feed.error ? (
                            <Empty icon={SearchX} title={q || type ? 'No jobs match' : 'No open jobs yet'} message={q || type ? 'Try another word or job type.' : 'New openings from businesses on WaziPOS appear here.'} />
                        ) : null}
                        {grid(list)}
                        {feed.page < feed.pages && !feed.fromCache ? (
                            <View style={{ alignItems: 'center', marginTop: 14 }}>
                                <SoftButton label={feed.loading ? 'Loading…' : 'Load more jobs'} onPress={() => void feed.more()} disabled={feed.loading} />
                            </View>
                        ) : null}
                    </>
                ) : tab === 'saved' ? (
                    list.length ? grid(list) : <Empty icon={Bookmark} title="Nothing saved yet" message="Tap the bookmark on any job to keep it here — it opens even offline." />
                ) : (
                    <View style={{ gap: 10 }}>
                        {apps.error ? <InlineNotice tone="danger" message={apps.error} /> : null}
                        {apps.loading && !apps.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
                        {!apps.loading && !apps.items.length ? <Empty icon={Inbox} title="No applications yet" message="Jobs you apply for show here with every update from the employer." /> : null}
                        {apps.items.map((a) => (
                            <ApplicationRow key={a.id} app={a} onOpen={() => setOpen({ id: a.advert.id })} onWithdraw={() => withdraw(a)} />
                        ))}
                        {apps.source === 'cache' ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center' }}>Saved on this device · {apps.lastSynced ?? ''}</Text> : null}
                    </View>
                )}
            </ScrollView>

            <JobDetailsSheet
                visible={!!open}
                advertId={open?.id}
                code={open?.code}
                initial={open?.card}
                onClose={() => {
                    setOpen(null);
                    if (params.code) router.setParams({ code: undefined } as any);
                }}
                onApplied={(id) => {
                    feed.markApplied(id);
                    void apps.refresh();
                }}
                saved={open?.card ? isSaved(open.card.id) : open?.id ? isSaved(open.id) : false}
                onToggleSave={(job) => toggle(job)}
            />
        </View>
    );
}

function ApplicationRow({ app, onOpen, onWithdraw }: { app: JobApplication; onOpen: () => void; onWithdraw: () => void }) {
    const { theme } = useAuth();
    const meta = APP_STATUS_META[app.status];
    const color = toneColor(theme, meta.tone);
    const active = !['HIRED', 'REJECTED', 'WITHDRAWN'].includes(app.status);
    return (
        <Pressable onPress={onOpen} accessibilityRole="button" style={{ backgroundColor: theme.panel, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 10, ...pointer }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{app.advert.title}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{app.advert.entity} · applied {fmtDate(app.created)}</Text>
                </View>
                <StatusPill tone={meta.tone === 'muted' ? 'info' : meta.tone} label={meta.label} />
                <ChevronRight size={16} color={theme.textMuted} />
            </View>
            {app.status === 'INTERVIEW' && app.interview_at ? (
                <View style={{ padding: 10, borderRadius: 12, backgroundColor: `${color}14` }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>Interview · {fmtDateTime(app.interview_at)}{app.interview_location ? ` · ${app.interview_location}` : ''}</Text>
                </View>
            ) : null}
            {app.message ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }} numberOfLines={3}>“{app.message}”</Text> : null}
            {active ? (
                <Pressable onPress={onWithdraw} hitSlop={6} style={{ alignSelf: 'flex-start', ...pointer }}>
                    <Text style={{ color: theme.danger, fontFamily: theme.font.semibold, fontSize: 12.5 }}>Withdraw</Text>
                </Pressable>
            ) : null}
        </Pressable>
    );
}

function Empty({ icon: Icon, title, message }: { icon: any; title: string; message: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Icon size={26} color={theme.primary} strokeWidth={2} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{title}</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 340 }}>{message}</Text>
        </View>
    );
}
