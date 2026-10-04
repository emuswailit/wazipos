import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
    children: ReactNode;
    scroll?: boolean;
    padded?: boolean;
    footerOffset?: number;
}

export function Screen({
    children,
    scroll = false,
    padded = true,
    footerOffset = 0,
}: Props) {
    const { theme } = useAuth();
    const inner = padded ? "px-4 pt-3" : "";

    if (scroll) {
        return (
            <SafeAreaView
                style={{ flex: 1, backgroundColor: theme.background }}
                edges={["top"]}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerClassName={inner}
                    contentContainerStyle={{ paddingBottom: 32 + footerOffset }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {children}
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.background }}
            edges={["top"]}
        >
            <View className={`flex-1 ${inner}`}>{children}</View>
        </SafeAreaView>
    );
}