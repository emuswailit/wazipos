import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";

// 🌟 FIXED: Absolute path import to pull your navigation manifest arrays modularly
import { SIDEBAR_NAV_MANIFEST } from "@/utils/navigationData";

interface NavListProps {
    themePrimaryColor?: string;
    themeTextDarkColor?: string;
    onCloseSidebarTrigger?: () => void;
}

export default function SidebarNavigationList({ onCloseSidebarTrigger }: NavListProps) {
    const { user, theme, isDarkMode, toggleTheme, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [activeMenu, setActiveMenu] = useState<string>("");

    // Memoized User Roles Processor
    const userRolesArray: string[] = React.useMemo(() => {
        return user?.roles?.map((r: any) => r?.value).filter(Boolean) || ["Client"];
    }, [user]);

    const handleMenuClick = (link: any) => {
        const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
        if (hasSubroutes) {
            setActiveMenu(activeMenu === link.title ? "" : link.title);
        } else {
            setActiveMenu("");
            router.push(link.route as any);
            if (onCloseSidebarTrigger) {
                onCloseSidebarTrigger();
            }
        }
    };

    const hasAccessPermission = (routeAllowedRoles: string[]) => {
        return routeAllowedRoles.some(role => userRolesArray.includes(role));
    };

    const authorizedRoutes = SIDEBAR_NAV_MANIFEST.filter(item =>
        item.showInSidebar && hasAccessPermission(item.allowedRoles)
    );

    const customBorderColor = isDarkMode ? "#334155" : theme.primary;
    const customTextColor = isDarkMode ? "#ffffff" : theme.primary;

    return (
        <View className="flex-1 justify-between h-full">

            {/* ─── SCROLLABLE MIDDLE NAVIGATION OPTIONS AREA ─── */}
            <View className="flex-1 min-h-0">
                {Platform.OS === 'web' && onCloseSidebarTrigger && (
                    <View style={{ borderBottomColor: customBorderColor }} className="flex-row justify-between items-center pb-3 border-b mb-2 px-1">
                        <Text style={{ color: isDarkMode ? "#ffffff" : theme.textDark }} className="text-[10px] font-black uppercase tracking-widest">
                            Navigation Menu
                        </Text>
                        <TouchableOpacity
                            activeOpacity={0.6}
                            onPress={onCloseSidebarTrigger}
                            className="p-1.5 px-3 rounded-lg bg-red-500/10"
                        >
                            <Text className="text-red-500 font-bold text-xs">✕ Close</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    className="space-y-2"
                >
                    {authorizedRoutes.map((link) => {
                        const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
                        const cleanRoutePath = link.route.replace(/\/\([^)]+\)/g, '');
                        const isRouteActive = pathname === cleanRoutePath;
                        const isMenuOpen = activeMenu === link.title;

                        const activeItemBg = isRouteActive
                            ? (isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(59, 130, 246, 0.1)")
                            : "transparent";

                        return (
                            <View key={link.id} className="mb-2">
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => handleMenuClick(link)}
                                    style={{
                                        backgroundColor: activeItemBg,
                                        borderColor: customBorderColor
                                    }}
                                    className="flex-row justify-between items-center py-3 px-4 rounded-xl border web:hover:opacity-70 transition-all"
                                >
                                    <Text style={{ color: customTextColor }} className="font-bold text-sm tracking-wide">
                                        {link.title}
                                    </Text>
                                    {hasSubroutes && (
                                        <Text style={{ color: customTextColor }} className="text-[10px] font-black">
                                            {isMenuOpen ? "▲" : "▼"}
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {hasSubroutes && isMenuOpen && (
                                    <View style={{ borderLeftColor: customBorderColor }} className="pl-4 mt-2 border-l-2 ml-4 gap-y-1 py-1">
                                        {link.subRoutes!
                                            .filter(sub => sub.showInSidebar && hasAccessPermission(sub.allowedRoles))
                                            .map(subItem => {
                                                const isSubActive = subItem.route.includes(pathname);
                                                const activeSubBg = isSubActive
                                                    ? (isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(59, 130, 246, 0.1)")
                                                    : "transparent";

                                                return (
                                                    <TouchableOpacity
                                                        key={subItem.title}
                                                        activeOpacity={0.6}
                                                        onPress={() => {
                                                            router.push(subItem.route as any);
                                                            if (onCloseSidebarTrigger) {
                                                                onCloseSidebarTrigger();
                                                            }
                                                        }}
                                                        style={{
                                                            backgroundColor: activeSubBg,
                                                            borderColor: customBorderColor
                                                        }}
                                                        className="py-2.5 px-3 rounded-xl border my-0.5 web:hover:opacity-70 transition-all"
                                                    >
                                                        <Text style={{ color: isSubActive ? theme.primary : theme.text }} className="font-bold text-xs">
                                                            {subItem.title}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })
                                        }
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ─── STICKY FOOTER ANCHOR PANEL (PERMANENTLY PINNED AT THE BOTTOM) ─── */}
            <View style={{ borderTopColor: customBorderColor }} className="pt-4 border-t w-full gap-y-2 bg-transparent">
                {/* <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={toggleTheme}
                    style={{ backgroundColor: theme.background, borderColor: customBorderColor }}
                    className="w-full py-2.5 px-4 rounded-xl items-center justify-center border web:hover:opacity-80 transition-all"
                >
                    <Text style={{ color: customTextColor }} className="text-xs font-bold text-center">
                        {isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
                    </Text>
                </TouchableOpacity> */}

                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={async () => {
                        await logout();
                        if (onCloseSidebarTrigger) onCloseSidebarTrigger();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl items-center justify-center bg-red-500/10 border border-red-500/20 web:hover:bg-red-500/20 transition-all"
                >
                    <Text className="text-xs font-black text-red-500 uppercase tracking-wider">
                        Sign Out
                    </Text>
                </TouchableOpacity>
            </View>

        </View>
    );
}
