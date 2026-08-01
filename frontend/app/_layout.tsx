import "react-native-gesture-handler"; // Compulsory topmost gesture primitive initialization hook
import "../global.css";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreLogs(["Cannot record touch end without a touch start"]);

// 🌟 FIX: Moved outside the component to the global scope so it loads safely on start
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // 👈 Turn off the inline .value warning message globally
});

// 1. ISOLATED INNER NAVIGATION ROUTER ENGINE
function RootNavigationLayout() {
  const { user, isLoading, theme } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Checks if the active system route path segment sits within authorization wrappers
    const inAuthGroup = segments.includes("(auth)");

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(home)" />
    </Stack>
  );
}

// 2. PRIMARY SYSTEM ENTRY POINT: Enforces AuthProvider wrapping above all nodes
export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <SafeAreaProvider>
          <RootNavigationLayout />
        </SafeAreaProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
