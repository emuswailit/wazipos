import { useAuth } from "@/context/AuthContext";
import { Slot, Stack } from "expo-router";
import { useState } from "react";
import { Image, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";

// Absolute path module imports from outside the app routing tree
import SidebarNavigationList from "@/utils/SidebarNavigationList";
import WebTopNavbar from "@/utils/WebTopNavbar";

function HomeWebLayoutContainer() {
    const { user, logout, theme } = useAuth();

    // Unified interface toggle parameters
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

    const currentUserRole = user?.role || "Client";
    const workspaceBg = isDarkMode ? "#0f172a" : "#f8fafc";

    console.log("usee", user)

    return (
        <TouchableWithoutFeedback onPress={() => setProfileDropdownOpen(false)}>
            <View style={{ backgroundColor: workspaceBg }} className="flex-1 flex-col w-full h-screen">

                {/* Full-width Horizontal Top Header Navbar */}
                {Platform.OS === "web" && (
                    <WebTopNavbar
                        isDarkMode={isDarkMode}
                        dropdownOpen={profileDropdownOpen}
                        setDropdownOpen={setProfileDropdownOpen}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        userCompany={user ? user.entity_title : ""}
                        userFullName={user ? user.name : ""}
                    />
                )}

                {/* Lower Dashboard Panel Grid */}
                <View className="flex-1 flex-row w-full relative">

                    {/* Collapsible Sidebar */}
                    {sidebarOpen && (
                        <View
                            style={{ backgroundColor: theme.primary }}
                            className="flex flex-col w-64 h-full p-6 shadow-2xl justify-between border-r border-white/10 z-40"
                        >
                            <View className="flex-1">
                                {/* Micro Brand Logo Header */}
                                <View className="mb-8 px-2 flex-row items-center gap-x-2">
                                    <Image
                                        source={require("@/assets/images/wazipos_icon.png")}
                                        resizeMode="contain"
                                        style={{
                                            width: 16,
                                            height: 16,
                                            tintColor: "#ffffff"
                                        }}
                                    />
                                    <View className="flex-1 items-start">
                                        <Text className="text-white text-lg font-black tracking-tight leading-none">wazipos</Text>
                                        <Text className="text-white/40 text-[8px] font-bold tracking-widest uppercase mt-0.5">Unified System</Text>
                                    </View>
                                </View>

                                {/* Sidebar Navigation Links List Container */}
                                <SidebarNavigationList
                                    currentUserRole={currentUserRole}
                                    themePrimaryColor={theme.primary}
                                    themeTextDarkColor={theme.textDark}
                                />
                            </View>

                            {/* Sidebar Settings Footer Row */}
                            <View className="gap-y-4 border-t border-white/10 pt-4">
                                <TouchableOpacity
                                    onPress={() => setIsDarkMode(!isDarkMode)}
                                    className="w-full py-2.5 px-4 rounded-xl bg-white/10 border border-white/10 flex-row justify-between items-center"
                                >
                                    <Text className="text-xs font-bold text-white tracking-wide">
                                        {isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity onPress={logout} className="w-full py-3 items-center rounded-xl bg-black/20 border border-white/5 web:hover:bg-black/40 active:bg-black/50 transition-all">
                                    <Text className="text-[11px] font-extrabold text-white/90 uppercase tracking-widest">Sign Out</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Dynamic Content Canvas Slots */}
                    <View className="flex-1 h-full overflow-y-auto">
                        <Slot />
                    </View>
                </View>

            </View>
        </TouchableWithoutFeedback>
    );
}

export default function HomeLayout() {
    if (Platform.OS === "web") {
        return <HomeWebLayoutContainer />;
    }

    // Native App Environment Flow Fallback Configuration
    return <Stack screenOptions={{ headerShown: false }} />;
}
