// components/common/AlertProvider.tsx
//
// useAlert(): a blocking dialog for decisions and important outcomes (same call
// shape as React Native's Alert.alert, plus a tone). For passing notices prefer
// `toast` from ./Toast.
//
//   const alert = useAlert();
//   alert('Not saved', errorText(res, 'Could not save.'), undefined, 'danger');
//   alertResponse(alert, res, 'Could not save.');   // tone + words from the response

import { useAuth } from "@/context/AuthContext";
import { describeResponse } from "@/utils/apiFeedback";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, WifiOff, XCircle } from "lucide-react-native";
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { Alert as RNAlert, Animated, Modal as RNModal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

/* =========================================================
 * Types
 * ======================================================= */

export type AlertTone = "default" | "success" | "danger" | "warning" | "info" | "offline";

export interface AlertButton {
    text?: string;
    onPress?: () => void;
    style?: "default" | "cancel" | "destructive";
}

interface AlertConfig {
    title: string;
    message?: string;
    buttons?: AlertButton[];
    tone?: AlertTone;
}

type AlertFn = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    tone?: AlertTone
) => void;

const AlertContext = createContext<AlertFn | undefined>(undefined);

/** Show a server response as a dialog: tone, title and message from its status / response_code. */
export function alertResponse(alert: AlertFn, res: any, fallback?: string, buttons?: AlertButton[]) {
    const d = describeResponse(res, fallback);
    alert(d.title, d.message, buttons, d.tone === "danger" ? "danger" : d.tone);
}

/* =========================================================
 * Provider
 * ======================================================= */

/*
 * React Native's Alert.alert does nothing on web and looks different on every
 * platform. While the provider is mounted, Alert.alert(...) anywhere in the app
 * opens this dialog instead (same arguments), so older screens get it for free.
 */
const nativeAlert = RNAlert.alert.bind(RNAlert);
let bridge: AlertFn | null = null;
(RNAlert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: any) => {
    if (bridge) {
        const destructive = buttons?.some((b) => b.style === "destructive");
        bridge(String(title ?? ""), message ?? undefined, buttons, destructive ? "warning" : guessTone(String(title ?? "")));
    } else {
        nativeAlert(title, message, buttons as any, options);
    }
};

/** Tone from wording when a caller didn't give one (Alert.alert has no tone). */
function guessTone(title: string): AlertTone {
    const t = title.toLowerCase();
    if (/(error|fail|could not|couldn't|not (saved|sent|placed|created|allowed|found)|invalid|denied|rejected|unable)/.test(t)) return "danger";
    if (/(success|saved|done|sent|created|paid|complete|approved|added|updated)/.test(t)) return "success";
    if (/(offline|connection|network)/.test(t)) return "offline";
    if (/(warning|careful|sure|confirm|delete|remove|cancel)/.test(t)) return "warning";
    return "default";
}

export function AlertProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<AlertConfig[]>([]);
    const current = queue[0] ?? null;

    const alert: AlertFn = useCallback((title, message, buttons, tone = "default") => {
        // Queue, so a second alert raised while one is open isn't lost.
        setQueue((q) => [...q, { title, message, buttons, tone }]);
    }, []);

    useEffect(() => {
        bridge = alert;
        return () => {
            if (bridge === alert) bridge = null;
        };
    }, [alert]);

    const dismiss = (handler?: () => void) => {
        setQueue((q) => q.slice(1));
        if (handler) setTimeout(handler, 0);
    };

    return (
        <AlertContext.Provider value={alert}>
            {children}
            <AlertDialog config={current} onDismiss={dismiss} />
        </AlertContext.Provider>
    );
}

function AlertDialog({ config, onDismiss }: { config: AlertConfig | null; onDismiss: (handler?: () => void) => void }) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const anim = useRef(new Animated.Value(0)).current;
    const visible = !!config;

    useEffect(() => {
        if (visible) {
            anim.setValue(0);
            Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", damping: 20, stiffness: 260, mass: 0.7 }).start();
        }
    }, [visible, config, anim]);

    const tone: AlertTone = config?.tone ?? "default";
    const hasChoice = (config?.buttons?.length ?? 0) > 1;
    const toneMap: Record<AlertTone, { icon: any; color: string }> = {
        default: { icon: hasChoice ? HelpCircle : Info, color: theme.primary },
        info: { icon: Info, color: theme.primary },
        success: { icon: CheckCircle2, color: theme.success },
        danger: { icon: XCircle, color: theme.danger },
        warning: { icon: AlertTriangle, color: theme.warning },
        offline: { icon: WifiOff, color: theme.navyLight ?? theme.textMuted },
    };
    const { icon: Icon, color } = toneMap[tone] ?? toneMap.default;

    const buttons: AlertButton[] = config?.buttons && config.buttons.length > 0 ? config.buttons : [{ text: "OK" }];
    // Two buttons sit side by side (Cancel | Confirm); more stack.
    const row = buttons.length === 2;
    const ordered = row ? [...buttons].sort((a, b) => (a.style === "cancel" ? -1 : b.style === "cancel" ? 1 : 0)) : buttons;

    return (
        <RNModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => onDismiss(buttons.find((b) => b.style === "cancel")?.onPress)}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: isDarkMode ? "rgba(2,6,23,0.72)" : "rgba(11,23,51,0.45)" }}>
                <Animated.View
                    accessibilityRole="alert"
                    style={{
                        width: "100%",
                        maxWidth: Math.min(400, width - 40),
                        backgroundColor: theme.panel,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: theme.border,
                        paddingTop: 24,
                        paddingHorizontal: 20,
                        paddingBottom: 16,
                        opacity: anim,
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
                        shadowColor: "#0b1733", shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 24,
                    }}
                >
                    <View style={{ alignItems: "center" }}>
                        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: `${color}1c`, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                            <Icon size={26} color={color} strokeWidth={2.2} />
                        </View>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 17, color: theme.text, textAlign: "center", letterSpacing: -0.2 }}>{config?.title}</Text>
                    </View>
                    {config?.message ? (
                        <ScrollView style={{ maxHeight: 260, marginTop: 8 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
                            <Text style={{ fontFamily: theme.font.regular, fontSize: 14, lineHeight: 20, color: theme.textMuted, textAlign: "center" }}>
                                {config.message}
                            </Text>
                        </ScrollView>
                    ) : null}

                    <View style={{ flexDirection: row ? "row" : "column", gap: 8, marginTop: 20 }}>
                        {ordered.map((b, i) => {
                            const isCancel = b.style === "cancel";
                            const isDestructive = b.style === "destructive";
                            const primaryish = !isCancel;
                            const bg = isCancel
                                ? theme.surfaceAlt
                                : isDestructive || tone === "danger"
                                    ? theme.danger
                                    : theme.primary;
                            return (
                                <Pressable
                                    key={i}
                                    onPress={() => onDismiss(b.onPress)}
                                    accessibilityRole="button"
                                    // Plain style object: NativeWind drops function styles on native.
                                    style={{
                                        flex: row ? 1 : undefined,
                                        height: 48,
                                        borderRadius: 14,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: bg,
                                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                                    }}
                                >
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: 14.5, color: primaryish ? "#fff" : theme.text }}>{b.text ?? "OK"}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </Animated.View>
            </View>
        </RNModal>
    );
}

/* =========================================================
 * Hook
 * ======================================================= */

export function useAlert(): AlertFn {
    const ctx = useContext(AlertContext);
    if (!ctx) {
        throw new Error("useAlert must be used inside <AlertProvider />");
    }
    return ctx;
}
