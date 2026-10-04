// components/wholesalers/productsRequests/WholesalerProductRequestsList.tsx
//
// Parent list — owns state, decides between mobile/web view.
// Wholesale inventory is sourced from WholesalerReceiptsSyncContext
// inside WholesaleInventoryPicker (via MakeOfferModal), so this
// container does not pass receipts down.

import React, {
    useCallback,
    useMemo,
    useState,
} from 'react';
import { useWindowDimensions } from 'react-native';

import wholesalersApi from '@/api/wholesalersApi';
import { useRetailerProductRequestsSync } from '@/context/RetailerProductRequestsSyncContext';

import type { RespondPayload } from './MakeOfferModal';
import { WholesalerProductRequestsMobileView } from './WholesalerProductRequestsMobileView';
import { WholesalerProductRequestsWebView } from './WholesalerProductRequestsWebView';

const LARGE_SCREEN_MIN_WIDTH = 900;

/* =========================================================
 * Logging
 * ======================================================= */

const LOG_TAG = '[WholesalerProductRequests]';

const log = (...args: any[]) => {
    if (__DEV__) console.log(LOG_TAG, ...args);
};
const warn = (...args: any[]) => {
    if (__DEV__) console.warn(LOG_TAG, ...args);
};
const error = (...args: any[]) => {
    if (__DEV__) console.error(LOG_TAG, ...args);
};

/* =========================================================
 * Component
 * ======================================================= */

const WholesalerProductRequestsList: React.FC = () => {
    const { width } = useWindowDimensions();
    const isLarge = width >= LARGE_SCREEN_MIN_WIDTH;

    const {
        requests,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        lastSyncedTime,
        dataSource,
        reconnectLiveSync,
    } = useRetailerProductRequestsSync();

    /* ---- filters ---- */
    const [entityQuery, setEntityQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    /* ---- submit state ---- */
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* ---- derived ---- */
    const entityOptions = useMemo(() => {
        const s = new Set<string>();
        requests.forEach(
            (r) => r.entity_title && s.add(r.entity_title)
        );
        return Array.from(s).sort((a, b) =>
            a.localeCompare(b)
        );
    }, [requests]);

    const statusCounts = useMemo(() => {
        const m: Record<string, number> = {
            ALL: requests.length,
        };
        requests.forEach((r) => {
            const k = String(r.status ?? '')
                .trim()
                .toUpperCase();
            m[k] = (m[k] ?? 0) + 1;
        });
        return m;
    }, [requests]);


    const filtered = useMemo(() => {
        const q = entityQuery.trim().toLowerCase();
        return requests.filter((r) => {
            if (
                statusFilter !== 'ALL' &&
                String(r.status ?? '')
                    .trim()
                    .toUpperCase() !== statusFilter
            )
                return false;
            if (
                q &&
                !(r.entity_title ?? '')
                    .toLowerCase()
                    .includes(q)
            )
                return false;
            return true;
        });
    }, [requests, entityQuery, statusFilter]);

    const hasActiveFilter =
        statusFilter !== 'ALL' || entityQuery.trim() !== '';

    /* ---- actions ---- */
    const onRefresh = useCallback(() => {
        log('manual refresh triggered');
        void reconnectLiveSync();
    }, [reconnectLiveSync]);

    const clearAllFilters = useCallback(() => {
        setEntityQuery('');
        setStatusFilter('ALL');
    }, []);

    /* ---- submit ---- */
    const submitResponse = useCallback(
        async (payload: RespondPayload) => {
            setIsSubmitting(true);

            log(
                '========== RESPOND — REQUEST =========='
            );
            log('payload:', payload);
            log(
                'accepted_lines:',
                payload.accepted_lines
            );
            log(
                'rejected_lines:',
                payload.rejected_lines
            );
            log('note:', payload.note);
            log('request_id:', payload.request_id);
            log(
                'accepted count:',
                payload.accepted_lines.length
            );
            log(
                'rejected count:',
                payload.rejected_lines.length
            );

            try {
                const started = Date.now();

                const res =
                    await wholesalersApi.wholesalerProductRequestsAction(
                        payload
                    );

                const elapsed = Date.now() - started;

                log(
                    '========== RESPOND — RESPONSE =========='
                );
                log('elapsed ms:', elapsed);
                log('raw response:', res);
                log('res?.ok:', res?.ok);
                log('res?.status:', (res as any)?.status);
                log('res?.data:', (res as any)?.data);
                log(
                    'res?.data?.response_code:',
                    (res as any)?.data?.response_code
                );
                log(
                    'res?.data?.response_message:',
                    (res as any)?.data?.response_message
                );
                log('res?.error:', (res as any)?.error);

                if (res && typeof res === 'object') {
                    log(
                        'response keys:',
                        Object.keys(res)
                    );
                    if ((res as any).data) {
                        log(
                            'data keys:',
                            Object.keys((res as any).data)
                        );
                    }
                }

                const ok =
                    res?.ok === true ||
                    res?.data?.response_code === 0;

                log('interpreted as ok:', ok);

                if (!ok) {
                    warn(
                        'wholesalerProductRequestsAction rejected',
                        res
                    );
                    throw new Error(
                        (res as any)?.data?.response_message ??
                        'Response rejected'
                    );
                }

                log(
                    '========== RESPOND — SUCCESS =========='
                );
                return res;
            } catch (e: any) {
                error(
                    '========== RESPOND — ERROR =========='
                );
                error('thrown:', e);
                error('message:', e?.message);
                error('name:', e?.name);
                error('stack:', e?.stack);
                if (e?.response) {
                    error(
                        'e.response.status:',
                        e.response.status
                    );
                    error(
                        'e.response.data:',
                        e.response.data
                    );
                    error(
                        'e.response.headers:',
                        e.response.headers
                    );
                }
                throw e;
            } finally {
                setIsSubmitting(false);
            }
        },
        []
    );

    /* ---- source label / tone ---- */
    const sourceTone: 'server' | 'cache' | 'none' =
        dataSource === 'server'
            ? 'server'
            : dataSource === 'cache'
                ? 'cache'
                : 'none';
    const sourceLabel =
        sourceTone === 'server'
            ? 'Server · Live'
            : sourceTone === 'cache'
                ? 'Cache'
                : 'Offline';

    /* ---- shared props ---- */
    const common = {
        entityQuery,
        setEntityQuery,
        statusFilter,
        setStatusFilter,
        hasActiveFilter,
        onClearFilters: clearAllFilters,
        isSyncing,
        isManualRefreshing,
        isLiveConnected,
        sourceLabel,
        sourceTone,
        lastSyncedTime,
        onRefresh,
        items: filtered,
        statusCounts,
        entityOptions,
        isSubmitting,
        onSubmitResponse: submitResponse,
    } as const;

    return isLarge ? (
        <WholesalerProductRequestsWebView {...common} />
    ) : (
        <WholesalerProductRequestsMobileView {...common} />
    );
};

export default WholesalerProductRequestsList;