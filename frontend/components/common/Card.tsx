import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { Pressable, View } from "react-native";

interface Props {
    children: ReactNode;
    onPress?: () => void;
    className?: string;
    padded?: boolean;
}

export function Card({
    children,
    onPress,
    className = "",
    padded = true,
}: Props) {
    const { theme } = useAuth();

    const style = {
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: padded ? 16 : 0,
    };

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={style}
                className={`active:opacity-80 ${className}`}
            >
                {children}
            </Pressable>
        );
    }
    return (
        <View style={style} className={className}>
            {children}
        </View>
    );
}