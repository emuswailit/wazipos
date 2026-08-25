import "react-native-gesture-handler";
import "../global.css";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import SidebarNavigationList from "@/utils/SidebarNavigationList";
import WebTopNavbar from "@/utils/WebTopNavbar";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useState } from "react";
import { Image, LogBox, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

LogBox.ignoreLogs(["Cannot record touch end without a touch start"]);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

function GlobalAppShellLayout() {
  const { user, logout, isDarkMode, toggleTheme, theme } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Navigation Panel Visibility States
  const isLargeScreen = width >= 768;
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // 🌟 FIXED: Sidebar is now explicitly initialized to TRUE (Always Visible on all viewports)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Authentication Route Guard Logic
  React.useEffect(() => {
    const inAuthGroup = segments.includes("(auth)");
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, segments]);

  // Isolate login screen layouts away from core nav panels
  const isAuthScreen = segments.includes("(auth)");
  if (isAuthScreen) {
    return (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  // Parse User Metadata fields safely
  const userFullName = user?.name || "Anonymous User";
  const userUsername = user?.email ? user.email.split('@')[0] : "guest_user";
  const userEmail = user?.email || "no-email@wazipos.com";

  // Dynamic Theme Structural Color Allocations
  const customBorderColor = isDarkMode ? "#334155" : theme.primary;
  const customTextColor = isDarkMode ? "#ffffff" : theme.primary;

  return (
    <TouchableWithoutFeedback onPress={() => setProfileDropdownOpen(false)}>
      <View style={{ paddingTop: insets.top, backgroundColor: theme.background }} className="flex-1 flex-col w-full h-screen overflow-hidden">

        {/* GLOBAL TOP NAVBAR */}
        <View className="w-full z-50">
          {Platform.OS === "web" ? (
            <WebTopNavbar
              isDarkMode={isDarkMode}
              dropdownOpen={profileDropdownOpen}
              setDropdownOpen={setProfileDropdownOpen}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              userFullName={userFullName}
              userUsername={userUsername}
              userEmail={userEmail}
              userCompany="Independent Workspace"
              themePrimaryColor={theme.primary}
              onLogoutTrigger={logout}
            />
          ) : (
            <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background }} className="h-14 w-full border-b px-4 flex-row justify-between items-center shadow-xs">
              {/* Menu Toggle Trigger Button */}
              <TouchableOpacity onPress={() => setSidebarOpen(!sidebarOpen)} style={{ backgroundColor: theme.background }} className="p-2 rounded-xl">
                <Text style={{ color: customTextColor }} className="font-extrabold text-xs">☰ Menu</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.primary }} className="font-black text-lg tracking-tight">wazipos hub</Text>
              <View style={{ backgroundColor: theme.background }} className="w-8 h-8 rounded-full items-center justify-center">
                <Text style={{ color: theme.primary }} className="font-bold text-xs uppercase">{user?.name?.charAt(0) || "W"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* WORKSPACE CONTENT BODY FRAME ROW */}
        <View className="flex-1 flex-row w-full h-full relative overflow-hidden">

          {/* GLOBAL SIDEBAR PANEL CONTAINER */}
          {sidebarOpen && (
            <View
              style={{ backgroundColor: theme.panel, borderColor: customBorderColor }}
              className={`flex flex-col h-full p-5 justify-between border-r shadow-sm z-40 ${isLargeScreen ? "w-64 min-w-[256px] max-w-[256px]" : "absolute left-0 top-0 bottom-0 w-64 shadow-2xl"
                }`}
            >
              <View className="flex-1">
                <View className="mb-6 px-1 flex-row items-center gap-x-3 h-10">
                  <Image source={require("@/assets/images/wazipos_icon.png")} resizeMode="contain" className="w-5 h-5" style={{ width: 22, height: 22, tintColor: theme.primary }} />
                  <View className="flex-1 items-start justify-center">
                    <Text style={{ color: customTextColor }} className="text-base font-black tracking-tight leading-none">wazipos</Text>
                    <Text style={{ color: isDarkMode ? "#ffffff" : theme.textDark }} className="text-[9px] font-bold tracking-widest uppercase mt-1">Unified System</Text>
                  </View>
                </View>

                <View className="flex-1">
                  {/* Fixed Navigation link layers */}
                  <SidebarNavigationList onCloseSidebarTrigger={() => setSidebarOpen(false)} />
                </View>
              </View>

              <View style={{ borderTopColor: customBorderColor }} className="pt-4 border-t w-full">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={toggleTheme}
                  style={{ backgroundColor: theme.background, borderColor: customBorderColor }}
                  className="w-full py-2.5 px-4 rounded-xl items-center justify-center border web:hover:opacity-80 transition-all"
                >
                  <Text style={{ color: customTextColor }} className="text-xs font-bold text-center">
                    {isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* DYNAMIC SCREEN ROUTER CANVAS */}
          <View style={{ backgroundColor: theme.background }} className="flex-1 h-full overflow-y-auto">
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="client/orders" />
            </Stack>
          </View>
        </View>

      </View>
    </TouchableWithoutFeedback>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <SafeAreaProvider>
          <GlobalAppShellLayout />
        </SafeAreaProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
