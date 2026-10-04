import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { Text, View } from "react-native";

type Tone = "primary" | "success" | "warning" | "danger" | "neutral";

interface Props {
    children: ReactNode;
    tone?: Tone;
    className?: string;
}

/**
 * Semantic tones aren't carried by ThemeShape — kept here.
 * Swap for theme keys if the theme grows them.
 */
const TONES = {
    light: {
        primary: { bg: "#e0edfb", fg: "#0056b3" },
        success: { bg: "#dcfce7", fg: "#166534" },
        warning: { bg: "#fef3c7", fg: "#92400e" },
        danger: { bg: "#fee2e2", fg: "#991b1b" },
        neutral: { bg: "#f1f5f9", fg: "#334155" },
    },
    dark: {
        primary: { bg: "#0b2545", fg: "#5b9cff" },
        success: { bg: "#064e3b", fg: "#6ee7b7" },
        warning: { bg: "#78350f", fg: "#fcd34d" },
        danger: { bg: "#7f1d1d", fg: "#fca5a5" },
        neutral: { bg: "#1e293b", fg: "#cbd5e1" },
    },
};

export function Badge({ children, tone = "neutral", className = "" }: Props) {
    const { isDarkMode } = useAuth();
    const palette = isDarkMode ? TONES.dark : TONES.light;
    const { bg, fg } = palette[tone];

    return (
        <View
            style={{
                backgroundColor: bg,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
                alignSelf: "flex-start",
            }}
            className={className}
        >
            <Text
                style={{
                    color: fg,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                }}
            >
                {children}
            </Text>
        </View>
    );
}