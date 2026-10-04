// components/retailers/retailerIndents/RetailerIndentEditModal.tsx
//
// Edit modal for retailer indent parameters: open state, lead time,
// order days, pricing %, budget amount and budget enforcement.
//
// Behaviour
//   - Optimistic: values are written into local state the moment Save
//     is tapped, so the row on the list updates instantly.
//   - HTTP: `retailerIndentParamsUpdateAction` is called with the new
//     values. On success the server's `params` payload reconciles the
//     local row.
//   - On failure the previous values are restored and an inline error
//     banner shows the server's response_message / errors.
//
// Offline-queueable parameter edits (an INDENT_UPDATE op kind) is a
// follow-up — for now a failed save simply reverts.

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerIndent } from '@/databases/types';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Helpers
 * ======================================================= */

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

function extractServerMessage(payload: any): string {
    if (!payload) return '';
    const flat =
        payload.response_message ??
        payload.message ??
        payload.detail;
    return typeof flat === 'string' ? flat.trim() : '';
}

function extractServerErrors(payload: any): string[] {
    if (!payload?.errors) return [];
    const raw = payload.errors;
    if (Array.isArray(raw)) {
        return raw
            .map((e: any) =>
                typeof e === 'string'
                    ? e
                    : JSON.stringify(e),
            )
            .filter(Boolean);
    }
    if (typeof raw === 'object') {
        const out: string[] = [];
        for (const [key, val] of Object.entries(raw)) {
            if (Array.isArray(val)) {
                for (const msg of val) {
                    out.push(`${key}: ${String(msg)}`);
                }
            } else {
                out.push(`${key}: ${String(val)}`);
            }
        }
        return out;
    }
    return [String(raw)];
}

/* =========================================================
 * Component
 * ======================================================= */

function RetailerIndentEditModal({
    indent,
    onClose,
    onSaved,
}: {
    indent: RetailerIndent | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { theme } = useAuth();
    const { patchIndentLocally } = useRetailerIndentsSync();

    const [isOpen, setIsOpen] = useState('true');
    const [leadTime, setLeadTime] = useState('0');
    const [orderDays, setOrderDays] = useState('0');
    const [pricingPct, setPricingPct] = useState('0');
    const [budgetEnforced, setBudgetEnforced] =
        useState('false');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(
        null,
    );

    useEffect(() => {
        if (!indent) return;
        setIsOpen(toBool(indent.is_open) ? 'true' : 'false');
        setLeadTime(String(indent.lead_time ?? 0));
        setOrderDays(String(indent.order_days ?? 0));
        setPricingPct(
            String(indent.pricing_percentage ?? '0'),
        );
        setBudgetEnforced(
            toBool(indent.budget_enforced)
                ? 'true'
                : 'false',
        );
        setBudgetAmount(
            indent.budget_amount
                ? String(indent.budget_amount)
                : '',
        );
        setSaving(false);
        setErrorText(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [indent?.remote_id]);

    if (!indent) return null;

    /* ── Save ─────────────────────────────────────────────── */

    const handleSave = async () => {
        if (saving) return;

        /* Snapshot the current local values so we can roll back if
         * the server rejects the change. */
        const previous: Partial<RetailerIndent> = {
            is_open: indent.is_open,
            lead_time: indent.lead_time,
            order_days: indent.order_days,
            pricing_percentage: indent.pricing_percentage,
            budget_amount: indent.budget_amount,
            budget_enforced: indent.budget_enforced,
        };

        /* New values, typed for the wire payload. */
        const nextParams = {
            order_days: Number(orderDays) || 0,
            lead_time: Number(leadTime) || 0,
            budget_amount: budgetAmount
                ? Number(budgetAmount)
                : null,
            budget_enforced: budgetEnforced,
            pricing_percentage: Number(pricingPct) || 0,
        };

        /* Optimistic local write — the list row flips immediately. */
        patchIndentLocally(indent.remote_id, {
            is_open: isOpen,
            lead_time: nextParams.lead_time,
            order_days: nextParams.order_days,
            pricing_percentage: String(
                nextParams.pricing_percentage,
            ),
            budget_amount:
                nextParams.budget_amount === null
                    ? null
                    : String(nextParams.budget_amount),
            budget_enforced: nextParams.budget_enforced,
        });

        setSaving(true);
        setErrorText(null);

        let res: any = null;
        try {
            res =
                await retailersApi.retailerIndentParamsUpdateAction(
                    {
                        indent_id: indent.remote_id,
                        ...nextParams,
                    },
                );
        } catch (e: any) {
            res = {
                ok: false,
                problem: 'exception',
                data: {
                    detail: e?.message || 'Request threw',
                },
            };
        }

        const payload = res?.data ?? res;

        const isOk =
            res?.ok === true ||
            res?.status === 200 ||
            res?.status === 201 ||
            res?.status === 202 ||
            payload?.status === 'accepted' ||
            payload?.status === 'ok' ||
            String(payload?.response_code ?? '') === '0';

        if (!isOk) {
            /* Roll back the optimistic write. */
            patchIndentLocally(indent.remote_id, previous);

            const serverMessage =
                extractServerMessage(payload);
            const serverErrors =
                extractServerErrors(payload);

            const parts: string[] = [];
            if (serverMessage) parts.push(serverMessage);
            if (serverErrors.length > 0) {
                parts.push(serverErrors.join('\n'));
            }
            if (parts.length === 0) {
                parts.push(
                    res?.problem
                        ? `Update failed (${res.problem}).`
                        : 'Update failed.',
                );
            }

            setErrorText(parts.join('\n\n'));
            setSaving(false);
            return;
        }

        /* Success — reconcile with the server's canonical params if
         * the response included them. Otherwise our optimistic write
         * already matches what the server accepted. */
        const params = payload?.params ?? {};
        const applied: Partial<RetailerIndent> = {};

        if (params.order_days !== undefined) {
            applied.order_days = Number(params.order_days);
        }
        if (params.lead_time !== undefined) {
            applied.lead_time = Number(params.lead_time);
        }
        if (params.budget_amount !== undefined) {
            applied.budget_amount = params.budget_amount;
        }
        if (params.budget_enforced !== undefined) {
            applied.budget_enforced = String(
                params.budget_enforced,
            );
        }
        if (params.pricing_percentage !== undefined) {
            applied.pricing_percentage = String(
                params.pricing_percentage,
            );
        }
        if (params.is_open !== undefined) {
            applied.is_open = String(params.is_open);
        }

        if (Object.keys(applied).length > 0) {
            patchIndentLocally(indent.remote_id, applied);
        }

        setSaving(false);
        onSaved();
    };

    /* ── Styling ──────────────────────────────────────────── */

    const borderColor = theme.isDarkMode
        ? '#334155'
        : '#e2e8f0';
    const dividerColor = theme.isDarkMode
        ? '#334155'
        : '#f1f5f9';
    const inputBg = theme.isDarkMode
        ? '#0f172a'
        : '#f8fafc';

    const inputStyle = {
        borderColor,
        backgroundColor: inputBg,
        color: theme.text,
        fontFamily: theme.font.medium,
        fontSize: theme.fontSize.sm,
    };

    const busy = saving;

    /* ── Render ───────────────────────────────────────────── */

    return (
        <Modal
            visible={!!indent}
            animationType="fade"
            transparent
            onRequestClose={busy ? undefined : onClose}
        >
            <KeyboardAvoidingView
                className="flex-1 bg-black/55 items-center justify-center p-4"
                behavior={
                    Platform.OS === 'ios'
                        ? 'padding'
                        : undefined
                }
            >
                <View
                    className="w-full max-w-[560px] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{
                            borderBottomColor: dividerColor,
                        }}
                    >
                        <View className="flex-1 min-w-0 pr-3">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize:
                                        theme.fontSize.lg,
                                }}
                            >
                                Edit Indent Parameters
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize:
                                        theme.fontSize.xs,
                                }}
                                numberOfLines={1}
                            >
                                {indent.entity_title ||
                                    indent.remote_id}
                            </Text>
                        </View>
                        <Pressable
                            onPress={
                                busy ? undefined : onClose
                            }
                            disabled={busy}
                            hitSlop={10}
                            className="p-1.5"
                            style={{
                                opacity: busy ? 0.4 : 1,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize:
                                        theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Form */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {errorText ? (
                            <View
                                style={{
                                    backgroundColor:
                                        'rgba(220,38,38,0.1)',
                                    borderColor:
                                        'rgba(220,38,38,0.35)',
                                    borderWidth: 1,
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    marginBottom: 16,
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#dc2626',
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                    }}
                                >
                                    {errorText}
                                </Text>
                            </View>
                        ) : null}

                        {/* Status */}
                        <FieldLabel label="Status" />
                        <View className="flex-row gap-2 mb-4">
                            {['true', 'false'].map((v) => {
                                const selected = isOpen === v;
                                return (
                                    <Pressable
                                        key={v}
                                        onPress={() =>
                                            setIsOpen(v)
                                        }
                                        disabled={busy}
                                        className="flex-1 py-2.5 rounded-xl border items-center"
                                        style={{
                                            borderColor:
                                                selected
                                                    ? theme.primary
                                                    : borderColor,
                                            backgroundColor:
                                                selected
                                                    ? `${theme.primary}15`
                                                    : 'transparent',
                                            opacity: busy
                                                ? 0.6
                                                : 1,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: selected
                                                    ? theme.primary
                                                    : theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 12,
                                            }}
                                        >
                                            {v === 'true'
                                                ? 'Open'
                                                : 'Closed'}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Lead / Order */}
                        <View className="flex-row gap-3 mb-4">
                            <View className="flex-1">
                                <FieldLabel label="Lead Time (days)" />
                                <TextInput
                                    keyboardType="number-pad"
                                    value={leadTime}
                                    onChangeText={setLeadTime}
                                    editable={!busy}
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: busy ? 0.6 : 1,
                                    }}
                                />
                            </View>
                            <View className="flex-1">
                                <FieldLabel label="Order Days" />
                                <TextInput
                                    keyboardType="number-pad"
                                    value={orderDays}
                                    onChangeText={setOrderDays}
                                    editable={!busy}
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: busy ? 0.6 : 1,
                                    }}
                                />
                            </View>
                        </View>

                        {/* Pricing / Budget */}
                        <View className="flex-row gap-3 mb-4">
                            <View className="flex-1">
                                <FieldLabel label="Pricing %" />
                                <TextInput
                                    keyboardType="decimal-pad"
                                    value={pricingPct}
                                    onChangeText={setPricingPct}
                                    editable={!busy}
                                    placeholder="0.00"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: busy ? 0.6 : 1,
                                    }}
                                />
                            </View>
                            <View className="flex-1">
                                <FieldLabel label="Budget Amount" />
                                <TextInput
                                    keyboardType="decimal-pad"
                                    value={budgetAmount}
                                    onChangeText={setBudgetAmount}
                                    editable={!busy}
                                    placeholder="0.00"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: busy ? 0.6 : 1,
                                    }}
                                />
                            </View>
                        </View>

                        {/* Budget enforced */}
                        <FieldLabel label="Budget Enforced" />
                        <View className="flex-row gap-2 mb-2">
                            {['true', 'false'].map((v) => {
                                const selected =
                                    budgetEnforced === v;
                                return (
                                    <Pressable
                                        key={v}
                                        onPress={() =>
                                            setBudgetEnforced(v)
                                        }
                                        disabled={busy}
                                        className="flex-1 py-2.5 rounded-xl border items-center"
                                        style={{
                                            borderColor:
                                                selected
                                                    ? theme.primary
                                                    : borderColor,
                                            backgroundColor:
                                                selected
                                                    ? `${theme.primary}15`
                                                    : 'transparent',
                                            opacity: busy
                                                ? 0.6
                                                : 1,
                                        }}
                                    >
                                        <Text
                                            className="uppercase tracking-wide"
                                            style={{
                                                color: selected
                                                    ? theme.primary
                                                    : theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 12,
                                            }}
                                        >
                                            {v === 'true'
                                                ? 'Yes'
                                                : 'No'}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t"
                        style={{
                            borderTopColor: dividerColor,
                        }}
                    >
                        <Pressable
                            onPress={onClose}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{
                                borderColor,
                                opacity: busy ? 0.4 : 1,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                Cancel
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSave}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl flex-row items-center gap-2"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: busy ? 0.6 : 1,
                                minHeight: 40,
                            }}
                        >
                            {saving && (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            )}
                            <Text
                                className="uppercase tracking-wide text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Blocking overlay while saving */}
                {busy ? (
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor:
                                'rgba(0,0,0,0.35)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                        }}
                    >
                        <View
                            className="rounded-2xl px-6 py-5 items-center"
                            style={{
                                backgroundColor: theme.panel,
                                minWidth: 200,
                            }}
                        >
                            <ActivityIndicator
                                size="large"
                                color={theme.primary}
                            />
                            <Text
                                className="mt-3"
                                style={{
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.bold,
                                    fontSize:
                                        theme.fontSize.sm,
                                }}
                            >
                                Saving changes…
                            </Text>
                        </View>
                    </View>
                ) : null}
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* =========================================================
 * Field label
 * ======================================================= */

function FieldLabel({ label }: { label: string }) {
    const { theme } = useAuth();
    return (
        <Text
            className="uppercase tracking-widest mb-1.5"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
            }}
        >
            {label}
        </Text>
    );
}

export default RetailerIndentEditModal;