// components/church/FindChurches.tsx
//
// Church → Find a church (everyone signed in): search by name, town or denomination,
// or "Near me" (device location) for the nearest first. Opens the church's page.

import churchesApi, { type ChurchCard, type Denomination } from '@/api/churchesApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { readDeviceLocation } from '@/hooks/useNearbyShops';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useRouter } from 'expo-router';
import { Church, Clock, LocateFixed, MapPin, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyNote, Meta, pointer } from './churchShared';

export default function FindChurches() {
    const { theme } = useAuth();
    const router = useRouter();
    const [q, setQ] = useState('');
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [rows, setRows] = useState<ChurchCard[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [denom, setDenom] = useState('');
    const [denoms, setDenoms] = useState<{ value: string; label: string }[]>([]);
    const [region, setRegion] = useState('');
    const [regions, setRegions] = useState<{ value: string; label: string }[]>([]);

    // A denomination's regions, to narrow the search further.
    useEffect(() => {
        setRegion('');
        setRegions([]);
        if (!denom) return;
        churchesApi.regionsOf(denom).then((res: any) => {
            if (isServerOk(res)) setRegions([{ value: '', label: 'All regions' }, ...res.data.result.regions.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name }))]);
        });
    }, [denom]);
    const timer = useRef<any>(null);

    useEffect(() => {
        churchesApi.denominations().then((res: any) => {
            if (isServerOk(res)) setDenoms([{ value: '', label: 'All denominations' }, ...res.data.result.denominations.filter((d: Denomination) => d.parishes > 0).map((d: Denomination) => ({ value: d.id, label: `${d.title} (${d.parishes})` }))]);
        });
    }, []);

    const search = useCallback(async (query: string, here: typeof coords, denomination: string, regionId: string) => {
        setBusy(true);
        const res: any = await churchesApi.find({ q: query.trim() || undefined, denomination_id: denomination || undefined, region_id: regionId || undefined, ...(here ?? {}) }).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            setRows(res.data.result.churches);
            setError(null);
        } else setError(res ? describeResponse(res, 'Could not search churches.').message : "You're offline. Connect to find churches.");
    }, []);

    useEffect(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void search(q, coords, denom, region), 350);
        return () => clearTimeout(timer.current);
    }, [q, coords, denom, region, search]);

    const nearMe = async () => {
        setLocating(true);
        const fix = await readDeviceLocation();
        setLocating(false);
        if (fix.ok) setCoords(fix.coords);
        else setError(fix.message);
    };

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 12 }} keyboardShouldPersistTaps="handled">
            <PosHeader icon={Search} title="Find a church" subtitle={coords ? 'Nearest first' : 'Search by name, town or denomination'} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                    <CustomTextField value={q} onChangeText={setQ} placeholder="e.g. PCEA, Nakuru, St. Paul's" autoCorrect={false} />
                </View>
                <SoftButton label={coords ? 'Near me ✓' : locating ? 'Locating…' : 'Near me'} icon={LocateFixed} onPress={() => (coords ? setCoords(null) : void nearMe())} disabled={locating} />
            </View>
            {denoms.length > 1 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexGrow: 1, minWidth: 220 }}>
                        <SelectDropdown label="Denomination" options={denoms} value={denom} onChange={setDenom} placeholder="All denominations" />
                    </View>
                    {regions.length > 1 ? (
                        <View style={{ flexGrow: 1, minWidth: 200 }}>
                            <SelectDropdown label="Region" options={regions} value={region} onChange={setRegion} placeholder="All regions" />
                        </View>
                    ) : null}
                </View>
            ) : null}
            {error ? <InlineNotice tone="warning" message={error} /> : null}
            {busy && !rows ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
            {rows && !rows.length ? <EmptyNote icon={Church} title="No churches found" text="Try another name or town. Churches appear here once they join WaziPOS." /> : null}
            {(rows ?? []).map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/churches?church=${c.id}` as any)} accessibilityRole="button" accessibilityLabel={c.title} style={pointer}>
                    <Card>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Church size={20} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }} numberOfLines={1}>{c.title}</Text>
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>{[c.denomination, c.region, c.town].filter(Boolean).join(' · ') || 'Church'}</Text>
                            </View>
                            {c.is_member ? <Chip label="Your church" color={theme.success} /> : null}
                        </View>
                        {c.distance_km != null ? <Meta icon={MapPin} text={`${c.distance_km} km away`} /> : null}
                        {(c.services ?? []).map((s) => (
                            <Meta key={s} icon={Clock} text={s} />
                        ))}
                    </Card>
                </Pressable>
            ))}
        </ScrollView>
    );
}
