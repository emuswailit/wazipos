import { useAuth } from "@/context/AuthContext";
import { Text, View } from "react-native";

export default function WaziposHeader() {
    const { theme } = useAuth();

    return (
        <View className="mb-8 items-center">
            <Text style={{ color: theme.primary }} className="text-4xl font-black tracking-tight text-center">
                wazipos
            </Text>
            <Text className="text-slate-500 mt-3 text-sm font-medium leading-relaxed text-center">
                The unified B2B2C hub for ubiquitous shopping, inventory tracking, restocking orders, and secure mobile money settlements.
            </Text>
        </View>
    );
}
