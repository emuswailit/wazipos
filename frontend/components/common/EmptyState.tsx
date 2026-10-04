import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { Text, View } from "react-native";

interface Props {
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
}

function withAlpha(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export function EmptyState({ title, description, icon, action }: Props) {
    const { theme } = useAuth();

    return (
        <View
            style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 64,
                paddingHorizontal: 24,
                gap: 12,
            }}
        >
            {icon ? (
                <View
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: withAlpha(theme.primary, 0.12),
                    }}
                >
                    {icon}
                </View>
            ) : null}

            <Text
                style={{
                    color: theme.text,
                    fontSize: 17,
                    fontWeight: "600",
                    textAlign: "center",
                }}
            >
                {title}
            </Text>

            {description ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 14,
                        lineHeight: 20,
                        textAlign: "center",
                        maxWidth: 280,
                    }}
                >
                    {description}
                </Text>
            ) : null}

            {action ? (
                <View style={{ marginTop: 8, width: "100%", maxWidth: 240 }}>
                    {action}
                </View>
            ) : null}
        </View>
    );
}