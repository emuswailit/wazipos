// components/church/admin/ChurchDashboard.tsx
//
// Church admin → Dashboard: the church at a glance for its officials — families,
// members, visitors, groups, live notices, SMS left this month, birthdays in the next
// week and events in the next two weeks — with shortcuts to each area.

import { InlineNotice, PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { Cake, CalendarDays, HeartHandshake, HouseHeart, Megaphone, MessageSquare, Share2, Users, UsersRound } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Card, ChurchAdminGate, ChurchSwitcher, EventCard, fmtDate, pointer, SectionHeading, shareChurch, useChurchAdmin } from '../churchShared';

export default function ChurchDashboard() {
    const state = useChurchAdmin();
    const { theme } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const [refreshing, setRefreshing] = useState(false);
    const cols = width >= 1000 ? 4 : width >= 600 ? 3 : 2;

    return (
        <ChurchAdminGate state={state}>
            {(home) => {
                const tiles = [
                    { label: 'Families', value: home.counts.families, icon: HouseHeart, to: '/churchFamilies', show: home.can.view_register },
                    { label: 'Members', value: home.counts.members, icon: Users, to: '/churchMembers', show: true },
                    { label: 'Visitors', value: home.counts.visitors, icon: Users, to: '/churchMembers', show: true },
                    { label: 'Groups', value: home.counts.groups, icon: UsersRound, to: '/churchGroups', show: true },
                    { label: 'Live notices', value: home.counts.announcements, icon: Megaphone, to: '/churchAnnouncements', show: true },
                    { label: 'SMS left this month', value: Math.max(0, home.sms.quota - home.sms.used), icon: MessageSquare, to: '/churchMessages', show: home.can.send_sms },
                ].filter((t) => t.show && t.value != null);
                return (
                    <ScrollView
                        contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1100, width: '100%', alignSelf: 'center' }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await state.reload(); setRefreshing(false); }} tintColor={theme.primary} />}
                    >
                        <ChurchSwitcher state={state} />
                        <PosHeader
                            icon={HeartHandshake}
                            title={home.church.title}
                            subtitle={`${home.office_label}${home.church.denomination ? ` · ${home.church.denomination}` : ''}`}
                            right={home.church.code ? <SoftButton label="Share page" icon={Share2} tone="neutral" onPress={() => void shareChurch(home.church)} /> : null}
                        />
                        {home.office === 'GROUP_LEADER' ? <InlineNotice tone="info" message="As a group leader you see and text your own group, and post its programme and events." /> : null}

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginTop: 6 }}>
                            {tiles.map((t) => (
                                <View key={t.label} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                                    <Pressable onPress={() => router.push(t.to as any)} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}`} style={pointer}>
                                        <Card style={{ gap: 6 }}>
                                            <t.icon size={18} color={theme.primary} />
                                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>{t.value}</Text>
                                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{t.label}</Text>
                                        </Card>
                                    </Pressable>
                                </View>
                            ))}
                        </View>

                        <SectionHeading title="Birthdays this week" hint="Active members with a date of birth in the register" />
                        {home.birthdays.length ? (
                            <Card style={{ gap: 8 }}>
                                {home.birthdays.map((b) => (
                                    <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Cake size={15} color={theme.primary} />
                                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold }}>{b.name}</Text>
                                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                            {fmtDate(b.date, false)} · turns {b.turns}
                                        </Text>
                                    </View>
                                ))}
                            </Card>
                        ) : (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>No birthdays in the next 7 days.</Text>
                        )}

                        <SectionHeading title="Coming up" hint="Events in the next two weeks" right={home.can.post ? <SoftButton label="Programme" icon={CalendarDays} tone="neutral" onPress={() => router.push('/churchSchedule' as any)} /> : null} />
                        {home.upcoming.length ? (
                            <View style={{ gap: 10 }}>
                                {home.upcoming.map((e) => (
                                    <EventCard key={e.id} e={e} />
                                ))}
                            </View>
                        ) : (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>No events in the next two weeks.</Text>
                        )}
                    </ScrollView>
                );
            }}
        </ChurchAdminGate>
    );
}
