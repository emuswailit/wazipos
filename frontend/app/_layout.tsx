// app/_layout.tsx

import { SubscriptionBanner } from '@/components/common/SubscriptionBanner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerBackgroundSyncTask } from '@/context/backgroundSyncTask';
import { CadresSyncProvider } from '@/context/CadresSyncContext';
import { ClustersSyncProvider } from '@/context/ClustersSyncContext';
import { DepartmentsSyncProvider } from '@/context/DepartmentsSyncContext';
import { DesignationsSyncProvider } from '@/context/DesignationsSyncContext';
import { EmployeesSyncProvider } from '@/context/EmployeesSyncContext';
import { EntitiesSyncProvider } from '@/context/EntitiesSyncContext';
import { ForecastProvider } from '@/context/ForecastContext';
import { FrequenciesSyncProvider } from '@/context/FrequenciesSyncContext';
import { InventorySyncProvider } from '@/context/InventorySyncContext';
import {
  NetworkMonitorProvider,
  useNetworkStatus,
} from '@/context/NetworkMonitorContext';
import { CustomerOrdersSyncProvider } from '@/context/CustomerOrdersSyncContext';
import { PaymentMethodsSyncProvider } from '@/context/PaymentMethodsSyncContext';
import { PreparationsSyncProvider } from '@/context/PreparationsSyncContext';
import { ProductsSyncProvider } from '@/context/ProductsSyncContext';
import { RetailerIndentsSyncProvider } from '@/context/RetailerIndentsSyncContext';
import { RetailerOrdersSyncProvider } from '@/context/RetailerOrdersSyncContext';
import { RetailerOutOfStocksSyncProvider } from '@/context/RetailerOutOfStocksSyncContext';
import { RolesSyncProvider } from '@/context/RolesSyncContext';
import { RoutesSyncProvider } from '@/context/RoutesSyncContext';
import {
  useOfflineOrderSync,
} from '@/hooks/useOfflineOrderSync';

import { AlertProvider } from '@/components/common/AlertProvider';
import { RetailerProductRequestsSyncProvider } from '@/context/RetailerProductRequestsSyncContext';
import { ShopperCartProvider } from '@/context/ShopperCartContext';
import { WholesalerReceiptsSyncProvider } from '@/context/WholesalerReceiptsSyncContext';
import { clearDoseReminders, MEDICATIONS_ROUTE, onDoseReminderTapped, syncMedicationReminders } from '@/utils/medicationReminders';
import SidebarNavigationList from '@/utils/SidebarNavigationList';
import WebTopNavbar from '@/utils/WebTopNavbar';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ShoppingBag, Store, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Image,
  LogBox,
  Platform,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
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

// 🌟 IMPORT SUBSCRIPTION COMPONENTS
import { SubscriptionSyncProvider } from '@/context/SubscriptionSyncContext';

LogBox.ignoreLogs([
  'Cannot record touch end without a touch start',
]);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync().catch(() => { });

const MOBILE_TAB_BAR_HEIGHT = 56;

const MOBILE_TABS = [
  { title: 'Shopping', route: '/(tabs)', icon: ShoppingBag },
  { title: 'Business', route: '/(tabs)/business', icon: Store },
  { title: 'Profile', route: '/(tabs)/profile', icon: User },
] as const;

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
  // Typed routes infer an empty tuple at the root layout; segments are plain strings.
  const segments = useSegments() as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isLargeScreen = width >= 768;

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  // Docked open on wide screens; on phones it's a drawer that starts closed.
  const [sidebarOpen, setSidebarOpen] = useState(isLargeScreen);
  useEffect(() => {
    setSidebarOpen(isLargeScreen);
  }, [isLargeScreen]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      registerBackgroundSyncTask();
    }
  }, []);

  // Medication reminders: keep the phone's dose reminders (60 and 30 minutes
  // before each dose) and refill calendar events in step with what this user
  // has bought, open the schedule when a reminder is tapped, and drop the
  // dose reminders on logout. Never prompts for permissions from here.
  const userId = user ? String((user as any).id ?? (user as any).email ?? 'user') : null;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!userId) {
      void clearDoseReminders();
      return;
    }
    const timer = setTimeout(() => void syncMedicationReminders({ ask: false }).catch(() => undefined), 4000);
    const unsubscribe = onDoseReminderTapped(() => router.push(MEDICATIONS_ROUTE as any));
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, router]);

  React.useEffect(() => {
    const inAuthGroup = segments.includes('(auth)');
    const inWelcome = segments.includes('welcome');

    if (!user && !inAuthGroup && !inWelcome) {
      router.replace('/welcome');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (user && inWelcome) {
      router.replace('/(tabs)');
    }
  }, [user, segments, router]);

  const inAuthGroup = segments.includes('(auth)');
  const inWelcome = segments.includes('welcome');

  if (inAuthGroup || inWelcome) {
    // Login / register / password reset / welcome: keep content clear of the status bar
    // and the system navigation bar (Android draws edge-to-edge).
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          backgroundColor: theme.background,
        }}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          {inAuthGroup && <Stack.Screen name="(auth)" />}
          {inWelcome && <Stack.Screen name="welcome" />}
        </Stack>
      </View>
    );
  }

  const userFullName = user?.name || 'Anonymous User';
  const userUsername = user?.email
    ? user.email.split('@')[0]
    : 'guest_user';
  const userEmail = user?.email || 'no-email@wazipos.com';

  const structuralBorderColor = isDarkMode
    ? '#334155'
    : theme.border;

  const accentBorderColor = isDarkMode
    ? '#334155'
    : theme.primary;

  const customTextColor = isDarkMode
    ? '#ffffff'
    : theme.primary;

  const inTabsGroup = segments[0] === '(tabs)';
  const tabSegment = inTabsGroup ? (segments[1] as string | undefined) : undefined;

  let activeTabTitle: string | null = null;
  if (inTabsGroup) {
    if (!tabSegment || tabSegment === 'index') {
      activeTabTitle = 'Shopping';
    } else if (tabSegment === 'business') {
      activeTabTitle = 'Business';
    } else if (tabSegment === 'profile') {
      activeTabTitle = 'Profile';
    }
  }

  const tabBarBg = isDarkMode ? '#0f172a' : '#ffffff';
  const tabBarBorder = isDarkMode ? '#1e293b' : '#e2e8f0';
  const tabInactive = isDarkMode ? '#94a3b8' : theme.textDark;

  // No TouchableWithoutFeedback around the whole shell: on Android it competes with
  // ScrollViews for the touch and stops screens (e.g. the dashboard) from scrolling.
  // The web profile dropdown is closed by a backdrop that exists only while it's open.
  // Safe area: this shell is the single place the insets are applied for signed-in
  // screens. Top always; bottom is handled by the mobile tab bar / offline banner, so it's
  // only added here on native tablets (no tab bar) while online. Left/right cover
  // landscape notches. Screens must not add their own top inset.
  // Shared by the docked sidebar (wide screens) and the phone drawer (Modal).
  const sidebarBody = (
    <>
              <View className="flex-1 min-h-0">
                {isLargeScreen && (
                  <View className="mb-6 px-1 flex-row items-center gap-x-3 h-10">
                    <Image
                      source={require('@/assets/images/wazipos_icon.png')}
                      resizeMode="contain"
                      className="w-5 h-5"
                      style={{
                        width: 22,
                        height: 22,
                        tintColor: theme.primary,
                      }}
                    />
                    <View className="flex-1 items-start justify-center">
                      <Text
                        style={{
                          color: customTextColor,
                          fontFamily: theme.font.bold,
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
                          fontFamily: theme.font.medium,
                        }}
                        className="text-[9px] tracking-widest uppercase mt-1"
                      >
                        Unified System
                      </Text>
                    </View>
                  </View>
                )}

                <View className="flex-1 min-h-0">
                  <SidebarNavigationList
                    onCloseSidebarTrigger={() =>
                      setSidebarOpen(false)
                    }
                  />
                </View>
              </View>

              <View
                style={{ borderTopColor: structuralBorderColor }}
                className="pt-4 pb-3 border-t w-full gap-y-3"
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={toggleTheme}
                  style={{
                    backgroundColor: theme.background,
                    borderColor: accentBorderColor,
                  }}
                  className="w-full py-2.5 px-4 rounded-xl items-center justify-center border web:hover:opacity-80 transition-all"
                >
                  <Text
                    style={{
                      color: customTextColor,
                      fontFamily: theme.font.bold,
                    }}
                    className="text-xs text-center"
                  >
                    {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={logout}
                  style={{
                    backgroundColor: isDarkMode
                      ? 'rgba(244,63,94,0.15)'
                      : 'rgba(244,63,94,0.10)',
                    borderColor: isDarkMode
                      ? 'rgba(244,63,94,0.4)'
                      : 'rgba(244,63,94,0.25)',
                  }}
                  className="w-full py-2.5 px-4 rounded-xl items-center justify-center border web:hover:opacity-80 transition-all"
                >
                  <Text
                    style={{
                      color: '#f43f5e',
                      fontFamily: theme.font.bold,
                    }}
                    className="text-xs text-center uppercase tracking-widest"
                  >
                    Sign Out
                  </Text>
                </TouchableOpacity>
              </View>
    </>
  );

  const needsBottomInset = Platform.OS !== 'web' && isLargeScreen && isOnline;

  return (
    <>
      {/* Phone/tablet-portrait drawer. A Modal is used because an absolutely positioned
          panel sits *under* the native Stack on Android and can't be seen or tapped. */}
      {!isLargeScreen && (
        <Modal
          visible={sidebarOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setSidebarOpen(false)}
        >
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View
              style={{
                width: 272,
                maxWidth: '85%',
                backgroundColor: theme.panel,
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom,
                paddingLeft: insets.left,
                elevation: 24,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 4, height: 0 },
              }}
              className="flex flex-col px-5 pb-0 justify-between"
            >
              {sidebarBody}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={() => setSidebarOpen(false)}
              style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
            />
          </View>
        </Modal>
      )}
      <View
        style={{
          paddingTop: insets.top,
          paddingBottom: needsBottomInset ? insets.bottom : 0,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          backgroundColor: theme.background,
        }}
        className="flex-1 flex-col w-full overflow-hidden"
      >
        {/* Subscription status, inside the safe area (was drawn under the status bar). */}
        {user && <SubscriptionBanner />}

        {profileDropdownOpen && (
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setProfileDropdownOpen(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 }}
          />
        )}
        <View className="w-full z-50">
          {Platform.OS === 'web' ? (
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
            <View
              style={{
                backgroundColor: theme.panel,
                borderBottomColor: theme.background,
              }}
              className="h-14 w-full border-b px-4 flex-row justify-between items-center shadow-xs"
            >
              <TouchableOpacity
                onPress={() => setSidebarOpen((open) => !open)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Toggle menu"
                style={{ backgroundColor: theme.background }}
                className="p-2 rounded-xl"
              >
                <Text
                  style={{ color: customTextColor }}
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
                style={{ backgroundColor: theme.background }}
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <Text
                  style={{ color: theme.primary }}
                  className="font-bold text-xs uppercase"
                >
                  {user?.name?.charAt(0) || 'W'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="flex-1 flex-row w-full relative overflow-hidden">
          {sidebarOpen && isLargeScreen && (
            <View
              style={{ backgroundColor: theme.panel }}
              className="flex flex-col px-5 pt-5 pb-0 justify-between w-64 min-w-[256px] max-w-[256px] self-stretch"
            >
              {sidebarBody}
            </View>
          )}

          <View
            style={{ backgroundColor: theme.background }}
            className="flex-1 overflow-hidden"
          >
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="client/orders" />
            </Stack>
          </View>
        </View>

        {!isLargeScreen && Platform.OS !== 'web' && (
          <View
            style={{
              backgroundColor: tabBarBg,
              borderTopWidth: 1,
              borderTopColor: tabBarBorder,
              paddingBottom: insets.bottom,
              height: MOBILE_TAB_BAR_HEIGHT + insets.bottom,
              flexDirection: 'row',
              zIndex: 60,
            }}
          >
            {MOBILE_TABS.map((tab) => {
              const isActive = activeTabTitle === tab.title;
              const Icon = tab.icon;
              const color = isActive ? theme.primary : tabInactive;

              return (
                <TouchableOpacity
                  key={tab.title}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (sidebarOpen && !isLargeScreen) {
                      setSidebarOpen(false);
                    }
                    router.push(tab.route as any);
                  }}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingTop: 6,
                    gap: 2,
                  }}
                >
                  <Icon size={18} color={color} strokeWidth={2.2} />
                  <Text
                    style={{
                      color,
                      fontFamily: theme.font.bold,
                      fontSize: 10,
                      letterSpacing: 0.3,
                    }}
                  >
                    {tab.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isOnline && (
          <View
            style={{
              backgroundColor: '#f43f5e',
              paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            }}
            className="w-full py-2 items-center justify-center z-50 shadow-lg"
          >
            <Text
              style={{
                fontFamily: theme.font.bold,
                fontSize: theme.fontSize.xs,
              }}
              className="text-white tracking-wider uppercase text-center"
            >
              ⚠️ Connection Interrupted. Operating in Offline Mode.
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Light': require('@/assets/fonts/Inter-Light.ttf'),
    'Inter-Regular': require('@/assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('@/assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('@/assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('@/assets/fonts/Inter-Bold.ttf'),
    'Inter-Italic': require('@/assets/fonts/Inter-Italic.ttf'),
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
      console.error('[RootLayout] Font loading failed:', fontError);
    }
  }, [fontError]);

  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <NetworkMonitorProvider>
          <RetailerIndentsSyncProvider>
            <EntitiesSyncProvider>

              {/* 🟢 ALL ADMIN CONTEXTS ARE NESTED HERE */}
              <EmployeesSyncProvider>
                <RolesSyncProvider>
                  <DesignationsSyncProvider>
                    <ClustersSyncProvider>
                      <CadresSyncProvider>
                        <DepartmentsSyncProvider>

                          {/* Remaining app providers */}
                          <WholesalerReceiptsSyncProvider>
                            <InventorySyncProvider>
                              <PaymentMethodsSyncProvider>
                                <RoutesSyncProvider>
                                  <FrequenciesSyncProvider>
                                    <PreparationsSyncProvider>
                                      <ProductsSyncProvider>
                                        <CustomerOrdersSyncProvider>
                                          <RetailerOutOfStocksSyncProvider>
                                            <RetailerProductRequestsSyncProvider>
                                              <RetailerOrdersSyncProvider>
                                                <ForecastProvider>
                                                  <ShopperCartProvider>
                                                    <SafeAreaProvider>
                                                      <AlertProvider>
                                                        <SubscriptionSyncProvider>
                                                          <GlobalAppShellLayout />
                                                        </SubscriptionSyncProvider>
                                                      </AlertProvider>
                                                    </SafeAreaProvider>
                                                  </ShopperCartProvider>
                                                </ForecastProvider>
                                              </RetailerOrdersSyncProvider>
                                            </RetailerProductRequestsSyncProvider>
                                          </RetailerOutOfStocksSyncProvider>
                                        </CustomerOrdersSyncProvider>
                                      </ProductsSyncProvider>
                                    </PreparationsSyncProvider>
                                  </FrequenciesSyncProvider>
                                </RoutesSyncProvider>
                              </PaymentMethodsSyncProvider>
                            </InventorySyncProvider>
                          </WholesalerReceiptsSyncProvider>

                        </DepartmentsSyncProvider>
                      </CadresSyncProvider>
                    </ClustersSyncProvider>
                  </DesignationsSyncProvider>
                </RolesSyncProvider>
              </EmployeesSyncProvider>

            </EntitiesSyncProvider>
          </RetailerIndentsSyncProvider>
        </NetworkMonitorProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}