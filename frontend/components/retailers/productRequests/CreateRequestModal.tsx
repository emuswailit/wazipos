// components/retailers/productRequests/CreateRequestModal.tsx

import { useAuth } from '@/context/AuthContext';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

/* =========================================================
 * Props
 * ======================================================= */

interface DraftLine {
    product_id: string;
    product_title?: string;
    requested_quantity: number;
    urgency?: 'low' | 'medium' | 'high';
    note?: string;
    target_wholesaler_ids?: string[];
    target_wholesaler_titles?: string[];
}

interface Props {
    visible: boolean;
    onClose: () => void;
    /**
     * Called with the full set of lines the user added in the
     * modal. The caller (RetailerProductRequestsList) forwards
     * each line to `addDraftItem`.
     */
    onSubmit: (payload: {
        items: DraftLine[];
        urgency?: 'low' | 'medium' | 'high';
        note?: string;
    }) => void | Promise<void>;
}

const URGENCY_OPTIONS: Array<{
    value: 'low' | 'medium' | 'high';
    label: string;
}> = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
    ];

/* =========================================================
 * Component
 * ======================================================= */

export function CreateRequestModal({
    visible,
    onClose,
    onSubmit,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const subBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const [lines, setLines] = useState<DraftLine[]>([]);
    const [overallNote, setOverallNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* Reset on open */
    useEffect(() => {
        if (!visible) return;
        setLines([]);
        setOverallNote('');
        setIsSubmitting(false);
    }, [visible]);

    /* ---------------- Line mutation ---------------- */
    const addEmptyLine = useCallback(() => {
        setLines((prev) => [
            ...prev,
            {
                product_id: '',
                product_title: '',
                requested_quantity: 1,
                urgency: 'medium',
                note: '',
            },
        ]);
    }, []);

    const removeLine = useCallback((index: number) => {
        setLines((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const updateLine = useCallback(
        (index: number, patch: Partial<DraftLine>) => {
            setLines((prev) =>
                prev.map((l, i) =>
                    i === index ? { ...l, ...patch } : l
                )
            );
        },
        []
    );

    /* ---------------- Submit ---------------- */
    const handleSubmit = useCallback(async () => {
        if (isSubmitting) return;

        const cleaned = lines.filter(
            (l) =>
                l.product_id.trim().length > 0 &&
                l.requested_quantity > 0
        );
        if (cleaned.length === 0) return;

        setIsSubmitting(true);
        try {
            await onSubmit({
                items: cleaned,
                note: overallNote || undefined,
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [lines, overallNote, onSubmit, isSubmitting]);

    if (!visible) return null;

    const canSubmit =
        !isSubmitting &&
        lines.some(
            (l) =>
                l.product_id.trim().length > 0 &&
                l.requested_quantity > 0
        );

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[720px] max-h-[92%] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                            >
                                New request
                            </Text>
                            <Text
                                className="mt-0.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                Lines are added to your open draft
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            className="p-1.5"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                    >
                        {lines.length === 0 ? (
                            <View
                                className="rounded-xl p-6 items-center"
                                style={{ backgroundColor: subBg }}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                    }}
                                >
                                    No lines yet. Add one below.
                                </Text>
                            </View>
                        ) : (
                            lines.map((line, idx) => (
                                <View
                                    key={idx}
                                    className="rounded-xl border p-3 mb-2"
                                    style={{
                                        backgroundColor: subBg,
                                        borderColor,
                                    }}
                                >
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text
                                            className="uppercase tracking-widest"
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize: 10,
                                            }}
                                        >
                                            Line {idx + 1}
                                        </Text>
                                        <Pressable
                                            onPress={() =>
                                                removeLine(idx)
                                            }
                                            hitSlop={8}
                                        >
                                            <Text
                                                style={{
                                                    color: '#ef4444',
                                                    fontFamily:
                                                        theme.font
                                                            .bold,
                                                    fontSize: 11,
                                                }}
                                            >
                                                Remove
                                            </Text>
                                        </Pressable>
                                    </View>

                                    <TextInput
                                        value={line.product_id}
                                        onChangeText={(v) =>
                                            updateLine(idx, {
                                                product_id: v,
                                            })
                                        }
                                        placeholder="Product ID"
                                        placeholderTextColor="#94a3b8"
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                        className="h-10 rounded-lg border px-3 mb-2"
                                        style={{
                                            borderColor,
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                            backgroundColor:
                                                isDarkMode
                                                    ? '#0f172a'
                                                    : '#ffffff',
                                        }}
                                    />

                                    <TextInput
                                        value={line.product_title ?? ''}
                                        onChangeText={(v) =>
                                            updateLine(idx, {
                                                product_title: v,
                                            })
                                        }
                                        placeholder="Product title (optional)"
                                        placeholderTextColor="#94a3b8"
                                        className="h-10 rounded-lg border px-3 mb-2"
                                        style={{
                                            borderColor,
                                            color: theme.text,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                            backgroundColor:
                                                isDarkMode
                                                    ? '#0f172a'
                                                    : '#ffffff',
                                        }}
                                    />

                                    <View className="flex-row gap-2 mb-2">
                                        <TextInput
                                            value={String(
                                                line.requested_quantity
                                            )}
                                            onChangeText={(v) => {
                                                const digits =
                                                    v.replace(
                                                        /[^0-9]/g,
                                                        ''
                                                    );
                                                const n =
                                                    parseInt(
                                                        digits,
                                                        10
                                                    );
                                                updateLine(idx, {
                                                    requested_quantity:
                                                        Number.isFinite(
                                                            n
                                                        ) &&
                                                            n > 0
                                                            ? n
                                                            : 1,
                                                });
                                            }}
                                            keyboardType="number-pad"
                                            className="flex-1 h-10 rounded-lg border px-3 text-center"
                                            style={{
                                                borderColor,
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize:
                                                    theme.fontSize
                                                        .base,
                                                backgroundColor:
                                                    isDarkMode
                                                        ? '#0f172a'
                                                        : '#ffffff',
                                            }}
                                        />
                                    </View>

                                    <View className="flex-row gap-1.5">
                                        {URGENCY_OPTIONS.map((u) => (
                                            <Pressable
                                                key={u.value}
                                                onPress={() =>
                                                    updateLine(idx, {
                                                        urgency:
                                                            u.value,
                                                    })
                                                }
                                                className="flex-1 py-2 rounded-lg border items-center"
                                                style={{
                                                    borderColor:
                                                        line.urgency ===
                                                            u.value
                                                            ? theme.primary
                                                            : borderColor,
                                                    backgroundColor:
                                                        line.urgency ===
                                                            u.value
                                                            ? `${theme.primary}15`
                                                            : isDarkMode
                                                                ? '#0f172a'
                                                                : '#ffffff',
                                                }}
                                            >
                                                <Text
                                                    className="uppercase tracking-wide"
                                                    style={{
                                                        color:
                                                            line.urgency ===
                                                                u.value
                                                                ? theme.primary
                                                                : theme.textDark,
                                                        fontFamily:
                                                            theme
                                                                .font
                                                                .bold,
                                                        fontSize: 10,
                                                    }}
                                                >
                                                    {u.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                            ))
                        )}

                        <Pressable
                            onPress={addEmptyLine}
                            className="py-3 rounded-xl border items-center mt-1"
                            style={{
                                borderColor: theme.primary,
                                borderStyle: 'dashed',
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                + Add line
                            </Text>
                        </Pressable>

                        {/* Overall note */}
                        <Text
                            className="uppercase tracking-widest mb-2 mt-4"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                            }}
                        >
                            Overall note (optional)
                        </Text>
                        <TextInput
                            value={overallNote}
                            onChangeText={setOverallNote}
                            placeholder="Anything you want wholesalers to know"
                            placeholderTextColor="#94a3b8"
                            multiline
                            numberOfLines={2}
                            className="rounded-xl border px-3 py-2 min-h-[60px]"
                            style={{
                                borderColor,
                                backgroundColor: subBg,
                                color: theme.text,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                            }}
                        />
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{ borderColor }}
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
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            className="px-4 py-2.5 rounded-xl"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: canSubmit ? 1 : 0.5,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                {isSubmitting
                                    ? 'Adding...'
                                    : `Add to draft (${lines.length})`}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}