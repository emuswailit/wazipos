// components/shopping/prescriptions/UserPrescriptionsList.tsx

import retailerPrescriptionsApi from '@/api/retailerPrescriptionsApi';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { LiveAlertBanner, type LiveAlert } from '@/components/common/LiveAlertBanner';
import { usePrescriptionEvents } from '@/hooks/usePrescriptionEvents';

import { CreatePrescriptionModal } from './CreatePrescriptionModal';
import { UserPrescriptionDetailsModal } from './UserPrescriptionDetailsModal';
import { UserPrescriptionsMobileView } from './UserPrescriptionsMobileView';
import { UserPrescriptionsWebView } from './UserPrescriptionsWebView';

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
    nature?: string | null;
    patient_gender: string;
    patient_date_of_birth: string;
    created: string;
    ai_extraction_status: string;
    prescription_items?: any[];
    images?: any[];
}

export default function UserPrescriptionsList() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isLarge = width >= 900;

    // This screen only ever shows the logged-in user's OWN prescriptions.
    // Prescriptions sent to a pharmacy live at /entityPrescriptions.

    // --- State ---
    const [prescriptions, setPrescriptions] = useState<PrescriptionNormalized[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [query, setQuery] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);




    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
    const [detailsTarget, setDetailsTarget] = useState<PrescriptionNormalized | null>(null);

    // --- Fetch Data ---
    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        try {
            const res = await retailerPrescriptionsApi.retrieveUserRetailPrescriptionsAction({
                action: "RetrieveUserRetailPrescriptions",
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

    /** Swap a fresh prescription into the list (and the open details sheet). */
    const upsertPrescription = useCallback((fresh: any) => {
        if (!fresh?.id) return;
        const normalized = { ...fresh, prescription_items: fresh.prescription_items || fresh.items || [] };
        setPrescriptions((list) => {
            const i = list.findIndex((p) => String(p.id) === String(fresh.id));
            if (i < 0) return [normalized, ...list];
            const next = list.slice();
            next[i] = { ...list[i], ...normalized };
            return next;
        });
        setDetailsTarget((p) => (p && String(p.id) === String(fresh.id) ? { ...p, ...normalized } : p));
    }, []);

    // --- Live: "your prescription is digitized" from the pharmacy ---
    const [liveAlert, setLiveAlert] = useState<LiveAlert | null>(null);
    const dismissAlert = useCallback(() => setLiveAlert(null), []);
    // Pharmacy staff also receive their pharmacy's events on this socket, so
    // only react to prescriptions that are already in this (own) list.
    const ownIdsRef = useRef<Set<string>>(new Set());
    ownIdsRef.current = new Set(prescriptions.map((p) => String(p.id)));
    usePrescriptionEvents(({ event, prescription }) => {
        if (!prescription?.id || !ownIdsRef.current.has(String(prescription.id))) return;
        upsertPrescription(prescription);
        const open = () => setDetailsTarget({ ...prescription, prescription_items: prescription.prescription_items || prescription.items || [] });
        if (event === 'prescription.digitized') {
            setLiveAlert({
                id: `dig-${prescription.id}`,
                title: 'Prescription digitized',
                message: `${prescription.digitized_by_entity_title || 'WaziPOS'} has read your prescription.${prescription.entity_title ? ` ${prescription.entity_title} will send its quotation.` : ' Send it to a pharmacy to get prices.'}`,
                icon: 'checkmark-done-circle',
                color: '#10b981',
                onPress: open,
            });
        } else if (event === 'prescription.dispensed') {
            setLiveAlert({
                id: `disp-${prescription.id}`,
                title: 'Prescription fully dispensed',
                message: `You’ve bought every medicine on this prescription.${prescription.has_long_term_items ? ' It has long-term medicine: check whether you have a follow-up appointment with your prescriber.' : ''}`,
                icon: 'bag-check',
                color: '#10b981',
                onPress: open,
            });
        } else if (event === 'prescription.quoted') {
            const latest = [...(prescription.quotations || [])]
                .filter((q: any) => q.quoted_at)
                .sort((a: any, b: any) => String(b.quoted_at).localeCompare(String(a.quoted_at)))[0];
            setLiveAlert({
                id: `quote-${prescription.id}-${latest?.id ?? ''}`,
                title: 'New quotation',
                message: latest
                    ? `${latest.entity_title} quoted ${latest.lines?.length ?? 0} medicine${latest.lines?.length === 1 ? '' : 's'} for KES ${Number(latest.order?.total || 0).toLocaleString()}${latest.pickup_required
                        ? '. Collect in person at the pharmacy'
                        : latest.delivery_available
                            ? '. Choose delivery or collection when you pay'
                            : ''}. Pay by mobile money. Tap to view.`
                    : 'A pharmacy sent a quotation. Tap to view.',
                icon: 'pricetags',
                color: '#6366f1',
                onPress: open,
            });
        }
    });

    /** Re-read one prescription (after paying or forwarding) and swap it in. */
    const refreshOne = useCallback(
        async (id: string | number | undefined) => {
            if (!id) return;
            try {
                const res = await retailerPrescriptionsApi.getRetailPrescriptionDetailsAction({ action: 'GetRetailPrescriptionDetails', prescription_id: String(id) });
                if (res.ok && res.data?.response_code === 0 && res.data?.prescription) upsertPrescription(res.data.prescription);
            } catch {
                /* the list refresh below still runs */
            }
            void fetchData();
        },
        [upsertPrescription, fetchData]
    );

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
            i.prescription_items?.some((item: any) => item.is_verified === "false")
        ).length,
    }), [prescriptions]);

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => { setPage(1); }, [query, onlyPending, pageSize]);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);
    const paginated = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);

    // --- Shared Props ---
    const sharedProps = {
        query,
        setQuery,
        onlyPending,
        setOnlyPending,
        onRefresh: handleRefresh,
        onOpenCreate: () => setIsCreateModalVisible(true),
        refreshing,
        counts,
        items: paginated,
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
                <UserPrescriptionsWebView {...sharedProps} />
            ) : (
                <UserPrescriptionsMobileView {...sharedProps} />
            )}

            <CreatePrescriptionModal
                visible={isCreateModalVisible}
                onClose={() => setIsCreateModalVisible(false)}
                onSuccess={(id) => {
                    setIsCreateModalVisible(false);
                    fetchData();
                }}
            />

            <UserPrescriptionDetailsModal
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
                onChanged={() => void refreshOne(detailsTarget?.id)}
                onForwarded={(fresh) => {
                    upsertPrescription(fresh);
                    setLiveAlert({
                        id: `fwd-${fresh.id}`,
                        title: 'Sent to the pharmacy',
                        message: `${fresh.entity_title || 'The pharmacy'} has been notified. You’ll get an alert when its quotation arrives.`,
                        icon: 'return-up-forward-outline',
                        color: '#6366f1',
                    });
                }}
            />
        </>
    );
}