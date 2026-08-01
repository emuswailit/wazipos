import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
// Change from relative to absolute root utils path alias
import { checkAccessPermission } from "@/utils/navigationData";


export default function MobileWebFooter() {
    const { user, logout, theme } = useAuth();
    const router = useRouter();
    const currentUserRole = user?.role || "Client";

    return (
        <>
            <View style={{ backgroundColor: theme.background, borderColor: theme.border }} className="flex md:hidden p-4 border-b flex-row justify-between items-center shadow-sm z-40">
                <Text style={{ color: theme.primary }} className="text-xl font-black">wazipos</Text>
                <TouchableOpacity onPress={logout} className="px-3 py-1.5 border border-red-200 rounded-lg"><Text className="text-red-500 font-bold text-xs">Exit</Text></TouchableOpacity>
            </View>

            <View style={{ backgroundColor: theme.background }} className="flex md:hidden flex-row border-t border-slate-100 h-16 justify-around items-center px-4 z-40">
                <TouchableOpacity onPress={() => router.push("/(tabs)")} className="items-center"><Text style={{ color: theme.primary }} className="text-xs font-bold">Shop</Text></TouchableOpacity>
                {checkAccessPermission(currentUserRole, ["Admin", "Vendor"]) && (
                    <TouchableOpacity onPress={() => router.push("/(tabs)/business")} className="items-center"><Text className="text-xs font-bold text-slate-400">Business</Text></TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} className="items-center"><Text className="text-xs font-bold text-slate-400">Profile</Text></TouchableOpacity>
            </View>
        </>
    );
}
