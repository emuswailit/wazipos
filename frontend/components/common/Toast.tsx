// components/common/Toast.tsx
//
// Sleek, non-blocking notices that slide in from the top: success after a save,
// warnings and errors worded from the server's response code and message.
//
//   import { toast } from '@/components/common/Toast';
//   toast.success('Order saved', 'Receipt #A12 sent to the customer.');
//   toast.fromResponse(res, 'Could not save the order.');   // picks tone + words from the response
//
// `toast` works anywhere (screens, hooks, the API client) — <ToastHost /> is mounted
// once in the root layout. Blocking decisions still use useAlert().

import { useAuth } from '@/context/AuthContext';
import { describeResponse, type FeedbackTone } from '@/utils/apiFeedback';
import { AlertTriangle, CheckCircle2, Info, WifiOff, X, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ToastOptions {
    tone?: FeedbackTone;
    title: string;
    message?: string;
    /** ms on screen; 0 keeps it until tapped. Defaults by tone. */
    duration?: number;
    action?: { label: string; onPress: () => void };
    /** Same key replaces the visible toast instead of stacking (e.g. 'offline'). */
    key?: string;
}

interface ToastItem extends ToastOptions {
    id: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const MAX_VISIBLE = 3;

function emit() {
    listeners.forEach((l) => l(items));
}

function dismiss(id: number) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    items = items.filter((i) => i.id !== id);
    emit();
}

function show(opts: ToastOptions): number {
    const id = ++seq;
    const tone = opts.tone ?? 'info';
    const duration = opts.duration ?? (tone === 'danger' ? 6500 : tone === 'warning' || tone === 'offline' ? 5000 : 3500);
    if (opts.key) items.filter((i) => i.key === opts.key).forEach((i) => dismiss(i.id));
    items = [...items, { ...opts, tone, id }].slice(-MAX_VISIBLE);
    emit();
    if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration));
    return id;
}

export const toast = {
    show,
    dismiss,
    success: (title: string, message?: string, extra?: Partial<ToastOptions>) => show({ ...extra, tone: 'success', title, message }),
    info: (title: string, message?: string, extra?: Partial<ToastOptions>) => show({ ...extra, tone: 'info', title, message }),
    warning: (title: string, message?: string, extra?: Partial<ToastOptions>) => show({ ...extra, tone: 'warning', title, message }),
    error: (title: string, message?: string, extra?: Partial<ToastOptions>) => show({ ...extra, tone: 'danger', title, message }),
    /** Tone, title and message from an API response (status code, response_code, errors). */
    fromResponse: (res: any, fallback?: string, extra?: Partial<ToastOptions>) => {
        const d = describeResponse(res, fallback);
        return show({ ...extra, tone: d.tone, title: d.title, message: d.message });
    },
};

/* ------------------------------------------------------------------ host */

const TONES: Record<FeedbackTone, { icon: any; color: (t: any) => string }> = {
    success: { icon: CheckCircle2, color: (t) => t.success },
    info: { icon: Info, color: (t) => t.primary },
    warning: { icon: AlertTriangle, color: (t) => t.warning },
    danger: { icon: XCircle, color: (t) => t.danger },
    offline: { icon: WifiOff, color: (t) => t.navyLight ?? t.text },
};

export function ToastHost() {
    const [list, setList] = useState<ToastItem[]>(items);
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();

    useEffect(() => {
        listeners.add(setList);
        return () => {
            listeners.delete(setList);
        };
    }, []);

    if (!list.length) return null;
    const wide = width >= 768;
    return (
        <View
            pointerEvents="box-none"
            style={{
                position: 'absolute', zIndex: 100000, elevation: 100,
                top: insets.top + (Platform.OS === 'web' ? 14 : 8),
                left: wide ? undefined : 12, right: 12,
                width: wide ? 400 : undefined,
                gap: 8,
            }}
        >
            {list.map((t) => (
                <ToastCard key={t.id} item={t} />
            ))}
        </View>
    );
}

function ToastCard({ item }: { item: ToastItem }) {
    const { theme, isDarkMode } = useAuth();
    const anim = useRef(new Animated.Value(0)).current;
    const tone = TONES[item.tone ?? 'info'];
    const color = tone.color(theme);
    const Icon = tone.icon;

    useEffect(() => {
        Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== 'web', damping: 18, stiffness: 220, mass: 0.8 }).start();
    }, [anim]);

    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            }}
        >
            <Pressable
                onPress={() => dismiss(item.id)}
                style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                    paddingVertical: 12, paddingLeft: 12, paddingRight: 10,
                    borderRadius: 16, borderWidth: 1,
                    backgroundColor: isDarkMode ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.98)',
                    borderColor: isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.06)',
                    shadowColor: '#0b1733', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10,
                    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)', cursor: 'pointer' } as any) : null),
                }}
            >
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: `${color}1f`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color={color} strokeWidth={2.3} />
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 14, color: theme.text }} numberOfLines={2}>{item.title}</Text>
                    {item.message ? (
                        <Text style={{ fontFamily: theme.font.regular, fontSize: 12.5, lineHeight: 17, color: theme.textMuted, marginTop: 2 }} numberOfLines={5}>
                            {item.message}
                        </Text>
                    ) : null}
                    {item.action ? (
                        <Pressable
                            onPress={() => {
                                dismiss(item.id);
                                item.action!.onPress();
                            }}
                            hitSlop={6}
                            style={{ alignSelf: 'flex-start', marginTop: 8 }}
                        >
                            <Text style={{ fontFamily: theme.font.bold, fontSize: 12.5, color: theme.primary }}>{item.action.label}</Text>
                        </Pressable>
                    ) : null}
                </View>
                <X size={15} color={theme.textMuted} style={{ marginTop: 2 }} />
            </Pressable>
        </Animated.View>
    );
}

/* -------------------------------------------------- API client monitor */

let lastGlobal: Record<string, number> = {};
function once(key: string, ms: number, fn: () => void) {
    const now = Date.now();
    if ((lastGlobal[key] ?? 0) + ms > now) return;
    lastGlobal[key] = now;
    fn();
}

/**
 * App-wide notices that no single screen owns: lost connection, slow server, an
 * expired session, rate limiting. Screens still report their own business errors,
 * so these are deduplicated and limited to transport/session problems.
 */
export function attachApiToasts(client: { addMonitor: (fn: (res: any) => void) => void }) {
    client.addMonitor((res: any) => {
        if (!res) return;
        const problem = res.problem;
        if (!res.status && (problem === 'NETWORK_ERROR' || problem === 'CONNECTION_ERROR')) {
            once('offline', 15000, () => toast.show({ key: 'net', tone: 'offline', title: "Can't reach WaziPOS", message: 'Check your connection. Work saved on this device will sync when you are back online.' }));
        } else if (!res.status && problem === 'TIMEOUT_ERROR') {
            once('timeout', 15000, () => toast.show({ key: 'net', tone: 'warning', title: 'Slow connection', message: 'The server is taking long to answer. Hang on or try again.' }));
        } else if (res.status === 401) {
            once('401', 30000, () => toast.show({ key: 'auth', tone: 'warning', title: 'Session expired', message: 'Please sign in again to continue.' }));
        } else if (res.status === 429) {
            once('429', 15000, () => toast.show({ key: 'rate', tone: 'warning', title: 'Slow down', message: 'Too many requests at once. Wait a moment and try again.' }));
        }
    });
}

export default toast;
