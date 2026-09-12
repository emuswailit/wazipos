// app/_layout.tsx

import {
  useOfflineOrderSync,
} from '@/app/(retailers)/newCustomerOrder/useOfflineOrderSync';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerBackgroundSyncTask } from '@/context/backgroundSyncTask';
import { EntitiesSyncProvider } from '@/context/EntitiesSyncContext';
import { InventorySyncProvider } from '@/context/InventorySyncContext';
import {
  NetworkMonitorProvider,
  useNetworkStatus,
} from '@/context/NetworkMonitorContext';
import { OrdersSyncProvider } from '@/context/OrdersSyncContext';
import { PaymentMethodsSyncProvider } from '@/context/PaymentMethodsSyncContext';
import { ProductsSyncProvider } from '@/context/ProductsSyncContext';
import SidebarNavigationList from '@/utils/SidebarNavigationList';
import WebTopNavbar from '@/utils/WebTopNavbar';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import {
  Image,
  LogBox,
  Platform,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import '../global.css';

LogBox.ignoreLogs([
  'Cannot record touch end without a touch start',
]);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

/*
 * Keep the splash screen visible until fonts are ready.
 * No-op on web.
 */
SplashScreen.preventAutoHideAsync().catch(() => { });

/* =========================================================
 * Global shell
 * ======================================================= */

function GlobalAppShellLayout() {
  useOfflineOrderSync();

  const {
    user,
    logout,
    isDarkMode,
    toggleTheme,
    theme,
  } = useAuth();
  const { isOnline } = useNetworkStatus();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isLargeScreen = width >= 768;

  const [profileDropdownOpen, setProfileDropdownOpen] =
    useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  React.useEffect(() => {
    const inAuthGroup = segments.includes('(auth)');
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, segments]);

  if (segments.includes('(auth)')) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: 'transparent',
          },
        }}
      >
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  const userFullName = user?.name || 'Anonymous User';
  const userUsername = user?.email
    ? user.email.split('@')[0]
    : 'guest_user';
  const userEmail = user?.email || 'no-email@wazipos.com';

  const customBorderColor = isDarkMode
    ? '#334155'
    : theme.primary;
  const customTextColor = isDarkMode
    ? '#ffffff'
    : theme.primary;

  if (Platform.OS !== 'web') {
    registerBackgroundSyncTask();
  }

  return (
    <TouchableWithoutFeedback
      onPress={() => setProfileDropdownOpen(false)}
    >
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: theme.background,
        }}
        className="flex-1 flex-col w-full h-screen overflow-hidden"
      >
        <View className="w-full z-50">
          {Platform.OS === 'web' ? (
            <WebTopNavbar
              isDarkMode={isDarkMode}
              dropdownOpen={profileDropdownOpen}
              setDropdownOpen={
                setProfileDropdownOpen
              }
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
            <View
              style={{
                backgroundColor: theme.panel,
                borderBottomColor:
                  theme.background,
              }}
              className="h-14 w-full border-b px-4 flex-row justify-between items-center shadow-xs"
            >
              <TouchableOpacity
                onPress={() =>
                  setSidebarOpen(!sidebarOpen)
                }
                style={{
                  backgroundColor:
                    theme.background,
                }}
                className="p-2 rounded-xl"
              >
                <Text
                  style={{
                    color: customTextColor,
                  }}
                  className="font-extrabold text-xs"
                >
                  ☰ Menu
                </Text>
              </TouchableOpacity>
              <Text
                style={{ color: theme.primary }}
                className="font-black text-lg tracking-tight"
              >
                wazipos hub
              </Text>
              <View
                style={{
                  backgroundColor:
                    theme.background,
                }}
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <Text
                  style={{
                    color: theme.primary,
                  }}
                  className="font-bold text-xs uppercase"
                >
                  {user?.name?.charAt(0) ||
                    'W'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="flex-1 flex-row w-full h-full relative overflow-hidden">
          {sidebarOpen && (
            <View
              style={{
                backgroundColor: theme.panel,
                borderColor: customBorderColor,
              }}
              className={`flex flex-col h-full p-5 justify-between border-r shadow-sm z-40 ${isLargeScreen
                  ? 'w-64 min-w-[256px] max-w-[256px]'
                  : 'absolute left-0 top-0 bottom-0 w-64 shadow-2xl'
                }`}
            >
              <View className="flex-1">
                <View className="mb-6 px-1 flex-row items-center gap-x-3 h-10">
                  <Image
                    source={require('@/assets/images/wazipos_icon.png')}
                    resizeMode="contain"
                    className="w-5 h-5"
                    style={{
                      width: 22,
                      height: 22,
                      tintColor:
                        theme.primary,
                    }}
                  />
                  <View className="flex-1 items-start justify-center">
                    <Text
                      style={{
                        color: customTextColor,
                        fontFamily:
                          theme.font
                            .bold,
                      }}
                      className="text-base tracking-tight leading-none"
                    >
                      wazipos
                    </Text>
                    <Text
                      style={{
                        color: isDarkMode
                          ? '#ffffff'
                          : theme.textDark,
                        fontFamily:
                          theme.font
                            .medium,
                      }}
                      className="text-[9px] tracking-widest uppercase mt-1"
                    >
                      Unified System
                    </Text>
                  </View>
                </View>

                <View className="flex-1">
                  <SidebarNavigationList
                    onCloseSidebarTrigger={() =>
                      setSidebarOpen(false)
                    }
                  />
                </View>
              </View>

              <View
                style={{
                  borderTopColor:
                    customBorderColor,
                }}
                className="pt-4 border-t w-full"
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={toggleTheme}
                  style={{
                    backgroundColor:
                      theme.background,
                    borderColor:
                      customBorderColor,
                  }}
                  className="w-full py-2.5 px-4 rounded-xl items-center justify-center border web:hover:opacity-80 transition-all"
                >
                  <Text
                    style={{
                      color: customTextColor,
                      fontFamily:
                        theme.font.bold,
                    }}
                    className="text-xs text-center"
                  >
                    {isDarkMode
                      ? '☀️ Light Mode'
                      : '🌙 Dark Mode'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View
            style={{
              backgroundColor: theme.background,
            }}
            className="flex-1 h-full overflow-y-auto"
          >
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor:
                    'transparent',
                },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="client/orders" />
            </Stack>
          </View>
        </View>

        {!isOnline && (
          <View
            style={{
              backgroundColor: '#f43f5e',
              paddingBottom:
                insets.bottom > 0
                  ? insets.bottom
                  : 8,
            }}
            className="w-full py-2 items-center justify-center z-50 shadow-lg"
          >
            <Text
              style={{
                fontFamily:
                  theme.font.bold,
                fontSize: theme.fontSize.xs,
              }}
              className="text-white tracking-wider uppercase text-center"
            >
              ⚠️ Connection Interrupted. Operating
              in Offline Mode.
            </Text>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

/* =========================================================
 * Root layout — loads fonts before rendering the shell
 * ======================================================= */

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    /* Inter — full family */
    'Inter-Light': require('@/assets/fonts/Inter-Light.ttf'),
    'Inter-Regular': require('@/assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('@/assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('@/assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('@/assets/fonts/Inter-Bold.ttf'),
    'Inter-Italic': require('@/assets/fonts/Inter-Italic.ttf'),

    /* Monospace */
    'JetBrainsMono': require('@/assets/fonts/JetBrainsMono-Regular.ttf'),
    'SpaceMono': require('@/assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => { });
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontError) {
      console.error(
        '[RootLayout] Font loading failed:',
        fontError
      );
    }
  }, [fontError]);

  /*
   * On web, expo-font injects @font-face rules and we can
   * render immediately. On native, block until fonts are
   * ready (or failed) to avoid a flash of system font.
   */
  if (
    Platform.OS !== 'web' &&
    !fontsLoaded &&
    !fontError
  ) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <NetworkMonitorProvider>
          <EntitiesSyncProvider>
            <InventorySyncProvider>
              <PaymentMethodsSyncProvider>
                <ProductsSyncProvider>
                  <OrdersSyncProvider>
                    <SafeAreaProvider>
                      <GlobalAppShellLayout />
                    </SafeAreaProvider>
                  </OrdersSyncProvider>
                </ProductsSyncProvider>
              </PaymentMethodsSyncProvider>
            </InventorySyncProvider>
          </EntitiesSyncProvider>
        </NetworkMonitorProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}