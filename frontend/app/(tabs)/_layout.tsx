import { useAuth } from "@/context/AuthContext";
import SidebarNavigationList from "@/utils/SidebarNavigationList";
import { Slot, Tabs } from "expo-router";
import { useState } from "react";
import { Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DrawerComponent = Platform.OS !== "web" ? require("react-native-drawer-layout").Drawer : null;

export default function TabsLayout() {
  const { logout, isDarkMode, toggleTheme, theme } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  if (Platform.OS === "web") {
    return <Slot />;
  }

  const mobileTabBg = isDarkMode ? "#0f172a" : "#ffffff";
  const mobileTabBorder = isDarkMode ? "#1e293b" : "#e2e8f0";

  return (
    <SafeAreaView style={{ backgroundColor: theme.background }} className="flex-1 h-full" edges={["top", "bottom"]}>
      <DrawerComponent
        open={mobileDrawerOpen}
        onOpen={() => setMobileDrawerOpen(true)}
        onClose={() => setMobileDrawerOpen(false)}
        drawerType="slide"
        drawerStyle={{ backgroundColor: theme.panel, width: 260 }}
        renderDrawerContent={() => (
          <View className="flex-1 p-5 justify-between">
            <View className="flex-1">
              <View className="mb-6 px-2 flex-row items-center gap-x-2">
                <Image source={require("@/assets/images/wazipos_icon.png")} resizeMode="contain" className="w-5 h-5" style={{ width: 20, height: 20, tintColor: theme.primary }} />
                <Text style={{ color: theme.text }} className="text-xl font-black">wazipos</Text>
              </View>
              <SidebarNavigationList />
            </View>
            <View className="gap-y-3">
              <TouchableOpacity onPress={toggleTheme} style={{ backgroundColor: theme.background }} className="w-full py-3 items-center rounded-xl">
                <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">{isDarkMode ? "☀️ Light" : "🌙 Dark"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setMobileDrawerOpen(false); logout(); }} className="w-full py-3 items-center rounded-xl bg-black/20">
                <Text className="text-xs font-black text-white uppercase tracking-widest">Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      >
        <Tabs screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textDark,
          tabBarStyle: {
            backgroundColor: mobileTabBg,
            borderTopWidth: 1,
            borderTopColor: mobileTabBorder,
            height: 40,
            paddingBottom: 8,
            paddingTop: 2
          },
          contentStyle: { backgroundColor: theme.background }
        }}>
          <Tabs.Screen name="index" options={{ title: "Shopping", headerShown: false }} />
          <Tabs.Screen name="business" options={{ title: "Business", headerShown: false }} />
          <Tabs.Screen name="profile" options={{ title: "Profile", headerShown: false }} />
        </Tabs>
      </DrawerComponent>
    </SafeAreaView>
  );
}
