// app/(retailers)/retailerIndents/IndentEditModal.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerIndent } from '@/databases/types';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

export function IndentEditModal({
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

    useEffect(() => {
        if (!indent) return;
        setIsOpen(toBool(indent.is_open) ? 'true' : 'false');
        setLeadTime(String(indent.lead_time ?? 0));
        setOrderDays(String(indent.order_days ?? 0));
        setPricingPct(
            String(indent.pricing_percentage ?? '0')
        );
        setBudgetEnforced(
            toBool(indent.budget_enforced)
                ? 'true'
                : 'false'
        );
        setBudgetAmount(
            indent.budget_amount
                ? String(indent.budget_amount)
                : ''
        );
    }, [indent]);

    if (!indent) return null;

    /* ---------------------------------------------------------
     * Save — PATCH, then apply response params locally
     * ------------------------------------------------------- */
    const handleSave = async () => {
        if (saving) return;

        setSaving(true);
        console.log(
            '[IndentEditModal] PATCH params for',
            indent.remote_id
        );

        let res: any = null;
        try {
            res =
                await retailersApi.retailerIndentParamsUpdateAction(
                    {
                        indent_id: indent.remote_id,
                        order_days: Number(orderDays) || 0,
                        lead_time: Number(leadTime) || 0,
                        budget_amount: budgetAmount
                            ? Number(budgetAmount)
                            : null,
                        budget_enforced: budgetEnforced,
                        pricing_percentage:
                            Number(pricingPct) || 0,
                    }
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

        console.log(
            '[IndentEditModal] response:',
            res?.status,
            res?.data
        );

        const payload = res?.data ?? res;

        const isOk =
            res?.ok === true ||
            res?.status === 200 ||
            res?.status === 201 ||
            res?.status === 202 ||
            payload?.status === 'accepted' ||
            payload?.status === 'ok';

        if (!isOk) {
            const msg =
                payload?.detail ||
                payload?.message ||
                res?.problem ||
                'Update failed';
            notify('Update Failed', String(msg));
            setSaving(false);
            return;
        }

        /* ---------------------------------------------------
         * Apply the response params to the local row
         * immediately — no waiting for the refetch.
         * ------------------------------------------------- */
        const params = payload?.params ?? {};
        const applied: Partial<RetailerIndent> = {};

        if (params.order_days !== undefined) {
            applied.order_days = Number(params.order_days);
        }
        if (params.lead_time !== undefined) {
            applied.lead_time = Number(params.lead_time);
        }
        if (params.budget_amount !== undefined) {
            applied.budget_amount = params.budget_amount; // string | null
        }
        if (params.budget_enforced !== undefined) {
            applied.budget_enforced = String(
                params.budget_enforced
            );
        }
        if (params.pricing_percentage !== undefined) {
            applied.pricing_percentage = String(
                params.pricing_percentage
            );
        }

        if (Object.keys(applied).length > 0) {
            patchIndentLocally(indent.remote_id, applied);
        }

        /* ---------------------------------------------------
         * Alert summary
         * ------------------------------------------------- */
        const fmt = (v: any) =>
            v === null || v === undefined
                ? '—'
                : String(v);

        const summary = [
            `order_days: ${fmt(
                params.order_days ?? orderDays
            )}`,
            `lead_time: ${fmt(
                params.lead_time ?? leadTime
            )}`,
            `budget_amount: ${params.budget_amount
                ? `KES ${params.budget_amount}`
                : '—'
            }`,
            `budget_enforced: ${fmt(
                params.budget_enforced ?? budgetEnforced
            )}`,
            `pricing_percentage: ${fmt(
                params.pricing_percentage ?? pricingPct
            )}%`,
        ].join('\n');

        notify(
            'Indent Updated',
            `Server accepted the changes.\n\n${summary}`
        );

        setSaving(false);
        onSaved();
    };

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

    return (
        <Modal
            visible={!!indent}
            animationType="fade"
            transparent
            onRequestClose={saving ? () => { } : onClose}
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
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
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
                                    fontSize: theme.fontSize.xs,
                                }}
                                numberOfLines={1}
                            >
                                {indent.entity_title}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            disabled={saving}
                            hitSlop={10}
                            className="p-1.5"
                            style={{
                                opacity: saving ? 0.4 : 1,
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
                                        disabled={saving}
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
                                            opacity: saving
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
                                    editable={!saving}
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
                                    }}
                                />
                            </View>
                            <View className="flex-1">
                                <FieldLabel label="Order Days" />
                                <TextInput
                                    keyboardType="number-pad"
                                    value={orderDays}
                                    onChangeText={setOrderDays}
                                    editable={!saving}
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
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
                                    editable={!saving}
                                    placeholder="0.00"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
                                    }}
                                />
                            </View>
                            <View className="flex-1">
                                <FieldLabel label="Budget Amount" />
                                <TextInput
                                    keyboardType="decimal-pad"
                                    value={budgetAmount}
                                    onChangeText={setBudgetAmount}
                                    editable={!saving}
                                    placeholder="0.00"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
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
                                        disabled={saving}
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
                                            opacity: saving
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
                            disabled={saving}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{
                                borderColor,
                                opacity: saving ? 0.4 : 1,
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
                            disabled={saving}
                            className="px-4 py-2.5 rounded-xl flex-row items-center gap-2"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: saving ? 0.6 : 1,
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
            </KeyboardAvoidingView>
        </Modal>
    );
}

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