// components/agents/AgentPayoutAccountSheet.tsx
//
// Agents set up where their users (e.g. a stocktaker's pay) and businesses
// (sales payouts) are paid, while registering them. Uses the shared payout-account
// form: user accounts (forUser) or the business's own (lockedEntity). Saved
// unverified; a WaziPOS admin verifies. Backend: agents/me AgentGet/SavePayoutAccount.

import { agentMeApi } from '@/api/agentsApi';
import type { PayoutAccount, PayoutAccountDetails } from '@/api/payoutAccountsApi';
import { AdminSheet, SheetButton, useListTokens } from '@/components/admin/kit';
import AdminPayoutAccountEditModal from '@/components/admin/payoutAccounts/AdminPayoutAccountEditModal';
import { destinationOf, isActiveAccount } from '@/components/admin/payoutAccounts/payoutAccountsConfig';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { errorText } from '@/utils/apiFeedback';

export interface PayoutTarget {
    user?: string;
    entity?: string;
    title: string;
}

const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';

export default function AgentPayoutAccountSheet({ target, onClose, onSaved }: { target: PayoutTarget | null; onClose: () => void; onSaved?: () => void }) {
    const { theme, border, chipBg } = useListTokens();
    const [accounts, setAccounts] = useState<PayoutAccount[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<PayoutAccount | null | 'new'>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const key = target ? { ...(target.user ? { user: target.user } : {}), ...(target.entity ? { entity: target.entity } : {}) } : null;

    const load = useCallback(async () => {
        if (!key) return;
        setAccounts(null);
        const res: any = await agentMeApi.getPayoutAccounts(key);
        if (ok(res)) {
            setAccounts(res.data.payout_accounts ?? []);
            setError(null);
        } else {
            setAccounts([]);
            setError(errorText(res, 'Could not load payout accounts.'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.user, target?.entity]);

    useEffect(() => {
        if (target) void load();
    }, [target, load]);

    const save = async (details: PayoutAccountDetails) => {
        if (!key) return;
        setSaving(true);
        setFormError(null);
        try {
            const id = editing && editing !== 'new' ? editing.id : undefined;
            const res: any = await agentMeApi.savePayoutAccount(key, details as any, id);
            if (ok(res)) {
                setEditing(null);
                await load();
                onSaved?.();
            } else setFormError(errorText(res, 'Could not save the payout account.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <AdminSheet
                visible={!!target && !editing}
                onClose={onClose}
                title="Payout account"
                subtitle={target ? `Where ${target.title} is paid` : undefined}
                icon="wallet-outline"
                width={520}
                footer={
                    <>
                        <SheetButton label="Close" variant="ghost" onPress={onClose} />
                        <SheetButton label="Add account" icon="add" onPress={() => { setFormError(null); setEditing('new'); }} />
                    </>
                }
            >
                <View style={{ gap: 10 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>
                        {target?.user
                            ? 'Needed before they can work as a stocktaker: their days worked are paid here.'
                            : "The business's sales and settlements are paid here."}{' '}
                        A WaziPOS admin verifies new accounts.
                    </Text>
                    {accounts === null ? <ActivityIndicator color={theme.primary} /> : null}
                    {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
                    {accounts && accounts.length === 0 && !error ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No payout account yet.</Text>
                    ) : null}
                    {(accounts ?? []).map((a) => (
                        <Pressable
                            key={a.id}
                            onPress={() => { setFormError(null); setEditing(a); }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: chipBg }}
                        >
                            <Ionicons name={isActiveAccount(a) ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={isActiveAccount(a) ? '#10b981' : theme.textDark} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>{a.account_name}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {destinationOf(a)} · {isActiveAccount(a) ? 'Active' : 'Inactive'} · {a.is_verified ? 'Verified' : 'Awaiting verification'}
                                </Text>
                            </View>
                            <Ionicons name="create-outline" size={16} color={theme.textDark} />
                        </Pressable>
                    ))}
                </View>
            </AdminSheet>
            <AdminPayoutAccountEditModal
                visible={!!target && !!editing}
                onClose={() => { if (!saving) setEditing(null); }}
                initialData={editing && editing !== 'new' ? editing : null}
                submitting={saving}
                error={formError}
                onSubmit={save}
                forUser={!!target?.user}
                lockedEntity={target?.entity ? { id: target.entity, title: target.title } : null}
            />
        </>
    );
}
