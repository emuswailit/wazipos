// components/navigation/WebSidebar.tsx

import { useAuth } from '@/context/AuthContext';
import {
    SIDEBAR_NAV_MANIFEST,
    checkAccessPermission,
} from '@/utils/navigationData';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const INACTIVE_TEXT = '#94a3b8'; // slate-400

export default function WebSidebar() {
    const { user, theme, isDarkMode, toggleTheme } = useAuth(); // assuming toggleTheme exists here
    const router = useRouter();
    const pathname = usePathname();
    const [expandedMenus, setExpandedMenus] = useState<{
        [key: string]: boolean;
    }>({});

    const currentUserRole = user?.role || 'Client';
    const authorizedRoutes = SIDEBAR_NAV_MANIFEST.filter(
        (item) =>
            item.showInSidebar &&
            checkAccessPermission(
                currentUserRole,
                item.allowedRoles
            )
    );

    /* Auto-expand parent menus when a child route is active */
    useEffect(() => {
        const toExpand: { [key: string]: boolean } = {};
        authorizedRoutes.forEach((link) => {
            if (
                link.subRoutes?.some((sub) =>
                    pathname.startsWith(
                        sub.route.split('?')[0]
                    )
                )
            ) {
                toExpand[link.title] = true;
            }
        });
        if (Object.keys(toExpand).length > 0) {
            setExpandedMenus((prev) => ({ ...prev, ...toExpand }));
        }
    }, [pathname, authorizedRoutes]);

    const toggleSubmenu = (title: string) => {
        setExpandedMenus((p) => ({
            ...p,
            [title]: !p[title],
        }));
    };

    return (
        <View
            style={{
                backgroundColor: '#0b1329',
                borderColor: '#1e293b',
            }}
            // Removed justify-between so the nav can fill the space naturally
            className="hidden md:flex flex-col w-72 h-full border-r p-6 shadow-xl"
        >
            {/* Brand / logo */}
            <View className="mb-10 px-2 flex-row items-center justify-between">
                <View>
                    <Text
                        style={{
                            color: '#ffffff',
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xxl,
                            letterSpacing: -0.5,
                        }}
                    >
                        wazi
                        <Text
                            style={{
                                color: theme.primary,
                            }}
                        >
                            pos
                        </Text>
                    </Text>

                    <Text
                        style={{
                            color: '#64748b',
                            fontFamily: theme.font.semibold,
                            fontSize: theme.fontSize.sm,
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                            marginTop: 4,
                        }}
                    >
                        Unified Platform
                    </Text>
                </View>

                {/* Role badge */}
                <View
                    style={{
                        backgroundColor: '#1e293b',
                        borderColor: theme.primary + '30',
                    }}
                    className="px-2.5 py-1 rounded-lg border"
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.sm,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                        }}
                    >
                        {currentUserRole}
                    </Text>
                </View>
            </View>

            {/* Navigation — now flex-1 so it stretches to fill available height */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                className="flex-1 space-y-1"
            >
                {authorizedRoutes.map((link) => {
                    const hasSubroutes =
                        link.subRoutes && link.subRoutes.length > 0;

                    const childIsActive =
                        link.subRoutes?.some((sub) =>
                            pathname.startsWith(
                                sub.route.split('?')[0]
                            )
                        ) ?? false;

                    const isRouteActive =
                        pathname === link.route ||
                        (hasSubroutes && childIsActive);

                    const isMenuOpen =
                        expandedMenus[link.title] ?? childIsActive;

                    const titleColor = isRouteActive
                        ? theme.primary
                        : INACTIVE_TEXT;

                    return (
                        <View key={link.title} className="mb-2">
                            <TouchableOpacity
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityState={{
                                    expanded: isMenuOpen,
                                    selected: isRouteActive,
                                }}
                                onPress={() =>
                                    hasSubroutes
                                        ? toggleSubmenu(link.title)
                                        : router.push(
                                            link.route as any
                                        )
                                }
                                style={{
                                    backgroundColor:
                                        isRouteActive
                                            ? theme.primary + '25'
                                            : 'transparent',
                                    borderColor: isRouteActive
                                        ? theme.primary + '50'
                                        : 'transparent',
                                }}
                                className="flex-row justify-between items-center py-3 px-4 rounded-xl border transition-all web:hover:bg-slate-800/40"
                            >
                                <Text
                                    style={{
                                        color: titleColor,
                                        fontFamily: isRouteActive
                                            ? theme.font.bold
                                            : theme.font.semibold,
                                        fontSize:
                                            theme.fontSize.xl,
                                        letterSpacing: 0.3,
                                    }}
                                >
                                    {link.title}
                                </Text>

                                {hasSubroutes && (
                                    <Text
                                        style={{
                                            color: isMenuOpen
                                                ? theme.primary
                                                : '#64748b',
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize.lg,
                                        }}
                                    >
                                        {isMenuOpen ? '▲' : '▼'}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            {hasSubroutes && isMenuOpen && (
                                <View
                                    style={{
                                        borderLeftColor:
                                            theme.primary + '30',
                                    }}
                                    className="pl-4 mt-1 border-l-2 ml-4 gap-y-1 py-1"
                                >
                                    {link.subRoutes!
                                        .filter(
                                            (sub) =>
                                                sub.showInSidebar &&
                                                checkAccessPermission(
                                                    currentUserRole,
                                                    sub.allowedRoles
                                                )
                                        )
                                        .map((subItem) => {
                                            const isSubActive =
                                                pathname.startsWith(
                                                    subItem.route.split(
                                                        '?'
                                                    )[0]
                                                );
                                            return (
                                                <TouchableOpacity
                                                    key={
                                                        subItem.title
                                                    }
                                                    activeOpacity={
                                                        0.7
                                                    }
                                                    accessibilityRole="button"
                                                    accessibilityState={{
                                                        selected:
                                                            isSubActive,
                                                    }}
                                                    onPress={() =>
                                                        router.push(
                                                            subItem.route as any
                                                        )
                                                    }
                                                    className="py-2 px-3 rounded-lg web:hover:bg-slate-800/30"
                                                >
                                                    <Text
                                                        style={{
                                                            color: isSubActive
                                                                ? theme.primary
                                                                : INACTIVE_TEXT,
                                                            fontFamily:
                                                                isSubActive
                                                                    ? theme
                                                                        .font
                                                                        .bold
                                                                    : theme
                                                                        .font
                                                                        .semibold,
                                                            fontSize:
                                                                theme
                                                                    .fontSize
                                                                    .lg,
                                                            letterSpacing: 0.2,
                                                        }}
                                                    >
                                                        {
                                                            subItem.title
                                                        }
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

            {/* Compact Footer: Dark/Light Mode Toggle Only */}
            <View className="border-t border-slate-800/60 pt-4 px-1 flex-row justify-end">
                <TouchableOpacity
                    onPress={toggleTheme}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle dark mode"
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 web:hover:bg-slate-800/60 active:bg-slate-800 transition-all"
                >
                    <Text style={{ fontSize: 16 }}>
                        {isDarkMode ? '☀️' : '🌙'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}