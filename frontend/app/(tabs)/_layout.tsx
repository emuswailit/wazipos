import { useAuth } from "@/context/AuthContext";
import { Slot, Tabs } from "expo-router";
import { useState } from "react";
import { Image, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Absolute path module targets
import SidebarNavigationList from "@/utils/SidebarNavigationList";
import WebTopNavbar from "@/utils/WebTopNavbar";

const DrawerComponent = Platform.OS !== "web" ? require("react-native-drawer-layout").Drawer : null;

function UniversalWebContainer() {
  const { user, logout, theme } = useAuth();

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const currentUserRole = user?.role || "Client";
  const userFullName = user?.name || "Anonymous User";
  const userUsername = user?.username || "guest_user";
  const userEmail = user?.email || "no-email@wazipos.com";
  const userCompany = user?.company || "Independent Workspace";
  const workspaceBg = isDarkMode ? "#0f172a" : "#f8fafc";

  return (
    <TouchableWithoutFeedback onPress={() => setProfileDropdownOpen(false)}>
      <View style={{ backgroundColor: workspaceBg }} className="flex-1 flex-col w-full h-screen">
        {/* 
          Binds static context parameters at the shell level and pipes them 
          safely down as independent functional props parameters.
        */}
        <WebTopNavbar
          isDarkMode={isDarkMode}
          dropdownOpen={profileDropdownOpen}
          setDropdownOpen={setProfileDropdownOpen}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          userFullName={userFullName}
          userUsername={userUsername}
          userEmail={userEmail}
          userCompany={userCompany}
          themePrimaryColor={theme.primary}
          onLogoutTrigger={logout}
        />
        <View className="flex-1 flex-row w-full relative">
          {sidebarOpen && (
            <View style={{ backgroundColor: theme.primary }} className="flex flex-col w-64 h-full p-6 shadow-2xl justify-between border-r border-white/10 z-40" >
              <View className="flex-1">
                <View className="mb-8 px-2 flex-row items-center gap-x-2">
                  <Image source={require("@/assets/images/wazipos_icon.png")} resizeMode="contain" style={{ width: 16, height: 16, tintColor: "#ffffff" }} />
                  <View className="flex-1 items-start">
                    <Text className="text-white text-lg font-black tracking-tight leading-none">wazipos</Text>
                    <Text className="text-white/40 text-[8px] font-bold tracking-widest uppercase mt-0.5">Unified System</Text>
                  </View>
                </View>
                <SidebarNavigationList currentUserRole={currentUserRole} themePrimaryColor={theme.primary} themeTextDarkColor={theme.textDark} />
              </View>
              <View className="gap-y-4 border-t border-white/10 pt-4">
                <TouchableOpacity onPress={() => setIsDarkMode(!isDarkMode)} className="w-full py-2.5 px-4 rounded-xl bg-white/10 border border-white/10"><Text className="text-xs font-bold text-white">Toggle Theme</Text></TouchableOpacity>
              </View>
            </View>
          )}
          <View className="flex-1 h-full overflow-y-auto"><Slot /></View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

export default function TabsLayout() {
  const { user, logout, theme } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const currentUserRole = user?.role || "Client";

  if (Platform.OS === "web") {
    return <UniversalWebContainer />;
  }

  return (
    <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1" edges={["top", "bottom"]}>
      <DrawerComponent
        open={mobileDrawerOpen}
        onOpen={() => setMobileDrawerOpen(true)}
        onClose={() => setMobileDrawerOpen(false)}
        drawerType="slide"
        drawerStyle={{ backgroundColor: theme.primary, width: 260 }}
        renderDrawerContent={() => (
          <View className="flex-1 p-5 justify-between">
            <View className="flex-1">
              <View className="mb-6 px-2 flex-row items-center gap-x-2">
                <Image source={require("@/assets/images/wazipos_icon.png")} resizeMode="contain" style={{ width: 16, height: 16, tintColor: "#ffffff" }} />
                <Text className="text-white text-xl font-black">wazipos</Text>
              </View>
              <SidebarNavigationList currentUserRole={currentUserRole} themePrimaryColor={theme.primary} themeTextDarkColor={theme.textDark} />
            </View>
            <TouchableOpacity onPress={() => { setMobileDrawerOpen(false); logout(); }} className="w-full py-3 items-center rounded-xl bg-black/20 border border-white/5"><Text className="text-xs font-black text-white uppercase tracking-widest">Sign Out</Text></TouchableOpacity>
          </View>
        )}
      >
        <View style={{ backgroundColor: theme.background }} className="h-14 w-full border-b border-slate-100 px-4 flex-row justify-between items-center shadow-xs">
          <TouchableOpacity onPress={() => setMobileDrawerOpen(true)} className="p-2 rounded-xl bg-slate-50 border border-slate-100"><Text style={{ color: theme.textDark }} className="font-extrabold text-xs">☰ Menu</Text></TouchableOpacity>
          <Text style={{ color: theme.primary }} className="font-black text-lg tracking-tight">wazipos hub</Text>
          <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"><Text style={{ color: theme.primary }} className="font-bold text-xs uppercase">{user?.name?.charAt(0) || "W"}</Text></View>
        </View>

        <Tabs screenOptions={{ tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: "#94a3b8", tabBarStyle: { backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: "#e2e8f0", height: 60, paddingBottom: 8, paddingTop: 8 }, contentStyle: { backgroundColor: theme.background } }}>
          <Tabs.Screen name="index" options={{ title: "Shopping", headerShown: false }} />
          <Tabs.Screen name="business" options={{ title: "Business", headerShown: false }} />
          <Tabs.Screen name="profile" options={{ title: "Profile", headerShown: false }} />
        </Tabs>
      </DrawerComponent>
    </SafeAreaView>
  );
}
