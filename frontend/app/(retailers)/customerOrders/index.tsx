// app/(retailers)/client/orders/CustomerOrdersRoute.tsx

import { useAuth } from '@/context/AuthContext';
import { CustomerOrder } from '@/databases/types';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { InvoiceModal } from '../../../components/retailers/customerOrders/InvoiceModal';
import { RowItem } from '../../../components/retailers/customerOrders/RowItem';
import { useOrdersData } from '../../../components/retailers/customerOrders/useOrdersData';

/* ---------------------------------------------------------
 * Row identity: server UUID when present, else the client
 * draft id, else the local Dexie PK as a last resort.
 * ------------------------------------------------------- */
const orderKey = (o: CustomerOrder): string =>
    o.remote_id || o.draft_id || String(o.id ?? '');

/* ---------------------------------------------------------
 * Amount: prefer the normalized convenience field, then
 * fall back through the server's own total columns.
 * ------------------------------------------------------- */
const orderAmount = (o: CustomerOrder): number => {
    const raw =
        o.total_amount ||
        o.order_price_total ||
        o.order_net_price_total ||
        '0';
    const val = parseFloat(String(raw));
    return isNaN(val) ? 0 : val;
};

export default function CustomerOrdersRoute() {
    const { token, isLoading: isAuthLoading } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= 768;

    const {
        orders,
        isConnected,
        isRefreshing,
        lastSynced,
        refetch,
    } = useOrdersData(token);

    const [search, setSearch] = useState('');
    const [selected, setSelected] =
        useState<CustomerOrder | null>(null);

    const filtered = useMemo(
        () =>
            orders.filter(
                (o) =>
                    (o.order_number || '')
                        .toLowerCase()
                        .includes(search.toLowerCase()) ||
                    (o.customer_name || '')
                        .toLowerCase()
                        .includes(search.toLowerCase())
            ),
        [orders, search]
    );

    const totalVal = useMemo(
        () =>
            filtered.reduce(
                (sum, o) => sum + orderAmount(o),
                0
            ),
        [filtered]
    );

    const renderItem = useCallback(
        ({ item }: { item: CustomerOrder }) => (
            <RowItem
                order={item}
                isLarge={isLarge}
                onSelect={setSelected}
            />
        ),
        [isLarge]
    );

    if (isAuthLoading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#007AFF" />
                <Text className="text-gray-500 text-xs font-semibold mt-3">
                    Validating Session Registers...
                </Text>
            </View>
        );
    }

    const renderListHeader = () => (
        <View className="w-full bg-gray-50 pt-4">
            {/* Header Info Block */}
            <View className="p-4 rounded-2xl mb-4 border-l-4 border-l-blue-600 bg-white shadow-xs flex-row justify-between items-center">
                <View className="flex-1">
                    <Text className="text-lg font-bold text-gray-900 tracking-tight">
                        Internal Order Registers
                    </Text>
                    <Text className="text-gray-500 text-[11px] mt-0.5">
                        {isConnected
                            ? 'Live WebSockets Connected'
                            : 'Offline Mode Active'}{' '}
                        {lastSynced && `• Checked: ${lastSynced}`}
                    </Text>
                    {!isConnected && (
                        <View className="mt-1.5 bg-amber-50 px-2 py-0.5 rounded self-start border border-amber-200">
                            <Text className="text-amber-700 text-[9px] font-bold">
                                ⚠️ INTERNET IS REQUIRED FOR UPDATE
                            </Text>
                        </View>
                    )}
                </View>
                {!isLarge && (
                    <View className="items-end pl-2">
                        <Text className="text-[9px] font-bold text-gray-400 tracking-wider">
                            VALUE
                        </Text>
                        <Text className="text-sm font-black text-green-700 mt-0.5">
                            KES{' '}
                            {totalVal.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                            })}
                        </Text>
                    </View>
                )}
            </View>

            {/* Input Utility Controls */}
            <View className="flex-row items-center justify-between mb-3 gap-3">
                <TextInput
                    placeholder="Search registrations..."
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 border border-gray-200 rounded-xl px-3 h-9 bg-white text-gray-900 text-xs shadow-xs"
                    value={search}
                    onChangeText={setSearch}
                />
                <View className="px-2.5 py-1.5 bg-white border border-gray-100 rounded-xl shadow-xs">
                    <Text
                        className={`text-[10px] font-bold ${isRefreshing
                            ? 'text-blue-500'
                            : isConnected
                                ? 'text-green-600'
                                : 'text-amber-500'
                            }`}
                    >
                        •{' '}
                        {isRefreshing
                            ? 'Syncing...'
                            : isConnected
                                ? 'Live'
                                : 'Offline'}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-gray-50 relative">
            {isLarge ? (
                /* ---------- Desktop / wide web ---------- */
                <ScrollView
                    className="flex-1 p-6"
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={refetch}
                            tintColor="#007AFF"
                        />
                    }
                >
                    {renderListHeader()}
                    <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-2 mb-8">
                        <View className="flex-row p-4 bg-gray-50 border-b border-gray-200 items-center">
                            <View className="w-2/12 px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Order Number
                                </Text>
                            </View>
                            <View className="w-2/12 px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Customer
                                </Text>
                            </View>
                            <View className="w-2/12 px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Status
                                </Text>
                            </View>
                            <View className="w-[12.5%] px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Method
                                </Text>
                            </View>
                            <View className="w-[12.5%] px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Provider Ref
                                </Text>
                            </View>
                            <View className="w-[12.5%] px-1">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider">
                                    Amount
                                </Text>
                            </View>
                            <View className="w-[12.5%] px-1 text-right">
                                <Text className="text-gray-500 font-bold text-xs uppercase tracking-wider text-right pr-4">
                                    Action
                                </Text>
                            </View>
                        </View>

                        {filtered.length === 0 ? (
                            <View className="p-12 items-center">
                                <Text className="text-gray-400 text-sm font-medium">
                                    No order files match your search
                                    criteria.
                                </Text>
                            </View>
                        ) : (
                            filtered.map((o) => (
                                <RowItem
                                    key={orderKey(o)}
                                    order={o}
                                    isLarge={true}
                                    onSelect={setSelected}
                                />
                            ))
                        )}
                    </View>
                </ScrollView>
            ) : (
                /* ---------- Mobile ---------- */
                <FlatList
                    data={filtered}
                    keyExtractor={orderKey}
                    renderItem={renderItem}
                    ListHeaderComponent={renderListHeader}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 32,
                    }}
                    keyboardShouldPersistTaps="handled"
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    initialNumToRender={8}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={refetch}
                            tintColor="#007AFF"
                            colors={['#007AFF']}
                        />
                    }
                    ListEmptyComponent={
                        <View className="py-20 items-center justify-center">
                            <Text className="text-gray-400 text-xs text-center font-medium">
                                No system sales order logs match
                                filters.
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Overlay dialog */}
            <InvoiceModal
                order={selected}
                onClose={() => setSelected(null)}
            />
        </View>
    );
}