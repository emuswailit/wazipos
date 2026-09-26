// components/common/ApiErrorModal.tsx
//
// Universal API error modal.
//
// Dumb component: caller owns `visible`, `message`, `errors`, `origin`,
// `onClose`.
//
// In __DEV__, shows the JS call stack that led to the failing useApi
// hook. In production, `origin` is always [] and the section is hidden.

import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

const DANGER_FG = '#ef4444';
const DANGER_BG = 'rgba(239,68,68,0.12)';
const DANGER_BORDER = 'rgba(239,68,68,0.35)';

export interface FlatFieldError {
    field: string;
    message: string;
}

export interface OriginFrame {
    component: string;
    file: string;
    line: number;
    column: number;
}

interface Props {
    visible: boolean;
    message: string | null;
    errors: FlatFieldError[];
    origin?: OriginFrame[];
    onClose: () => void;
}

export default function ApiErrorModal({
    visible,
    message,
    errors,
    origin,
    onClose,
}: Props) {
    const { theme } = useAuth();

    const text = theme.text;
    const textMuted = theme.textDark;
    const panelBg = theme.panel;
    const border = `${textMuted}33`;
    const divider = `${textMuted}20`;
    const font = theme.font;
    const size = theme.fontSize;

    const hasErrors = errors.length > 0;
    const hasOrigin =
        Array.isArray(origin) && origin.length > 0;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-4">
                <View
                    className="w-full max-w-[480px] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: panelBg,
                        borderColor: border,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center border-b p-4"
                        style={{ borderBottomColor: divider }}
                    >
                        <View
                            className="w-8 h-8 rounded-full items-center justify-center mr-3"
                            style={{ backgroundColor: DANGER_BG }}
                        >
                            <Text
                                style={{
                                    color: DANGER_FG,
                                    fontFamily: font.bold,
                                    fontSize: 18,
                                }}
                            >
                                !
                            </Text>
                        </View>
                        <Text
                            className="flex-1 font-bold"
                            style={{
                                color: text,
                                fontFamily: font.bold,
                                fontSize: size.base,
                            }}
                        >
                            Something went wrong
                        </Text>
                    </View>

                    {/* Body */}
                    <ScrollView
                        className="max-h-[65vh]"
                        contentContainerClassName="p-4"
                    >
                        {message ? (
                            <Text
                                style={{
                                    color: text,
                                    fontFamily: font.medium,
                                    fontSize: size.sm,
                                }}
                            >
                                {message}
                            </Text>
                        ) : null}

                        {hasErrors ? (
                            <View
                                className="rounded-xl border"
                                style={{
                                    borderColor: DANGER_BORDER,
                                    backgroundColor: DANGER_BG,
                                    padding: 12,
                                    marginTop: message ? 12 : 0,
                                }}
                            >
                                {errors.map((e, i) => (
                                    <View
                                        key={`${e.field || 'err'}-${i}`}
                                        style={{
                                            marginTop:
                                                i === 0 ? 0 : 10,
                                        }}
                                    >
                                        {e.field &&
                                            e.field.trim() ? (
                                            <Text
                                                style={{
                                                    color: DANGER_FG,
                                                    fontFamily:
                                                        font.bold,
                                                    fontSize: size.xs,
                                                    textTransform:
                                                        'uppercase',
                                                    letterSpacing: 0.5,
                                                }}
                                            >
                                                {prettifyField(
                                                    e.field
                                                )}
                                            </Text>
                                        ) : null}
                                        <Text
                                            style={{
                                                color: text,
                                                fontFamily:
                                                    font.medium,
                                                fontSize: size.sm,
                                                marginTop:
                                                    e.field &&
                                                        e.field.trim()
                                                        ? 2
                                                        : 0,
                                            }}
                                        >
                                            {e.message}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}

                        {/* ---------- Origin (dev only) ---------- */}
                        {hasOrigin ? (
                            <View
                                className="mt-4 rounded-xl border"
                                style={{
                                    borderColor: `${textMuted}22`,
                                    backgroundColor: `${textMuted}08`,
                                    padding: 12,
                                }}
                            >
                                <View className="flex-row items-center mb-2">
                                    <Text
                                        style={{
                                            color: textMuted,
                                            fontFamily: font.bold,
                                            fontSize: 10,
                                            letterSpacing: 1,
                                        }}
                                    >
                                        ORIGIN
                                    </Text>
                                    <View
                                        className="rounded-full px-2 py-0.5 ml-2"
                                        style={{
                                            backgroundColor:
                                                'rgba(245,158,11,0.15)',
                                            borderWidth: 1,
                                            borderColor:
                                                'rgba(245,158,11,0.35)',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: '#f59e0b',
                                                fontFamily: font.bold,
                                                fontSize: 9,
                                                letterSpacing: 0.5,
                                            }}
                                        >
                                            DEV ONLY
                                        </Text>
                                    </View>
                                </View>

                                {origin!.map((frame, i) => (
                                    <View
                                        key={`${frame.file}-${frame.line}-${i}`}
                                        style={{
                                            marginTop:
                                                i === 0 ? 0 : 8,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: text,
                                                fontFamily:
                                                    font.mono ??
                                                    font.medium,
                                                fontSize: 11,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {frame.file}:{frame.line}
                                        </Text>
                                        <Text
                                            style={{
                                                color: textMuted,
                                                fontFamily:
                                                    font.medium,
                                                fontSize: 10,
                                                marginTop: 1,
                                            }}
                                            numberOfLines={1}
                                        >
                                            in {frame.component}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="border-t p-3 flex-row justify-end"
                        style={{ borderTopColor: divider }}
                    >
                        <Pressable
                            onPress={onClose}
                            className="rounded-xl px-6 min-h-[44px] items-center justify-center"
                            style={{
                                backgroundColor: theme.primary,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-white font-bold"
                                style={{
                                    fontFamily: font.bold,
                                    fontSize: size.xs,
                                }}
                            >
                                OK
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* Convert `accepted_lines.0.product_id` → `Accepted Lines · 0 · Product Id` */
function prettifyField(field: string): string {
    if (!field) return 'Error';
    return field
        .replace(/\.\d+\./g, ' · ')
        .replace(/_/g, ' ')
        .replace(/\./g, ' · ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}