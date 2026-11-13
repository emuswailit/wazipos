// components/admin/subscriptions/SubscriptionList.tsx

import subscriptionsApi from '@/api/subscriptionsApi';
import { SubscriptionNormalized } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";

import { SubscriptionDetailsModal } from './SubscriptionDetailsModal';
import { SubscriptionFormModal } from './SubscriptionFormModal';
import { SubscriptionMobileView } from './SubscriptionMobileView';
import { SubscriptionWebView, type SubscriptionCounts } from './SubscriptionWebView';
import type { PageSize } from '@/components/common/PaginationBar';

export default function SubscriptionList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const [query, setQuery] = useState('');
    const [onlyActive, setOnlyActive] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [subscriptions, setSubscriptions] = useState<SubscriptionNormalized[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [formOpen, setFormOpen] = useState(false);
    const [detailsTarget, setDetailsTarget] = useState<SubscriptionNormalized | null>(null);

    const [apiError, setApiError] = useState<{
        isOpen: boolean;
        title: string;
        envelope: any | null;
        fallbackMessage: string | null;
        onRetry?: () => void;
    }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    const fetchApi = useApi(subscriptionsApi.getEntitySubscriptionAction);
    const fetchApiRef = React.useRef(fetchApi);
    fetchApiRef.current = fetchApi;

    const loadData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const res = await fetchApiRef.current.request({
                action: "GetEntitySubscriptions",
                page: page,
                page_size: pageSize,
            });

            if (res.status === 400 || res.status === 500) {
                const env = extractEnvelope(res);
                setApiError({
                    isOpen: true,
                    title: "Failed to load subscriptions",
                    envelope: env,
                    fallbackMessage: null,
                    onRetry: () => loadData(),
                });
                return;
            }

            if (res.ok && res.data) {
                const envelopeData = res.data?.subscriptions;

                // 🌟 BULLETPROOF EXTRACTION
                let rawList: any[] = [];
                let backendTotal = 0;

                if (Array.isArray(envelopeData)) {
                    // If it's the old flat array format
                    rawList = envelopeData;
                    backendTotal = envelopeData.length;
                } else if (envelopeData && Array.isArray(envelopeData.results)) {
                    // If it's the new paginated format
                    rawList = envelopeData.results;
                    backendTotal = envelopeData.count || rawList.length;
                }

                setTotalCount(backendTotal);

                const normalized: SubscriptionNormalized[] = rawList.map((sub: any) => {
                    const endDate = new Date(sub.end_date);
                    const now = new Date();
                    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                    const isActive = String(sub.is_active).toUpperCase() === "TRUE" && daysRemaining > 0;

                    return {
                        id: sub.id,
                        owner: sub.owner,
                        entity: sub.entity,
                        entity_title: sub.entity_title,
                        months: sub.months,
                        startDate: sub.start_date,
                        endDate: sub.end_date,
                        type: sub.type,
                        isActive: isActive,
                        created: sub.created,
                        updated: sub.updated,
                    };
                });
                setSubscriptions(normalized);
            }
        } catch (err: any) {
            setApiError({
                isOpen: true,
                title: "Connection Error",
                envelope: null,
                fallbackMessage: err?.message || "Could not reach the server.",
                onRetry: () => loadData(),
            });
        } finally {
            setIsRefreshing(false);
        }
    }, [page, pageSize]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filtered = useMemo(() => {
        let base = onlyActive ? subscriptions.filter((s) => s.isActive) : subscriptions;
        const q = query.trim().toLowerCase();
        if (!q) return base;

        // 🟢 FIX: Search by entity_title OR type
        return base.filter((s) =>
            String(s.type || '').toLowerCase().includes(q) ||
            String(s.entity_title || '').toLowerCase().includes(q)
        );
    }, [subscriptions, onlyActive, query]);

    const counts: SubscriptionCounts = useMemo(() => ({
        total: totalCount,
        active: subscriptions.filter((s) => s.isActive).length,
        expired: subscriptions.filter((s) => !s.isActive).length,
    }), [subscriptions, totalCount]);

    const totalItems = totalCount;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    const pageStart = (page - 1) * pageSize + 1;
    const pageEnd = Math.min(page * pageSize, totalItems);

    const sharedProps = {
        query, setQuery, onlyActive, setOnlyActive,
        onOpenCreate: () => setFormOpen(true),
        onRefresh: loadData, refreshing: isRefreshing,
        counts, items: filtered,
        onPressItem: (sub: SubscriptionNormalized) => setDetailsTarget(sub),
        page, pageSize, totalItems, totalPages, pageStart, pageEnd,
        onPrev: () => setPage(p => Math.max(1, p - 1)),
        onNext: () => setPage(p => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => { setPageSize(size); setPage(1); },
    };

    return (
        <>
            {isLarge ? (
                <SubscriptionWebView {...sharedProps} />
            ) : (
                <SubscriptionMobileView {...sharedProps} />
            )}

            <SubscriptionFormModal
                visible={formOpen}
                onClose={() => setFormOpen(false)}
                onSuccess={() => { setFormOpen(false); loadData(); }}
            />

            <SubscriptionDetailsModal
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
            />

            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                onRetry={apiError.onRetry ? () => {
                    setApiError((prev) => ({ ...prev, isOpen: false }));
                    apiError.onRetry?.();
                } : undefined}
            />
        </>
    );
}