// components/welcome/WelcomeScreen.tsx
//
// Post-entry landing for every visitor — authenticated or not.
//
// Two audiences:
//   - First-time visitors (hasAccount = false) see the marketing
//     page with the role cards and Join Now buttons.
//   - Returning users who arrive here while signed out are bounced
//     to /(auth)/login, since the marketing pitch is noise for them.
//
// The bounce is a safety net for deep links: the layout's auth
// guard handles the cold-start redirect, but a user who navigates
// directly to /welcome (bookmark, back-button) would otherwise sit
// on a marketing page they've already seen.
//
// Signed-in users still see the welcome page (with a "Go to
// Dashboard" shortcut) since they land here post-login.

import { useAuth } from '@/context/AuthContext';
import { readHasAccount } from '@/utils/hasAccountFlag';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

interface RoleCard {
    key: 'customer' | 'retailer' | 'wholesaler';
    emoji: string;
    title: string;
    subtitle: string;
    benefits: string[];
}

const ROLE_CARDS: RoleCard[] = [
    {
        key: 'customer',
        emoji: '🛍️',
        title: 'For Customers',
        subtitle:
            'Shop from trusted shops and pharmacies near you.',
        benefits: [
            'Browse and order from local shops',
            'Fast delivery or in-store pickup',
            'Secure payments — mobile money and card',
            'Track your orders in real time',
        ],
    },
    {
        key: 'retailer',
        emoji: '🏪',
        title: 'For Retailers',
        subtitle:
            'Grow your retail business — online and in-store.',
        benefits: [
            'Sell online and offline from one inventory',
            'Payments processed securely',
            'Requisition stock from wholesalers online',
            'Track sales, stock and payments in one app',
        ],
    },
    {
        key: 'wholesaler',
        emoji: '🚚',
        title: 'For Wholesalers',
        subtitle: 'Distribute more, reach further.',
        benefits: [
            'Sell to retailers across the region',
            'Receive and fulfill requisitions online',
            'Payments processed securely',
            'Manage inventory, orders and payments easily',
        ],
    },
];

const WIDE_BREAKPOINT = 900;

export default function WelcomeScreen() {
    const { user, theme } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();

    const isWide = width >= WIDE_BREAKPOINT;
    const isAuthed = !!user;

    /* Returning users get bounced to login. Check is async, so we
     * gate the first render behind a null flag to avoid flashing
     * the marketing page for half a second before the redirect. */
    const [hasAccount, setHasAccount] = useState<boolean | null>(
        null
    );

    useEffect(() => {
        let cancelled = false;
        readHasAccount()
            .then((v) => {
                if (!cancelled) setHasAccount(v);
            })
            .catch(() => {
                if (!cancelled) setHasAccount(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (hasAccount === null) return;
        if (isAuthed) return;
        if (!hasAccount) return;

        // Returning user, not signed in — send them straight to
        // login.
        router.replace('/(auth)/login');
    }, [hasAccount, isAuthed, router]);

    /* Hold the render until we know which audience this is. On
     * native, a blank frame; on web, same. The redirect effect
     * above fires as soon as the flag resolves. */
    if (hasAccount === null) {
        return (
            <View
                style={[
                    styles.scroll,
                    { backgroundColor: theme.background },
                ]}
            />
        );
    }

    const goToRegister = (role: RoleCard['key']) => {
        router.push(`/(auth)/register?role=${role}`);
    };

    const goToDashboard = () => router.push('/(tabs)');
    const goToLogin = () => router.push('/(auth)/login');

    return (
        <ScrollView
            style={[styles.scroll, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.container}>
                {/* Authenticated shortcut */}
                {isAuthed && (
                    <View
                        style={[
                            styles.authBanner,
                            {
                                backgroundColor: theme.panel,
                                borderColor: theme.textDark + '22',
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.authBannerText,
                                {
                                    color: theme.text,
                                    fontFamily: theme.font.semibold,
                                },
                            ]}
                        >
                            You're signed in.
                        </Text>
                        <Pressable
                            onPress={goToDashboard}
                            accessibilityRole="button"
                            accessibilityLabel="Go to dashboard"
                            style={[
                                styles.primaryButton,
                                { backgroundColor: theme.primary },
                            ]}
                        >
                            <Text style={styles.primaryButtonText}>
                                Go to Dashboard
                            </Text>
                        </Pressable>
                    </View>
                )}

                {/* Hero */}
                <View style={styles.hero}>
                    <Text
                        style={[
                            styles.brand,
                            {
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                            },
                        ]}
                    >
                        Wazipos
                    </Text>
                    <Text
                        style={[
                            styles.tagline,
                            {
                                color: theme.text,
                                fontFamily: theme.font.bold,
                            },
                        ]}
                    >
                        One platform for the entire supply chain
                    </Text>
                    <Text
                        style={[
                            styles.heroSub,
                            {
                                color: theme.textDark,
                                fontFamily: theme.font.regular,
                            },
                        ]}
                    >
                        {isAuthed
                            ? 'Everything you need to run your business — in one place.'
                            : 'Buy, sell, and manage your business — all in one place.'}
                    </Text>
                </View>

                {/* Role cards */}
                <View
                    style={[
                        styles.cardsRow,
                        isWide && styles.cardsRowWide,
                    ]}
                >
                    {ROLE_CARDS.map((card) => (
                        <View
                            key={card.key}
                            style={[
                                styles.card,
                                {
                                    backgroundColor: theme.panel,
                                    borderColor: theme.textDark + '22',
                                },
                                isWide && styles.cardWide,
                            ]}
                        >
                            <Text style={styles.cardEmoji}>{card.emoji}</Text>

                            <Text
                                style={[
                                    styles.cardTitle,
                                    {
                                        color: theme.text,
                                        fontFamily: theme.font.bold,
                                    },
                                ]}
                            >
                                {card.title}
                            </Text>

                            <Text
                                style={[
                                    styles.cardSubtitle,
                                    {
                                        color: theme.textDark,
                                        fontFamily: theme.font.medium,
                                    },
                                ]}
                            >
                                {card.subtitle}
                            </Text>

                            <View style={styles.benefitsList}>
                                {card.benefits.map((benefit, i) => (
                                    <View key={i} style={styles.benefitRow}>
                                        <Text
                                            style={[
                                                styles.benefitDot,
                                                { color: theme.primary },
                                            ]}
                                        >
                                            •
                                        </Text>
                                        <Text
                                            style={[
                                                styles.benefitText,
                                                {
                                                    color: theme.text,
                                                    fontFamily: theme.font.regular,
                                                },
                                            ]}
                                        >
                                            {benefit}
                                        </Text>
                                    </View>
                                ))}
                            </View>

                            {!isAuthed && (
                                <Pressable
                                    onPress={() => goToRegister(card.key)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Join as ${card.title}`}
                                    style={[
                                        styles.primaryButton,
                                        { backgroundColor: theme.primary },
                                    ]}
                                >
                                    <Text style={styles.primaryButtonText}>
                                        Join Now
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    ))}
                </View>

                {/* Sign-in footer (unauthenticated) */}
                {!isAuthed && (
                    <View style={styles.footer}>
                        <Text
                            style={[
                                styles.footerText,
                                {
                                    color: theme.textDark,
                                    fontFamily: theme.font.regular,
                                },
                            ]}
                        >
                            Already have an account?
                        </Text>
                        <Pressable
                            onPress={goToLogin}
                            accessibilityRole="link"
                            accessibilityLabel="Sign in"
                        >
                            <Text
                                style={[
                                    styles.footerLink,
                                    {
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                    },
                                ]}
                            >
                                Sign in
                            </Text>
                        </Pressable>
                    </View>
                )}

                {/* Powered-by credit */}
                <View
                    style={[
                        styles.poweredBy,
                        { borderTopColor: theme.textDark + '22' },
                    ]}
                >
                    <Text
                        style={[
                            styles.poweredByText,
                            {
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                            },
                        ]}
                    >
                        Powered by{' '}
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            Jambopay
                        </Text>
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    container: {
        maxWidth: 1100,
        alignSelf: 'center',
        width: '100%',
        flex: 1,
    },

    /* Auth banner */
    authBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 32,
        gap: 12,
        flexWrap: 'wrap',
    },
    authBannerText: {
        fontSize: 16,
        flexShrink: 1,
    },

    /* Hero */
    hero: {
        alignItems: 'center',
        marginBottom: 40,
    },
    brand: {
        fontSize: 40,
        letterSpacing: -1,
        marginBottom: 8,
    },
    tagline: {
        fontSize: 22,
        textAlign: 'center',
        marginBottom: 8,
    },
    heroSub: {
        fontSize: 15,
        textAlign: 'center',
        maxWidth: 540,
        lineHeight: 22,
    },

    /* Card layout */
    cardsRow: {
        gap: 20,
    },
    cardsRowWide: {
        flexDirection: 'row',
    },
    card: {
        flex: 1,
        padding: 24,
        borderRadius: 16,
        borderWidth: 1,
        gap: 12,
    },
    cardWide: {
        minWidth: 0,
    },
    cardEmoji: {
        fontSize: 36,
    },
    cardTitle: {
        fontSize: 20,
    },
    cardSubtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    benefitsList: {
        gap: 8,
        marginTop: 4,
        marginBottom: 8,
    },
    benefitRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
    },
    benefitDot: {
        fontSize: 14,
        lineHeight: 20,
    },
    benefitText: {
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
    },

    /* Buttons */
    primaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    /* Sign-in footer */
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginTop: 32,
        flexWrap: 'wrap',
    },
    footerText: {
        fontSize: 14,
    },
    footerLink: {
        fontSize: 14,
    },

    /* Powered-by */
    poweredBy: {
        marginTop: 'auto',
        paddingTop: 20,
        borderTopWidth: 1,
        alignItems: 'center',
    },
    poweredByText: {
        fontSize: 13,
        letterSpacing: 0.3,
    },
});