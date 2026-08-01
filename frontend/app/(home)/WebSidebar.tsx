import { useAuth } from "@/context/AuthContext";
import { SIDEBAR_NAV_MANIFEST, checkAccessPermission } from "@/utils/navigationData";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function WebSidebar() {
    const { user, logout, theme } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});

    const currentUserRole = user?.role || "Client";
    const authorizedRoutes = SIDEBAR_NAV_MANIFEST.filter(item =>
        item.showInSidebar && checkAccessPermission(currentUserRole, item.allowedRoles)
    );

    const toggleSubmenu = (title: string) => {
        setExpandedMenus(p => ({ ...p, [title]: !p[title] }));
    };

    return (
        /* 
          Sleek Context-Driven Theme Architecture:
          - Uses theme.primary mixed with dark slate tones to color elements dynamically.
        */
        <View
            style={{ backgroundColor: "#0b1329", borderColor: "#1e293b" }}
            className="hidden md:flex flex-col w-64 h-full border-r p-6 shadow-xl justify-between"
        >
            <View>
                {/* Brand Identity / Logo Section */}
                <View className="mb-10 px-2 flex-row items-center justify-between">
                    <View>
                        <Text className="text-white text-2xl font-black tracking-tight">
                            wazi<Text style={{ color: theme.primary }}>pos</Text>
                        </Text>
                        <Text className="text-slate-500 text-[10px] font-medium tracking-widest uppercase mt-0.5">
                            Unified Platform
                        </Text>
                    </View>

                    {/* Micro Role Badge Colored with context primary */}
                    <View style={{ backgroundColor: "#1e293b", borderColor: theme.primary + "30" }} className="px-2.5 py-1 rounded-lg border">
                        <Text style={{ color: theme.primary }} className="text-[9px] font-extrabold uppercase tracking-wider">
                            {currentUserRole}
                        </Text>
                    </View>
                </View>

                {/* Modular Navigation List Container */}
                <ScrollView showsVerticalScrollIndicator={false} className="space-y-1">
                    {authorizedRoutes.map((link) => {
                        const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
                        const isRouteActive = pathname === link.route;
                        const isMenuOpen = expandedMenus[link.title];

                        return (
                            <View key={link.title} className="mb-1.5">
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => hasSubroutes ? toggleSubmenu(link.title) : router.push(link.route as any)}
                                    style={{
                                        // Context color highlights: generates dynamic translucent backgrounds via hex alpha channels
                                        backgroundColor: isRouteActive ? theme.primary + "25" : "transparent",
                                        borderColor: isRouteActive ? theme.primary + "50" : "transparent"
                                    }}
                                    className="flex-row justify-between items-center py-3 px-4 rounded-xl border transition-all web:hover:bg-slate-800/40"
                                >
                                    <Text
                                        style={{ color: isRouteActive ? theme.primary : "#94a3b8" }}
                                        className="font-bold text-sm tracking-wide"
                                    >
                                        {link.title}
                                    </Text>

                                    {hasSubroutes && (
                                        <Text
                                            style={{ color: isMenuOpen ? theme.primary : "#475569" }}
                                            className="text-[10px] font-black"
                                        >
                                            {isMenuOpen ? "▲" : "▼"}
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {/* Smooth Multi-Level Sub-Route Nested Drawer */}
                                {hasSubroutes && isMenuOpen && (
                                    <View style={{ borderLeftColor: theme.primary + "30" }} className="pl-4 mt-1 border-l-2 ml-4 gap-y-1 py-1">
                                        {link.subRoutes!
                                            .filter(sub => sub.showInSidebar && checkAccessPermission(currentUserRole, sub.allowedRoles))
                                            .map(subItem => {
                                                const isSubActive = pathname.includes(subItem.route.split("?")[0]);
                                                return (
                                                    <TouchableOpacity
                                                        key={subItem.title}
                                                        activeOpacity={0.7}
                                                        onPress={() => router.push(subItem.route as any)}
                                                        className="py-2 px-3 rounded-lg web:hover:bg-slate-800/30"
                                                    >
                                                        <Text
                                                            style={{ color: isSubActive ? theme.primary : "#64748b" }}
                                                            className={`text-xs font-semibold ${isSubActive ? "font-bold" : ""}`}
                                                        >
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

            {/* Disconnect Button Footer Section */}
            <View className="border-t border-slate-800/60 pt-4 px-1">
                <TouchableOpacity
                    onPress={logout}
                    className="w-full py-3 items-center rounded-xl bg-slate-900 border border-red-500/20 web:hover:bg-red-950/20 active:bg-red-950/30 transition-all"
                >
                    <Text className="text-[11px] font-extrabold text-red-400 uppercase tracking-widest">
                        Disconnect Session
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
