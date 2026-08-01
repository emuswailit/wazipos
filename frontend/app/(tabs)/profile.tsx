import { useAuth } from "@/context/AuthContext";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function ProfileScreen() {
    const { user, logout, theme } = useAuth();

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} className="px-6" showsVerticalScrollIndicator={false}>
            <View className="items-center mb-6">
                <Text style={{ color: theme.textDark }} className="text-3xl font-black tracking-tight">
                    My Account
                </Text>
            </View>

            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="p-5 rounded-2xl border mb-8">
                <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Registered Account</Text>
                <Text style={{ color: theme.textDark }} className="text-base font-bold">
                    {user?.email || "guest-user@domain.com"}
                </Text>
            </View>

            <TouchableOpacity onPress={logout} style={{ borderColor: "#ef4444" }} className="w-full items-center rounded-xl py-4 border border-dashed active:bg-red-50">
                <Text className="font-bold text-red-500">Sign Out of Session</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}
