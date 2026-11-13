// components/retailers/productRequests/ViewRequestDetailsModal.tsx
//
// Read-only product request on the shared details sheet: status, progress,
// each requested line with the wholesaler offers it received.
// (Requests that need a decision open OfferReviewModal instead.)

import { AdminBadgePill, AdminDetailsSheet, formatDate, textOr, useListTokens, type AdminBadge, type BadgeTone } from '@/components/common/listScreen';
import type { ProductRequest, ProductRequestItem, ProductRequestOffer } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { requestStatusBadge, urgencyBadge } from './productRequestsConfig';
import { offerStatusLabel } from './statusPrimitives';

interface Props {
    visible: boolean;
    request: ProductRequest | null;
    onClose: () => void;
}

export function ViewRequestDetailsModal({ visible, request, onClose }: Props) {
    if (!request) {
        return <AdminDetailsSheet visible={false} onClose={onClose} heading="" icon="search-circle-outline" title="" sections={[]} />;
    }

    const items = request.items ?? [];
    const offers = items.reduce((n, i) => n + (i.offers?.length ?? 0), 0);
    const urg = urgencyBadge(request.urgency);
    const badges: AdminBadge[] = [requestStatusBadge(request), ...(urg ? [urg] : [])];

    return (
        <AdminDetailsSheet
            visible={visible}
            onClose={onClose}
            heading="Product request"
            icon="search-circle-outline"
            title={textOr(request.request_number, 'Product request')}
            subtitle={textOr(request.entity_title, '') || null}
            avatar={{ icon: 'search-circle-outline' }}
            badges={badges}
            stats={[
                { label: 'Lines', value: String(request.total_line_count ?? items.length) },
                { label: 'Fulfilled', value: `${request.fulfilled_line_count ?? 0}/${request.total_line_count ?? items.length}`, color: (request.fulfilled_line_count ?? 0) > 0 ? '#10b981' : undefined },
                { label: 'Offers', value: String(offers) },
            ]}
            sections={[
                {
                    title: 'Request',
                    icon: 'document-text-outline',
                    fields: [
                        { label: 'Created', value: formatDate(request.created) },
                        { label: 'Expires', value: formatDate(request.expires_at) },
                        { label: 'Fulfilled on', value: request.fulfilled_at ? formatDate(request.fulfilled_at) : '' },
                        { label: 'Cancelled on', value: request.cancelled_at ? formatDate(request.cancelled_at) : '' },
                        { label: 'Note', value: request.note?.trim() ?? '', full: true },
                    ],
                },
                {
                    title: `Requested products (${items.length})`,
                    icon: 'cube-outline',
                    children: (
                        <View style={{ gap: 10 }}>
                            {items.length === 0 ? <EmptyNote text="No lines on this request." /> : items.map((line) => <RequestLineCard key={line.id} line={line} />)}
                        </View>
                    ),
                },
            ]}
        />
    );
}

/* ------------------------------------------------------------------ */
/* Shared pieces (also used by OfferReviewModal)                       */
/* ------------------------------------------------------------------ */

export function EmptyNote({ text }: { text: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: chipBg }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>{text}</Text>
        </View>
    );
}

const OFFER_TONE: Record<string, BadgeTone> = {
    OFFERED: 'warning',
    ACCEPTED: 'success',
    CONFIRMED: 'success',
    DECLINED: 'danger',
    REJECTED: 'danger',
    CANCELLED: 'neutral',
    WITHDRAWN: 'neutral',
    EXPIRED: 'neutral',
};

function offerBadge(o: ProductRequestOffer): AdminBadge {
    const key = String(o.status ?? '').trim().toUpperCase();
    return { label: offerStatusLabel(o.status, o.status_display), tone: OFFER_TONE[key] ?? 'neutral' };
}

export function formatKES(raw: string | number | null | undefined): string {
    const n = Number(raw ?? 0);
    return `KES ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Header of a requested line: product, quantity, urgency, status, note. */
export function LineHeader({ line }: { line: ProductRequestItem }) {
    const { theme } = useListTokens();
    const urg = urgencyBadge(line.urgency);
    const status = line.status_display || line.status;
    return (
        <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={2}>
                    {textOr(line.product_title, 'Product')}
                </Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>×{Number(line.requested_quantity ?? 0).toLocaleString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {status ? <AdminBadgePill badge={{ label: textOr(status), tone: 'neutral' }} /> : null}
                {urg ? <AdminBadgePill badge={urg} /> : null}
                {line.product_bar_code ? <AdminBadgePill badge={{ label: line.product_bar_code, tone: 'neutral', icon: 'barcode-outline' }} /> : null}
                {Number(line.confirmed_quantity) > 0 ? <AdminBadgePill badge={{ label: `${line.confirmed_quantity} confirmed`, tone: 'success' }} /> : null}
            </View>
            {line.note?.trim() ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={3}>
                    “{line.note.trim()}”
                </Text>
            ) : null}
        </View>
    );
}

/** One wholesaler offer, read-only. `right` lets the review modal add controls. */
export function OfferSummary({ offer, right }: { offer: ProductRequestOffer; right?: React.ReactNode }) {
    const { theme } = useListTokens();
    const facts = [
        `${Number(offer.offered_quantity ?? 0).toLocaleString()} unit${offer.offered_quantity === 1 ? '' : 's'}`,
        offer.offered_unit_price ? `${formatKES(offer.offered_unit_price)} each` : '',
        offer.batch ? `Batch ${offer.batch}` : '',
        offer.expiry_date ? `Expires ${formatDate(offer.expiry_date)}` : '',
    ].filter(Boolean);
    return (
        <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="storefront-outline" size={15} color={theme.textDark} />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                    {textOr(offer.wholesaler_title, 'Wholesaler')}
                </Text>
                {right ?? <AdminBadgePill badge={offerBadge(offer)} />}
            </View>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginLeft: 23 }}>{facts.join(' · ')}</Text>
            {offer.is_placement ? (
                <View style={{ marginLeft: 23, flexDirection: 'row' }}>
                    <AdminBadgePill badge={{ label: 'Consignment', tone: 'violet' }} />
                </View>
            ) : null}
            {offer.response_note?.trim() ? (
                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12.5, marginLeft: 23 }} numberOfLines={3}>
                    “{offer.response_note.trim()}”
                </Text>
            ) : null}
            {offer.retailer_response_note?.trim() ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginLeft: 23 }} numberOfLines={2}>
                    You: {offer.retailer_response_note.trim()}
                </Text>
            ) : null}
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11, marginLeft: 23, opacity: 0.8 }}>
                Offered {formatDate(offer.created)}
                {offer.retailer_confirmed_at ? ` · Confirmed ${formatDate(offer.retailer_confirmed_at)}` : ''}
            </Text>
        </View>
    );
}

function RequestLineCard({ line }: { line: ProductRequestItem }) {
    const { theme, chipBg, divider } = useListTokens();
    const offers = line.offers ?? [];
    return (
        <View style={{ borderRadius: 18, padding: 14, gap: 10, backgroundColor: chipBg }}>
            <LineHeader line={line} />
            {offers.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>No offers yet.</Text>
            ) : (
                offers.map((o, i) => (
                    <View key={o.id} style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: divider }}>
                        <OfferSummary offer={o} />
                    </View>
                ))
            )}
        </View>
    );
}
