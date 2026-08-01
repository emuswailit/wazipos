import { useAuth } from "@/context/AuthContext";
import { ScrollView, Text, View } from "react-native";

export default function BusinessScreen() {
    const { theme } = useAuth();

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} className="px-6" showsVerticalScrollIndicator={false}>
            <View className="items-center mb-6">
                <Text style={{ color: theme.textDark }} className="text-3xl font-black tracking-tight">
                    Business Hub
                </Text>
                <Text className="text-center text-sm text-slate-500 mt-1 font-medium">
                    Manage your operations and metrics.
                </Text>
            </View>

            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="p-5 rounded-2xl border">
                <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2">Performance Overview</Text>
                <Text style={{ color: theme.primary }} className="text-2xl font-black">KES 0.00</Text>
                <Text className="text-slate-500 text-xs mt-1">Total revenue generated this month.</Text>
            </View>
        </ScrollView>
    );
}
