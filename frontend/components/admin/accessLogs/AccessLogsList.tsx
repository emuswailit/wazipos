// components/admin/accessLogs/AccessLogsList.tsx
//
// Admin -> Access logs: every request to the API with the caller's IP and the
// endpoint; for signed-in requests also the user and business, the backend app,
// the action, the source (web / Android / iOS / script) and the screen.
// Paged, searched and filtered on the server (logs grow fast). New requests
// stream in over a websocket while "Live" is on and page 1 is showing; the
// strip on top shows the busiest IP addresses — tap one to see only its requests.

import accessLogsApi, { type AccessFilters, type AccessIp, type AccessLog, type AccessScope, type AccessSource, type AccessStats } from '@/api/accessLogsApi';
import { AdminListView, ConfigDetailsSheet, DateRangeFilter, DetailsDock, SheetButton, useListTokens } from '@/components/admin/kit';
import type { PageSize } from '@/components/common/PaginationBar';
import { useAccessLogEvents } from '@/hooks/useAccessLogEvents';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { accessLogDetailsConfig, accessLogsConfig, formatWhen, SOURCE_LABELS } from './accessLogsConfig';
import { errorText } from '@/utils/apiFeedback';


const EMPTY_STATS: AccessStats = { requests: 0, ips: 0, users: 0, errors: 0 };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether a live row belongs in the current filters (mirrors the server's _filtered). */
function matchesFilters(l: AccessLog, f: AccessFilters): boolean {
    const day = localDay(new Date(l.created));
    if (f.date_from && day < f.date_from) return false;
    if (f.date_to && day > f.date_to) return false;
    if (f.ip && l.ip !== f.ip) return false;
    if (f.user && l.user !== f.user) return false;
    if (f.source && l.source !== f.source) return false;
    if (f.app && l.app !== f.app) return false;
    if (f.scope === 'SIGNED_IN' && !l.user) return false;
    if (f.scope === 'ANONYMOUS' && l.user) return false;
    if (f.scope === 'ERRORS' && l.status_code < 400) return false;
    if (f.q) {
        const q = f.q.toLowerCase();
        const hay = [l.endpoint, l.action, l.app, l.user_label, l.entity_title, l.client_route].map((x) => (x || '').toLowerCase());
        if (!l.ip.startsWith(f.q) && !hay.some((x) => x.includes(q))) return false;
    }
    return true;
}

export default function AccessLogsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;

    const [logs, setLogs] = useState<AccessLog[]>([]);
    const [stats, setStats] = useState<AccessStats>(EMPTY_STATS);
    const [ips, setIps] = useState<AccessIp[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncedTime, setLastSyncedTime] = useState<string | undefined>(undefined);

    const [query, setQuery] = useState('');
    const [q, setQ] = useState(''); // debounced
    const [scope, setScope] = useState<AccessScope>('ALL');
    const [source, setSource] = useState<AccessSource | null>(null);
    const [live, setLive] = useState(true);
    const [missed, setMissed] = useState(0); // arrived while paused / off page 1
    const [ip, setIp] = useState<string | null>(null);
    const [userFilter, setUserFilter] = useState<{ id: string; label: string } | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(50 as PageSize);
    const [viewing, setViewing] = useState<AccessLog | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setQ(query.trim()), 400);
        return () => clearTimeout(t);
    }, [query]);
    useEffect(() => setPage(1), [q, scope, source, ip, userFilter, dateFrom, dateTo, pageSize]);

    const filters: AccessFilters = {
        q: q || undefined,
        scope,
        source: source || undefined,
        ip: ip || undefined,
        user: userFilter?.id,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
    };
    const filtersKey = JSON.stringify(filters);

    const seq = useRef(0);
    const load = useCallback(async () => {
        const mine = ++seq.current;
        setRefreshing(true);
        const f = JSON.parse(filtersKey);
        try {
            const [logsRes, ipsRes]: any[] = await Promise.all([
                accessLogsApi.getLogs({ ...f, page, page_size: pageSize }),
                accessLogsApi.getIps({ ...f, limit: 30 }),
            ]);
            if (mine !== seq.current) return; // a newer load is running
            if (logsRes.ok && String(logsRes.data?.response_code) === '0') {
                const data = logsRes.data?.data ?? {};
                setLogs(Array.isArray(data.logs?.results) ? data.logs.results : []);
                setStats({ ...EMPTY_STATS, ...(data.stats ?? {}) });
                setLoadError(null);
                setMissed(0);
                setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } else {
                setLoadError(errorText(logsRes, 'Could not load the access logs.'));
            }
            if (ipsRes.ok && String(ipsRes.data?.response_code) === '0') {
                setIps(Array.isArray(ipsRes.data?.ips) ? ipsRes.data.ips : []);
            }
        } catch (e: any) {
            if (mine === seq.current) setLoadError(e?.message || 'Could not reach the server.');
        } finally {
            if (mine === seq.current) setRefreshing(false);
        }
    }, [filtersKey, page, pageSize]);

    useEffect(() => {
        void load();
    }, [load]);
    useFocusEffect(
        useCallback(() => {
            void load();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
    );

    /* ---------------- Live (websocket) ---------------- */
    const onLive = useCallback(
        (incoming: AccessLog[]) => {
            const f: AccessFilters = JSON.parse(filtersKey);
            const fresh = incoming.filter((l) => matchesFilters(l, f));
            if (!fresh.length) return;
            setStats((st) => ({
                ...st,
                requests: st.requests + fresh.length,
                errors: st.errors + fresh.filter((l) => l.status_code >= 400).length,
            }));
            if (!live || page !== 1) {
                setMissed((n) => n + fresh.length);
                return;
            }
            fresh.sort((a, b) => (a.created < b.created ? 1 : -1));
            setLogs((prev) => {
                const seen = new Set(prev.map((l) => l.id));
                return [...fresh.filter((l) => !seen.has(l.id)), ...prev].slice(0, pageSize);
            });
            setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        },
        [filtersKey, live, page, pageSize],
    );
    const { isLive } = useAccessLogEvents(onLive);

    const toggleLive = () => {
        if (!live && missed) void load(); // catch up on what arrived while paused
        setLive((v) => !v);
    };

    /* ---------------- Pagination (server) ---------------- */
    const totalItems = stats.requests;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + logs.length, totalItems);

    const byIp = (value: string) => {
        setIp((cur) => (cur === value ? null : value));
        setViewing(null);
    };
    const byUser = (log: AccessLog) => {
        if (!log.user) return;
        setUserFilter({ id: log.user, label: log.user_label || 'this user' });
        setViewing(null);
    };

    const header = (
        <View style={{ gap: 8 }}>
            <LiveAndSource
                connected={isLive}
                live={live}
                missed={missed}
                onToggleLive={toggleLive}
                onShowMissed={() => {
                    if (page === 1) void load();
                    else setPage(1);
                }}
                source={source}
                onSource={setSource}
            />
            <TopIps
            ips={ips}
            selected={ip}
            onSelect={byIp}
            userFilter={userFilter}
            onClearUser={() => setUserFilter(null)}
            />
        </View>
    );

    return (
        <DetailsDock
            placeholder="Pick a request to see who made it."
            pane={
                <ConfigDetailsSheet
                    config={accessLogDetailsConfig}
                    item={viewing}
                    heading="Request details"
                    onClose={() => setViewing(null)}
                    actions={
                        viewing ? (
                            <>
                                <SheetButton label="All from this IP" icon="globe-outline" variant="secondary" onPress={() => byIp(viewing.ip)} grow={!isLarge} />
                                {viewing.user ? <SheetButton label="All by this user" icon="person-outline" onPress={() => byUser(viewing)} grow={!isLarge} /> : null}
                            </>
                        ) : null
                    }
                />
            }
        >
            <AdminListView<AccessLog, AccessScope>
                variant={isLarge ? 'web' : 'mobile'}
                config={accessLogsConfig}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                sourceLabel={loadError ? 'Not loaded' : isLive && live ? 'Live' : 'Server'}
                sourceTone={loadError ? 'none' : 'server'}
                lastSyncedTime={lastSyncedTime}
                error={loadError}
                items={logs}
                allItems={logs}
                onPressItem={setViewing}
                header={header}
                stats={[
                    { label: 'Requests', value: stats.requests.toLocaleString() },
                    { label: 'IP addresses', value: stats.ips.toLocaleString() },
                    { label: 'Signed-in users', value: stats.users.toLocaleString(), color: '#3b82f6' },
                    { label: 'Errors', value: stats.errors.toLocaleString(), color: stats.errors ? '#f43f5e' : undefined },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline' },
                        { key: 'SIGNED_IN', label: 'Signed in', icon: 'person-outline' },
                        { key: 'ANONYMOUS', label: 'Not signed in', icon: 'globe-outline' },
                        { key: 'ERRORS', label: 'Errors', icon: 'alert-circle-outline' },
                    ],
                    value: scope,
                    onChange: setScope,
                    allKey: 'ALL',
                }}
                toolbar={<DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} variant={isLarge ? 'web' : 'mobile'} />}
                toolbarActive={!!(dateFrom || dateTo)}
                toolbarLabel="Date (default: last 7 days)"
                onClearToolbar={() => {
                    setDateFrom('');
                    setDateTo('');
                }}
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(size) => setPageSize(size)}
            />
        </DetailsDock>
    );
}

/** The busiest IP addresses in the current filters; tap one to filter by it. */
function TopIps({
    ips,
    selected,
    onSelect,
    userFilter,
    onClearUser,
}: {
    ips: AccessIp[];
    selected: string | null;
    onSelect: (ip: string) => void;
    userFilter: { id: string; label: string } | null;
    onClearUser: () => void;
}) {
    const { theme, border, chipBg } = useListTokens();
    if (!ips.length && !userFilter && !selected) return null;
    return (
        <View style={{ gap: 8, marginBottom: 8 }}>
            {userFilter ? (
                <Pressable
                    onPress={onClearUser}
                    style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: `${theme.primary}14`, borderWidth: 1, borderColor: theme.primary }}
                >
                    <Ionicons name="person" size={13} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Only {userFilter.label}</Text>
                    <Ionicons name="close" size={14} color={theme.primary} />
                </Pressable>
            ) : null}
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>TOP IP ADDRESSES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {ips.map((x) => {
                    const active = selected === x.ip;
                    return (
                        <Pressable
                            key={x.ip}
                            onPress={() => onSelect(x.ip)}
                            style={{ width: 210, padding: 10, borderRadius: 14, gap: 3, borderWidth: 1, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}10` : chipBg }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>{x.ip}</Text>
                                {active ? <Ionicons name="close-circle" size={16} color={theme.primary} /> : null}
                            </View>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                {x.requests.toLocaleString()} requests{x.errors ? ` · ${x.errors} errors` : ''}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={1}>
                                {x.users.length ? x.users.join(', ') : 'Not signed in'}
                            </Text>
                            {x.last_seen ? (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: 11 }}>Last {formatWhen(x.last_seen)}</Text>
                            ) : null}
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const SOURCES: AccessSource[] = ['WEB', 'ANDROID', 'IOS', 'SCRIPT', 'UNKNOWN'];

/** Live / paused switch, "N new" catch-up, and the source (web, Android, iOS…) chips. */
function LiveAndSource({
    connected,
    live,
    missed,
    onToggleLive,
    onShowMissed,
    source,
    onSource,
}: {
    connected: boolean;
    live: boolean;
    missed: number;
    onToggleLive: () => void;
    onShowMissed: () => void;
    source: AccessSource | null;
    onSource: (s: AccessSource | null) => void;
}) {
    const { theme, border, chipBg } = useListTokens();
    const on = live && connected;
    const dot = on ? '#22c55e' : live ? '#f59e0b' : theme.textDark;
    const chip = (active: boolean) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 6,
        paddingHorizontal: 12,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: active ? theme.primary : border,
        backgroundColor: active ? `${theme.primary}14` : chipBg,
    });
    const label = (active: boolean) => ({ color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12 });
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8, alignItems: 'center' }}>
            <Pressable onPress={onToggleLive} style={chip(on)} accessibilityRole="switch" accessibilityState={{ checked: live }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                <Text style={label(on)}>{!live ? 'Paused' : connected ? 'Live' : 'Connecting…'}</Text>
                <Ionicons name={live ? 'pause' : 'play'} size={13} color={on ? theme.primary : theme.textDark} />
            </Pressable>
            {missed > 0 ? (
                <Pressable onPress={onShowMissed} style={chip(true)}>
                    <Ionicons name="arrow-up" size={13} color={theme.primary} />
                    <Text style={label(true)}>{missed.toLocaleString()} new</Text>
                </Pressable>
            ) : null}
            <View style={{ width: 1, height: 20, backgroundColor: border, marginHorizontal: 2 }} />
            <Pressable onPress={() => onSource(null)} style={chip(!source)}>
                <Text style={label(!source)}>Any source</Text>
            </Pressable>
            {SOURCES.map((s) => (
                <Pressable key={s} onPress={() => onSource(source === s ? null : s)} style={chip(source === s)}>
                    <Text style={label(source === s)}>{SOURCE_LABELS[s]}</Text>
                </Pressable>
            ))}
        </ScrollView>
    );
}
