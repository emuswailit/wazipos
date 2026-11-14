import subscriptionsApi from '@/api/subscriptionsApi';
import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";
import { SubscriptionPaymentNormalized } from '@/databases/types';
import { useApi } from '@/hooks/useApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { SubscriptionPaymentsDetailsModal } from './SubscriptionPaymentsDetailsModal';
import { SubscriptionPaymentsMobileView } from './SubscriptionPaymentsMobileView';
import { SubscriptionPaymentsWebView } from './SubscriptionPaymentsWebView';

import type { PageSize } from '@/components/common/PaginationBar';

export default function SubscriptionPaymentsList() {
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const [payments, setPayments] = useState<SubscriptionPaymentNormalized[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [detailsTarget, setDetailsTarget] = useState<SubscriptionPaymentNormalized | null>(null);

    const [apiError, setApiError] = useState<{ isOpen: boolean; title: string; envelope: any | null; fallbackMessage: string | null; onRetry?: () => void; }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    const fetchApi = useApi(subscriptionsApi.getEntitySubscriptionPaymentsAction);
    const fetchApiRef = React.useRef(fetchApi);
    fetchApiRef.current = fetchApi;

    const loadData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const res = await fetchApiRef.current.request({
                action: "GetEntitySubscriptionPayments",
                page: page,
                page_size: pageSize,
            });

            if (res.status === 400 || res.status === 500) {
                setApiError({ isOpen: true, title: "Failed to load payments", envelope: extractEnvelope(res), fallbackMessage: null, onRetry: () => loadData() });
                return;
            }

            if (res.ok && res.data) {
                const envelopeData = res.data?.payments;

                let rawList: any[] = [];
                let backendTotal = 0;

                if (Array.isArray(envelopeData)) {
                    rawList = envelopeData;
                    backendTotal = envelopeData.length;
                } else if (envelopeData && Array.isArray(envelopeData.results)) {
                    rawList = envelopeData.results;
                    backendTotal = envelopeData.count || rawList.length;
                }

                setTotalCount(backendTotal);

                const normalized: SubscriptionPaymentNormalized[] = rawList.map((p: any) => ({
                    id: p.id,
                    entity: p.entity,
                    entity_title: p.entity_title,
                    reference_number: p.reference_number,
                    psp_reference_number: p.psp_reference_number,
                    provider_reference_number: p.provider_reference_number,
                    description: p.description,
                    amount: Number(p.amount) || 0,
                    status: p.status as any,
                    created: p.created,
                    updated: p.updated,
                }));

                setPayments(normalized);
            }
        } catch (err: any) {
            setApiError({ isOpen: true, title: "Connection Error", envelope: null, fallbackMessage: err?.message || "Could not reach the server.", onRetry: () => loadData() });
        } finally {
            setIsRefreshing(false);
        }
    }, [page, pageSize]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return payments;
        return payments.filter((p) =>
            String(p.reference_number || '').toLowerCase().includes(q) ||
            String(p.psp_reference_number || '').toLowerCase().includes(q) ||
            String(p.status || '').toLowerCase().includes(q)
        );
    }, [payments, query]);

    const totalItems = totalCount;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    const pageStart = (page - 1) * pageSize + 1;
    const pageEnd = Math.min(page * pageSize, totalItems);

    const sharedProps = {
        query, setQuery,
        onRefresh: loadData, refreshing: isRefreshing,
        items: filtered,
        onPressItem: (p: SubscriptionPaymentNormalized) => setDetailsTarget(p),
        page, pageSize, totalItems, totalPages, pageStart, pageEnd,
        onPrev: () => setPage(p => Math.max(1, p - 1)),
        onNext: () => setPage(p => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => { setPageSize(size); setPage(1); },
    };

    return (
        <>
            {isLarge ? <SubscriptionPaymentsWebView {...sharedProps} /> : <SubscriptionPaymentsMobileView {...sharedProps} />}

            <SubscriptionPaymentsDetailsModal item={detailsTarget} onClose={() => setDetailsTarget(null)} />

            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                onRetry={apiError.onRetry ? () => { setApiError((prev) => ({ ...prev, isOpen: false })); apiError.onRetry?.(); } : undefined}
            />
        </>
    );
}