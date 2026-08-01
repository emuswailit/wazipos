import { useRouter } from "expo-router";
import { Platform, Text, TouchableOpacity, View } from "react-native";

// Define strict prop passing layout metrics from the parent branch shell
interface WebTopNavbarProps {
    isDarkMode: boolean;
    dropdownOpen: boolean;
    setDropdownOpen: (open: boolean) => void;
    setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    sidebarOpen: boolean;
    userFullName: string;
    userUsername: string;
    userEmail: string;
    userCompany: string;
    themePrimaryColor: string;
    onLogoutTrigger: () => void;
}

export default function WebTopNavbar({
    isDarkMode,
    dropdownOpen,
    setDropdownOpen,
    setSidebarOpen,
    sidebarOpen,
    userFullName,
    userUsername,
    userEmail,
    userCompany,
    themePrimaryColor,
    onLogoutTrigger
}: WebTopNavbarProps) {
    const router = useRouter();

    // Dynamic style parameters syncing with parent layout appearance mode
    const cardSurfaceBg = isDarkMode ? "#1e293b" : "#ffffff";
    const masterTextColor = isDarkMode ? "#f8fafc" : "#0f172a";
    const subtleBorderColor = isDarkMode ? "#334155" : "#e2e8f0";

    return (
        <View
            style={{ backgroundColor: cardSurfaceBg, borderColor: subtleBorderColor }}
            className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm relative z-50"
        >
            {/* Left Element: Toggle Button + Active Workspace Context */}
            <View className="flex-row items-center gap-x-4">
                <TouchableOpacity
                    onPress={(e) => {
                        if (Platform.OS === "web") e.stopPropagation();
                        setSidebarOpen(!sidebarOpen);
                    }}
                    style={{ borderColor: subtleBorderColor }}
                    className="p-2 rounded-xl border bg-slate-50/5 active:bg-slate-50/10 web:hover:opacity-80"
                >
                    <Text style={{ color: masterTextColor }} className="font-black text-sm tracking-tight px-1">
                        {sidebarOpen ? "✕ Close" : "☰ Menu"}
                    </Text>
                </TouchableOpacity>

                <View className="flex-row items-center gap-x-2 hidden sm:flex">
                    <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Workspace:</Text>
                    <Text style={{ color: masterTextColor }} className="font-bold text-sm tracking-tight">{userCompany}</Text>
                </View>
            </View>

            {/* Right Element: Clickable Profile Dropdown Action Pill */}
            <View className="relative">
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => {
                        if (Platform.OS === "web") e.stopPropagation();
                        setDropdownOpen(!dropdownOpen);
                    }}
                    style={{ backgroundColor: isDarkMode ? "#334155" : "#f1f5f9", borderColor: subtleBorderColor }}
                    className="flex-row items-center gap-x-3 px-3 py-1.5 rounded-xl border transition-colors"
                >
                    <View style={{ backgroundColor: themePrimaryColor }} className="w-8 h-8 rounded-full items-center justify-center">
                        <Text className="text-white text-xs font-black uppercase">{userFullName.charAt(0)}</Text>
                    </View>
                    <View className="items-start hidden xs:flex">
                        <Text style={{ color: masterTextColor }} className="font-bold text-xs leading-none">{userFullName}</Text>
                        <Text className="text-[10px] text-slate-400 font-medium mt-0.5">@{userUsername}</Text>
                    </View>
                    <Text className="text-[10px] text-slate-400 font-bold ml-1">{dropdownOpen ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {/* Account Panel Popup Overlay Menu */}
                {dropdownOpen && (
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => Platform.OS === "web" && e.stopPropagation()}
                        style={{ backgroundColor: cardSurfaceBg, borderColor: subtleBorderColor }}
                        className="absolute right-0 top-12 w-64 border rounded-xl shadow-2xl p-4 z-50 gap-y-3"
                    >
                        <View className="pb-3 border-b border-slate-700/50">
                            <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">Session Profile</Text>
                            <Text style={{ color: masterTextColor }} className="font-black text-sm mt-1 truncate">{userFullName}</Text>
                            <Text className="text-xs text-slate-400 truncate mt-0.5">{userEmail}</Text>
                        </View>
                        <View className="gap-y-1 py-1">
                            <TouchableOpacity onPress={() => { router.push("/(tabs)/profile"); setDropdownOpen(false); }} className="w-full py-2 px-3 rounded-lg web:hover:bg-slate-700/30 items-start">
                                <Text style={{ color: themePrimaryColor }} className="font-bold text-xs">View Full Profile</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { onLogoutTrigger(); setDropdownOpen(false); }} className="w-full py-2 px-3 rounded-lg bg-red-500/10 web:hover:bg-red-500/20 items-start mt-2">
                                <Text className="font-bold text-xs text-red-500">Sign Out of wazipos</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
