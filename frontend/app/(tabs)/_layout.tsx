// app/(tabs)/_layout.tsx

import { Tabs } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  // On web: completely hide the tab bar.
  // On mobile small screens: the shell (app/_layout.tsx) owns
  // the tab bar — hide this one so there's only one visible.
  const hideBuiltInBar = Platform.OS === "web" || !isLargeScreen;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: hideBuiltInBar ? { display: "none" } : undefined,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Shopping" }} />
      <Tabs.Screen name="business" options={{ title: "Business" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}