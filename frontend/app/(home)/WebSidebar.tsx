// components/navigation/WebSidebar.tsx

import { useAuth } from '@/context/AuthContext';
import {
    SIDEBAR_NAV_MANIFEST,
    checkAccessPermission,
} from '@/utils/navigationData';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function WebSidebar() {
    const { user, logout, theme } = useAuth();
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
            className="hidden md:flex flex-col w-72 h-full border-r p-6 shadow-xl justify-between"
        >
            <View>
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

                {/* Navigation */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    className="space-y-1"
                >
                    {authorizedRoutes.map((link) => {
                        const hasSubroutes =
                            link.subRoutes &&
                            link.subRoutes.length > 0;
                        const isRouteActive =
                            pathname === link.route;
                        const isMenuOpen =
                            expandedMenus[link.title];

                        return (
                            <View
                                key={link.title}
                                className="mb-2"
                            >
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() =>
                                        hasSubroutes
                                            ? toggleSubmenu(
                                                link.title
                                            )
                                            : router.push(
                                                link.route as any
                                            )
                                    }
                                    style={{
                                        backgroundColor:
                                            isRouteActive
                                                ? theme.primary +
                                                '25'
                                                : 'transparent',
                                        borderColor: isRouteActive
                                            ? theme.primary +
                                            '50'
                                            : 'transparent',
                                    }}
                                    className="flex-row justify-between items-center py-3 px-4 rounded-xl border transition-all web:hover:bg-slate-800/40"
                                >
                                    <Text
                                        style={{
                                            color: theme.primary,
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize:
                                                theme.fontSize
                                                    .xl,
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
                                                    theme
                                                        .fontSize
                                                        .lg,
                                            }}
                                        >
                                            {isMenuOpen
                                                ? '▲'
                                                : '▼'}
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {hasSubroutes && isMenuOpen && (
                                    <View
                                        style={{
                                            borderLeftColor:
                                                theme.primary +
                                                '30',
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
                                                    pathname.includes(
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
                                                        onPress={() =>
                                                            router.push(
                                                                subItem.route as any
                                                            )
                                                        }
                                                        className="py-2 px-3 rounded-lg web:hover:bg-slate-800/30"
                                                    >
                                                        <Text
                                                            style={{
                                                                color: theme.primary,
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
            </View>

            {/* Logout */}
            <View className="border-t border-slate-800/60 pt-4 px-1">
                <TouchableOpacity
                    onPress={logout}
                    className="w-full py-3 items-center rounded-xl bg-slate-900 border border-red-500/20 web:hover:bg-red-950/20 active:bg-red-950/30 transition-all"
                >
                    <Text
                        style={{
                            color: '#f87171',
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.base,
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                        }}
                    >
                        Disconnect Session
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}