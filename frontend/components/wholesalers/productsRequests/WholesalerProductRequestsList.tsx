// components/wholesalers/productsRequests/WholesalerProductRequestsList.tsx
//
// Parent list — owns state, decides between mobile/web view.
//
// Submit handling extracts a human-readable message from every
// shape the server might return:
//   { response_message: "…" }
//   { message: "…" }
//   { detail: "…" }
//   { errors: ["Please log in"] }
//   { errors: { field: ["msg"] } }
//   { error: "…" }
// and shows it in a cross-platform alert on both success and
// failure. Success alerts only fire when the server provided a
// meaningful message; the fallback is a generic success line.

import React, {
    useCallback,
    useMemo,
    useState,
} from 'react';
import { Alert, Platform, useWindowDimensions } from 'react-native';

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
const errorLog = (...args: any[]) => {
    if (__DEV__) console.error(LOG_TAG, ...args);
};

/* =========================================================
 * Cross-platform alert
 * ======================================================= */

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

/* =========================================================
 * Response helpers
 * ======================================================= */

function isResponseOk(res: any): boolean {
    if (!res) return false;
    if (res.ok === true) return true;
    if (String(res?.data?.response_code ?? '') === '0') return true;
    if (res?.data?.response_code === 0) return true;
    return false;
}

/**
 * Pull a human-readable message out of any response shape the
 * server might send. Returns an empty string when nothing
 * useful is present so callers can supply their own fallback.
 *
 * Recognised shapes:
 *   { response_message: "…" }
 *   { message: "…" }
 *   { detail: "…" }
 *   { error: "…" }
 *   { errors: ["Please log in"] }
 *   { errors: { field: ["msg"] } }
 *   { data: { …same shapes… } }
 */
function extractServerMessage(res: any): string {
    if (!res) return '';

    // Try both the raw response and its `.data` envelope.
    const bodies = [
        res,
        res?.data,
        res?.data?.data,
    ].filter(Boolean);

    for (const body of bodies) {
        if (typeof body === 'string') return body;
        if (typeof body !== 'object') continue;

        // Preferred single-string fields.
        const flat =
            body.response_message ??
            body.message ??
            body.detail ??
            body.error;
        if (typeof flat === 'string' && flat.trim()) {
            return flat.trim();
        }

        // DRF validation array: { errors: ["…"] }
        if (Array.isArray(body.errors) && body.errors.length > 0) {
            const first = body.errors[0];
            if (typeof first === 'string' && first.trim()) {
                return first.trim();
            }
            if (first && typeof first === 'object') {
                return JSON.stringify(first);
            }
        }

        // DRF validation object: { errors: { field: ["msg"] } }
        if (body.errors && typeof body.errors === 'object') {
            const firstKey = Object.keys(body.errors)[0];
            if (firstKey) {
                const firstVal = body.errors[firstKey];
                const firstMsg = Array.isArray(firstVal)
                    ? firstVal[0]
                    : firstVal;
                if (
                    typeof firstMsg === 'string' &&
                    firstMsg.trim()
                ) {
                    return firstMsg.trim();
                }
            }
        }

        // Nested non_field_errors (DRF serializer)
        if (
            Array.isArray(body.non_field_errors) &&
            body.non_field_errors.length > 0
        ) {
            const first = body.non_field_errors[0];
            if (typeof first === 'string' && first.trim()) {
                return first.trim();
            }
        }
    }

    return '';
}

/**
 * Extract a message from a thrown error. Handles Axios errors,
 * plain Errors, and thrown strings.
 */
function extractThrownMessage(err: any): string {
    if (!err) return '';

    // Axios timeout
    if (err.code === 'ECONNABORTED') {
        return 'Request timed out. Check your connection and try again.';
    }

    // Abort
    if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return 'Request was cancelled.';
    }

    // Prefer the server body if present
    const fromBody = extractServerMessage(err?.response);
    if (fromBody) return fromBody;

    // Axios network failure
    if (
        err?.message === 'Network Error' ||
        err?.code === 'ERR_NETWORK'
    ) {
        return 'Could not reach the server. Check your connection.';
    }

    if (typeof err === 'string') return err;
    if (err?.message) return String(err.message);

    return '';
}

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

    /* ---------------------------------------------------------
     * Submit — POST Respond, alert on both paths.
     * ------------------------------------------------------- */
    const submitResponse = useCallback(
        async (payload: RespondPayload) => {
            setIsSubmitting(true);

            log('========== RESPOND — REQUEST ==========');
            log('payload:', payload);
            log(
                'accepted count:',
                payload.accepted_lines.length
            );
            log(
                'rejected count:',
                payload.rejected_lines.length
            );
            log('request_id:', payload.request_id);

            try {
                const started = Date.now();

                const res =
                    await wholesalersApi.wholesalerProductRequestsAction(
                        payload
                    );

                const elapsed = Date.now() - started;

                log('========== RESPOND — RESPONSE ==========');
                log('elapsed ms:', elapsed);
                log('raw response:', res);
                log('interpreted as ok:', isResponseOk(res));

                if (!isResponseOk(res)) {
                    // Build the failure message from the response
                    // body — response_message, message, detail,
                    // errors[], errors{} — or fall back to a
                    // generic string.
                    const serverMessage =
                        extractServerMessage(res);
                    const failureMessage =
                        serverMessage ||
                        `Server rejected the response (code=${(res as any)?.data?.response_code ??
                        'unknown'
                        }).`;

                    warn(
                        'wholesalerProductRequestsAction rejected',
                        { res, extracted: serverMessage }
                    );

                    notify('Response rejected', failureMessage);

                    // Swallow the error here — we've already
                    // shown the alert, and rethrowing would
                    // leave the modal's onSubmit unhandled.
                    return;
                }

                // -------- Success --------
                const serverMessage =
                    extractServerMessage(res);
                const acceptedCount =
                    payload.accepted_lines.length;
                const rejectedCount =
                    payload.rejected_lines.length;

                const successMessage =
                    serverMessage ||
                    `Response sent. ${acceptedCount} line${acceptedCount === 1 ? '' : 's'
                    } accepted, ${rejectedCount} rejected.`;

                log('========== RESPOND — SUCCESS ==========');
                log('message:', successMessage);

                notify('Response sent', successMessage);
            } catch (e: any) {
                errorLog('========== RESPOND — ERROR ==========');
                errorLog('thrown:', e);
                errorLog('message:', e?.message);
                if (e?.response) {
                    errorLog(
                        'e.response.status:',
                        e.response.status
                    );
                    errorLog(
                        'e.response.data:',
                        e.response.data
                    );
                }

                const thrownMessage = extractThrownMessage(e);
                const failureMessage =
                    thrownMessage ||
                    'Could not submit the response. Please try again.';

                notify('Could not submit response', failureMessage);
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