// context/SubscriptionSyncContext.tsx

import subscriptionsApi from "@/api/subscriptionsApi";
import { SubscriptionErrorModal } from "@/components/common/SubscriptionErrorModal";
import { useAuth } from "@/context/AuthContext";
import { SubscriptionNormalized } from "@/databases/types";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** Totals across every active subscription of the entity (stacked renewals included). */
interface SubscriptionSummary {
    activeCount: number;
    totalDaysRemaining: number;
    /** ISO date the last active subscription ends, or null when none is active. */
    activeUntil: string | null;
}

const EMPTY_SUMMARY: SubscriptionSummary = { activeCount: 0, totalDaysRemaining: 0, activeUntil: null };

function normalizeSummary(raw: any): SubscriptionSummary | null {
    if (!raw || typeof raw !== "object") return null;
    return {
        activeCount: Number(raw.active_count) || 0,
        totalDaysRemaining: Number(raw.total_days_remaining) || 0,
        activeUntil: raw.active_until || null,
    };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Same totals the server computes (subscriptions/summary.py), worked out from a list of
 * raw subscriptions. Used when the server doesn't send a summary yet (older backend).
 */
function computeSummaryFromList(list: any[], entityId?: string | null): SubscriptionSummary {
    const now = Date.now();
    let remainingMs = 0;
    let activeCount = 0;
    let latestEnd = 0;

    for (const sub of list) {
        if (entityId && sub?.entity && String(sub.entity) !== String(entityId)) continue; // admins get every entity
        if (String(sub?.is_active).toUpperCase() !== "TRUE") continue;
        const end = new Date(sub.end_date).getTime();
        if (!end || end <= now) continue;
        const start = new Date(sub.start_date).getTime() || now;

        activeCount += 1;
        remainingMs += end - Math.max(start, now);
        latestEnd = Math.max(latestEnd, end);
    }

    return {
        activeCount,
        totalDaysRemaining: Math.max(0, Math.ceil(remainingMs / MS_PER_DAY)),
        activeUntil: latestEnd ? new Date(latestEnd).toISOString() : null,
    };
}

interface SubscriptionContextType {
    hasActiveSubscription: boolean;
    latestSubscription: SubscriptionNormalized | null;
    summary: SubscriptionSummary;
    isSyncing: boolean;
    forceRefresh: () => Promise<void>;
    handleSubscriptionError: (errors: string[]) => boolean;
}

const SubscriptionSyncContext = createContext<SubscriptionContextType | undefined>(undefined);

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes fallback
const WS_URL = "wss://api.wazipos.co.ke/ws/subscriptions/status/";

export function SubscriptionSyncProvider({ children }: { children: React.ReactNode }) {
    const { token, user } = useAuth();
    const [latestSubscription, setLatestSubscription] = useState<SubscriptionNormalized | null>(null);
    // null = server didn't send a summary (older backend); derived from latestSubscription instead
    const [serverSummary, setServerSummary] = useState<SubscriptionSummary | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // WebSocket Refs
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);

    const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

    // Global Error Handler for API interceptors
    const handleSubscriptionError = useCallback((errors: string[]) => {
        if (!errors || !Array.isArray(errors)) return false;
        const subError = errors.find(e => e.toLowerCase().includes("no active subscription"));
        if (subError) {
            setSubscriptionError(subError);
            return true;
        }
        return false;
    }, []);

    // Data Formatter
    const processSubscriptions = useCallback((rawList: any) => {
        let list = rawList;
        if (list && typeof list === 'object' && Array.isArray(list.results)) {
            list = list.results;
        }

        if (!Array.isArray(list) || list.length === 0) {
            setLatestSubscription(null);
            return;
        }

        const rawSub = list[0];
        if (!rawSub) {
            setLatestSubscription(null);
            return;
        }

        const endDateRaw = rawSub.end_date || rawSub.endDate;
        const endDate = endDateRaw ? new Date(endDateRaw) : new Date();
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
        const isBackendActive = String(rawSub.is_active).toUpperCase() === "TRUE";

        setLatestSubscription({
            id: rawSub.id,
            owner: rawSub.owner,
            entity: rawSub.entity,
            entity_title: rawSub.entity_title,
            months: rawSub.months || 1,
            startDate: rawSub.start_date || rawSub.startDate || "",
            endDate: rawSub.end_date || rawSub.endDate || "",
            type: rawSub.type || "TRIAL",
            isActive: isBackendActive && daysRemaining > 0,
            created: rawSub.created || "",
            updated: rawSub.updated || "",
        });
    }, []);

    // HTTP Fallback (Also used by `forceRefresh`)
    const fetchSubscriptions = useCallback(async () => {
        if (!user || !token) return;
        setIsSyncing(true);
        try {
            const res = await subscriptionsApi.getEntitySubscriptionAction({
                action: "GetEntitySubscriptions",
                // Enough rows to total every active (stacked) subscription if the server
                // doesn't send a summary itself.
                page_size: 50,
            });

            if (res.ok && res.data) {
                if (res.data.errors) {
                    handleSubscriptionError(res.data.errors);
                }
                const rawData = res.data?.subscriptions;
                processSubscriptions(rawData);

                const rows = Array.isArray(rawData) ? rawData : Array.isArray(rawData?.results) ? rawData.results : [];
                setServerSummary(
                    normalizeSummary(rawData?.summary) ??
                    computeSummaryFromList(rows, user?.entity_id || user?.entity)
                );
            }
        } catch (e) {
            console.error("[SubscriptionSync] Failed to fetch subscriptions", e);
        } finally {
            setIsSyncing(false);
        }
    }, [user, token, handleSubscriptionError, processSubscriptions]);

    // Lets the WebSocket handler call the latest fetch without reconnecting when it changes
    const fetchSubscriptionsRef = useRef(fetchSubscriptions);
    fetchSubscriptionsRef.current = fetchSubscriptions;

    // Initial Fetch & Polling Fallback
    useEffect(() => {
        if (!user || !token) return;
        fetchSubscriptions();
        const interval = setInterval(fetchSubscriptions, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [user, token, fetchSubscriptions]);

    // WebSocket Connection & Reconnection Logic
    useEffect(() => {
        if (!user || !token) return;

        isMountedRef.current = true;
        let isIntentionalClose = false;

        const connectWebSocket = () => {
            // Clear any pending reconnects
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            // If we already have an open connection, don't open a new one
            if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                return;
            }

            console.log("[SubscriptionSync] Connecting to WebSocket...");
            const ws = new WebSocket(`${WS_URL}?token=${token}`);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[SubscriptionSync] WebSocket Connected ✅");
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.subscriptions) {
                        processSubscriptions(data.subscriptions);
                        const wsSummary = normalizeSummary(data.summary);
                        if (wsSummary) {
                            setServerSummary(wsSummary);
                        } else {
                            // Older server: the socket only carries the newest subscription,
                            // so re-total from the full list over HTTP.
                            fetchSubscriptionsRef.current();
                        }
                    }
                } catch (err) {
                    console.error("[SubscriptionSync] WS Parse error", err);
                }
            };

            ws.onerror = (error: any) => {
                // Note: The event object here (e.g., { isTrusted: true }) is generic. 
                // The actual reason (e.g., CORS, server down) is usually in the browser's network tab.
                console.warn("[SubscriptionSync] WebSocket connection error. Check backend status or CORS settings.");
            };

            ws.onclose = () => {
                console.log("[SubscriptionSync] WebSocket Disconnected ❌");

                // Auto-reconnect if the component is still mounted, user is logged in, and close wasn't intentional
                if (isMountedRef.current && user && !isIntentionalClose) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (isMountedRef.current) connectWebSocket();
                    }, 5000);
                }
            };
        };

        connectWebSocket();

        // Cleanup
        return () => {
            isMountedRef.current = false;
            isIntentionalClose = true;

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, token, processSubscriptions]);

    const summary = useMemo<SubscriptionSummary>(() => {
        if (serverSummary) return serverSummary;
        // Fallback for servers that don't send a summary yet: use the newest subscription only.
        if (!latestSubscription?.isActive || !latestSubscription.endDate) return EMPTY_SUMMARY;
        const msLeft = new Date(latestSubscription.endDate).getTime() - Date.now();
        return {
            activeCount: 1,
            totalDaysRemaining: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))),
            activeUntil: latestSubscription.endDate,
        };
    }, [serverSummary, latestSubscription]);

    const value = useMemo(() => ({
        hasActiveSubscription: summary.activeCount > 0 || (latestSubscription?.isActive ?? false),
        latestSubscription,
        summary,
        isSyncing,
        forceRefresh: fetchSubscriptions,
        handleSubscriptionError,
    }), [latestSubscription, summary, isSyncing, fetchSubscriptions, handleSubscriptionError]);

    return (
        <SubscriptionSyncContext.Provider value={value}>
            {/* The subscription banner is rendered by the app shell (app/_layout.tsx),
                inside the safe area, not here above everything. */}
            {children}

            {/* Global Error Modal */}
            <SubscriptionErrorModal
                visible={!!subscriptionError}
                message={subscriptionError}
                onClose={() => setSubscriptionError(null)}
            />
        </SubscriptionSyncContext.Provider>
    );
};

export const useSubscriptionSync = () => {
    const context = useContext(SubscriptionSyncContext);
    if (!context) throw new Error("useSubscriptionSync must be used within a SubscriptionSyncProvider");
    return context;
};