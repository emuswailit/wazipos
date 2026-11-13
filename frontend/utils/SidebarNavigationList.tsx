// components/navigation/SidebarNavigationList.tsx

import { useAuth } from "@/context/AuthContext";
import { SIDEBAR_NAV_MANIFEST } from "@/utils/navigationData";
import { usePathname, useRouter } from "expo-router";
import {
    Activity, AlertTriangle, ArrowLeftRight, BadgePercent, BarChart3, BookOpen,
    Boxes, CalendarX, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList,
    Clock, CreditCard, FileCheck, FileText, FlaskConical, FolderTree, Gift,
    Layers, Layers2, LayoutDashboard, Megaphone, Package, PackageX, Pill,
    PlusCircle, Receipt, RefreshCw, Route, ShieldCheck, ShoppingBag,
    ShoppingCart, Sliders, Store, Tag, TestTube, TrendingUp, Undo2, User,
    UserCircle, Users, Wallet, Warehouse, type LucideIcon,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";

interface NavListProps {
    themePrimaryColor?: string;
    themeTextDarkColor?: string;
    onCloseSidebarTrigger?: () => void;
}

function cleanPath(path: string): string {
    return (path.replace(/\/\([^)]+\)/g, "").replace(/\/+$/, "") || "/");
}

const LUCIDE_ICONS: Record<string, LucideIcon> = {
    Activity, AlertTriangle, ArrowLeftRight, BadgePercent, BarChart3, BookOpen,
    Boxes, CalendarX, ClipboardCheck, ClipboardList, Clock, CreditCard,
    FileCheck, FileText, FlaskConical, FolderTree, Gift, LayoutDashboard,
    Layers, Layers2, Megaphone, Package, PackageX, Pill, PlusCircle, Receipt,
    RefreshCw, Route, ShieldCheck, ShoppingBag, ShoppingCart, Sliders, Store,
    Tag, TestTube, TrendingUp, Undo2, User, UserCircle, Users, Wallet, Warehouse,
};

function initials(title: string): string {
    const parts = title.replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/);
    if (parts.length === 0) return "•";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/*
 * IconSlot now renders the icon in the SAME color as the label.
 * No tinted square background — the icon floats next to the text.
 */
function IconSlot({
    item,
    color,
    size = 18,
    iconSize = 16,
}: {
    item: any;
    color: string;
    size?: number;
    iconSize?: number;
}) {
    const Comp = item.icon ? LUCIDE_ICONS[item.icon as string] : undefined;

    if (Comp) {
        return <Comp size={iconSize} color={color} strokeWidth={2} />;
    }

    // Fallback: initials glyph, same color as label
    return (
        <View
            style={{
                width: size,
                height: size,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Text
                style={{
                    fontSize: iconSize - 3,
                    fontWeight: "700",
                    color,
                    letterSpacing: 0.4,
                }}
            >
                {initials(String(item.title ?? "?"))}
            </Text>
        </View>
    );
}

export default function SidebarNavigationList({ onCloseSidebarTrigger }: NavListProps) {
    const { user, theme, isDarkMode } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [activeMenu, setActiveMenu] = useState<string>("");

    const userRolesArray: string[] = useMemo(
        () => user?.roles?.map((r: any) => r?.value).filter(Boolean) || ["Client"],
        [user]
    );

    const hasAccessPermission = (routeAllowedRoles: string[]) =>
        routeAllowedRoles.some((role) => userRolesArray.includes(role));

    const authorizedRoutes = useMemo(
        () =>
            SIDEBAR_NAV_MANIFEST.filter(
                (item) => item.showInSidebar && hasAccessPermission(item.allowedRoles)
            ),
        [userRolesArray]
    );

    const cleanCurrentPath = cleanPath(pathname);

    useEffect(() => {
        const parent = authorizedRoutes.find((link) =>
            link.subRoutes?.some((sub) =>
                cleanCurrentPath.startsWith(cleanPath(sub.route.split("?")[0]))
            )
        );
        if (parent) setActiveMenu(parent.title);
    }, [cleanCurrentPath, authorizedRoutes]);

    const handleMenuClick = (link: any) => {
        const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
        if (hasSubroutes) {
            setActiveMenu(activeMenu === link.title ? "" : link.title);
        } else {
            setActiveMenu("");
            router.push(link.route as any);
            if (onCloseSidebarTrigger) onCloseSidebarTrigger();
        }
    };

    const dividerColor = isDarkMode ? "#334155" : "#e2e8f0";
    const inactiveLabel = isDarkMode ? "#94a3b8" : "#64748b";
    const inactiveLabelStrong = isDarkMode ? "#cbd5e1" : "#334155";
    const activeBg = isDarkMode ? "rgba(255,255,255,0.08)" : `${theme.primary}12`;
    const headerLabelColor = isDarkMode ? "#ffffff" : theme.textDark;

    return (
        <View style={{ flex: 1, minHeight: 0 }}>
            {Platform.OS === "web" && onCloseSidebarTrigger && (
                <View
                    style={{ borderBottomColor: dividerColor }}
                    className="flex-row justify-between items-center pb-3 border-b mb-2 px-1"
                >
                    <Text
                        className="tracking-widest text-[10px]"
                        style={{ fontFamily: theme.font.bold, color: headerLabelColor }}
                    >
                        Navigation Menu
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.6}
                        onPress={onCloseSidebarTrigger}
                        className="p-1.5 px-2.5 rounded-md"
                        style={{ backgroundColor: "rgba(244,63,94,0.10)" }}
                    >
                        <Text
                            className="text-red-500 text-[10px] tracking-wider"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            ✕ Close
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
            >
                {authorizedRoutes.map((link) => {
                    const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
                    const isRouteActive = cleanCurrentPath === cleanPath(link.route);
                    const childIsActive =
                        link.subRoutes?.some((sub) =>
                            cleanCurrentPath.startsWith(cleanPath(sub.route.split("?")[0]))
                        ) ?? false;
                    const parentIsActive = isRouteActive || childIsActive;
                    const isMenuOpen =
                        activeMenu === link.title ||
                        (childIsActive && activeMenu !== link.title && activeMenu === "");

                    // Label + icon share this color for parent rows
                    const parentColor = parentIsActive
                        ? theme.primary
                        : inactiveLabelStrong;

                    return (
                        <View key={link.id}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityState={{ selected: parentIsActive, expanded: isMenuOpen }}
                                onPress={() => handleMenuClick(link)}
                                style={{ backgroundColor: parentIsActive ? activeBg : "transparent" }}
                                className="flex-row items-center justify-between py-2.5 px-2 rounded-lg web:hover:bg-slate-500/5"
                            >
                                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                                    <IconSlot item={link} color={parentColor} />
                                    <Text
                                        numberOfLines={1}
                                        className="text-[13px] flex-1"
                                        style={{
                                            fontFamily: parentIsActive
                                                ? theme.font.bold
                                                : theme.font.medium,
                                            color: parentColor,
                                        }}
                                    >
                                        {link.title}
                                    </Text>
                                </View>

                                {hasSubroutes ? (
                                    <View className="ml-1">
                                        {isMenuOpen ? (
                                            <ChevronUp size={14} color={parentColor} />
                                        ) : (
                                            <ChevronDown size={14} color={parentColor} />
                                        )}
                                    </View>
                                ) : null}
                            </TouchableOpacity>

                            {hasSubroutes && isMenuOpen && (
                                <View
                                    className="ml-5 pl-4 mt-0.5 mb-1"
                                    style={{ borderLeftWidth: 1, borderLeftColor: dividerColor }}
                                >
                                    {link.subRoutes!
                                        .filter(
                                            (sub) => sub.showInSidebar && hasAccessPermission(sub.allowedRoles)
                                        )
                                        .map((subItem) => {
                                            const isSubActive = cleanCurrentPath.startsWith(
                                                cleanPath(subItem.route.split("?")[0])
                                            );

                                            // Label + icon share this color for sub rows
                                            const subColor = isSubActive
                                                ? theme.primary
                                                : inactiveLabel;

                                            return (
                                                <TouchableOpacity
                                                    key={subItem.title}
                                                    activeOpacity={0.6}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: isSubActive }}
                                                    onPress={() => {
                                                        router.push(subItem.route as any);
                                                        if (onCloseSidebarTrigger) onCloseSidebarTrigger();
                                                    }}
                                                    style={{
                                                        backgroundColor: isSubActive ? activeBg : "transparent",
                                                    }}
                                                    className="flex-row items-center gap-2.5 py-2 pl-2 pr-2 rounded-lg web:hover:bg-slate-500/5"
                                                >
                                                    <IconSlot
                                                        item={subItem}
                                                        color={subColor}
                                                        size={16}
                                                        iconSize={14}
                                                    />
                                                    <Text
                                                        numberOfLines={1}
                                                        className="text-[12px] flex-1"
                                                        style={{
                                                            fontFamily: isSubActive
                                                                ? theme.font.bold
                                                                : theme.font.medium,
                                                            color: subColor,
                                                        }}
                                                    >
                                                        {subItem.title}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}