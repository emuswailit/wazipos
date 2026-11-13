// components/retailers/retailerPrescriptions/DigitizePrescriptionModal.tsx
//
// Full-screen workspace for digitizing a prescription, shared by:
//   - admins  (client = adminRxClient): add medicines (preparation and/or
//     product) and mark digitized. Admins have no inventory, so they never quote.
//   - pharmacy staff (client = pharmacyRxClient): add medicines and mark
//     digitized; the backend then quotes every medicine they have stock for
//     (they can still adjust a line and re-send the quotation).
// Only the prescription's owner can send it to a pharmacy — exactly one
// (UserPrescriptionDetailsModal), so there is no forward action here.
// Wide screens: image + medicines left, add-item form right; phones: segments.

import { pharmacyRxClient, type PrescriptionsClient } from '@/api/retailerPrescriptionsApi';
import { AdminAvatarTile, AdminBadgePill, SegmentedControl, SheetButton, useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddPrescriptionItemForm } from './AddPrescriptionItemForm';
import { allowsPartial, isPaidQuotation, itemTitle, kes, myQuotation, quoteLineFor, resolveImage, type QuoteLine } from './prescriptionsConfig';
import { QuoteItemSheet } from './QuoteItemSheet';
import { FulfilmentChoiceSheet, type FulfilmentChoice } from './FulfilmentChoiceSheet';
import { WholesaleSourcesPanel } from './WholesaleSourcesPanel';
import type { PrescriptionNormalized } from './RetailerPrescriptionsList';

interface Props {
    visible: boolean;
    prescription: PrescriptionNormalized | null;
    onClose: () => void;
    /** Called with the fresh prescription after any change. */
    onPrescriptionUpdated?: (prescription: PrescriptionNormalized) => void;
    client?: PrescriptionsClient;
}

type Tab = 'items' | 'form';

/** Cross-platform yes/no prompt (Alert has no web implementation). */
function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: confirmLabel, onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}

const errorText = (res: any, fallback: string) =>
    [res?.data?.response_message || fallback, Array.isArray(res?.data?.errors) ? res.data.errors.join(' ') : ''].filter(Boolean).join(' ');

export function DigitizePrescriptionModal({ visible, prescription, onClose, onPrescriptionUpdated, client = pharmacyRxClient }: Props) {
    const { theme, chipBg, divider } = useListTokens();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isLarge = width >= 900;
    const isAdmin = client.scope === 'admin';

    const [current, setCurrent] = useState<any | null>(prescription);
    const [activeTab, setActiveTab] = useState<Tab>('items');
    const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [busy, setBusy] = useState<'done' | 'send' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [quoteTarget, setQuoteTarget] = useState<any | null>(null);
    const [fulfilFor, setFulfilFor] = useState<'done' | 'send' | null>(null);
    const [fulfilError, setFulfilError] = useState<string | null>(null);

    useEffect(() => {
        setCurrent(prescription);
    }, [prescription]);
    useEffect(() => {
        setNotice(null);
        setError(null);
    }, [prescription?.id]);

    const resolvedId = current?.id || current?.remote_id || current?.key;
    const items: any[] = current?.prescription_items || current?.items || [];
    const quotation = isAdmin ? null : myQuotation(current);
    const locked = quotation?.status === 'CHECKOUT' || isPaidQuotation(quotation);

    const applyFresh = useCallback(
        (fresh: any) => {
            setCurrent(fresh);
            onPrescriptionUpdated?.(fresh);
        },
        [onPrescriptionUpdated]
    );

    const refresh = useCallback(async () => {
        if (!resolvedId) return;
        setLoadingItems(true);
        try {
            const res = await client.post({ action: 'GetRetailPrescriptionDetails', prescription_id: String(resolvedId) });
            if (res.ok && res.data?.response_code === 0 && res.data?.prescription) applyFresh(res.data.prescription);
            else setError(errorText(res, "Couldn't refresh this prescription."));
        } catch {
            setError("Couldn't refresh. Check your connection.");
        } finally {
            setLoadingItems(false);
        }
    }, [resolvedId, client, applyFresh]);

    const removeItem = async (med: any) => {
        const ok = await confirmAsync('Remove medicine', `Remove ${itemTitle(med)} from the prescription?`, 'Remove');
        if (!ok) return;
        setDeletingId(med.id);
        setError(null);
        try {
            const res = await client.post({ action: 'RemoveRetailPrescriptionItem', prescription_item_id: String(med.id) });
            if (res.ok && res.data?.response_code === 0) await refresh();
            else setError(errorText(res, 'Failed to remove the medicine.'));
        } catch {
            setError('Network error while removing the medicine.');
        } finally {
            setDeletingId(null);
        }
    };

    /** Returns true on success. `confirm` null = the caller already confirmed (fulfilment sheet). */
    const runAction = async (
        kind: 'done' | 'send',
        action: string,
        confirm: { title: string; message: string; label: string } | null,
        extra: Record<string, any> = {}
    ): Promise<boolean> => {
        if (!resolvedId || busy) return false;
        if (confirm && !(await confirmAsync(confirm.title, confirm.message, confirm.label))) return false;
        setBusy(kind);
        setError(null);
        setFulfilError(null);
        setNotice(null);
        try {
            const res = await client.post({ action, prescription_id: String(resolvedId), ...extra });
            if (res.ok && res.data?.response_code === 0 && res.data?.prescription) {
                applyFresh(res.data.prescription);
                setNotice(res.data.response_message || 'Done.');
                return true;
            }
            const msg = errorText(res, 'That did not work.');
            if (confirm) setError(msg);
            else setFulfilError(msg);
        } catch {
            const msg = "Couldn't reach the server. Check your connection.";
            if (confirm) setError(msg);
            else setFulfilError(msg);
        } finally {
            setBusy(null);
        }
        return false;
    };

    // Pharmacy: insist on collection in person, or let the patient choose
    // (and pay shipping for) delivery, before the quotation goes out.
    const confirmFulfilment = async (choice: FulfilmentChoice) => {
        if (!fulfilFor) return;
        const ok = fulfilFor === 'send'
            ? await runAction('send', 'SubmitPrescriptionQuotation', null, { ...choice })
            : await runAction('done', 'MarkPrescriptionDigitized', null, { ...choice });
        if (ok) setFulfilFor(null);
    };

    if (!current) return null;

    const digitized = current.status === 'DIGITIZED';
    const heroThumb = resolveImage(current.images?.[0]) ?? null;
    const quotedLines = quotation?.lines ?? [];
    const quotedCount = items.filter((i) => quoteLineFor(quotation, i.id)).length;

    // Pharmacy staff pick collect-in-person vs delivery (the quotation goes out
    // with it); admins have no quotation, so they just confirm.
    const markDone = () => {
        if (!isAdmin) {
            setFulfilError(null);
            setFulfilFor('done');
            return;
        }
        void runAction('done', 'MarkPrescriptionDigitized', {
            title: digitized ? 'Notify the customer again?' : 'Done digitizing?',
            message: 'The customer is told their prescription is digitized. They can then send it to a pharmacy.',
            label: 'Notify customer',
        });
    };

    const sendQuote = () => {
        setFulfilError(null);
        setFulfilFor('send');
    };

    const canDeliver = !!(current.origin_point || current.origin_latitude);

    const bottomBar = items.length > 0 ? (
        <View style={{ gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 + (isLarge ? 0 : insets.bottom), borderTopWidth: 1, borderTopColor: divider, backgroundColor: theme.panel }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={2}>
                {isAdmin
                    ? `${items.length} medicine${items.length === 1 ? '' : 's'} · ${digitized ? 'digitized' : 'not marked digitized yet'}`
                    : `${quotedCount} of ${items.length} quoted${quotedLines.length ? ` · ${kes(quotation?.order?.total)}` : ''}${quotation?.status === 'QUOTED' ? (quotation.pickup_required ? ' · must collect in person' : ' · patient chooses delivery or collection') : ''}${locked ? ' · customer is paying' : ''}`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {!digitized || isAdmin ? (
                    <SheetButton
                        label={digitized ? 'Notify again' : 'Done digitizing'}
                        icon={digitized ? 'refresh' : 'checkmark-done'}
                        variant={digitized ? 'secondary' : 'primary'}
                        onPress={markDone}
                        loading={busy === 'done'}
                        loadingLabel="Saving…"
                        grow
                    />
                ) : null}
                {!isAdmin && digitized ? (
                    <SheetButton
                        label={quotation?.status === 'QUOTED' ? 'Re-send quotation' : 'Send quotation'}
                        icon="paper-plane-outline"
                        onPress={sendQuote}
                        disabled={!quotedLines.length || locked}
                        loading={busy === 'send'}
                        loadingLabel="Sending…"
                        grow
                    />
                ) : null}
            </View>
        </View>
    ) : null;

    const imageAndItems = (
        <View style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 16 + (isLarge || bottomBar ? 0 : insets.bottom) }} keyboardShouldPersistTaps="handled">
                {notice ? <Banner tone="success" text={notice} /> : null}
                {error ? <Banner tone="danger" text={error} /> : null}
                {locked ? <Banner tone="warning" text="The customer is paying for your quotation, so it can no longer be changed." /> : null}
                {!isAdmin && resolvedId && items.length ? (
                    <WholesaleSourcesPanel
                        prescriptionId={String(resolvedId)}
                        refreshKey={`${items.map((i) => `${i.id}:${i.required_unit_quantity ?? ''}`).join(',')}|${quotedLines.length}`}
                    />
                ) : null}

                <Pressable
                    onPress={() => heroThumb && setIsImageViewerVisible(true)}
                    disabled={!heroThumb}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="Open prescription image"
                    style={{ height: isLarge ? 300 : 230, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: chipBg, ...(heroThumb ? webPointer : {}) }}
                >
                    {heroThumb ? (
                        <>
                            <Image source={{ uri: heroThumb }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.65)' }}>
                                <Ionicons name="expand" size={12} color="#fff" />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 11.5 }}>Tap to zoom</Text>
                            </View>
                        </>
                    ) : (
                        <>
                            <Ionicons name="document-text-outline" size={36} color={theme.textDark} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginTop: 6 }}>No image attached</Text>
                        </>
                    )}
                </Pressable>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 }}>
                        Medicines ({items.length})
                    </Text>
                    {loadingItems ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                </View>

                {items.length === 0 && !loadingItems ? (
                    <View style={{ alignItems: 'center', gap: 6, borderRadius: 18, paddingVertical: 28, paddingHorizontal: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: divider }}>
                        <Ionicons name="medkit-outline" size={26} color={theme.textDark} />
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>No medicines yet</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, textAlign: 'center' }}>
                            {isLarge ? 'Add them with the form on the right.' : 'Switch to “Add item” to add medicines.'}
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 8 }}>
                        {items.map((med: any, index: number) => (
                            <MedicationRow
                                key={med.id || index}
                                med={med}
                                line={isAdmin ? null : quoteLineFor(quotation, med.id)}
                                showQuote={!isAdmin}
                                quoteDisabled={locked}
                                deleting={deletingId === med.id}
                                onQuote={() => setQuoteTarget(med)}
                                onRemove={() => removeItem(med)}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
            {bottomBar}
        </View>
    );

    const formPanel = (
        <View style={{ flex: 1, backgroundColor: theme.panel }}>
            <AddPrescriptionItemForm
                prescription={current}
                existingItems={items}
                client={client}
                onSuccess={() => {
                    void refresh();
                    if (!isLarge) setActiveTab('items');
                }}
                onCancel={onClose}
            />
        </View>
    );

    return (
        <>
            <Modal visible={visible} animationType={isLarge ? 'fade' : 'slide'} transparent={isLarge} statusBarTranslucent onRequestClose={onClose}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isLarge ? 'rgba(2,6,23,0.55)' : theme.panel, padding: isLarge ? 24 : 0 }}>
                    <View
                        style={{
                            flex: isLarge ? undefined : 1,
                            width: '100%',
                            maxWidth: isLarge ? 1200 : undefined,
                            height: isLarge ? Math.min(height - 48, 860) : undefined,
                            borderRadius: isLarge ? 24 : 0,
                            overflow: 'hidden',
                            backgroundColor: theme.panel,
                            paddingTop: isLarge ? 0 : insets.top,
                        }}
                    >
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: divider }}>
                            <AdminAvatarTile avatar={{ icon: 'scan-outline', color: theme.primary }} title="Digitize" size={40} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={1}>
                                    {isAdmin ? 'Digitize prescription' : digitized ? 'Quote prescription' : 'Digitize & quote'}
                                </Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 1 }} numberOfLines={1}>
                                    {current.patient_name ? `Patient: ${current.patient_name}` : 'Unnamed patient'}
                                </Text>
                            </View>
                            {digitized ? <AdminBadgePill badge={{ label: 'Digitized', tone: 'success', icon: 'checkmark-done' }} /> : null}
                            <Pressable
                                onPress={onClose}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: chipBg, ...webPointer }}
                            >
                                <Ionicons name="close" size={18} color={theme.textDark} />
                            </Pressable>
                        </View>

                        {isLarge ? (
                            <View style={{ flex: 1, flexDirection: 'row' }}>
                                <View style={{ width: '45%', borderRightWidth: 1, borderRightColor: divider, backgroundColor: theme.background }}>{imageAndItems}</View>
                                <View style={{ flex: 1 }}>{formPanel}</View>
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                                    <SegmentedControl<Tab>
                                        variant="mobile"
                                        options={[
                                            { key: 'items', label: `Image & medicines (${items.length})` },
                                            { key: 'form', label: 'Add item' },
                                        ]}
                                        value={activeTab}
                                        onChange={setActiveTab}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>{activeTab === 'items' ? imageAndItems : formPanel}</View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Full-screen image viewer */}
            <Modal visible={isImageViewerVisible} transparent animationType="fade" onRequestClose={() => setIsImageViewerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
                    <Pressable
                        onPress={() => setIsImageViewerVisible(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Close image"
                        style={{ position: 'absolute', zIndex: 2, top: insets.top + 12, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', ...webPointer }}
                    >
                        <Ionicons name="close" size={24} color="#fff" />
                    </Pressable>
                    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }} maximumZoomScale={4} minimumZoomScale={1} centerContent>
                        {heroThumb ? <Image source={{ uri: heroThumb }} style={{ width, height: height * 0.85 }} resizeMode="contain" /> : null}
                    </ScrollView>
                </View>
            </Modal>

            {!isAdmin ? (
                <QuoteItemSheet
                    visible={!!quoteTarget}
                    item={quoteTarget}
                    line={quoteTarget ? quoteLineFor(quotation, quoteTarget.id) : null}
                    onClose={() => setQuoteTarget(null)}
                    onSaved={() => void refresh()}
                />
            ) : null}

            {!isAdmin ? (
                <FulfilmentChoiceSheet
                    visible={!!fulfilFor}
                    title={fulfilFor === 'send' ? (quotation?.status === 'QUOTED' ? 'Re-send quotation' : 'Send quotation') : 'Done digitizing'}
                    submitLabel={fulfilFor === 'send' ? 'Send quotation' : 'Notify customer'}
                    initialPickupRequired={quotation?.pickup_required}
                    initialReason={quotation?.pickup_reason}
                    canDeliver={canDeliver}
                    submitting={!!busy}
                    error={fulfilError}
                    onClose={() => setFulfilFor(null)}
                    onConfirm={confirmFulfilment}
                />
            ) : null}
        </>
    );
}

const BANNER = {
    success: { fg: '#059669', bg: 'rgba(16,185,129,0.10)', icon: 'checkmark-circle' as const },
    danger: { fg: '#e11d48', bg: 'rgba(244,63,94,0.08)', icon: 'alert-circle' as const },
    warning: { fg: '#b45309', bg: 'rgba(245,158,11,0.12)', icon: 'lock-closed-outline' as const },
};

function Banner({ tone, text }: { tone: keyof typeof BANNER; text: string }) {
    const { theme } = useListTokens();
    const t = BANNER[tone];
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, backgroundColor: t.bg }}>
            <Ionicons name={t.icon} size={17} color={t.fg} />
            <Text style={{ flex: 1, color: t.fg, fontFamily: theme.font.medium, fontSize: 13 }}>{text}</Text>
        </View>
    );
}

function MedicationRow({
    med,
    line,
    showQuote,
    quoteDisabled,
    deleting,
    onQuote,
    onRemove,
}: {
    med: any;
    line: QuoteLine | null;
    showQuote: boolean;
    quoteDisabled: boolean;
    deleting: boolean;
    onQuote: () => void;
    onRemove: () => void;
}) {
    const { theme, chipBg } = useListTokens();
    const name = itemTitle(med);
    const required = Number(med.required_unit_quantity) || 0;
    const dosing = [med.dose, med.days ? `${med.days} days` : '', required ? `Qty ${required}` : ''].filter(Boolean).join(' · ');
    const how = [med.frequency_title, med.route_title].filter(Boolean).join(' · ');
    const bought = Number(med.bought_quantity) || 0;

    return (
        <View style={{ borderRadius: 16, padding: 12, gap: 8, backgroundColor: chipBg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AdminAvatarTile avatar={{ icon: 'medical-outline' }} title={name} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={2}>
                        {name}
                    </Text>
                    {dosing ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                            {dosing}
                        </Text>
                    ) : null}
                    {how ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>
                            {how}
                        </Text>
                    ) : null}
                </View>
                <Pressable
                    onPress={onRemove}
                    disabled={deleting}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                    style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,63,94,0.10)', ...webPointer }}
                >
                    {deleting ? <ActivityIndicator size="small" color="#e11d48" /> : <Ionicons name="trash-outline" size={16} color="#e11d48" />}
                </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <AdminBadgePill badge={allowsPartial(med) ? { label: 'Partial purchase OK', tone: 'info' } : { label: 'Full dose only', tone: 'neutral' }} />
                {bought ? <AdminBadgePill badge={{ label: `${bought} bought`, tone: 'success', icon: 'checkmark' }} /> : null}
                {showQuote ? (
                    line ? (
                        <AdminBadgePill badge={{ label: `Quoted ${line.quantity} × ${kes(line.unit_price)}`, tone: 'primary', icon: 'pricetag' }} />
                    ) : (
                        <AdminBadgePill badge={{ label: 'Not quoted', tone: 'neutral' }} />
                    )
                ) : null}
                {showQuote ? (
                    <Pressable onPress={onQuote} disabled={quoteDisabled} hitSlop={6} style={{ marginLeft: 'auto', opacity: quoteDisabled ? 0.4 : 1, ...webPointer }}>
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>{line ? 'Edit quote' : 'Quote'}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}
