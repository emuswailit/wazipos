// components/common/ApiErrorModal.tsx
//
// Universal API error dialog.
//
// Dumb component: caller owns `visible` and `onClose`. Either pass `message` /
// `errors` yourself, or pass the raw `response` and the dialog words itself from
// the status code, response_code, response_message and field errors.
//
// In __DEV__, shows the JS call stack that led to the failing useApi hook.

import { useAuth } from '@/context/AuthContext';
import { describeResponse, prettyField, type FeedbackTone } from '@/utils/apiFeedback';
import { AlertTriangle, RefreshCw, WifiOff, XCircle } from 'lucide-react-native';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

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
    message?: string | null;
    errors?: FlatFieldError[];
    origin?: OriginFrame[];
    onClose: () => void;
    /** Headline (default from the response, else "Something went wrong"). */
    title?: string;
    /** Raw apisauce response: fills title, message, errors and tone. */
    response?: any;
    /** Shows a "Try again" button. */
    onRetry?: () => void;
}

export default function ApiErrorModal({ visible, message, errors = [], origin, onClose, title, response, onRetry }: Props) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const font = theme.font;

    const d = response ? describeResponse(response, message ?? undefined) : null;
    const tone: FeedbackTone = d?.tone ?? 'danger';
    const headline = title ?? d?.title ?? 'Something went wrong';
    const body = message ?? d?.message ?? null;
    const fieldList = errors.length ? errors : (d?.fields ?? []);
    // When the body already lists the field reasons (describeResponse joins them), don't repeat.
    const showFields = fieldList.length > 0 && !(body && fieldList.every((f) => body.includes(f.message)));
    const hasOrigin = Array.isArray(origin) && origin.length > 0;

    const color = tone === 'offline' ? (theme.navyLight ?? theme.textMuted) : tone === 'warning' ? theme.warning : theme.danger;
    const Icon = tone === 'offline' ? WifiOff : tone === 'warning' ? AlertTriangle : XCircle;
    const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

    return (
        <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: isDarkMode ? 'rgba(2,6,23,0.72)' : 'rgba(11,23,51,0.45)' }}>
                <View
                    accessibilityRole="alert"
                    style={{
                        width: '100%', maxWidth: Math.min(460, width - 40),
                        backgroundColor: theme.panel, borderRadius: 24, borderWidth: 1, borderColor: theme.border,
                        overflow: 'hidden',
                        shadowColor: '#0b1733', shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 24,
                    }}
                >
                    <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 22, paddingBottom: 8 }}>
                        <View style={{ alignItems: 'center' }}>
                            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: `${color}1c`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                                <Icon size={26} color={color} strokeWidth={2.2} />
                            </View>
                            <Text style={{ color: theme.text, fontFamily: font.bold, fontSize: 17, textAlign: 'center', letterSpacing: -0.2 }}>{headline}</Text>
                            {body ? (
                                <Text style={{ color: theme.textMuted, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 }}>{body}</Text>
                            ) : null}
                        </View>

                        {showFields ? (
                            <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: `${theme.danger}12`, padding: 14, gap: 10 }}>
                                {fieldList.map((e, i) => (
                                    <View key={`${e.field || 'err'}-${i}`} style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.danger, marginTop: 7 }} />
                                        <View style={{ flex: 1 }}>
                                            {e.field?.trim() ? (
                                                <Text style={{ color: theme.danger, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>{prettyField(e.field)}</Text>
                                            ) : null}
                                            <Text style={{ color: theme.text, fontFamily: font.medium, fontSize: 13.5, lineHeight: 19 }}>{e.message}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}

                        {d?.status ? (
                            <Text style={{ color: theme.textMuted, fontFamily: font.medium, fontSize: 11, textAlign: 'center', marginTop: 12 }}>Code {d.status}</Text>
                        ) : null}

                        {hasOrigin ? (
                            <View style={{ marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt, padding: 12 }}>
                                <Text style={{ color: theme.warning, fontFamily: font.bold, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>ORIGIN · DEV ONLY</Text>
                                {origin!.map((frame, i) => (
                                    <View key={`${frame.file}-${frame.line}-${i}`} style={{ marginTop: i === 0 ? 0 : 8 }}>
                                        <Text style={{ color: theme.text, fontFamily: font.mono ?? font.medium, fontSize: 11 }} numberOfLines={1}>
                                            {frame.file}:{frame.line}
                                        </Text>
                                        <Text style={{ color: theme.textMuted, fontFamily: font.medium, fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                                            in {frame.component}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </ScrollView>

                    <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingTop: 12 }}>
                        {onRetry ? (
                            <Pressable
                                onPress={() => {
                                    onClose();
                                    onRetry();
                                }}
                                accessibilityRole="button"
                                style={{ flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: theme.surfaceAlt, ...pointer }}
                            >
                                <RefreshCw size={15} color={theme.text} strokeWidth={2.3} />
                                <Text style={{ color: theme.text, fontFamily: font.bold, fontSize: 14.5 }}>Try again</Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            onPress={onClose}
                            accessibilityRole="button"
                            style={{ flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, ...pointer }}
                        >
                            <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 14.5 }}>OK</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
