import { useAuth } from "@/context/AuthContext";
import { Text, View } from "react-native";

export default function RegistrationHeader() {
    const { theme } = useAuth();
    return (
        <View className="mb-2 items-center">
            <Text style={{ color: theme.primary }} className="text-3xl font-black tracking-tight text-center">
                Create Account
            </Text>
            <Text className="text-slate-500 mt-2 text-sm font-medium leading-relaxed text-center">
                Join the wazipos network. Settle B2B payments, check inventory, and shop ubiquitously.
            </Text>
        </View>
    );
}
