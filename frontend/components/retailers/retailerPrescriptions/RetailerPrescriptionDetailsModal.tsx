// components/retailers/retailerPrescriptions/RetailerPrescriptionDetailsModal.tsx
//
// Prescription details: image (tap to zoom), AI status, medicines, and the
// Digitize / Manage medicines action while the prescription is queued.

import { AdminBadgePill, AdminDetailsSheet, SheetButton, formatDateTime, textOr, useListTokens, useSheetIsWide, webPointer } from '@/components/common/listScreen';
import ImageWithFallback from '@/components/common/ImageWithFallback';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import {
    aiReading,
    allowsPartial,
    canEditItems,
    isPaidQuotation,
    itemTitle,
    kes,
    myQuotation,
    needsVerification,
    patientLine,
    prescriptionBadges,
    prescriptionItems,
    quotationBadge,
    quotationsOf,
    quoteLineFor,
    resolveImage,
    type Quotation,
} from './prescriptionsConfig';
import type { PrescriptionNormalized } from './RetailerPrescriptionsList';

interface RetailerPrescriptionDetailsModalProps {
    item: PrescriptionNormalized | null;
    onClose: () => void;
    onDigitize?: (item: PrescriptionNormalized) => void;
    onProceedToDispense?: (item: PrescriptionNormalized) => void;
    /** 'pharmacy' shows your own quotation; 'admin' shows the handling pharmacy's quotation. */
    scope?: 'pharmacy' | 'admin';
}

export function RetailerPrescriptionDetailsModal({ item, onClose, onDigitize, onProceedToDispense, scope = 'pharmacy' }: RetailerPrescriptionDetailsModalProps) {
    const wide = useSheetIsWide();
    const [zoomOpen, setZoomOpen] = useState(false);

    const meds = prescriptionItems(item);
    const image = resolveImage(item?.images?.[0]);
    const canDigitize = !!item && canEditItems(item) && !!onDigitize;
    const reading = !!item && aiReading(item);
    const verify = !!item && needsVerification(item);
    const isAdmin = scope === 'admin';
    const quotation = isAdmin ? null : myQuotation(item);
    const quotations = quotationsOf(item);
    const quotedCount = quotation ? meds.filter((m) => quoteLineFor(quotation, m.id)).length : 0;
    const digitizeLabel = isAdmin ? (meds.length ? 'Edit medicines' : 'Digitize prescription') : meds.length ? 'Quote & manage medicines' : 'Digitize prescription';
    const openDigitize = () => {
        if (!item || !onDigitize) return;
        onClose();
        onDigitize(item);
    };

    return (
        <>
            <AdminDetailsSheet
                visible={!!item}
                onClose={onClose}
                heading="Prescription"
                icon="document-text-outline"
                title={textOr(item?.patient_name, 'Unnamed patient')}
                subtitle={patientLine(item) || null}
                avatar={{ uri: image, icon: 'document-text-outline', label: item?.patient_name }}
                badges={item ? prescriptionBadges(item, scope) : []}
                stats={
                    isAdmin
                        ? [
                            { label: 'Medicines', value: String(meds.length) },
                            { label: 'Quotations', value: `${quotations.filter((q) => q.status !== 'REQUESTED').length}/${quotations.length}` },
                            { label: 'Received', value: formatDateTime(item?.created) },
                        ]
                        : [
                            { label: 'Medicines', value: String(meds.length) },
                            { label: 'You quoted', value: `${quotedCount}/${meds.length}`, color: quotedCount ? '#10b981' : undefined },
                            quotation?.order ? { label: 'Your quote', value: kes(quotation.order.total) } : { label: 'Received', value: formatDateTime(item?.created) },
                        ]
                }
                sections={[
                    ...(reading || verify
                        ? [{ title: 'AI extraction', icon: 'sparkles-outline' as const, children: <AiBanner reading={reading} /> }]
                        : []),
                    {
                        title: 'Prescription',
                        icon: 'document-text-outline' as const,
                        fields: [
                            { label: 'Uploaded to', value: (item as any)?.entity_title || 'No pharmacy chosen' },
                            {
                                label: 'Digitized by',
                                value: (item as any)?.digitized_at ? (item as any)?.digitized_by_entity_title || 'WaziPOS admin' : 'Not yet',
                            },
                            { label: 'Comment', value: (item as any)?.comment || '', full: true },
                        ],
                    },
                    { title: 'Prescription image', icon: 'image-outline', children: <ImagePreview uri={image} onZoom={() => setZoomOpen(true)} /> },
                    { title: `Medicines (${meds.length})`, icon: 'medkit-outline', children: <MedicineList meds={meds} canDigitize={canDigitize} quotation={quotation} /> },
                    ...(isAdmin
                        ? [{ title: `Pharmacy quotations (${quotations.length})`, icon: 'storefront-outline' as const, children: <QuotationList quotations={quotations} meds={meds} /> }]
                        : []),
                ]}
                actions={
                    <>
                        {canDigitize ? (
                            <SheetButton
                                label={digitizeLabel}
                                icon="scan-outline"
                                variant={onProceedToDispense && meds.length ? 'secondary' : 'primary'}
                                onPress={openDigitize}
                                grow={!wide}
                            />
                        ) : null}
                        {meds.length > 0 && onProceedToDispense && item ? (
                            <SheetButton label="Dispense" icon="bag-check-outline" onPress={() => (onClose(), onProceedToDispense(item))} grow={!wide} />
                        ) : null}
                    </>
                }
            />

            <ZoomViewer uri={image} visible={zoomOpen} onClose={() => setZoomOpen(false)} />
        </>
    );
}

function AiBanner({ reading }: { reading: boolean }) {
    const { theme } = useListTokens();
    const color = reading ? '#3b82f6' : '#f59e0b';
    return (
        <View className="flex-row items-center gap-2 rounded-2xl px-3.5 py-3" style={{ backgroundColor: `${color}14` }}>
            <Ionicons name={reading ? 'sparkles' : 'alert-circle'} size={18} color={color} />
            <Text style={{ flex: 1, color, fontFamily: theme.font.bold, fontSize: 12.5, lineHeight: 18 }}>
                {reading ? 'AI is reading the medicines from the image…' : 'Check the medicines AI found before dispensing.'}
            </Text>
        </View>
    );
}

function ImagePreview({ uri, onZoom }: { uri: string | null; onZoom: () => void }) {
    const { theme, chipBg } = useListTokens();
    if (!uri) {
        return (
            <View className="rounded-2xl items-center justify-center py-8" style={{ backgroundColor: chipBg }}>
                <Ionicons name="image-outline" size={28} color={theme.textDark} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 6 }}>No image attached</Text>
            </View>
        );
    }
    return (
        <Pressable onPress={onZoom} accessibilityRole="imagebutton" accessibilityLabel="Zoom prescription image" style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: chipBg, ...webPointer }}>
            <Image source={{ uri }} style={{ width: '100%', height: 220 }} resizeMode="contain" />
            <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.65)' }}>
                <Ionicons name="expand" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 11 }}>Tap to zoom</Text>
            </View>
        </Pressable>
    );
}

/** Admin view: the handling pharmacy's quotation for the prescription. */
function QuotationList({ quotations, meds }: { quotations: Quotation[]; meds: any[] }) {
    const { theme, chipBg } = useListTokens();
    if (quotations.length === 0) {
        return (
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                Not sent to any pharmacy yet. Once it is digitized, the customer can request quotations.
            </Text>
        );
    }
    return (
        <View style={{ gap: 8 }}>
            {quotations.map((q) => {
                const badge = quotationBadge(q);
                return (
                    <View key={q.id} style={{ borderRadius: 16, padding: 12, gap: 6, backgroundColor: chipBg }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                                {q.entity_title || 'Pharmacy'}
                            </Text>
                            {badge ? <AdminBadgePill badge={badge} /> : null}
                        </View>
                        {q.lines.length ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                Quoted {q.lines.length} of {meds.length} medicine{meds.length === 1 ? '' : 's'}
                                {isPaidQuotation(q) ? ' · paid' : ''}
                            </Text>
                        ) : (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>No prices yet.</Text>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

function MedicineList({ meds, canDigitize, quotation }: { meds: any[]; canDigitize: boolean; quotation: Quotation | null }) {
    const { theme, chipBg, border } = useListTokens();
    if (meds.length === 0) {
        return (
            <View className="rounded-2xl items-center px-4 py-6 border" style={{ borderColor: border, borderStyle: 'dashed' }}>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>No medicines added yet.</Text>
                {canDigitize ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
                        Use “Digitize” to read them from the image or add them yourself.
                    </Text>
                ) : null}
            </View>
        );
    }
    return (
        <View style={{ gap: 8 }}>
            {meds.map((m, i) => {
                const verified = m.is_verified === 'true';
                return (
                    <View key={m.id ?? i} className="flex-row items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: chipBg }}>
                        <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden' }}>
                            <ImageWithFallback uri={resolveImage(m.product?.images?.[0])} width={44} height={44} borderRadius={12} fallback="💊" fallbackSize={18} />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>
                                {itemTitle(m)}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                {[m.dose ? `Dose ${m.dose}` : '', m.days ? `${m.days} days` : '', m.required_unit_quantity ? `Qty ${m.required_unit_quantity}` : ''].filter(Boolean).join(' · ') ||
                                    'No dosing details'}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 1 }}>
                                {allowsPartial(m) ? 'Partial purchase allowed' : 'Full dose only'}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            {quotation ? (
                                (() => {
                                    const line = quoteLineFor(quotation, m.id);
                                    return (
                                        <AdminBadgePill
                                            badge={line ? { label: `${line.quantity} × ${kes(line.unit_price)}`, tone: 'primary', icon: 'pricetag' } : { label: 'Not quoted', tone: 'neutral' }}
                                        />
                                    );
                                })()
                            ) : null}
                            <AdminBadgePill badge={verified ? { label: 'Verified', tone: 'success' } : { label: 'Review', tone: 'warning' }} />
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

function ZoomViewer({ uri, visible, onClose }: { uri: string | null; visible: boolean; onClose: () => void }) {
    const { width, height } = useWindowDimensions();
    return (
        <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
                <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close image"
                    style={{ position: 'absolute', top: 48, right: 24, zIndex: 10, padding: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', ...webPointer }}
                >
                    <Ionicons name="close" size={26} color="#fff" />
                </Pressable>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    centerContent
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                >
                    {uri ? <Image source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode="contain" /> : null}
                </ScrollView>
            </View>
        </Modal>
    );
}
