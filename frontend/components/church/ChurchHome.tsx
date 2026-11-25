// components/church/ChurchHome.tsx
//
// Church → My church (everyone signed in). Shows the page of the church you belong to
// (or the one opened from Find a church / a link): announcements, this week's
// programme and upcoming events. Not in any church yet: a way to find one.
// /churches?hide=1 is the menu's "Hide this menu" item.

import churchesApi, { type ChurchCard, type ChurchPage } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { useHiddenMenus } from '@/utils/menuPrefs';
import { isServerOk } from '@/utils/serverResponse';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Church, EyeOff, HeartHandshake, HouseHeart, MapPin, Megaphone, Search, Share2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { AnnouncementCard, Card, Chip, EmptyNote, EventCard, Loading, pointer, shareChurch, ThisWeek } from './churchShared';

type Tab = 'notices' | 'week' | 'events';

export default function ChurchHome() {
    const { theme } = useAuth();
    const router = useRouter();
    const alert = useAlert();
    const { setHidden } = useHiddenMenus();
    const params = useLocalSearchParams<{ church?: string; code?: string; hide?: string }>();
    const [mine, setMine] = useState<ChurchCard[] | null>(null);
    const [managed, setManaged] = useState<{ id: string; title: string }[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // "Hide this menu" from the sidebar.
    useEffect(() => {
        if (params.hide !== '1') return;
        alert(
            'Hide the Church menu?',
            "It disappears from your menu on every device. Church SMS from your church still reach you. Bring it back any time from Profile → Menu sections.",
            [
                { text: 'Keep it', style: 'cancel', onPress: () => router.replace('/churches' as any) },
                {
                    text: 'Hide menu',
                    style: 'destructive',
                    onPress: () => {
                        void setHidden('church', true);
                        toast.success('Church menu hidden', 'Show it again from Profile → Menu sections.');
                        router.replace('/(tabs)' as any);
                    },
                },
            ],
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.hide]);

    const loadMine = useCallback(async () => {
        const res: any = await churchesApi.myChurches().catch(() => null);
        if (isServerOk(res)) {
            setMine(res.data.result.churches);
            setManaged(res.data.result.managed);
            setError(null);
        } else {
            setMine((m) => m ?? []);
            setError(res ? describeResponse(res, 'Could not load your churches.').message : "You're offline.");
        }
    }, []);

    useEffect(() => {
        void loadMine();
    }, [loadMine]);

    const open = params.church || selected || mine?.[0]?.id || null;

    if (params.hide === '1') return <View style={{ flex: 1, backgroundColor: theme.background }} />;
    if (mine === null && !params.church && !params.code) return <Loading />;

    if (!open && !params.code) {
        return (
            <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
                <PosHeader icon={Church} title="My church" subtitle="Notices, the weekly programme and your family register" />
                {error ? <InlineNotice tone="warning" message={error} /> : null}
                <EmptyNote
                    icon={Church}
                    title="You're not in a church register yet"
                    text="Find your church to see its notices and programme. To see your family here, ask the church secretary to register your family with your phone number."
                    action={<SoftButton label="Find a church" icon={Search} onPress={() => router.push('/churchFind' as any)} />}
                />
                {managed.length ? (
                    <Card style={{ marginTop: 8 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>You help run {managed.map((m) => m.title).join(', ')}</Text>
                        <SoftButton label="Open Church admin" icon={HeartHandshake} onPress={() => router.push('/churchDashboard' as any)} />
                    </Card>
                ) : null}
                <Pressable onPress={() => router.push('/churches?hide=1' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 24, padding: 8, ...pointer }}>
                    <EyeOff size={14} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>Not for me — hide the Church menu</Text>
                </Pressable>
            </ScrollView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {(mine?.length ?? 0) > 1 && !params.church ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
                    {mine!.map((c) => {
                        const on = c.id === open;
                        return (
                            <Pressable key={c.id} onPress={() => setSelected(c.id)} style={{ paddingHorizontal: 12, height: 34, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surfaceAlt, ...pointer }}>
                                <Text style={{ color: on ? '#fff' : theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>{c.title}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
            <ChurchPageView key={open || params.code} churchId={open} code={params.code} />
        </View>
    );
}

/** One church's page: header, then Notices / This week / Events. */
export function ChurchPageView({ churchId, code }: { churchId?: string | null; code?: string }) {
    const { theme } = useAuth();
    const router = useRouter();
    const [page, setPage] = useState<ChurchPage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<Tab>('notices');

    const load = useCallback(async () => {
        const res: any = await churchesApi.page(churchId ? { church_id: churchId } : { code }).catch(() => null);
        if (isServerOk(res)) {
            setPage(res.data.page);
            setError(null);
        } else setError(res ? describeResponse(res, 'Could not open this church.').message : "You're offline.");
    }, [churchId, code]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!page) return error ? <View style={{ padding: 16 }}><InlineNotice tone="danger" message={error} /></View> : <Loading />;
    const c = page.church;

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />}
        >
            <Card>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Church size={24} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }} numberOfLines={2}>{c.title}</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }} numberOfLines={1}>
                            {[c.denomination, c.town].filter(Boolean).join(' · ') || 'Church'}
                        </Text>
                    </View>
                    {page.is_member ? <Chip label="Member" color={theme.success} /> : null}
                </View>
                {c.about ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 19 }}>{c.about}</Text> : null}
                {c.road ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MapPin size={13} color={theme.textMuted} />
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{[c.road, c.town].filter(Boolean).join(', ')}</Text>
                    </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {c.code ? <SoftButton label="Share" icon={Share2} onPress={() => void shareChurch(c)} /> : null}
                    {page.is_member ? <SoftButton label="My family" icon={HouseHeart} onPress={() => router.push(`/churchFamily?church=${c.id}` as any)} /> : null}
                    {page.can_manage ? <SoftButton label="Manage" icon={HeartHandshake} tone="navy" onPress={() => router.push('/churchDashboard' as any)} /> : null}
                </View>
            </Card>

            <Segmented<Tab>
                options={[
                    ['notices', `Notices${page.announcements.length ? ` (${page.announcements.length})` : ''}`],
                    ['week', 'This week'],
                    ['events', `Events${page.events.length ? ` (${page.events.length})` : ''}`],
                ]}
                value={tab}
                onChange={setTab}
            />

            {tab === 'notices' ? (
                page.announcements.length ? (
                    page.announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)
                ) : (
                    <EmptyNote icon={Megaphone} title="No notices right now" />
                )
            ) : null}
            {tab === 'week' ? <ThisWeek schedule={page.schedule} events={page.events} /> : null}
            {tab === 'events' ? (
                page.events.length ? page.events.map((e) => <EventCard key={e.id} e={e} />) : <EmptyNote icon={CalendarDays} title="No upcoming events" />
            ) : null}
            {!page.is_member ? (
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>
                    Members also see members-only notices. Ask the church secretary to register your family with your phone number.
                </Text>
            ) : null}
        </ScrollView>
    );
}
