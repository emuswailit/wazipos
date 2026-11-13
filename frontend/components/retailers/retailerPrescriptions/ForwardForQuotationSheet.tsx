// components/retailers/retailerPrescriptions/ForwardForQuotationSheet.tsx
//
// The owner of a digitized prescription that has no pharmacy yet sends it to
// exactly ONE pharmacy. That pharmacy then handles it end to end: it quotes
// from its own stock and sources anything it lacks from wholesalers. Once a
// prescription has a pharmacy it can't be forwarded again.
// Backend action: ForwardPrescriptionForQuotation (owner only).

import type { PrescriptionsClient } from '@/api/retailerPrescriptionsApi';
import { AdminFormSheet, SearchField, useListTokens, webPointer } from '@/components/common/listScreen';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface Pharmacy {
    id: string;
    title: string;
    town?: string;
    phone?: string;
}

interface Props {
    visible: boolean;
    prescription: any | null;
    client: PrescriptionsClient;
    onClose: () => void;
    /** Called with the updated prescription. */
    onForwarded: (prescription: any) => void;
}

export function ForwardForQuotationSheet({ visible, prescription, client, onClose, onForwarded }: Props) {
    const { theme, chipBg } = useListTokens();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Pharmacy[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Pharmacy | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setSelected(null);
        setError(null);
        setQuery('');
    }, [visible, prescription?.id]);

    // Debounced pharmacy search.
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await client.post({ action: 'SearchPharmacies', search: query.trim() });
                if (!cancelled) setResults(Array.isArray(res.data?.pharmacies) ? res.data.pharmacies : []);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [visible, query, client]);

    const submit = async () => {
        if (!prescription || !selected) return setError('Choose a pharmacy.');
        setSubmitting(true);
        setError(null);
        try {
            const res = await client.post({
                action: 'ForwardPrescriptionForQuotation',
                prescription_id: String(prescription.id),
                entity: selected.id,
            });
            if (res.ok && res.data?.response_code === 0 && res.data?.prescription) {
                onForwarded(res.data.prescription);
                onClose();
            } else {
                const detail = Array.isArray(res.data?.errors) ? res.data.errors.join(' ') : '';
                setError([res.data?.response_message || "Couldn't send the prescription.", detail].filter(Boolean).join(' '));
            }
        } catch {
            setError("Couldn't reach the server. Check your connection.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminFormSheet
            visible={visible}
            onClose={submitting ? () => { } : onClose}
            title="Send to a pharmacy"
            subtitle={prescription?.patient_name ? `Patient: ${prescription.patient_name}` : null}
            icon="return-up-forward-outline"
            submitLabel={selected ? `Send to ${selected.title}` : 'Send'}
            submitting={submitting}
            onSubmit={submit}
            error={error}
            width={560}
        >
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                Choose one pharmacy. It prices the medicines from its own stock and sources anything it doesn't have. You can't send this prescription to another pharmacy afterwards.
            </Text>

            <SearchField value={query} onChangeText={setQuery} placeholder="Search pharmacies…" />

            <View style={{ gap: 6 }}>
                {loading ? (
                    <ActivityIndicator color={theme.primary} style={{ paddingVertical: 16 }} />
                ) : results.length === 0 ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                        {query ? 'No pharmacies match your search.' : 'No pharmacies found.'}
                    </Text>
                ) : (
                    results.map((p) => {
                        const on = selected?.id === p.id;
                        return (
                            <Pressable
                                key={p.id}
                                onPress={() => setSelected(on ? null : p)}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: on }}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 14,
                                    borderWidth: 1.5,
                                    borderColor: on ? theme.primary : 'transparent',
                                    backgroundColor: on ? `${theme.primary}10` : chipBg,
                                    opacity: pressed ? 0.85 : 1,
                                    ...webPointer,
                                })}
                            >
                                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? theme.primary : theme.textDark} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }} numberOfLines={1}>
                                        {p.title}
                                    </Text>
                                    {p.town || p.phone ? (
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                            {[p.town, p.phone].filter(Boolean).join(' · ')}
                                        </Text>
                                    ) : null}
                                </View>
                            </Pressable>
                        );
                    })
                )}
            </View>
        </AdminFormSheet>
    );
}

