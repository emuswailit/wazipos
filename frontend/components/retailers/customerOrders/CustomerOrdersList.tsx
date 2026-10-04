// components/retailers/customerOrders/CustomerOrdersList.tsx
//
// Customer-orders view — shell.
//
// Owns data + filter state, dispatches to the Web or Mobile view.

import { useAuth } from '@/context/AuthContext';
import { CustomerOrder } from '@/databases/types';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';

import { CustomerOrdersMobileView } from './CustomerOrdersMobileView';
import {
    CustomerOrdersWebView, orderAmount,
    toBool,
    type CustomerOrdersCounts,
    type CustomerOrdersViewProps
} from './CustomerOrdersWebView';
import { InvoiceModal } from './InvoiceModal';
import { useOrdersData } from './useOrdersData';

const LARGE_SCREEN_MIN_WIDTH = 768;

/* =========================================================
 * Search
 * ======================================================= */

function matchesQuery(o: CustomerOrder, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const haystacks = [
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.selected_payment_method_title,
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    for (const h of haystacks) {
        if (h.includes(needle)) return true;
    }
    return false;
}

/* =========================================================
 * Shell
 * ======================================================= */

export default function CustomerOrdersList() {
    const { token, isLoading: isAuthLoading } = useAuth();
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const {
        orders,
        isConnected,
        isRefreshing,
        lastSynced,
        refetch,
    } = useOrdersData(token);

    const [query, setQuery] = useState('');
    const [onlyUnpaid, setOnlyUnpaid] = useState(false);
    const [selected, setSelected] =
        useState<CustomerOrder | null>(null);

    const visible = useMemo(() => {
        const base = onlyUnpaid
            ? orders.filter((o) => !toBool(o.is_paid))
            : orders;

        return base.filter((o) => matchesQuery(o, query));
    }, [orders, onlyUnpaid, query]);

    const counts: CustomerOrdersCounts = useMemo(
        () => ({
            total: orders.length,
            visible: visible.length,
            unpaid: orders.filter((o) => !toBool(o.is_paid)).length,
        }),
        [orders, visible.length]
    );

    const totalValue = useMemo(
        () =>
            visible.reduce(
                (sum, o) => sum + orderAmount(o),
                0
            ),
        [visible]
    );

    const onRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

    const onView = useCallback((order: CustomerOrder) => {
        setSelected(order);
    }, []);

    const onQueryChange = useCallback((q: string) => {
        setQuery(q);
    }, []);

    const onToggleOnlyUnpaid = useCallback(() => {
        setOnlyUnpaid((v) => !v);
    }, []);

    const onCloseDetails = useCallback(() => {
        setSelected(null);
    }, []);

    if (isAuthLoading) {
        return (
            <View
                className="flex-1 justify-center items-center"
                style={{ backgroundColor: '#f8fafc' }}
            >
                <ActivityIndicator size="large" color="#007AFF" />
                <Text
                    className="mt-3"
                    style={{
                        color: '#64748b',
                        fontSize: 12,
                        fontWeight: '600',
                    }}
                >
                    Validating Session Registers...
                </Text>
            </View>
        );
    }

    const common: CustomerOrdersViewProps = {
        orders: visible,
        counts,
        query,
        onQueryChange,
        onlyUnpaid,
        onToggleOnlyUnpaid,
        refreshing: isRefreshing,
        onRefresh,
        isConnected,
        lastSynced,
        totalValue,
        onView,
    };

    return (
        <>
            {isLarge ? (
                <CustomerOrdersWebView {...common} />
            ) : (
                <CustomerOrdersMobileView {...common} />
            )}

            <InvoiceModal
                order={selected}
                onClose={onCloseDetails}
                onRefresh={onRefresh}
            />
        </>
    );
}