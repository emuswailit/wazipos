// components/restaurants/owner/RestaurantBar.tsx
//
// The bar, billed apart from food: Sell (bottles & tots, cash sale or tab),
// Tabs (running bills), Stock (bottles + tots in the open bottle). Mobile
// first; works offline — cash sales and stock changes are saved on the device
// and sync when the connection is back.

import type { BarTab } from '@/api/diningApi';
import PendingSyncBanner from '@/components/common/PendingSyncBanner';
import { SegmentedControl, useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { BarSell } from './bar/BarSell';
import { BarStock } from './bar/BarStock';
import { BarTabs } from './bar/BarTabs';
import { useBarData } from './bar/useBarData';

type Seg = 'SELL' | 'TABS' | 'STOCK';

export default function RestaurantBar() {
    const { theme } = useListTokens();
    const bar = useBarData();
    const [seg, setSeg] = useState<Seg>('SELL');
    const [target, setTarget] = useState<BarTab | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const say = (m: string) => {
        setToast(m);
        setTimeout(() => setToast(null), 3500);
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View className="px-3 pt-3" style={{ gap: 8, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
                <View className="flex-row items-center justify-between">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>Bar</Text>
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                        <Ionicons name={bar.isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'} size={15} color={bar.isOnline ? '#10b981' : '#d97706'} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {bar.isOnline ? (bar.syncedAt ? `Synced ${bar.syncedAt}` : 'Online') : 'Offline · cash sales still work'}
                        </Text>
                    </View>
                </View>
                <PendingSyncBanner kind="dining" />
                <SegmentedControl<Seg>
                    variant="mobile"
                    value={seg}
                    onChange={(s) => {
                        setSeg(s);
                        if (s !== 'SELL') setTarget(null);
                    }}
                    options={[
                        { key: 'SELL', label: target ? 'Add round' : 'Sell' },
                        { key: 'TABS', label: `Tabs${bar.tabs.length ? ` · ${bar.tabs.length}` : ''}` },
                        { key: 'STOCK', label: 'Stock' },
                    ]}
                />
                {toast ? (
                    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: toast.startsWith('Saved offline') ? 'rgba(217,119,6,0.12)' : 'rgba(16,185,129,0.12)' }}>
                        <Text style={{ color: toast.startsWith('Saved offline') ? '#d97706' : '#10b981', fontFamily: theme.font.bold, fontSize: 12.5 }}>{toast}</Text>
                    </View>
                ) : null}
                {bar.error && bar.isOnline ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12 }}>{bar.error}</Text> : null}
            </View>
            <View style={{ flex: 1, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
                {seg === 'SELL' ? (
                    <BarSell
                        bar={bar}
                        target={target}
                        onDone={(m) => {
                            say(m);
                            if (target) {
                                setTarget(null);
                                setSeg('TABS');
                            }
                        }}
                    />
                ) : seg === 'TABS' ? (
                    <BarTabs
                        bar={bar}
                        onAddRound={(t) => {
                            setTarget(t);
                            setSeg('SELL');
                        }}
                    />
                ) : (
                    <BarStock bar={bar} />
                )}
            </View>
        </View>
    );
}
