// components/retailers/retailerPrescriptions/prescriptionsConfig.tsx
//
// How a prescription is shown in lists and details, plus the quotation helpers
// shared by the pharmacy, admin and customer screens.
//
// Flow: uploaded (QUEUING) → digitized by the system / an admin / a pharmacy
// (DIGITIZED) → the ONE pharmacy handling it sends its quotation (an
// independent customer order) → the customer buys from it, fully or in parts
// (each purchase is its own quotation + order).

import { CellText, formatDate, textOr, type AdminBadge, type AdminListConfig } from '@/components/common/listScreen';

import type { PrescriptionNormalized } from './RetailerPrescriptionsList';

export function resolveImage(raw: any): string | null {
    if (!raw) return null;
    const p = typeof raw === 'string' ? raw : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    return `https://api.wazipos.co.ke/${p.replace(/^\/+/, '')}`;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export const prescriptionItems = (p: PrescriptionNormalized | null | undefined): any[] => (p?.prescription_items || p?.items || []) as any[];
const isQueued = (p: PrescriptionNormalized) => p.status === 'QUEUING';
const isDigitized = (p: PrescriptionNormalized) => p.status === 'DIGITIZED';
/** Medicines can be added/edited until the prescription is dispensed, closed or cancelled. */
export const canEditItems = (p: PrescriptionNormalized) => isQueued(p) || isDigitized(p);
export const aiReading = (p: PrescriptionNormalized) => p.ai_extraction_status === 'PENDING' || p.ai_extraction_status === 'PROCESSING';
export const needsVerification = (p: PrescriptionNormalized) =>
    p.ai_extraction_status === 'COMPLETED' && prescriptionItems(p).some((i) => i.is_verified === 'false');

export const itemTitle = (i: any) => i?.product_title || i?.preparation_title || 'Unknown medicine';
export const allowsPartial = (i: any) => i?.allow_partial_purchase === true || i?.allow_partial_purchase === 'true';

/* ------------------------------------------------------------------ */
/* Quotations                                                          */
/* ------------------------------------------------------------------ */

export interface QuoteLine {
    id: string;
    prescription_item: string | null;
    product_title: string;
    batch: string;
    expiry_date: string | null;
    quantity: number;
    unit_price: string;
    total: string;
}

export interface Quotation {
    id: string;
    entity: string;
    entity_title: string;
    entity_town?: string;
    /** FULFILLED: everything it offered has been bought. */
    status: 'REQUESTED' | 'QUOTED' | 'CHECKOUT' | 'FULFILLED' | 'DECLINED' | 'CANCELLED';
    quoted_at: string | null;
    order: {
        id: string;
        status: string;
        is_paid: string;
        /** Medicines + shipping. */
        total: string;
        reference_number: string;
        /** The quotation's order is a price list (always PICKUP, no shipping); fulfilment is chosen per purchase. */
        delivery_method?: 'PICKUP' | 'DELIVERY' | '';
        shipping_cost?: string;
        items_total?: string;
        distance_km?: string | null;
    } | null;
    lines: QuoteLine[];
    /** The pharmacy insists on collection in person (advice / pharmaceutical care): no shipping, no delivery. */
    pickup_required?: boolean;
    pickup_reason?: string;
    /** The customer may choose delivery at checkout (and pays its shipping). */
    delivery_available?: boolean;
    /**
     * Paid purchases made from this quotation, newest first. Each purchase is a
     * quotation of its own with its own order; this (open) quotation's lines
     * are what is still left to buy.
     */
    purchases?: QuotationPurchase[];
}

export interface QuotationPurchase {
    /** The purchase's own quotation. */
    id: string;
    /** The purchase's own customer order. */
    order: string;
    status: string;
    paid_at: string | null;
    created: string | null;
    total: string;
    items_total: string;
    delivery_method: 'PICKUP' | 'DELIVERY' | '';
    shipping_cost: string;
    reference_number: string;
    lines: { prescription_item: string | null; quantity: number }[];
}

export const purchasesOf = (q: Quotation | null | undefined): QuotationPurchase[] => (Array.isArray(q?.purchases) ? q!.purchases! : []);

export const quotationsOf = (p: any): Quotation[] => (Array.isArray(p?.quotations) ? p.quotations : []);
/** A prescription is handled by one pharmacy, so it has at most one (open) quotation. */
export const myQuotation = (p: any): Quotation | null => quotationsOf(p)[0] ?? null;
export const isPaidQuotation = (q: Quotation | null | undefined) => q?.order?.is_paid === 'true';
export const quoteLineFor = (q: Quotation | null | undefined, itemId: string | undefined | null): QuoteLine | null =>
    (q?.lines ?? []).find((l) => !!itemId && String(l.prescription_item) === String(itemId)) ?? null;

/** Shown to the patient when a prescription had a medicine for a month or longer. */
export const FOLLOW_UP_ADVICE =
    'This prescription has long-term medicine (a month or longer). Check whether you have a follow-up appointment with your prescriber, and book one if you don’t.';
const isDispensed = (p: any) => p?.status === 'DISPENSED';

export const kes = (v: unknown) => `KES ${(Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function quotationBadge(q: Quotation | null): AdminBadge | null {
    if (!q) return null;
    if (isPaidQuotation(q)) return { label: 'Paid', tone: 'success', icon: 'checkmark-circle' };
    const bought = purchasesOf(q).length;
    if (bought) return { label: `${bought} purchase${bought === 1 ? '' : 's'} paid`, tone: 'success', icon: 'checkmark-circle' };
    switch (q.status) {
        case 'REQUESTED':
            return { label: 'Quote requested', tone: 'info', icon: 'mail-unread-outline' };
        case 'QUOTED':
            return { label: `Quoted · ${kes(q.order?.total)}`, tone: 'primary', icon: 'pricetags-outline' };
        case 'CHECKOUT':
            return { label: 'Customer paying', tone: 'warning', icon: 'card-outline' };
        case 'FULFILLED':
            return { label: 'Fully bought', tone: 'success', icon: 'checkmark-done' };
        default:
            return { label: q.status.charAt(0) + q.status.slice(1).toLowerCase(), tone: 'neutral' };
    }
}

/* ------------------------------------------------------------------ */
/* List config                                                         */
/* ------------------------------------------------------------------ */

const titleCase = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

export function prescriptionBadges(p: PrescriptionNormalized, scope: 'pharmacy' | 'admin' = 'pharmacy'): AdminBadge[] {
    const badges: AdminBadge[] = [];
    if (isQueued(p)) badges.push({ label: 'Awaiting digitizing', tone: 'warning', icon: 'time-outline' });
    else if (isDigitized(p)) badges.push({ label: 'Digitized', tone: 'success', icon: 'checkmark-done' });
    else if (isDispensed(p)) badges.push({ label: 'Fully dispensed', tone: 'success', icon: 'bag-check-outline' });
    else badges.push({ label: titleCase(p.status) || 'Unknown', tone: 'neutral' });

    if (aiReading(p)) badges.push({ label: 'AI reading', tone: 'info', icon: 'sparkles' });
    else if (needsVerification(p)) badges.push({ label: 'Needs verification', tone: 'warning', icon: 'alert-circle' });

    if (scope === 'pharmacy') {
        const qb = quotationBadge(myQuotation(p));
        if (qb) badges.push(qb);
    } else {
        // A prescription goes to one pharmacy.
        const q = myQuotation(p);
        if (q) badges.push({ label: q.status === 'REQUESTED' ? 'Awaiting quotation' : 'Quoted', tone: q.status === 'REQUESTED' ? 'info' : 'primary', icon: 'storefront-outline' });
        else if (isDigitized(p) && !(p as any).entity) badges.push({ label: 'Not sent to a pharmacy', tone: 'warning', icon: 'return-up-forward-outline' });
    }
    if (p.nature) badges.push({ label: titleCase(p.nature), tone: 'violet' });
    return badges;
}

export const patientLine = (p: PrescriptionNormalized | null | undefined) =>
    [textOr(p?.patient_gender, ''), p?.patient_date_of_birth ? `Born ${formatDate(p.patient_date_of_birth)}` : ''].filter(Boolean).join(' · ');

export function makePrescriptionsConfig(scope: 'pharmacy' | 'admin'): AdminListConfig<PrescriptionNormalized> {
    return {
        title: scope === 'admin' ? 'User prescriptions' : 'Prescriptions',
        noun: ['prescription', 'prescriptions'],
        icon: 'document-text-outline',
        searchPlaceholder: 'Search patient name…',
        emptyMessage: scope === 'admin' ? 'Prescriptions customers upload appear here for digitizing.' : 'Prescriptions shoppers send to your pharmacy appear here.',
        keyOf: (p, i) => `${p.id ?? 'rx'}-${i}`,
        titleOf: (p) => textOr(p.patient_name, 'Unnamed patient'),
        subtitleOf: (p) =>
            scope === 'admin'
                ? [patientLine(p), (p as any).entity_title ? `Sent to ${(p as any).entity_title}` : 'No pharmacy chosen'].filter(Boolean).join(' · ')
                : patientLine(p) || null,
        avatarOf: (p) => ({ uri: resolveImage(p.images?.[0]), icon: 'document-text-outline', label: p.patient_name }),
        badgesOf: (p) => prescriptionBadges(p, scope),
        metricOf: (p) => {
            const n = prescriptionItems(p).length;
            return { value: String(n), label: n === 1 ? 'medicine' : 'medicines' };
        },
        metaOf: (p) => formatDate(p.created),
        primaryColumn: { label: 'Patient', flex: 2.6 },
        columns: [
            { key: 'status', label: 'Status', flex: 1.2, render: (p) => <CellText strong>{prescriptionBadges(p, scope)[0].label}</CellText> },
            scope === 'admin'
                ? {
                    key: 'quotes',
                    label: 'Quotations',
                    flex: 1.2,
                    render: (p) => {
                        const qs = quotationsOf(p);
                        return qs.length ? `${qs.filter((q) => q.status !== 'REQUESTED').length}/${qs.length} quoted` : '—';
                    },
                }
                : {
                    key: 'quote',
                    label: 'Your quotation',
                    flex: 1.4,
                    render: (p) => quotationBadge(myQuotation(p))?.label ?? '—',
                },
            {
                key: 'meds',
                label: 'Medicines',
                flex: 0.9,
                align: 'right',
                render: (p) => (
                    <CellText strong align="right">
                        {prescriptionItems(p).length}
                    </CellText>
                ),
            },
            { key: 'date', label: 'Received', flex: 1.2, render: (p) => formatDate(p.created) },
        ],
    };
}

/** Pharmacy list config (kept for existing imports). */
export const prescriptionsConfig = makePrescriptionsConfig('pharmacy');
