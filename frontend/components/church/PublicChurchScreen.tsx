// components/church/PublicChurchScreen.tsx
//
// What a shared church link (wazipos.co.ke/church/<code>) shows anyone, signed in or
// not: the church, its public notices, weekly programme and public events, and an
// invitation to join WaziPOS. Signed-in visitors open the church in the app instead.

import churchesApi, { type ChurchPage } from '@/api/churchesApi';
import { BRAND_GRADIENT, useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useRouter } from 'expo-router';
import { CalendarDays, Church, Megaphone } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AnnouncementCard, EmptyNote, EventCard, isWeb, pointer, ScheduleList } from './churchShared';

export default function PublicChurchScreen({ code }: { code: string }) {
    const { theme, user } = useAuth() as any;
    const router = useRouter();
    const [page, setPage] = useState<ChurchPage | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!code) return;
        if (user) {
            router.replace(`/churches?code=${encodeURIComponent(code)}` as any);
            return;
        }
        churchesApi
            .publicChurch(code)
            .then((res: any) => (isServerOk(res) ? setPage(res.data.page) : setError(describeResponse(res, 'This church link could not be opened.').message)))
            .catch(() => setError("We couldn't reach WaziPOS. Check your connection and try again."));
    }, [code, user, router]);

    useEffect(() => {
        if (isWeb && page && typeof document !== 'undefined') document.title = `${page.church.title} | WaziPOS`;
    }, [page]);

    const [g1, g2] = BRAND_GRADIENT;
    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={[{ paddingTop: 28, paddingBottom: 28, paddingHorizontal: 20, alignItems: 'center', gap: 10 }, isWeb ? ({ backgroundImage: `linear-gradient(135deg, ${theme.navy ?? '#0b1733'}, ${g1} 70%, ${g2})` } as any) : { backgroundColor: theme.navy ?? '#0b1733' }]}>
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                    <Church size={26} color="#fff" />
                </View>
                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 22, textAlign: 'center' }}>{page?.church.title ?? 'Church'}</Text>
                {page ? (
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 13.5, textAlign: 'center' }}>
                        {[page.church.denomination, page.church.road, page.church.town].filter(Boolean).join(' · ')}
                    </Text>
                ) : null}
            </View>

            <View style={{ padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
                {!page && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {error ? <EmptyNote icon={Church} title="Church not found" text={error} /> : null}
                {page ? (
                    <>
                        {page.church.about ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 14, lineHeight: 20 }}>{page.church.about}</Text> : null}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 6 }}>Notices</Text>
                        {page.announcements.length ? page.announcements.map((a) => <AnnouncementCard key={a.id} a={a} />) : <EmptyNote icon={Megaphone} title="No notices right now" />}
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 6 }}>Weekly programme</Text>
                        {page.schedule.length ? <ScheduleList items={page.schedule} /> : <EmptyNote icon={CalendarDays} title="No programme posted yet" />}
                        {page.events.length ? <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 6 }}>Upcoming events</Text> : null}
                        {page.events.map((e) => (
                            <EventCard key={e.id} e={e} />
                        ))}
                    </>
                ) : null}

                <View style={{ marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: theme.primarySoft, gap: 10, alignItems: 'center' }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, textAlign: 'center' }}>Member of this church?</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13, textAlign: 'center' }}>
                        Join WaziPOS free with the phone number your church has, to see members' notices and your family register.
                    </Text>
                    <Pressable onPress={() => router.push('/(auth)/register' as any)} accessibilityRole="button" style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 18, height: 44, justifyContent: 'center', ...pointer }}>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold }}>Join WaziPOS</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/(auth)/login' as any)} style={pointer}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.semibold }}>I already have an account</Text>
                    </Pressable>
                </View>
            </View>
        </ScrollView>
    );
}
