// components/retailers/retailerPrescriptions/RetailerPrescriptionsList.tsx

import retailerPrescriptionsApi from '@/api/retailerPrescriptionsApi';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { LiveAlertBanner, type LiveAlert } from '@/components/common/LiveAlertBanner';
import { usePrescriptionEvents } from '@/hooks/usePrescriptionEvents';

import { DigitizePrescriptionModal } from './DigitizePrescriptionModal';
import { RetailerPrescriptionDetailsModal } from './RetailerPrescriptionDetailsModal';
import { RetailerPrescriptionsMobileView } from './RetailerPrescriptionsMobileView';
import { RetailerPrescriptionsWebView } from './RetailerPrescriptionsWebView';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface PrescriptionCounts {
    total: number;
    queuing: number;
    needsVerification: number;
}

export interface PrescriptionNormalized {
    id: number;
    patient_name: string;
    status: string;
    /** The pharmacy handling it; null until the owner sends it to one. */
    entity?: string | null;
    nature?: string | null;
    patient_gender: string;
    patient_date_of_birth: string;
    created: string;
    ai_extraction_status: string;
    prescription_items?: any[];
    items?: any[];
    images?: any[];
}

export default function RetailerPrescriptionsList() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    // --- State ---
    const [prescriptions, setPrescriptions] = useState<PrescriptionNormalized[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [query, setQuery] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    // Modal States
    const [detailsTarget, setDetailsTarget] = useState<PrescriptionNormalized | null>(null);
    const [digitizeTarget, setDigitizeTarget] = useState<PrescriptionNormalized | null>(null);

    // --- Fetch Data ---
    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        try {
            const res = await retailerPrescriptionsApi.retrieveEntityRetailPrescriptionsAction({
                action: "RetrieveEntityRetailPrescriptions",
                page: 1,
                page_size: 100,
            });

            if (res.ok && res.data) {
                const results = res.data.results || res.data || [];
                setPrescriptions(Array.isArray(results) ? results : []);
            }
        } catch (error) {
            console.error("Failed to fetch prescriptions", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = useCallback(() => fetchData(true), [fetchData]);

    /** Swap in a freshly fetched prescription (after an item is saved/removed) everywhere it is shown. */
    const upsertPrescription = useCallback((fresh: PrescriptionNormalized) => {
        if (!fresh?.id) return;
        const same = (p: PrescriptionNormalized | null) => !!p && String(p.id) === String(fresh.id);
        setPrescriptions((list) => {
            const i = list.findIndex((p) => String(p.id) === String(fresh.id));
            if (i < 0) return [fresh, ...list];
            const next = list.slice();
            next[i] = { ...list[i], ...fresh };
            return next;
        });
        setDetailsTarget((p) => (same(p) ? { ...p!, ...fresh } : p));
        setDigitizeTarget((p) => (same(p) ? { ...p!, ...fresh } : p));
    }, []);

    // --- Live events: quotation requests sent to this pharmacy, or updates by a colleague ---
    const [liveAlert, setLiveAlert] = useState<LiveAlert | null>(null);
    const dismissAlert = useCallback(() => setLiveAlert(null), []);
    usePrescriptionEvents(({ event, prescription }) => {
        upsertPrescription(prescription);
        if (event === 'prescription.quotation_requested') {
            const n = (prescription.prescription_items || prescription.items || []).length;
            setLiveAlert({
                id: `req-${prescription.id}`,
                title: 'Quotation requested',
                message: `${prescription.patient_name || 'A customer'} · ${n} medicine${n === 1 ? '' : 's'} to price from your stock.`,
                icon: 'mail-unread-outline',
                color: '#6366f1',
                onPress: () => setDetailsTarget(prescription),
            });
        }
    });

    // --- Deep link: /…Prescriptions?prescription=<id> opens that prescription's details ---
    const { prescription: linkedIdParam } = useLocalSearchParams<{ prescription?: string }>();
    const linkedId = Array.isArray(linkedIdParam) ? linkedIdParam[0] : linkedIdParam;
    const handledLinkRef = useRef<string | null>(null);

    useEffect(() => {
        if (!linkedId || loading || handledLinkRef.current === linkedId) return;
        handledLinkRef.current = linkedId;
        // Drop the param so closing the modal (or refreshing) doesn't reopen it
        router.setParams({ prescription: undefined } as any);

        const inList = prescriptions.find(p => String(p.id) === String(linkedId));
        if (inList) {
            setDetailsTarget(inList);
            return;
        }
        // Not in the loaded page (older, or another list) — fetch it directly
        let cancelled = false;
        retailerPrescriptionsApi
            .getRetailPrescriptionDetailsAction({ action: "GetRetailPrescriptionDetails", prescription_id: String(linkedId) })
            .then((res) => {
                const found = res.ok ? ((res.data as any)?.prescription ?? null) : null;
                if (!cancelled && found) setDetailsTarget(found);
            })
            .catch((e) => console.error("Failed to load linked prescription", e));
        return () => { cancelled = true; };
    }, [linkedId, loading, prescriptions, router]);

    // --- Filtering & Pagination ---
    const filtered = useMemo(() => {
        let base = prescriptions;
        if (onlyPending) base = base.filter(i => i.status === "QUEUING");
        const q = query.trim().toLowerCase();
        if (!q) return base;
        return base.filter(i => String(i.patient_name || '').toLowerCase().includes(q));
    }, [prescriptions, onlyPending, query]);

    const counts: PrescriptionCounts = useMemo(() => ({
        total: prescriptions.length,
        queuing: prescriptions.filter(i => i.status === "QUEUING").length,
        needsVerification: prescriptions.filter(i =>
            i.ai_extraction_status === "COMPLETED" &&
            (i.prescription_items || i.items || [])?.some((item: any) => item.is_verified === "false")
        ).length,
    }), [prescriptions]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, onlyPending, pageSize]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    // --- Handlers ---
    // Android/iOS drop a Modal presented while another is still animating out, so
    // when coming from the details sheet, open the workspace once it has closed.
    const digitizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (digitizeTimer.current) clearTimeout(digitizeTimer.current);
    }, []);
    const handleDigitize = (item: PrescriptionNormalized) => {
        const fromSheet = !!detailsTarget;
        setDetailsTarget(null);
        if (digitizeTimer.current) clearTimeout(digitizeTimer.current);
        if (fromSheet && Platform.OS !== 'web') {
            digitizeTimer.current = setTimeout(() => setDigitizeTarget(item), 350);
        } else {
            setDigitizeTarget(item);
        }
    };

    // --- Shared Props ---
    const sharedProps = {
        query,
        setQuery,
        onlyPending,
        setOnlyPending,
        onRefresh: handleRefresh,
        onDigitize: handleDigitize,
        refreshing,
        counts,
        items: paginated,
        allItems: filtered,
        onPressItem: (item: PrescriptionNormalized) => setDetailsTarget(item),
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: () => setPage(p => Math.max(1, p - 1)),
        onNext: () => setPage(p => Math.min(totalPages, p + 1)),
        onPageSizeChange: (size: PageSize) => { setPageSize(size); setPage(1); },
        loading,
    };

    return (
        <>
            <LiveAlertBanner alert={liveAlert} onDismiss={dismissAlert} />
            {isLarge ? (
                <RetailerPrescriptionsWebView {...sharedProps} />
            ) : (
                <RetailerPrescriptionsMobileView {...sharedProps} />
            )}

            {/* Details Modal */}
            <RetailerPrescriptionDetailsModal
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
                onDigitize={handleDigitize}
            />

            {/* Digitize Modal */}
            <DigitizePrescriptionModal
                visible={!!digitizeTarget}
                prescription={digitizeTarget}
                onPrescriptionUpdated={upsertPrescription}
                onClose={() => {
                    setDigitizeTarget(null);
                    fetchData(); // Refresh the list to show the newly added items
                }}
            />
        </>
    );
}