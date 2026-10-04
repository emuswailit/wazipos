import { useAuth } from "@/context/AuthContext";
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useState,
} from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";
import { Modal } from "./Modal";

/* =========================================================
 * Tones
 * ======================================================= */

export type AlertTone = "default" | "success" | "danger";

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

/* =========================================================
 * Tone palettes
 * ======================================================= */

const TONE_PALETTE = {
    success: {
        light: { accent: "#10b981" },
        dark: { accent: "#34d399" },
    },
    danger: {
        light: { accent: "#ef4444" },
        dark: { accent: "#dc2626" },
    },
    default: {
        light: { accent: "#3b82f6" },
        dark: { accent: "#60a5fa" },
    },
};

/* =========================================================
 * Provider
 * ======================================================= */

export function AlertProvider({ children }: { children: ReactNode }) {
    const { theme, isDarkMode } = useAuth();
    const [current, setCurrent] = useState<AlertConfig | null>(null);

    const alert: AlertFn = useCallback(
        (title, message, buttons, tone = "default") => {
            setCurrent({ title, message, buttons, tone });
        },
        []
    );

    const dismiss = (handler?: () => void) => {
        setCurrent(null);
        if (handler) setTimeout(handler, 0);
    };

    const buttons =
        current?.buttons && current.buttons.length > 0
            ? current.buttons
            : [{ text: "OK" }];

    const tone: AlertTone = current?.tone ?? "default";
    const palette = TONE_PALETTE[tone] ?? TONE_PALETTE.default;
    const accent = isDarkMode ? palette.dark.accent : palette.light.accent;

    /* Message text colour rules:
     *   danger  → red      (draws the eye)
     *   success → green
     *   default → normal text
     */
    const messageColor =
        tone === "danger"
            ? accent
            : tone === "success"
                ? accent
                : theme.text;

    const messageWeight =
        tone === "danger" || tone === "success" ? "500" : "400";

    return (
        <AlertContext.Provider value={alert}>
            {children}

            <Modal
                key={current ? "open" : "closed"}
                visible={current !== null}
                onClose={() => dismiss()}
                title={current?.title ?? ""}
                maxHeightRatio={0.6}
            >
                <View style={{ padding: 20, gap: 16 }}>
                    {/* Accent bar — one for every non-default tone */}
                    {tone !== "default" ? (
                        <View
                            style={{
                                height: 3,
                                width: 40,
                                borderRadius: 999,
                                backgroundColor: accent,
                                alignSelf: "center",
                                marginBottom: 4,
                            }}
                        />
                    ) : null}

                    {current?.message ? (
                        <Text
                            style={{
                                color: messageColor,
                                fontSize: 15,
                                lineHeight: 21,
                                fontWeight: messageWeight,
                            }}
                        >
                            {current.message}
                        </Text>
                    ) : null}

                    <View style={{ gap: 8 }}>
                        {buttons.map((b, i) => {
                            // Button variant priority:
                            //   1. explicit `destructive` style → danger
                            //   2. explicit `cancel` style → secondary
                            //   3. tone-driven default → primary / success / danger
                            const variant = (() => {
                                if (b.style === "destructive") {
                                    return "danger";
                                }
                                if (b.style === "cancel") {
                                    return "secondary";
                                }
                                if (tone === "danger") {
                                    return "danger";
                                }
                                if (tone === "success") {
                                    return "primary";
                                }
                                return "primary";
                            })();

                            return (
                                <Button
                                    key={i}
                                    variant={variant as any}
                                    onPress={() => dismiss(b.onPress)}
                                >
                                    {b.text ?? "OK"}
                                </Button>
                            );
                        })}
                    </View>
                </View>
            </Modal>
        </AlertContext.Provider>
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