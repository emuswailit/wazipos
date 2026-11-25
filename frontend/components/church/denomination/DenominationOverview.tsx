// components/church/denomination/DenominationOverview.tsx
//
// Denomination → Overview: parishes, members and families, join requests waiting, and
// totals by region, plus upcoming head-office / region events. Head office sees the
// whole denomination; a region admin sees their region(s).

import { PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { Church, Inbox, Landmark, Map, Megaphone, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Card, EventCard, pointer, SectionHeading } from '../churchShared';
import { DenominationGate, useDenomination } from './denominationShared';

export default function DenominationOverview() {
    const state = useDenomination();
    const { theme } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const [refreshing, setRefreshing] = useState(false);
    const cols = width >= 1000 ? 6 : width >= 600 ? 3 : 2;

    return (
        <DenominationGate state={state}>
            {(home) => {
                const regional = home.level === 'REGION';
                const tiles = [
                    { label: 'Regions', value: home.counts.regions, icon: Map, to: '/denominationRegions', show: !regional },
                    { label: 'Parishes', value: home.counts.parishes, icon: Church, to: '/denominationParishes', show: true },
                    { label: 'Waiting to join', value: home.counts.pending, icon: Inbox, to: '/denominationParishes?tab=PENDING', show: true },
                    { label: 'Members', value: home.counts.members, icon: Users, to: '/denominationParishes', show: true },
                    { label: 'Families', value: home.counts.families, icon: Users, to: '/denominationParishes', show: true },
                    { label: 'Live notices', value: home.counts.notices, icon: Megaphone, to: '/denominationNotices', show: true },
                ].filter((t) => t.show);
                return (
                    <ScrollView
                        contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1100, width: '100%', alignSelf: 'center' }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await state.reload(); setRefreshing(false); }} tintColor={theme.primary} />}
                    >
                        <PosHeader
                            icon={Landmark}
                            title={regional ? home.my_regions.map((r) => r.name).join(', ') || home.organization.title : home.organization.title}
                            subtitle={regional ? `${home.organization.title} · you are Region admin` : `Head office · you are ${home.role_label}`}
                        />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                            {tiles.map((t) => {
                                const alert = t.label === 'Waiting to join' && t.value > 0;
                                return (
                                    <View key={t.label} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                                        <Pressable onPress={() => router.push(t.to as any)} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}`} style={pointer}>
                                            <Card style={{ gap: 6, borderColor: alert ? theme.warning : theme.border }}>
                                                <t.icon size={18} color={alert ? theme.warning : theme.primary} />
                                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>{t.value.toLocaleString()}</Text>
                                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{t.label}</Text>
                                            </Card>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>

                        <SectionHeading
                            title={regional ? 'Your region' : 'By region'}
                            hint="Active members and families in approved parishes"
                            right={home.can.manage_regions ? <SoftButton label="Regions" icon={Map} tone="neutral" onPress={() => router.push('/denominationRegions' as any)} /> : null}
                        />
                        {home.regions.length ? (
                            <Card style={{ gap: 0, paddingVertical: 4 }}>
                                {home.regions.map((r, i) => (
                                    <Pressable
                                        key={r.id || 'none'}
                                        onPress={() => router.push(`/denominationParishes?region=${r.id || 'NONE'}` as any)}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: theme.border, opacity: r.is_active ? 1 : 0.55, ...pointer }}
                                    >
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.semibold }}>{r.name}</Text>
                                            {r.id ? (
                                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }} numberOfLines={1}>
                                                    {r.admins.length ? `Admin: ${r.admins.map((a) => a.name).join(', ')}` : 'No region admin yet'}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                            {r.parishes} {r.parishes === 1 ? 'parish' : 'parishes'} · {r.members.toLocaleString()} members · {r.families.toLocaleString()} families
                                        </Text>
                                    </Pressable>
                                ))}
                            </Card>
                        ) : (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>
                                {home.can.manage_regions ? 'No regions yet. Add regions, appoint their admins, then parishes join a region.' : 'No regions yet.'}
                            </Text>
                        )}

                        <SectionHeading title="Coming up" right={home.can.post ? <SoftButton label="Notices & events" icon={Megaphone} tone="neutral" onPress={() => router.push('/denominationNotices' as any)} /> : null} />
                        {home.upcoming.length ? (
                            <View style={{ gap: 10 }}>
                                {home.upcoming.map((e) => (
                                    <EventCard key={e.id} e={e} />
                                ))}
                            </View>
                        ) : (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular }}>No upcoming events. Conventions and conferences posted here show on the parishes' pages.</Text>
                        )}
                    </ScrollView>
                );
            }}
        </DenominationGate>
    );
}
