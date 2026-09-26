// components/wholesalers/newWholesaleOrder/WholesaleOrdersHistory.tsx

import {
    Platform,
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

interface WholesaleOrdersHistoryProps {
    theme: any;
    orders: any[];
    onReloadOrder: (order: any) => void;
}

export default function WholesaleOrdersHistory({
    theme,
    orders = [],
    onReloadOrder,
}: WholesaleOrdersHistoryProps) {
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const isDark = (theme as any).isDarkMode;
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const mutedBg = isDark ? '#0f172a' : '#f8fafc';

    /* -------- Empty state -------- */
    if (!orders || orders.length === 0) {
        return (
            <View
                style={{
                    backgroundColor: theme.panel,
                    borderColor,
                }}
                className="w-full p-8 rounded-xl border items-center justify-center mt-6"
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font?.medium,
                    }}
                    className="text-sm italic"
                >
                    No localized order transactions logged in
                    history indexes.
                </Text>
            </View>
        );
    }

    /* -------- Mobile layout -------- */
    if (!isLargeScreen) {
        return (
            <View className="w-full mt-8 gap-y-3">
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font?.bold,
                    }}
                    className="text-lg font-black px-1"
                >
                    Recent Transactions History (Tap to Reload)
                </Text>

                {orders.map((order) => (
                    <Pressable
                        key={order.id}
                        onPress={() => onReloadOrder(order)}
                    >
                        {({ pressed }) => (
                            <View
                                style={{
                                    backgroundColor: theme.panel,
                                    borderColor,
                                    opacity: pressed ? 0.75 : 1,
                                }}
                                className="p-4 rounded-xl border shadow-sm flex-col gap-y-2"
                            >
                                <View className="flex-row justify-between items-center">
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily:
                                                theme.font?.bold,
                                        }}
                                        className="text-sm font-black w-2/3"
                                        numberOfLines={1}
                                    >
                                        {order.retailer_name}
                                    </Text>

                                    <View
                                        style={{
                                            backgroundColor:
                                                order.sync_status ===
                                                    'SYNCED'
                                                    ? '#22c55e20'
                                                    : '#f59e0b20',
                                        }}
                                        className="px-2 py-0.5 rounded-md"
                                    >
                                        <Text
                                            style={{
                                                color:
                                                    order.sync_status ===
                                                        'SYNCED'
                                                        ? '#22c55e'
                                                        : '#f59e0b',
                                                fontFamily:
                                                    theme.font
                                                        ?.bold,
                                            }}
                                            className="text-[10px] font-black uppercase tracking-wider"
                                        >
                                            {order.sync_status}
                                        </Text>
                                    </View>
                                </View>

                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily: theme.font?.mono,
                                        opacity: 0.6,
                                    }}
                                    className="text-[10px]"
                                >
                                    REF: {order.draft_id}
                                </Text>

                                <View
                                    className="flex-row justify-between items-center mt-1 pt-2 border-t border-dashed"
                                    style={{ borderTopColor: borderColor }}
                                >
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font?.medium,
                                        }}
                                        className="text-xs font-semibold"
                                    >
                                        {order.item_count} items via{' '}
                                        {order.payment_method_title}
                                    </Text>
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontFamily:
                                                theme.font?.bold,
                                        }}
                                        className="text-sm font-extrabold"
                                    >
                                        KES{' '}
                                        {Number(
                                            order.final_price_total ??
                                            0
                                        ).toFixed(2)}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </Pressable>
                ))}
            </View>
        );
    }

    /* -------- Desktop layout -------- */
    const renderTableRows = () => (
        <>
            {orders.map((order) => (
                <Pressable
                    key={order.id}
                    onPress={() => onReloadOrder(order)}
                >
                    {({ pressed }) => (
                        <View
                            style={{
                                borderBottomColor: borderColor,
                                backgroundColor: pressed
                                    ? `${theme.primary}10`
                                    : 'transparent',
                            }}
                            className="flex-row items-center px-4 py-3 border-b"
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font?.bold,
                                }}
                                className="flex-[2] text-xs font-bold"
                                numberOfLines={1}
                            >
                                {order.retailer_name}
                            </Text>

                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font?.mono,
                                }}
                                className="flex-1 text-[10px]"
                                numberOfLines={1}
                            >
                                {order.draft_id}
                            </Text>

                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily:
                                        theme.font?.medium,
                                }}
                                className="flex-1 text-xs text-center"
                            >
                                {order.item_count}
                            </Text>

                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font?.bold,
                                }}
                                className="flex-1 text-[10px] text-center uppercase tracking-wide"
                                numberOfLines={1}
                            >
                                {order.payment_method_title}
                            </Text>

                            <View className="flex-1 items-center justify-center">
                                <View
                                    style={{
                                        backgroundColor:
                                            order.sync_status ===
                                                'SYNCED'
                                                ? '#22c55e15'
                                                : '#f59e0b15',
                                    }}
                                    className="px-2.5 py-0.5 rounded-md"
                                >
                                    <Text
                                        style={{
                                            color:
                                                order.sync_status ===
                                                    'SYNCED'
                                                    ? '#22c55e'
                                                    : '#f59e0b',
                                            fontFamily:
                                                theme.font?.bold,
                                        }}
                                        className="text-[10px] font-black tracking-widest"
                                    >
                                        {order.sync_status}
                                    </Text>
                                </View>
                            </View>

                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font?.bold,
                                }}
                                className="flex-1 text-xs font-black text-right"
                            >
                                KES{' '}
                                {Number(
                                    order.final_price_total ?? 0
                                ).toFixed(2)}
                            </Text>
                        </View>
                    )}
                </Pressable>
            ))}
        </>
    );

    return (
        <View className="w-full mt-8 flex-col gap-y-3">
            <Text
                style={{
                    color: theme.text,
                    fontFamily: theme.font?.bold,
                }}
                className="text-lg font-black"
            >
                Recent Transactions Ledger History (Click Row to
                Reload)
            </Text>

            <View
                style={{
                    backgroundColor: theme.panel,
                    borderColor,
                }}
                className="w-full rounded-xl border shadow-sm overflow-hidden"
            >
                {/* Table header */}
                <View
                    style={{
                        backgroundColor: mutedBg,
                        borderBottomColor: borderColor,
                    }}
                    className="flex-row px-4 py-3 border-b"
                >
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-[2] text-xs font-black uppercase tracking-wider"
                    >
                        Retailer / Client
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-1 text-xs font-black uppercase tracking-wider"
                    >
                        Reference Node
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-1 text-xs font-black uppercase tracking-wider text-center"
                    >
                        Lines
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-1 text-xs font-black uppercase tracking-wider text-center"
                    >
                        Settlement
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-1 text-xs font-black uppercase tracking-wider text-center"
                    >
                        Sync Matrix
                    </Text>
                    <Text
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font?.bold,
                        }}
                        className="flex-1 text-xs font-black uppercase tracking-wider text-right"
                    >
                        Billing Gross
                    </Text>
                </View>

                {Platform.OS === 'web' ? (
                    <ScrollView
                        className="w-full max-h-80"
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                    >
                        {renderTableRows()}
                    </ScrollView>
                ) : (
                    <View className="w-full">
                        {renderTableRows()}
                    </View>
                )}
            </View>
        </View>
    );
}