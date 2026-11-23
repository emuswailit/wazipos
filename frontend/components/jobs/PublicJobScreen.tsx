// components/jobs/PublicJobScreen.tsx
//
// What a shared job link (wazipos.co.ke/job/<code>) shows to anyone: a teaser —
// title, business, type, place, pay, closing date — and a call to join WaziPOS.
// The full advert and applying need an account: signing up / in brings the person
// straight to this job (rememberPendingJob → usePendingJobRedirect in the root layout).
// Signed-in visitors skip the teaser and open the job in the app.

import jobsApi, { type PublicJob } from '@/api/jobsApi';
import { BRAND_GRADIENT, useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useRouter } from 'expo-router';
import { Briefcase, CalendarClock, Lock, MapPin, Share2, Users, Wallet } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Badge, closesLabel, EntityAvatar, pointer, rememberPendingJob, shareJob, TYPE_META } from './jobsShared';

const isWeb = Platform.OS === 'web';

export default function PublicJobScreen({ code }: { code: string }) {
    const { theme, user } = useAuth() as any;
    const router = useRouter();
    const [job, setJob] = useState<PublicJob | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!code) return;
        if (user) {
            router.replace(`/jobs?code=${encodeURIComponent(code)}` as any);
            return;
        }
        void rememberPendingJob(code);
        jobsApi
            .publicJob(code)
            .then((res: any) => (isServerOk(res) ? setJob(res.data.job) : setError(describeResponse(res, 'This job link could not be opened.').message)))
            .catch(() => setError("We couldn't reach WaziPOS. Check your connection and try again."));
    }, [code, user, router]);

    // Social previews / browser tab.
    useEffect(() => {
        if (isWeb && job && typeof document !== 'undefined') document.title = `${job.title} · ${job.entity.title} | WaziPOS Jobs`;
    }, [job]);

    const [g1, g2] = BRAND_GRADIENT;
    const type = job ? TYPE_META[job.employment_type] ?? TYPE_META.PERMANENT : null;

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ flexGrow: 1 }}>
            {/* Brand band */}
            <View style={[{ paddingTop: 28, paddingBottom: 90, paddingHorizontal: 20, alignItems: 'center' }, isWeb ? ({ backgroundImage: `linear-gradient(135deg, ${theme.navy ?? '#0b1733'}, ${g1} 70%, ${g2})` } as any) : { backgroundColor: theme.navy ?? '#0b1733' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                        <Briefcase size={16} color="#fff" />
                    </View>
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16, letterSpacing: 0.2 }}>WaziPOS Jobs</Text>
                </View>
            </View>

            <View style={{ marginTop: -70, paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 620, alignSelf: 'center', gap: 16 }}>
                <View style={{ backgroundColor: theme.panel, borderRadius: 24, borderWidth: 1, borderColor: theme.border, padding: 20, gap: 16, shadowColor: '#0b1733', shadowOpacity: 0.12, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}>
                    {!job && !error ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 40 }} /> : null}
                    {error ? (
                        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Job not available</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, textAlign: 'center' }}>{error}</Text>
                        </View>
                    ) : null}
                    {job ? (
                        <>
                            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                                <EntityAvatar title={job.entity.title} logo={job.entity.logo} size={56} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 21, letterSpacing: -0.3 }}>{job.title}</Text>
                                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 14, marginTop: 2 }}>{job.entity.title}</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {type ? <Badge label={type.label} color={type.color} /> : null}
                                {job.cadre ? <Badge label={job.cadre} color={theme.textMuted} /> : null}
                                <Badge label={job.is_open ? closesLabel(job.closes) : 'Applications closed'} color={job.is_open ? theme.warning : theme.danger} />
                            </View>
                            <View style={{ gap: 10 }}>
                                {job.location ? <Row icon={MapPin} text={job.location} /> : null}
                                {job.pay ? <Row icon={Wallet} text={job.pay} /> : null}
                                <Row icon={Users} text={`${job.vacancies} ${job.vacancies === 1 ? 'position' : 'positions'}`} />
                                <Row icon={CalendarClock} text={`Apply by ${new Date(`${job.closes}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}`} />
                            </View>
                            {job.excerpt ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14.5, lineHeight: 22 }}>{job.excerpt}</Text> : null}

                            {/* Locked: full advert */}
                            <View style={{ padding: 16, borderRadius: 18, backgroundColor: theme.primarySoft, gap: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Lock size={16} color={theme.primary} />
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>See the full job and apply</Text>
                                </View>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 19 }}>
                                    Responsibilities, requirements, benefits and one-tap applying are for WaziPOS members. It's free — and you'll come right back to this job.
                                </Text>
                                <Pressable onPress={() => router.push('/(auth)/register' as any)} accessibilityRole="button" style={[{ height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, marginTop: 4, ...pointer }, isWeb ? ({ backgroundImage: `linear-gradient(120deg, ${g1}, ${g2})` } as any) : null]}>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15.5 }}>Join WaziPOS — it's free</Text>
                                </Pressable>
                                <Pressable onPress={() => router.push('/(auth)/login' as any)} accessibilityRole="button" style={{ height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel, ...pointer }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>I already have an account</Text>
                                </Pressable>
                            </View>
                        </>
                    ) : null}
                </View>

                {job ? (
                    <Pressable onPress={() => void shareJob({ code: job.code, title: job.title, entity: { title: job.entity.title } })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, ...pointer }}>
                        <Share2 size={16} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 14 }}>Share this job</Text>
                    </Pressable>
                ) : null}
                <Pressable onPress={() => router.push('/welcome' as any)} style={{ alignItems: 'center', ...pointer }}>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>What is WaziPOS? Shops, pharmacies, deliveries and jobs — in one app.</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}

function Row({ icon: Icon, text }: { icon: any; text: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={15} color={theme.primary} strokeWidth={2.2} />
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 14, flex: 1 }}>{text}</Text>
        </View>
    );
}
