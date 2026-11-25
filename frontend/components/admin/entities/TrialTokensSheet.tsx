// components/admin/entities/TrialTokensSheet.tsx
//
// System super users only: send a business WaziPOS Tokens to try the app, from Entity details.
// At most 100 trial tokens per business in total (backend billing AdminSendTrialTokens
// enforces it; this sheet shows what is left).

import billingApi from '@/api/billingApi';
import { AdminSheet } from '@/components/common/listScreen';
import { toast } from '@/components/common/Toast';
import { InlineNotice, PrimaryCTA } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

export const TRIAL_TOKENS_MAX = 100;

interface Props {
    entity: { id: string; title: string } | null;
    onClose: () => void;
}

interface TrialInfo {
    given: string;
    left: string;
    balance: string;
}

export default function TrialTokensSheet({ entity, onClose }: Props) {
    const { theme } = useAuth();
    const [info, setInfo] = useState<TrialInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [tokens, setTokens] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        setTokens('');
        setNote('');
        setErr(null);
        setInfo(null);
        if (!entity) return;
        let live = true;
        setLoading(true);
        billingApi
            .adminTrialTokens(entity.id)
            .catch(() => null)
            .then((res: any) => {
                if (!live) return;
                setLoading(false);
                if (isServerOk(res)) setInfo(res.data.trial);
                else setErr(describeResponse(res, 'Could not load trial tokens.').message);
            });
        return () => {
            live = false;
        };
    }, [entity?.id]);

    const left = info ? Number(info.left) : TRIAL_TOKENS_MAX;
    const amount = Number(tokens);
    const tooMany = amount > left;
    const ready = !!info && amount > 0 && !tooMany;

    const send = async () => {
        if (!entity || !ready) return;
        setBusy(true);
        setErr(null);
        const res: any = await billingApi.adminSendTrialTokens(entity.id, amount, note.trim() || undefined).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) {
            toast.success('Trial tokens sent', `${amount} tokens to ${entity.title}. Its admins have been emailed.`);
            onClose();
        } else setErr(describeResponse(res, 'Could not send trial tokens.').message);
    };

    const input = { height: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: theme.surfaceAlt, color: theme.text, fontFamily: theme.font.medium, fontSize: 15 } as const;
    const muted = { color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 } as const;

    return (
        <AdminSheet visible={!!entity} onClose={onClose} title="Send trial tokens" subtitle={entity?.title} icon="gift-outline" dismissible={!busy} width={460}>
            <View style={{ gap: 10 }}>
                {loading ? (
                    <ActivityIndicator color={theme.primary} />
                ) : info ? (
                    <Text style={muted}>
                        {left > 0
                            ? `Up to ${TRIAL_TOKENS_MAX} trial tokens per business. ${entity?.title} has had ${Number(info.given)}, so you can send up to ${left} more. Balance now: ${Number(info.balance)} tokens.`
                            : `${entity?.title} has already had the ${TRIAL_TOKENS_MAX} trial tokens allowed.`}
                    </Text>
                ) : null}
                {info && left > 0 ? (
                    <>
                        <TextInput
                            value={tokens}
                            onChangeText={(t) => setTokens(t.replace(/[^0-9]/g, '').slice(0, 3))}
                            placeholder={`Tokens, 1 to ${left}`}
                            placeholderTextColor={theme.textMuted}
                            keyboardType="number-pad"
                            style={input}
                        />
                        {tooMany ? <InlineNotice message={`At most ${left} more tokens for this business.`} /> : null}
                        <TextInput value={note} onChangeText={setNote} placeholder="Note (optional, shown to the business)" placeholderTextColor={theme.textMuted} style={input} />
                    </>
                ) : null}
                {err ? <InlineNotice message={err} /> : null}
                {info && left > 0 ? <PrimaryCTA label="Send tokens" loading={busy} disabled={!ready} onPress={() => void send()} /> : null}
            </View>
        </AdminSheet>
    );
}
