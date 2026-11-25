// components/navigation/SidebarNavigationList.tsx

import { useAuth } from "@/context/AuthContext";
import { useHiddenMenus } from "@/utils/menuPrefs";
import { SIDEBAR_NAV_MANIFEST } from "@/utils/navigationData";
import { usePathname, useRouter } from "expo-router";
import {
    Activity, AlertTriangle, ArrowLeftRight, BadgePercent, BarChart3, BookOpen,
    Boxes, CalendarX, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList,
    Clock, CreditCard, FileCheck, FileText, FlaskConical, FolderTree, Gift,
    Layers, Layers2, LayoutDashboard, Megaphone, Package, PackageX, Pill,
    PlusCircle, Receipt, RefreshCw, Route, ShieldCheck, ShoppingBag,
    ShoppingCart, Sliders, Store, Tag, TestTube, TrendingUp, Undo2, User,
    UserCircle, Users, Wallet, Warehouse, Truck, Bike, PackageCheck, UtensilsCrossed, Wifi,
    AlertCircle, Banknote, BedDouble, Building2, CalendarCheck, CalendarDays, CircleDollarSign, ClipboardPlus,
    FileEdit, FileSearch, Gauge, HandCoins, LineChart, ListOrdered, Package2, PackageOpen, PackagePlus,
    Factory, Radio, ReceiptText, Repeat2, RotateCcw, RotateCw, ShoppingBasket, Briefcase, Bookmark, Search, X,
    Church, MapPin, HouseHeart, EyeOff, HeartHandshake, UsersRound, MessageSquare, UserCog, Landmark, Map, type LucideIcon,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

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
    Truck, Bike, PackageCheck, UtensilsCrossed, Wifi,
    // Used by navigationData but missing before (they showed as initials, e.g. "PL", "PR").
    AlertCircle, Banknote, BedDouble, Building2, CalendarCheck, CalendarDays, CircleDollarSign, ClipboardPlus,
    FileEdit, FileSearch, Gauge, HandCoins, LineChart, ListOrdered, Package2, PackageOpen, PackagePlus,
    Factory, Radio, ReceiptText, Repeat2, RotateCcw, RotateCw, ShoppingBasket,
    Briefcase, Bookmark, Search,
    Church, MapPin, HouseHeart, EyeOff, HeartHandshake, UsersRound, MessageSquare, UserCog, Landmark, Map,
};

/** Every search word must appear in the title, the parent's title or the route (so "billing" finds "Tokens & usage"). */
function matches(item: any, terms: string[], parentTitle = ""): boolean {
    const route = String(item.route ?? "").replace(/[/?=&_-]+/g, " ");
    const hay = `${item.title ?? ""} ${parentTitle} ${route}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
}

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
    // Keyword filter for the menu: all typed words must match (title or route words).
    const [query, setQuery] = useState("");
    const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
    const searching = terms.length > 0;

    const userRolesArray: string[] = useMemo(
        () => user?.roles?.map((r: any) => r?.value).filter(Boolean) || ["Client"],
        [user]
    );

    const hasAccessPermission = (routeAllowedRoles: string[]) =>
        routeAllowedRoles.some((role) => userRolesArray.includes(role));

    // Sections the person hid (e.g. Church) stay out of the menu; see utils/menuPrefs.
    const { hidden } = useHiddenMenus();

    const authorizedRoutes = useMemo(
        () =>
            SIDEBAR_NAV_MANIFEST.filter(
                (item) => item.showInSidebar && hasAccessPermission(item.allowedRoles) && !(item.hideKey && hidden.includes(item.hideKey))
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userRolesArray, hidden]
    );

    const visibleSubs = (link: any): any[] =>
        (link.subRoutes ?? []).filter((sub: any) => sub.showInSidebar && hasAccessPermission(sub.allowedRoles));

    /* While searching: a parent whose own title matches keeps all its items; otherwise it shows
       only the items that match (hidden when none do). Results are shown opened. */
    const shownRoutes = useMemo(() => {
        if (!searching) return authorizedRoutes.map((link) => ({ link, subs: visibleSubs(link) }));
        const out: { link: any; subs: any[] }[] = [];
        for (const link of authorizedRoutes) {
            const subs = visibleSubs(link);
            if (matches(link, terms)) {
                out.push({ link, subs });
                continue;
            }
            const hits = subs.filter((sub) => matches(sub, terms, link.title));
            if (hits.length) out.push({ link, subs: hits });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authorizedRoutes, terms, searching]);

    /** Enter in the search box opens the first result. */
    const openFirstResult = () => {
        const first = shownRoutes[0];
        if (!first) return;
        const target = first.subs.length ? first.subs[0] : first.link;
        setQuery("");
        router.push(target.route as any);
        if (onCloseSidebarTrigger) onCloseSidebarTrigger();
    };

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
        if (hasSubroutes && searching) {
            // Tapping a parent in the results clears the search and leaves that menu open.
            setQuery("");
            setActiveMenu(link.title);
        } else if (hasSubroutes) {
            setActiveMenu(activeMenu === link.title ? "" : link.title);
        } else {
            setActiveMenu("");
            setQuery("");
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

            {/* Search the menu */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: searching ? theme.primary : dividerColor,
                    backgroundColor: isDarkMode ? "rgba(255,255,255,0.04)" : "#f8fafc",
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    marginBottom: 8,
                    marginHorizontal: 2,
                }}
            >
                <Search size={14} color={searching ? theme.primary : inactiveLabel} />
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search menu..."
                    placeholderTextColor={inactiveLabel}
                    returnKeyType="go"
                    onSubmitEditing={openFirstResult}
                    onKeyPress={(e: any) => {
                        if (e?.nativeEvent?.key === "Escape") setQuery("");
                    }}
                    autoCorrect={false}
                    autoCapitalize="none"
                    accessibilityLabel="Search menu"
                    style={[
                        {
                            flex: 1,
                            minWidth: 0,
                            paddingVertical: 8,
                            fontSize: 13,
                            fontFamily: theme.font.medium,
                            color: inactiveLabelStrong,
                        },
                        Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null,
                    ]}
                />
                {searching ? (
                    <TouchableOpacity onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                        <X size={14} color={inactiveLabel} />
                    </TouchableOpacity>
                ) : null}
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
            >
                {searching && shownRoutes.length === 0 ? (
                    <Text style={{ color: inactiveLabel, fontFamily: theme.font.medium, fontSize: 12, paddingHorizontal: 8, paddingVertical: 12 }}>
                        Nothing in the menu matches "{query.trim()}".
                    </Text>
                ) : null}
                {shownRoutes.map(({ link, subs }) => {
                    const hasSubroutes = link.subRoutes && link.subRoutes.length > 0;
                    const isRouteActive = cleanCurrentPath === cleanPath(link.route);
                    const childIsActive =
                        link.subRoutes?.some((sub: any) =>
                            cleanCurrentPath.startsWith(cleanPath(sub.route.split("?")[0]))
                        ) ?? false;
                    const parentIsActive = isRouteActive || childIsActive;
                    const isMenuOpen =
                        searching ||
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
                                    {subs.map((subItem: any) => {
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
                                                        if (searching) setQuery("");
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