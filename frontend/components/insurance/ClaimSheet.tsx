// components/insurance/ClaimSheet.tsx
//
// Make a claim on a policy: what happened, when, how much was lost — with the payout
// worked out live under the policy's own terms (excess, limits, the 80% on credit),
// plus a photo / PDF of the evidence and the police OB number where it's needed.

import insuranceApi, { type ClaimEstimate, type Policy } from '@/api/insuranceApi';
import { pickImage } from '@/components/common/imagePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminSheet, ChoiceChips } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PrimaryCTA } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { FileText, Paperclip, Send, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { kes, pointer } from './coverShared';

const POLICE_NEEDED = new Set(['BURGLARY', 'CASH', 'STAFF_THEFT', 'SIM_SWAP']);

function nowLocal() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ClaimSheet({ policy, onClose, onFiled }: { policy: Policy | null; onClose: () => void; onFiled: () => void }) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [incident, setIncident] = useState('');
    const [when, setWhen] = useState(nowLocal());
    const [loss, setLoss] = useState('');
    const [nights, setNights] = useState('');
    const [desc, setDesc] = useState('');
    const [police, setPolice] = useState('');
    const [file, setFile] = useState<{ file: any; name: string } | null>(null);
    const [estimate, setEstimate] = useState<ClaimEstimate | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!policy) return;
        setIncident(Object.keys(policy.incidents)[0] ?? '');
        setWhen(nowLocal());
        setLoss(policy.product === 'TRADE_GUARD' ? String(Math.round(policy.cover / 0.8)) : '');
        setNights('');
        setDesc('');
        setPolice('');
        setFile(null);
        setEstimate(null);
        setError(null);
    }, [policy]);

    // Live payout estimate.
    useEffect(() => {
        if (!policy || !incident || !isOnline) return;
        const t = setTimeout(async () => {
            const res: any = await insuranceApi.estimateClaim({ policy_id: policy.id, incident, loss_amount: loss || 0, nights: nights || 0 }).catch(() => null);
            if (isServerOk(res)) setEstimate(res.data.estimate);
        }, 300);
        return () => clearTimeout(t);
    }, [policy, incident, loss, nights, isOnline]);

    const pick = async () => {
        if (Platform.OS === 'web') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf';
            input.onchange = () => {
                const f = input.files?.[0];
                if (f) setFile({ file: f, name: f.name });
            };
            input.click();
            return;
        }
        const img = await pickImage({ allowsEditing: false, quality: 0.8 });
        if (img) setFile({ file: img.file, name: img.name });
    };

    const submit = async () => {
        if (!policy) return;
        if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(when.trim())) return setError('Enter when it happened as YYYY-MM-DD HH:MM.');
        if (desc.trim().length < 15) return setError('Describe what happened in a sentence or two.');
        if (POLICE_NEEDED.has(incident) && !police.trim()) return setError('Add the police OB number.');
        if (!isOnline) return setError("You're offline — your claim stays here; send it when you're back online.");
        setBusy(true);
        setError(null);
        try {
            const res: any = await insuranceApi.fileClaim({
                policy_id: policy.id, incident, incident_at: new Date(when.trim().replace(' ', 'T')).toISOString(),
                loss_amount: loss || undefined, nights: nights || undefined, description: desc.trim(), police_reference: police.trim() || undefined, evidence: file?.file,
            });
            if (isServerOk(res)) {
                toast.success('Claim received', `Claim ${res.data.claim.claim_number} — we'll update you as it's reviewed.`);
                onFiled();
            } else setError(describeResponse(res, 'Your claim was not sent.').message);
        } finally {
            setBusy(false);
        }
    };

    const needsLoss = !['DEATH', 'DISABILITY', 'HOSPITAL'].includes(incident);

    return (
        <AdminSheet visible={!!policy} onClose={onClose} title="Make a claim" subtitle={policy ? `${policy.name} · ${policy.policy_number}` : undefined} icon="document-text-outline" width={600}>
            {policy ? (
                <View style={{ gap: 14 }}>
                    <ChoiceChips<string> label="What happened" required options={Object.entries(policy.incidents).map(([value, label]) => ({ value, label }))} value={incident} onChange={setIncident} />
                    <CustomTextField label="When (YYYY-MM-DD HH:MM)" required value={when} onChangeText={setWhen} />
                    {needsLoss ? <CustomTextField label={policy.product === 'TRADE_GUARD' ? 'Amount still unpaid (KES)' : 'How much you lost (KES)'} required value={loss} onChangeText={(t) => setLoss(t.replace(/[^\d.]/g, ''))} keyboardType="numeric" /> : null}
                    {incident === 'HOSPITAL' ? <CustomTextField label="Nights in hospital" value={nights} onChangeText={(t) => setNights(t.replace(/\D/g, ''))} keyboardType="number-pad" /> : null}
                    <CustomTextField label="What happened" required value={desc} onChangeText={setDesc} multiline numberOfLines={4} maxLength={4000} placeholder="Where, how, and what was lost or damaged." />
                    {POLICE_NEEDED.has(incident) || policy.product === 'SAFE_PARCEL' ? (
                        <CustomTextField label={`Police OB number${POLICE_NEEDED.has(incident) ? '' : ' (if reported)'}`} required={POLICE_NEEDED.has(incident)} value={police} onChangeText={setPolice} autoCapitalize="characters" />
                    ) : null}

                    <Pressable onPress={() => void pick()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: file ? theme.success : theme.border, ...pointer }}>
                        {file ? <FileText size={20} color={theme.success} /> : <Paperclip size={20} color={theme.textMuted} />}
                        <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }} numberOfLines={1}>{file ? file.name : 'Add a photo or PDF (receipt, hospital note, police abstract)'}</Text>
                        {file ? (
                            <Pressable onPress={() => setFile(null)} hitSlop={8} style={pointer}>
                                <X size={16} color={theme.textMuted} />
                            </Pressable>
                        ) : null}
                    </Pressable>

                    {estimate ? (
                        <View style={{ padding: 14, borderRadius: 16, backgroundColor: `${theme.success}12`, gap: 6 }}>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 12 }}>Estimated payout</Text>
                            <Text style={{ color: theme.success, fontFamily: theme.font.bold, fontSize: 26, letterSpacing: -0.4 }}>{kes(estimate.payable)}</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>
                                Covered {kes(estimate.covered)}{estimate.excess ? ` − excess ${kes(estimate.excess)}` : ''}. Confirmed after review.
                            </Text>
                            {estimate.notes.map((n) => (
                                <Text key={n} style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }}>{n}</Text>
                            ))}
                        </View>
                    ) : null}
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    <PrimaryCTA label="Send claim" icon={Send} onPress={() => void submit()} loading={busy} />
                </View>
            ) : null}
        </AdminSheet>
    );
}
