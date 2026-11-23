// components/wholesalers/newWholesaleOrder/OrderManifestHeader.tsx

import { PosHeader, StatusPill } from '@/components/ui/pos';
import { RotateCcw, Truck } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface OrderManifestHeaderProps {
    theme: any;
    user: any;
    syncStatus: SyncStatus;
    isNetworkLoading: boolean;
    onResetWorkspaceTrigger: () => void;
}

export default function OrderManifestHeader({ theme, user, syncStatus, isNetworkLoading, onResetWorkspaceTrigger }: OrderManifestHeaderProps) {
    const pill =
        syncStatus === 'ok'
            ? { tone: 'success' as const, label: 'Synced' }
            : syncStatus === 'error'
                ? { tone: 'danger' as const, label: 'Sync error' }
                : syncStatus === 'syncing'
                    ? { tone: 'info' as const, label: 'Syncing…' }
                    : { tone: 'warning' as const, label: 'Draft' };

    return (
        <PosHeader
            icon={Truck}
            title="New wholesale order"
            subtitle={user?.name ? `Selling as ${user.name}` : 'Sell to a retailer'}
            right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isNetworkLoading ? <ActivityIndicator size="small" color={theme.primary} /> : <StatusPill tone={pill.tone} label={pill.label} />}
                    <Pressable
                        onPress={onResetWorkspaceTrigger}
                        accessibilityRole="button"
                        accessibilityLabel="Start a new order"
                        hitSlop={8}
                        style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surfaceAlt, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) }}
                    >
                        <RotateCcw size={14} color={theme.text} strokeWidth={2.3} />
                        <Text style={{ color: theme.text, fontFamily: theme.font?.bold, fontSize: 12.5 }}>New</Text>
                    </Pressable>
                </View>
            }
        />
    );
}
