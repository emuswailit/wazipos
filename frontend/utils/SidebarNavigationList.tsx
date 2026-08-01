import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface SidebarRoute {
    title: string;
    route: string;
    allowedRoles: string[];
    showInSidebar: boolean;
    subRoutes?: SidebarRoute[];
}

export const SIDEBAR_NAV_MANIFEST: SidebarRoute[] = [
    {
        title: "Adjacent Stores",
        route: "/(tabs)",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        title: "Client Orders Ledger",
        route: "/(home)/orders", // Points correctly to the standalone stacks route
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        title: "Inventory Control",
        route: "/(tabs)/business",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            { title: "Stock Monitor", route: "/(tabs)/business?tab=stock", allowedRoles: ["Admin", "Vendor"], showInSidebar: true },
            { title: "Restock Orders", route: "/(tabs)/business?tab=orders", allowedRoles: ["Admin"], showInSidebar: true },
        ]
    },
    {
        title: "Accounts Ledger",
        route: "/(tabs)/business",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        title: "My Profile",
        route: "/(tabs)/profile",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
];

interface NavListProps {
    currentUserRole: string;
    themePrimaryColor: string;
    themeTextDarkColor: string;
}

export default function SidebarNavigationList({ currentUserRole, themePrimaryColor, themeTextDarkColor }: NavListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [activeMenu, setActiveMenu] = useState<string>("");

    const handleMenuClick = (link: SidebarRoute) => {
        const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
        if (hasSubroutes) {
            setActiveMenu(activeMenu === link.title ? "" : link.title);
        } else {
            setActiveMenu("");
            router.push(link.route as any);
        }
    };

    const hasAccessPermission = (routeAllowedRoles: string[]) => {
        return routeAllowedRoles.includes(currentUserRole);
    };

    const authorizedRoutes = SIDEBAR_NAV_MANIFEST.filter(item =>
        item.showInSidebar && hasAccessPermission(item.allowedRoles)
    );

    return (
        <ScrollView showsVerticalScrollIndicator={false} className="space-y-2">
            {authorizedRoutes.map((link) => {
                const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
                const isRouteActive = pathname === link.route;
                const isMenuOpen = activeMenu === link.title;

                return (
                    <View key={link.title} className="mb-2">
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => handleMenuClick(link)}
                            style={{
                                backgroundColor: isRouteActive ? "rgba(255, 255, 255, 0.25)" : "transparent",
                                borderColor: "#ffffff"
                            }}
                            className="flex-row justify-between items-center py-3 px-4 rounded-xl border web:hover:opacity-60 transition-all"
                        >
                            <Text className="font-bold text-sm tracking-wide text-white">{link.title}</Text>
                            {hasSubroutes && <Text className="text-[10px] font-black text-white/70">{isMenuOpen ? "▲" : "▼"}</Text>}
                        </TouchableOpacity>

                        {hasSubroutes && isMenuOpen && (
                            <View style={{ borderLeftColor: "#ffffff" }} className="pl-4 mt-2 border-l-2 ml-4 gap-y-1 py-1">
                                {link.subRoutes!
                                    .filter(sub => sub.showInSidebar && hasAccessPermission(sub.allowedRoles))
                                    .map(subItem => (
                                        <TouchableOpacity
                                            key={subItem.title}
                                            activeOpacity={0.6}
                                            onPress={() => router.push(subItem.route as any)}
                                            style={{ borderColor: "#ffffff", backgroundColor: pathname === subItem.route ? "rgba(255, 255, 255, 0.15)" : "transparent" }}
                                            className="py-2.5 px-3 rounded-xl border my-0.5 web:hover:opacity-60 transition-all"
                                        >
                                            <Text className="text-white font-bold text-xs">{subItem.title}</Text>
                                        </TouchableOpacity>
                                    ))
                                }
                            </View>
                        )}
                    </View>
                );
            })}
        </ScrollView>
    );
}
