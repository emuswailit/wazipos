// components/church/MyFamily.tsx
//
// Church → My family (everyone signed in): the family the church registered you in,
// matched by your phone number — members, places in the family, baptism / wedding
// dates, and the family you grew up in. Changes go through the church secretary.

import churchesApi, { type Family } from '@/api/churchesApi';
import { InlineNotice, PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Church, HouseHeart, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyNote, fmtDate, Loading } from './churchShared';

export default function MyFamily() {
    const { theme } = useAuth();
    const router = useRouter();
    const { church } = useLocalSearchParams<{ church?: string }>();
    const [fam, setFam] = useState<Family | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        const res: any = await churchesApi.myFamily(church || undefined).catch(() => null);
        if (isServerOk(res)) {
            setFam(res.data.family);
            setError(null);
        } else setError(res ? describeResponse(res, 'Could not open your family.').message : "You're offline.");
        setLoading(false);
    }, [church]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <Loading />;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.primary} />}
        >
            <PosHeader icon={HouseHeart} title="My family" subtitle={fam ? `${fam.church?.title ?? ''} · ${fam.number}` : 'Your family in the church register'} />
            {!fam ? (
                <>
                    {error ? <InlineNotice tone="info" message={error} /> : null}
                    <EmptyNote
                        icon={HouseHeart}
                        title="No family register yet"
                        text="Your church's secretary registers families. Give them the phone number you use on WaziPOS and your family appears here."
                        action={<SoftButton label="Find your church" icon={Search} onPress={() => router.push('/churchFind' as any)} />}
                    />
                </>
            ) : (
                <>
                    <Card>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>{fam.name}</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13 }}>
                            {[fam.area, fam.cell_group?.name ? `Cell: ${fam.cell_group.name}` : null, fam.joined_on ? `Since ${fmtDate(fam.joined_on)}` : null].filter(Boolean).join(' · ')}
                        </Text>
                        {fam.parent_family ? (
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Branched from {fam.parent_family.name} ({fam.parent_family.number})</Text>
                        ) : null}
                    </Card>
                    {(fam.members ?? []).map((m) => (
                        <Card key={m.id} style={{ opacity: m.status === 'DECEASED' || m.status === 'TRANSFERRED' ? 0.6 : 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>
                                    {m.name}
                                    {m.id === fam.me ? ' (you)' : ''}
                                </Text>
                                <Chip label={m.role_label} color={theme.primary} />
                                {m.status !== 'ACTIVE' ? <Chip label={m.status_label} color={m.status === 'DECEASED' ? theme.textMuted : theme.warning} /> : null}
                            </View>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                {[
                                    m.age != null ? `${m.age} yrs` : null,
                                    m.baptised_on ? `Baptised ${fmtDate(m.baptised_on)}` : null,
                                    m.confirmed_on ? `Confirmed ${fmtDate(m.confirmed_on)}` : null,
                                    m.married_on ? `Married ${fmtDate(m.married_on)}` : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ') || ' '}
                            </Text>
                        </Card>
                    ))}
                    {(fam.branch_families ?? []).length ? (
                        <Card>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold }}>Families started by your children</Text>
                            {fam.branch_families!.map((b) => (
                                <Text key={b.id} style={{ color: theme.textMuted, fontFamily: theme.font.medium }}>{b.name} ({b.number})</Text>
                            ))}
                        </Card>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 6 }}>
                        <Church size={14} color={theme.textMuted} />
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5, textAlign: 'center' }}>
                            A newborn, a wedding or a mistake? Tell your church secretary to update the register.
                        </Text>
                    </View>
                </>
            )}
        </ScrollView>
    );
}
