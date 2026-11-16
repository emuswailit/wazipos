// components/shopping/userPrescriptions/UserPrescriptionsList.tsx
//
// The signed-in user's OWN prescriptions (ones sent to a pharmacy by staff live
// at /entityPrescriptions). Shared list kit: cards on phones, table on wide
// screens, kept on the device for offline viewing. Live alerts when a pharmacy
// digitizes, quotes or dispenses one; ?prescription=<id> opens its details.

import retailerPrescriptionsApi from '@/api/retailerPrescriptionsApi';
import { LiveAlertBanner, type LiveAlert } from '@/components/common/LiveAlertBanner';
import { AdminListView, formatDate, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';
import { useCachedList, usePaged } from '@/hooks/useCachedList';
import { usePrescriptionEvents } from '@/hooks/usePrescriptionEvents';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { CreatePrescriptionModal } from './CreatePrescriptionModal';
import { resolveImage } from './prescriptionImage';
import { UserPrescriptionDetailsModal } from './UserPrescriptionDetailsModal';

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
    entity_title?: string | null;
    [k: string]: any;
}

const items = (p: PrescriptionNormalized) => p.prescription_items || (p as any).items || [];
const needsCheck = (p: PrescriptionNormalized) => p.ai_extraction_status === 'COMPLETED' && items(p).some((i: any) => i.is_verified === 'false');
const nice = (s?: string | null) =>
    String(s || '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
const normalize = (p: any): PrescriptionNormalized => ({ ...p, prescription_items: p.prescription_items || p.items || [] });

function badges(p: PrescriptionNormalized): AdminBadge[] {
    const out: AdminBadge[] = [p.status === 'QUEUING' ? { label: 'Queuing', tone: 'warning', icon: 'time-outline' } : { label: nice(p.status) || 'Open', tone: 'neutral' }];
    const ai = p.ai_extraction_status;
    if (needsCheck(p)) out.push({ label: 'Check medicines', tone: 'warning', icon: 'alert-circle-outline' });
    else if (ai === 'COMPLETED') out.push({ label: 'Digitized', tone: 'success', icon: 'checkmark-done' });
    else if (ai === 'FAILED') out.push({ label: 'Could not read', tone: 'danger', icon: 'close-circle-outline' });
    else if (ai) out.push({ label: 'Reading…', tone: 'info', icon: 'sparkles-outline' });
    return out;
}

const config: AdminListConfig<PrescriptionNormalized> = {
    title: 'My prescriptions',
    noun: ['prescription', 'prescriptions'],
    icon: 'document-text-outline',
    searchPlaceholder: 'Search patient or pharmacy…',
    addLabel: 'Add prescription',
    emptyMessage: 'Snap a prescription: we read it, and pharmacies near you send quotations.',
    keyOf: (p) => String(p.id),
    titleOf: (p) => p.patient_name || 'Prescription',
    subtitleOf: (p) => [nice(p.patient_gender), p.patient_date_of_birth && `born ${formatDate(p.patient_date_of_birth)}`, p.entity_title].filter(Boolean).join(' · ') || null,
    avatarOf: (p) => {
        const uri = resolveImage(p.images?.[0]);
        return uri ? { uri } : { icon: 'document-text-outline' };
    },
    badgesOf: badges,
    metaOf: (p) => `Added ${formatDate(p.created)}${p.nature ? ` · ${nice(p.nature)}` : ''}`,
    metaIcon: 'calendar-outline',
    metricOf: (p) => ({ value: String(items(p).length), label: items(p).length === 1 ? 'medicine' : 'medicines' }),
    primaryColumn: { label: 'Patient', flex: 1.6 },
    columns: [
        { key: 'pharmacy', label: 'Pharmacy', flex: 1.3, render: (p) => p.entity_title || '—' },
        { key: 'status', label: 'Status', flex: 1, render: (p) => (p.status === 'QUEUING' ? 'Queuing' : nice(p.status) || '—') },
        { key: 'meds', label: 'Medicines', flex: 0.7, align: 'right', render: (p) => String(items(p).length) },
        { key: 'added', label: 'Added', flex: 1, render: (p) => formatDate(p.created) },
    ],
};

type Filter = 'ALL' | 'QUEUING' | 'CHECK';

export default function UserPrescriptionsList() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const list = useCachedList<PrescriptionNormalized>({
        key: 'user_prescriptions',
        fetch: () => retailerPrescriptionsApi.retrieveUserRetailPrescriptionsAction({ action: 'RetrieveUserRetailPrescriptions', page: 1, page_size: 100 }),
        pick: (d) => (Array.isArray(d) ? d : d?.results ?? []).map(normalize),
    });

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [createOpen, setCreateOpen] = useState(false);
    const [detailsTarget, setDetailsTarget] = useState<PrescriptionNormalized | null>(null);

    /** Swap a fresh prescription into the list (and the open details sheet). */
    const upsert = useCallback(
        (fresh: any) => {
            if (!fresh?.id) return;
            const n = normalize(fresh);
            list.patch((all) => {
                const i = all.findIndex((p) => String(p.id) === String(fresh.id));
                if (i < 0) return [n, ...all];
                const next = all.slice();
                next[i] = { ...all[i], ...n };
                return next;
            });
            setDetailsTarget((p) => (p && String(p.id) === String(fresh.id) ? { ...p, ...n } : p));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [list.patch],
    );

    // --- Live: digitized / quoted / dispensed. Staff also get their pharmacy's
    // events on this socket, so only react to prescriptions in this own list.
    const [liveAlert, setLiveAlert] = useState<LiveAlert | null>(null);
    const ownIds = useRef<Set<string>>(new Set());
    ownIds.current = new Set(list.items.map((p) => String(p.id)));
    usePrescriptionEvents(({ event, prescription }) => {
        if (!prescription?.id || !ownIds.current.has(String(prescription.id))) return;
        upsert(prescription);
        const open = () => setDetailsTarget(normalize(prescription));
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
            const latest = [...(prescription.quotations || [])].filter((q: any) => q.quoted_at).sort((a: any, b: any) => String(b.quoted_at).localeCompare(String(a.quoted_at)))[0];
            setLiveAlert({
                id: `quote-${prescription.id}-${latest?.id ?? ''}`,
                title: 'New quotation',
                message: latest
                    ? `${latest.entity_title} quoted ${latest.lines?.length ?? 0} medicine${latest.lines?.length === 1 ? '' : 's'} for KES ${Number(latest.order?.total || 0).toLocaleString()}${
                          latest.pickup_required ? '. Collect in person at the pharmacy' : latest.delivery_available ? '. Choose delivery or collection when you pay' : ''
                      }. Pay by mobile money. Tap to view.`
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
                if (res.ok && (res.data as any)?.response_code === 0 && (res.data as any)?.prescription) upsert((res.data as any).prescription);
            } catch {
                /* the list refresh below still runs */
            }
            void list.refresh();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [upsert, list.refresh],
    );

    // --- Deep link: ?prescription=<id> opens that prescription's details.
    const { prescription: linkedParam } = useLocalSearchParams<{ prescription?: string }>();
    const linkedId = Array.isArray(linkedParam) ? linkedParam[0] : linkedParam;
    const handledLink = useRef<string | null>(null);
    useEffect(() => {
        if (!linkedId || list.loading || handledLink.current === linkedId) return;
        handledLink.current = linkedId;
        router.setParams({ prescription: undefined } as any);
        const inList = list.items.find((p) => String(p.id) === String(linkedId));
        if (inList) return setDetailsTarget(inList);
        let cancelled = false;
        retailerPrescriptionsApi
            .getRetailPrescriptionDetailsAction({ action: 'GetRetailPrescriptionDetails', prescription_id: String(linkedId) })
            .then((res) => {
                const found = res.ok ? ((res.data as any)?.prescription ?? null) : null;
                if (!cancelled && found) setDetailsTarget(normalize(found));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [linkedId, list.loading, list.items, router]);

    const queuing = list.items.filter((p) => p.status === 'QUEUING').length;
    const toCheck = list.items.filter(needsCheck).length;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return list.items
            .filter((p) => filter === 'ALL' || (filter === 'QUEUING' ? p.status === 'QUEUING' : needsCheck(p)))
            .filter((p) => !q || `${p.patient_name ?? ''} ${p.entity_title ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => String(b.created).localeCompare(String(a.created)));
    }, [list.items, query, filter]);
    const paged = usePaged(filtered, `${query}|${filter}`);

    return (
        <>
            <LiveAlertBanner alert={liveAlert} onDismiss={() => setLiveAlert(null)} />
            <AdminListView<PrescriptionNormalized, Filter>
                variant={width >= 768 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={list.refresh}
                refreshing={list.refreshing}
                sourceLabel={list.sourceLabel}
                sourceTone={list.source}
                lastSyncedTime={list.lastSynced}
                error={list.error}
                {...paged}
                onOpenCreate={() => setCreateOpen(true)}
                onPressItem={setDetailsTarget}
                stats={[
                    { label: 'Prescriptions', value: String(list.items.length) },
                    { label: 'Queuing', value: String(queuing), color: '#f59e0b' },
                    { label: 'To check', value: String(toCheck), color: toCheck ? '#f43f5e' : undefined },
                ]}
                filters={{
                    options: [
                        { key: 'ALL', label: 'All', icon: 'apps-outline', count: list.items.length },
                        { key: 'QUEUING', label: 'Queuing', icon: 'time-outline', count: queuing },
                        { key: 'CHECK', label: 'Check medicines', icon: 'alert-circle-outline', count: toCheck },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'ALL',
                }}
            />

            <CreatePrescriptionModal
                visible={createOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={() => {
                    setCreateOpen(false);
                    void list.refresh();
                }}
            />

            <UserPrescriptionDetailsModal
                item={detailsTarget}
                onClose={() => setDetailsTarget(null)}
                onChanged={() => void refreshOne(detailsTarget?.id)}
                onForwarded={(fresh) => {
                    upsert(fresh);
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
