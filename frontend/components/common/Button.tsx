import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props {
    children: ReactNode;
    onPress?: () => void;
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    icon?: ReactNode;
    className?: string;
}

const HEIGHTS: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
const PADDING: Record<Size, number> = { sm: 12, md: 16, lg: 20 };
const TEXT_SIZE: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

const DANGER = { light: "#ef4444", dark: "#dc2626" };

export function Button({
    children,
    onPress,
    variant = "primary",
    size = "md",
    disabled,
    loading,
    fullWidth = true,
    icon,
    className = "",
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const isDisabled = disabled || loading;

    const bg = (() => {
        switch (variant) {
            case "primary":
                return theme.primary;
            case "secondary":
                return theme.surface;
            case "ghost":
                return "transparent";
            case "danger":
                return isDarkMode ? DANGER.dark : DANGER.light;
        }
    })();

    const border = variant === "secondary" ? theme.border : "transparent";
    const fg = (() => {
        switch (variant) {
            case "primary":
            case "danger":
                return "#ffffff";
            case "secondary":
                return theme.text;
            case "ghost":
                return theme.primary;
        }
    })();

    return (
        <Pressable
            onPress={isDisabled ? undefined : onPress}
            disabled={isDisabled}
            style={{
                height: HEIGHTS[size],
                paddingHorizontal: PADDING[size],
                backgroundColor: bg,
                borderColor: border,
                borderWidth: variant === "secondary" ? 1 : 0,
                borderRadius: 12,
                opacity: disabled ? 0.4 : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: fullWidth ? "100%" : undefined,
                alignSelf: fullWidth ? undefined : "flex-start",
            }}
            className={`active:opacity-80 ${className}`}
        >
            {loading ? (
                <ActivityIndicator
                    size="small"
                    color={
                        variant === "primary" || variant === "danger"
                            ? "#ffffff"
                            : theme.primary
                    }
                />
            ) : icon ? (
                icon
            ) : null}

            <Text
                style={{
                    color: fg,
                    fontSize: TEXT_SIZE[size],
                    fontWeight: "600",
                    opacity: loading ? 0.7 : 1,
                }}
            >
                {children}
            </Text>
        </Pressable>
    );
}