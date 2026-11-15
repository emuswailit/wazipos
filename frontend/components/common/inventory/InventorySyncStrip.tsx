// components/common/inventory/InventorySyncStrip.tsx
//
// Where the inventory on screen stands with the server, at a glance:
//   live · syncing · offline (changes kept on this device) · N changes waiting ·
//   a push the server refused — with "Sync now" when it can help.

import { useListTokens } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type Props = {
    online: boolean;
    live: boolean;
    syncing: boolean;
    /** Local stock changes (new / edited receipts) not yet on the server. */
    pending: number;
    error?: string | null;
    lastSynced?: string | null;
    onSync: () => void;
};

export function InventorySyncStrip({ online, live, syncing, pending, error, lastSynced, onSync }: Props) {
    const { theme } = useListTokens();

    let tone = '#10b981';
    let icon: keyof typeof Ionicons.glyphMap = 'radio-outline';
    let title = 'Live';
    let detail = lastSynced ? `Up to date · ${lastSynced}` : 'Stock updates arrive as they happen';

    if (!online) {
        tone = '#d97706';
        icon = 'cloud-offline-outline';
        title = 'Offline';
        detail = pending
            ? `${pending} change${pending === 1 ? '' : 's'} saved on this device — they sync when you're back online`
            : "Showing stock saved on this device. Changes you make sync when you're back online";
    } else if (syncing) {
        tone = '#3b82f6';
        icon = 'sync-outline';
        title = 'Syncing…';
        detail = pending ? `Sending ${pending} change${pending === 1 ? '' : 's'}` : 'Fetching the latest stock';
    } else if (error) {
        tone = '#e11d48';
        icon = 'alert-circle-outline';
        title = 'Sync problem';
        detail = error;
    } else if (pending) {
        tone = '#d97706';
        icon = 'cloud-upload-outline';
        title = `${pending} change${pending === 1 ? '' : 's'} waiting to sync`;
        detail = 'They are saved on this device';
    } else if (!live) {
        tone = '#64748b';
        icon = 'time-outline';
        title = 'Connecting…';
        detail = lastSynced ? `Last synced ${lastSynced}` : 'Showing stock saved on this device';
    }

    const canSync = online && !syncing && (pending > 0 || !!error || !live);

    return (
        <View
            accessibilityRole={!online || error ? 'alert' : undefined}
            className="flex-row items-center rounded-2xl px-3.5 py-2.5"
            style={{ backgroundColor: `${tone}14`, borderWidth: 1, borderColor: `${tone}55`, gap: 10 }}
        >
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: `${tone}22` }}>
                {syncing ? <ActivityIndicator size="small" color={tone} /> : <Ionicons name={icon} size={17} color={tone} />}
            </View>
            <View className="flex-1 min-w-0">
                <Text style={{ color: tone, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                    {title}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }} numberOfLines={2}>
                    {detail}
                </Text>
            </View>
            {canSync ? (
                <Pressable onPress={onSync} className="flex-row items-center gap-1.5 px-3 h-8 rounded-xl" style={{ backgroundColor: tone }}>
                    <Ionicons name="sync" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>Sync now</Text>
                </Pressable>
            ) : null}
        </View>
    );
}
