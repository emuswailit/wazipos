// components/admin/frequencies/AdminFrequencyDetailsModal.tsx
//
// Admin read-only details modal for a frequency.
//
// Matches the retailer FrequencyDetailsModal 1:1 — same header,
// same three cards (identity/timestamps, three-column spec grid,
// description), same action row.

import {
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import type { FrequencyItem } from './types';

interface Props {
    routeItem: FrequencyItem | null;
    onClose: () => void;
    theme: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: FrequencyItem) => void;
}

export default function AdminFrequencyDetailsModal({
    routeItem,
    onClose,
    theme,
    formatDateHandler,
    onOpenEditTrigger,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();

    const handleEditAction = () => {
        if (routeItem) {
            onClose();
            onOpenEditTrigger(routeItem);
        }
    };

    return (
        <Modal
            visible={!!routeItem}
            transparent={false}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View
                style={{
                    backgroundColor: theme.background,
                    height: screenHeight,
                }}
                className="flex-1 flex-col w-full"
            >
                {/* Header */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderBottomColor: theme.border,
                    }}
                    className="h-16 w-full border-b px-6 flex-row justify-between items-center z-50"
                >
                    <View className="flex-row items-center gap-x-3">
                        <View
                            style={{
                                backgroundColor:
                                    theme.primary + '15',
                            }}
                            className="px-2.5 py-1 rounded-md"
                        >
                            <Text
                                style={{ color: theme.primary }}
                                className="text-[10px] font-black tracking-widest uppercase"
                            >
                                Frequency Profile
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                            className="tracking-tight"
                        >
                            Frequency Specifications
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20"
                    >
                        <Text
                            className="text-red-500 font-bold text-xs px-2"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            ✕ Close View
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Body */}
                <ScrollView
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    className="flex-1 w-full px-6 py-6"
                >
                    <View className="w-full max-w-2xl mx-auto flex-col gap-y-6">
                        {/* Identity + timestamps card */}
                        <View
                            style={{
                                backgroundColor: theme.panel,
                                borderColor: theme.border,
                            }}
                            className="p-6 rounded-2xl border items-start w-full flex-col gap-y-4"
                        >
                            <View className="w-full">
                                <Text
                                    style={{ color: theme.textDark }}
                                    className="text-[10px] uppercase font-black tracking-wider mb-2"
                                >
                                    Frequency Interval Title
                                </Text>
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xl,
                                    }}
                                    className="text-left"
                                >
                                    {routeItem?.title}
                                </Text>
                            </View>
                            <View
                                style={{
                                    borderTopColor: theme.border,
                                }}
                                className="w-full flex-row justify-between items-center pt-3 border-t flex-wrap gap-2"
                            >
                                <View className="items-start">
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.bold,
                                        }}
                                        className="text-[9px] uppercase tracking-wider"
                                    >
                                        Initialized On
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.semibold,
                                            fontSize:
                                                theme.fontSize.xs,
                                            marginTop: 2,
                                        }}
                                    >
                                        {routeItem
                                            ? formatDateHandler(
                                                routeItem.created
                                            )
                                            : '—'}
                                    </Text>
                                </View>
                                <View className="items-end web:items-start">
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily: theme.font.bold,
                                        }}
                                        className="text-[9px] uppercase tracking-wider"
                                    >
                                        Last Sync
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.semibold,
                                            fontSize:
                                                theme.fontSize.xs,
                                            marginTop: 2,
                                        }}
                                    >
                                        {routeItem
                                            ? formatDateHandler(
                                                routeItem.updated
                                            )
                                            : '—'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Three-column spec card */}
                        <View
                            style={{
                                backgroundColor: theme.panel,
                                borderColor: theme.border,
                            }}
                            className="p-6 rounded-2xl border w-full flex-row justify-between gap-4 flex-wrap"
                        >
                            <View className="items-start min-w-[100px]">
                                <Text
                                    style={{ color: theme.textDark }}
                                    className="text-[10px] uppercase font-black tracking-wider mb-1"
                                >
                                    Prescription SIG Code
                                </Text>
                                <View
                                    className="px-3 py-1 rounded-lg mt-1"
                                    style={{
                                        backgroundColor:
                                            'rgba(148,163,184,0.15)',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {routeItem?.abbreviation || '—'}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-start min-w-[140px]">
                                <Text
                                    style={{ color: theme.textDark }}
                                    className="text-[10px] uppercase font-black tracking-wider mb-1"
                                >
                                    Latin Medical Term
                                </Text>
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                        fontStyle: 'italic',
                                        marginTop: 8,
                                    }}
                                >
                                    {routeItem?.latin || '—'}
                                </Text>
                            </View>
                            <View className="items-end web:items-start min-w-[120px]">
                                <Text
                                    style={{ color: theme.textDark }}
                                    className="text-[10px] uppercase font-black tracking-wider mb-1"
                                >
                                    Daily Frequency Value
                                </Text>
                                <Text
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                        marginTop: 8,
                                    }}
                                >
                                    {routeItem?.numerical}x per day
                                </Text>
                            </View>
                        </View>

                        {/* Description card */}
                        <View
                            style={{
                                backgroundColor: theme.panel,
                                borderColor: theme.border,
                            }}
                            className="p-6 rounded-2xl border items-start w-full"
                        >
                            <Text
                                style={{ color: theme.textDark }}
                                className="text-[10px] uppercase font-black tracking-wider mb-2"
                            >
                                Clinical Indication Summary
                            </Text>
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.sm,
                                    lineHeight: 22,
                                }}
                                className="text-left w-full"
                            >
                                {routeItem?.description ||
                                    'No supplemental clinical guidelines submitted for this interval node parameter.'}
                            </Text>
                        </View>

                        {/* Actions */}
                        <View className="flex-row items-center gap-x-4 mt-4 w-full">
                            <TouchableOpacity
                                onPress={handleEditAction}
                                style={{
                                    borderColor: theme.border,
                                }}
                                className="flex-1 h-12 rounded-xl border items-center justify-center active:opacity-70"
                            >
                                <Text
                                    className="uppercase tracking-wider"
                                    style={{
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Edit Parameters
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={onClose}
                                style={{
                                    backgroundColor:
                                        theme.primary,
                                }}
                                className="flex-1 h-12 rounded-xl items-center justify-center active:opacity-90"
                            >
                                <Text
                                    className="text-white uppercase tracking-wider"
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.xs,
                                    }}
                                >
                                    Go Back
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

