// components/common/SubscriptionBanner.tsx

import { SubscriptionFormModal } from '@/components/admin/subscriptions/SubscriptionFormModal';
import { useAuth } from '@/context/AuthContext';
import { useSubscriptionSync } from '@/context/SubscriptionSyncContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

export function SubscriptionBanner() {
    const { theme, user } = useAuth();
    const { latestSubscription, hasActiveSubscription, summary, isSyncing, forceRefresh } = useSubscriptionSync();
    const { width } = useWindowDimensions();

    const [isRenewModalVisible, setIsRenewModalVisible] = useState(false);
    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

    // Breakpoint to trigger mobile/small screen layout
    const isMobile = width < 768;

    // Don't show banner while initially loading
    if (isSyncing && !latestSubscription) return null;

    // Get entity title directly from the logged-in user's context
    const entityTitle = user?.entity_title || latestSubscription?.entity_title || 'My Entity';
    const entityType =
        user?.entity_type ||
        user?.roles?.find((r: any) => r.entity_type)?.entity_type ||
        '';

    // Format monthly subscription
    const rawAmount = user?.monthly_subscription;
    const numericAmount = Number(rawAmount);
    const monthlyAmountText = !isNaN(numericAmount) && numericAmount > 0
        ? `KES ${numericAmount.toLocaleString()}`
        : 'N/A';

    // Totals across all active subscriptions, so prepaid renewals are included
    const daysLeft = summary.totalDaysRemaining;
    const activeCount = summary.activeCount;

    const isActive = hasActiveSubscription && daysLeft > 0;

    const openDetails = () => {
        setIsBottomSheetOpen(false);
        router.push("/(admin)/subscriptions" as any);
    };
    const statusColor = isActive ? '#10b981' : '#ef4444';
    const statusBg = isActive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
    const statusBorder = isActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';

    // ─────────────────────────────────────────────────────────────
    // INNER CONTENT COMPONENT (Used in Desktop Banner & Mobile Sheet)
    // ─────────────────────────────────────────────────────────────
    const BannerContent = ({ isSheet = false }: { isSheet?: boolean }) => (
        <View
            className={`flex-col ${isSheet ? 'gap-4' : 'md:flex-row md:items-center md:justify-between md:gap-0 gap-3'} w-full`}
            style={{ maxWidth: isSheet ? '100%' : 1400, marginHorizontal: 'auto' }}
        >
            {/* 1. Entity Info */}
            <View className="flex-row items-center gap-3 shrink-0">
                <Ionicons
                    name={isActive ? "checkmark-circle" : "alert-circle"}
                    size={isSheet ? 28 : 24}
                    color={statusColor}
                />
                <View className="flex-row items-center gap-2 flex-wrap">
                    <Text
                        className={`font-bold ${isSheet ? 'text-base' : 'text-sm'}`}
                        style={{ color: theme.text, fontFamily: theme.font.bold }}
                    >
                        {entityTitle}
                    </Text>
                    {entityType ? (
                        <View
                            className="px-2 py-0.5 rounded border"
                            style={{
                                backgroundColor: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                borderColor: statusBorder,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wider text-[10px] font-bold"
                                style={{ color: isActive ? '#065f46' : '#991b1b', fontFamily: theme.font.bold }}
                            >
                                {entityType.replace(/([A-Z])/g, ' $1').trim()}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>

            {/* 2. Stats */}
            <View
                className={`flex-row items-center gap-3 ${isSheet ? 'gap-4 flex-wrap' : 'md:gap-6 md:flex-1 md:justify-center'}`}
            >
                <Text className="font-bold text-[13px]" style={{ color: isActive ? '#065f46' : '#991b1b', fontFamily: theme.font.bold }}>
                    {isActive ? 'Active' : 'Expired'}
                </Text>
                <Text className="text-[13px]" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                    • {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                </Text>
                <Text className="text-[13px]" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                    • {activeCount} active {activeCount === 1 ? 'subscription' : 'subscriptions'}
                </Text>
                <Text className="text-[13px]" style={{ color: theme.textDark, fontFamily: theme.font.medium }}>
                    • {monthlyAmountText}/mo
                </Text>
            </View>

            {/* 3. Actions */}
            <View className={`flex-row items-center gap-3 shrink-0 ${isSheet ? 'justify-end w-full mt-2' : 'w-full md:w-auto justify-end'}`}>
                {/* Live WebSocket Indicator */}
                <View
                    className="flex-row items-center gap-1.5 px-2 py-1 rounded-full bg-black/5"
                    style={{ backgroundColor: theme.surfaceAlt }}
                >
                    <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <Text className="text-[10px] uppercase tracking-wider font-bold" style={{ color: theme.textDark, fontFamily: theme.font.bold }}>
                        Live Sync
                    </Text>
                </View>

                <Pressable
                    onPress={openDetails}
                    accessibilityRole="button"
                    accessibilityLabel="View subscription details"
                    className={`rounded-lg flex-row items-center gap-1.5 border ${isSheet ? 'px-5 py-2.5' : 'px-4 py-2'}`}
                    style={{ borderColor: statusBorder, backgroundColor: theme.surface }}
                >
                    <Ionicons name="list" size={14} color={theme.text} />
                    <Text className="text-xs uppercase tracking-wider font-bold" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                        Details
                    </Text>
                </Pressable>

                {isSyncing ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                    <Pressable
                        onPress={() => {
                            if (isSheet) setIsBottomSheetOpen(false);
                            setIsRenewModalVisible(true);
                        }}
                        className={`rounded-lg flex-row items-center shadow-sm ${isSheet ? 'px-6 py-2.5' : 'px-5 py-2'}`}
                        style={{ backgroundColor: isActive ? theme.primary : '#ef4444' }}
                    >
                        <Text className="text-xs uppercase tracking-wider font-bold text-white" style={{ fontFamily: theme.font.bold }}>
                            Renew Now
                        </Text>
                    </Pressable>
                )}
            </View>
        </View>
    );

    return (
        <>
            {/* ─────────────────────────────────────────────────────────────
                DESKTOP VIEW (Full Width Banner)
            ───────────────────────────────────────────────────────────── */}
            {!isMobile && (
                <View
                    className="w-full border-b"
                    style={{ backgroundColor: statusBg, borderBottomColor: statusBorder }}
                >
                    <View className="w-full px-4 py-3">
                        <BannerContent />
                    </View>
                </View>
            )}

            {/* ─────────────────────────────────────────────────────────────
                MOBILE VIEW (Slim Bar + Bottom Sheet)
            ───────────────────────────────────────────────────────────── */}
            {isMobile && (
                <Pressable
                    onPress={() => setIsBottomSheetOpen(true)}
                    className="w-full border-b px-4 py-2.5 flex-row items-center justify-between"
                    style={{ backgroundColor: statusBg, borderBottomColor: statusBorder }}
                >
                    <View className="flex-row items-center gap-2">
                        <Ionicons
                            name={isActive ? "checkmark-circle" : "alert-circle"}
                            size={18}
                            color={statusColor}
                        />
                        <Text className="font-bold text-xs" style={{ color: theme.text, fontFamily: theme.font.bold }}>
                            Subscription {isActive ? `Active · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}` : 'Expired'}
                        </Text>
                    </View>
                    <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: statusColor, fontFamily: theme.font.bold }}>
                        View Details
                    </Text>
                </Pressable>
            )}

            {/* Mobile Bottom Sheet Modal */}
            {isMobile && (
                <Modal
                    visible={isBottomSheetOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setIsBottomSheetOpen(false)}
                >
                    {/* Overlay */}
                    <Pressable
                        style={styles.overlay}
                        onPress={() => setIsBottomSheetOpen(false)}
                    />

                    {/* Sheet Container */}
                    <View
                        style={[
                            styles.sheetContainer,
                            { backgroundColor: theme.panel, borderColor: theme.border, borderWidth: 1 }
                        ]}
                    >
                        {/* Drag Handle */}
                        <View className="items-center py-3">
                            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: theme.border }} />
                        </View>

                        {/* Content */}
                        <View className="px-5 pb-8">
                            <BannerContent isSheet />
                        </View>
                    </View>
                </Modal>
            )}

            {/* ─────────────────────────────────────────────────────────────
                SHARED MODAL (Renew Form)
            ───────────────────────────────────────────────────────────── */}
            <SubscriptionFormModal
                visible={isRenewModalVisible}
                onClose={() => setIsRenewModalVisible(false)}
                onSuccess={() => {
                    setIsRenewModalVisible(false);
                    // The WebSocket will catch this and update the banner automatically, 
                    // but we call forceRefresh just in case the WS is momentarily disconnected.
                    forceRefresh();
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheetContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        // Remove bottom corners for a flush bottom fit
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
});