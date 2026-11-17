// app/welcome/index.tsx
//
// Landing page for every visitor. First-time visitors see what WaziPOS does
// (shoppers, diners, shops & pharmacies, wholesalers, restaurants, riders &
// couriers), how it works, the ways to sign in, and payments by JamboPay.
// Returning users who are signed out are sent to login; signed-in users get a
// "Go to dashboard" shortcut.
//
// Visuals are drawn in-app (no remote images): gradient tiles (CSS gradients on
// web, solid brand colours on phones) and a phone mock-up of live updates.

import { useAuth } from '@/context/AuthContext';
import { readHasAccount } from '@/utils/hasAccountFlag';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

type IconName = keyof typeof Ionicons.glyphMap;

const isWeb = Platform.OS === 'web';
const gradient = (a: string, b: string): any => (isWeb ? { backgroundImage: `linear-gradient(135deg, ${a}, ${b})` } : { backgroundColor: a });
const shadow = (strength = 0.08): any =>
    isWeb
        ? { boxShadow: `0 10px 30px rgba(15,23,42,${strength})` }
        : { shadowColor: '#0f172a', shadowOpacity: strength, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 };

/* ------------------------------------------------------------------ content */

interface Offering {
    key: string;
    role: 'customer' | 'retailer' | 'wholesaler' | 'restaurant' | 'delivery' | 'hotspot';
    icon: IconName;
    colors: [string, string];
    title: string;
    lead: string;
    points: string[];
    cta: string;
}

const OFFERINGS: Offering[] = [
    {
        key: 'shoppers',
        role: 'customer',
        icon: 'bag-handle',
        colors: ['#2563eb', '#06b6d4'],
        title: 'Shoppers',
        lead: 'Buy from trusted shops and pharmacies near you.',
        points: [
            'Find shops and products nearby',
            'Upload a prescription and compare pharmacy quotes',
            'Delivery to your door or pickup',
            'Pay by mobile money and track every order live',
        ],
        cta: 'Start shopping',
    },
    {
        key: 'diners',
        role: 'customer',
        icon: 'restaurant',
        colors: ['#f97316', '#ef4444'],
        title: 'Diners',
        lead: 'Eat in, take away, or get it delivered.',
        points: [
            'Order from restaurant menus',
            'Book a table and order ahead',
            'Create your own dish — pick ingredients, the kitchen prices it',
            'Delivery, pickup or dine in',
        ],
        cta: 'Find restaurants',
    },
    {
        key: 'retailers',
        role: 'retailer',
        icon: 'storefront',
        colors: ['#10b981', '#14b8a6'],
        title: 'Shops & pharmacies',
        lead: 'Run your counter, online shop and stock in one app.',
        points: [
            'Point of sale that keeps selling offline (cash) and syncs later',
            'Online orders, prescriptions, prepare → pack → ready',
            'Restock from wholesalers and receive into stock',
            'Your own riders, or delivery partners and couriers',
        ],
        cta: 'Open your shop',
    },
    {
        key: 'wholesalers',
        role: 'wholesaler',
        icon: 'cube',
        colors: ['#7c3aed', '#6366f1'],
        title: 'Wholesalers & distributors',
        lead: 'Sell to retailers across the region.',
        points: [
            'Receive retailer orders, or take them yourself — even offline',
            'Fulfilment board: prepare, pack, hand over or dispatch',
            'Invoices, discounts and campaigns',
            'Payments settled to your payout account',
        ],
        cta: 'Start distributing',
    },
    {
        key: 'restaurants',
        role: 'restaurant',
        icon: 'flame',
        colors: ['#e11d48', '#f59e0b'],
        title: 'Restaurants',
        lead: 'Menus, bookings and a live kitchen board.',
        points: [
            'Menu with photos, prices and availability',
            'Orders & table bookings: new → preparing → ready → served',
            'Price customers’ custom dishes',
            'Assign riders to delivery orders',
        ],
        cta: 'List your restaurant',
    },
    {
        key: 'riders',
        role: 'delivery',
        icon: 'bicycle',
        colors: ['#0ea5e9', '#22c55e'],
        title: 'Riders & couriers',
        lead: 'Deliver for shops, wholesalers and restaurants.',
        points: [
            'Delivery jobs with pickup and drop-off',
            'Hand over with the customer’s delivery code',
            'Courier offices for long-distance parcels',
            'Earnings paid to your payout account',
        ],
        cta: 'Ride with WaziPOS',
    },
    {
        key: 'hotspots',
        role: 'hotspot',
        icon: 'wifi',
        colors: ['#0284c7', '#8b5cf6'],
        title: 'Wi-Fi hotspots',
        lead: 'Sell internet time — from a business or your home connection.',
        points: [
            'Routers, NAS ids and hotspot locations in one place',
            'Packages by the minute, hour, day, week or month',
            'Customers pay by mobile money and connect at once',
            'See who is connected and every payment, live',
        ],
        cta: 'Start a hotspot',
    },
];

/** Sharing home internet: how a household becomes a hotspot business. */
const HOME_WIFI: { icon: IconName; title: string; text: string }[] = [
    { icon: 'home', title: 'Your home connection', text: 'Fibre or home internet with a router that supports hotspot login (e.g. MikroTik).' },
    { icon: 'pricetags', title: 'Set your packages', text: 'Say 1 hour for KES 10 or a day for KES 50 — you choose.' },
    { icon: 'phone-portrait', title: 'Neighbours pay by mobile money', text: 'They pick a package, pay, and get online. No cash to handle.' },
    { icon: 'wallet', title: 'Get paid out', text: 'Earnings go to your payout account. Track every payment in the app.' },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
    { icon: 'person-add', title: 'Create a free account', text: 'Email, phone or Google. Shopping needs nothing more.' },
    { icon: 'storefront', title: 'Shop — or open your business', text: 'Add your phone, ID and business location to start selling.' },
    { icon: 'flash', title: 'Pay and track live', text: 'Mobile money payments, live order status and delivery tracking.' },
];

const SIGN_IN: { icon: IconName; color: string; title: string; text: string; soon?: boolean }[] = [
    { icon: 'mail', color: '#2563eb', title: 'Email & password', text: 'Sign in with the email you registered with.' },
    { icon: 'call', color: '#10b981', title: 'Phone & password', text: 'Use your phone number instead of email.' },
    { icon: 'logo-google', color: '#ea4335', title: 'Google', text: 'One tap. Your email is all we need to start shopping.' },
    { icon: 'logo-facebook', color: '#1877f2', title: 'Facebook', text: 'Sign in with Facebook.', soon: true },
];

const TRUST: { icon: IconName; title: string; text: string }[] = [
    { icon: 'phone-portrait', title: 'Mobile money by JamboPay', text: 'Payments go through JamboPay; sellers are paid out to their accounts.' },
    { icon: 'cloud-offline', title: 'Works offline', text: 'Counter and wholesale cash sales are saved on the device and sync later.' },
    { icon: 'shield-checkmark', title: 'Verified sellers', text: 'Business owners add an ID or passport and their business location.' },
    { icon: 'chatbubble-ellipses', title: 'You choose who contacts you', text: 'A one-time SMS code records your consent to calls and messages.' },
];

const WIDE = 960;

/* ------------------------------------------------------------------ screen */

export default function WelcomeScreen() {
    const { user, theme, isDarkMode } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const wide = width >= WIDE;
    const isAuthed = !!user;
    const [hasAccount, setHasAccount] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        readHasAccount()
            .then((v) => !cancelled && setHasAccount(v))
            .catch(() => !cancelled && setHasAccount(false));
        return () => {
            cancelled = true;
        };
    }, []);

    // Returning user, signed out: straight to login.
    useEffect(() => {
        if (hasAccount && !isAuthed) router.replace('/(auth)/login');
    }, [hasAccount, isAuthed, router]);

    if (hasAccount === null) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

    const register = (role: Offering['role']) => router.push(`/(auth)/register?role=${role}` as any);
    const login = () => router.push('/(auth)/login');
    const dashboard = () => router.push('/(tabs)');

    const border = isDarkMode ? '#1e293b' : '#e2e8f0';
    const muted = { color: theme.textDark, fontFamily: theme.font.medium } as const;
    const section = { maxWidth: 1160, width: '100%' as const, alignSelf: 'center' as const, paddingHorizontal: 20 };
    const columns = (n: number) => (wide ? `${100 / n - 2}%` : '100%') as any;

    const PrimaryButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) => (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ height: 48, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }, shadow(0.12)]}>
            {icon ? <Ionicons name={icon} size={17} color="#fff" /> : null}
            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{label}</Text>
        </Pressable>
    );
    const GhostButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) => (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ height: 48, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1.5, borderColor: border, backgroundColor: theme.panel, opacity: pressed ? 0.85 : 1 })}>
            {icon ? <Ionicons name={icon} size={17} color={theme.text} /> : null}
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{label}</Text>
        </Pressable>
    );
    const SectionTitle = ({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) => (
        <View style={{ alignItems: 'center', gap: 6, marginBottom: 28 }}>
            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12, letterSpacing: 1.6 }}>{eyebrow.toUpperCase()}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: wide ? 30 : 24, textAlign: 'center' }}>{title}</Text>
            {sub ? <Text style={[muted, { fontSize: 15, textAlign: 'center', maxWidth: 620, lineHeight: 22 }]}>{sub}</Text> : null}
        </View>
    );

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* ---------------- top bar */}
            <View style={[section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Image source={require('@/assets/images/wazipos_icon.png')} style={{ width: 34, height: 34, borderRadius: 9 }} />
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.5 }}>WaziPOS</Text>
                </View>
                {isAuthed ? (
                    <PrimaryButton label="Go to dashboard" icon="grid" onPress={dashboard} />
                ) : (
                    <Pressable onPress={login} hitSlop={8} style={{ paddingHorizontal: 14, height: 40, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: border }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Sign in</Text>
                    </Pressable>
                )}
            </View>

            {/* ---------------- hero */}
            <View style={[section, { flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 36, paddingVertical: wide ? 48 : 24 }]}>
                <View style={{ flex: wide ? 1.1 : undefined, gap: 18, alignItems: wide ? 'flex-start' : 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: `${theme.primary}14` }}>
                        <Ionicons name="sparkles" size={14} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12.5 }}>Shops · pharmacies · restaurants · wholesalers · riders · Wi-Fi hotspots</Text>
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: wide ? 50 : 34, lineHeight: wide ? 58 : 40, letterSpacing: -1.2, textAlign: wide ? 'left' : 'center' }}>
                        Shop, eat, sell and deliver — <Text style={{ color: theme.primary }}>one app.</Text>
                    </Text>
                    <Text style={[muted, { fontSize: 17, lineHeight: 26, maxWidth: 560, textAlign: wide ? 'left' : 'center' }]}>
                        WaziPOS connects shoppers and diners with the shops, pharmacies, restaurants and wholesalers around them — with mobile money payments and live delivery built in. Run a Wi-Fi hotspot, or share your home internet and earn from it.
                    </Text>
                    {!isAuthed ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: wide ? 'flex-start' : 'center' }}>
                            <PrimaryButton label="Create free account" icon="arrow-forward" onPress={() => register('customer')} />
                            <GhostButton label="Sign in" icon="log-in-outline" onPress={login} />
                        </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: wide ? 'flex-start' : 'center' }}>
                        {[
                            { icon: 'phone-portrait-outline' as IconName, text: 'Mobile money payments' },
                            { icon: 'navigate-outline' as IconName, text: 'Live delivery tracking' },
                            { icon: 'cloud-offline-outline' as IconName, text: 'Sells offline' },
                            { icon: 'wifi-outline' as IconName, text: 'Wi-Fi hotspots' },
                        ].map((t) => (
                            <View key={t.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name={t.icon} size={16} color="#10b981" />
                                <Text style={[muted, { fontSize: 13.5 }]}>{t.text}</Text>
                            </View>
                        ))}
                    </View>
                </View>
                <HeroMockup theme={theme} isDark={isDarkMode} border={border} />
            </View>

            {/* ---------------- offerings */}
            <View style={[section, { paddingVertical: 40 }]}>
                <SectionTitle eyebrow="Everything on WaziPOS" title="Built for everyone in the chain" sub="One account. Shop and dine as a customer, and open a shop, pharmacy, restaurant, wholesale or Wi-Fi hotspot business when you're ready." />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }}>
                    {OFFERINGS.map((o) => (
                        <View key={o.key} style={[{ width: columns(3), minWidth: wide ? 300 : undefined, borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: theme.panel, overflow: 'hidden' }, shadow(0.05)]}>
                            <View style={[{ height: 96, padding: 18, justifyContent: 'flex-end' }, gradient(o.colors[0], o.colors[1])]}>
                                <View style={{ position: 'absolute', right: -16, top: -16, opacity: 0.18 }}>
                                    <Ionicons name={o.icon} size={130} color="#fff" />
                                </View>
                                <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' }}>
                                    <Ionicons name={o.icon} size={24} color="#fff" />
                                </View>
                            </View>
                            <View style={{ padding: 20, gap: 10, flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 19 }}>{o.title}</Text>
                                <Text style={[muted, { fontSize: 14, lineHeight: 20 }]}>{o.lead}</Text>
                                <View style={{ gap: 8, marginTop: 2, flex: 1 }}>
                                    {o.points.map((p) => (
                                        <View key={p} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                                            <Ionicons name="checkmark-circle" size={16} color={o.colors[0]} style={{ marginTop: 2 }} />
                                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.regular, fontSize: 14, lineHeight: 20 }}>{p}</Text>
                                        </View>
                                    ))}
                                </View>
                                {!isAuthed ? (
                                    <Pressable onPress={() => register(o.role)} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: o.colors[0], fontFamily: theme.font.bold, fontSize: 14 }}>{o.cta}</Text>
                                        <Ionicons name="arrow-forward" size={15} color={o.colors[0]} />
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            {/* ---------------- share your home internet */}
            <View style={[section, { paddingVertical: 44 }]}>
                <View style={{ borderRadius: 28, overflow: 'hidden', padding: wide ? 32 : 20, gap: 20, ...gradient('#0284c7', '#7c3aed') }}>
                    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: 16 }}>
                        <View style={{ flex: 1, gap: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                                <Ionicons name="wifi" size={13} color="#fff" />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>New · Wi-Fi hotspots</Text>
                            </View>
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: wide ? 32 : 24, lineHeight: wide ? 38 : 30, letterSpacing: -0.6 }}>
                                Share your home internet. Earn from it.
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.86)', fontFamily: theme.font.medium, fontSize: 15, lineHeight: 22, maxWidth: 620 }}>
                                Already run a hotspot? Manage routers, packages, connected customers and payments in WaziPOS. Have home internet with spare capacity? We help you set it up as a hotspot your neighbours pay for by mobile money.
                            </Text>
                        </View>
                        <Pressable
                            onPress={() => (isAuthed ? router.push('/(tabs)/business' as any) : register('hotspot'))}
                            accessibilityRole="button"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 48, borderRadius: 14, backgroundColor: '#fff' }}
                        >
                            <Ionicons name="wifi" size={18} color="#4f46e5" />
                            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#4f46e5', fontFamily: theme.font.bold, fontSize: width < 380 ? 13.5 : 15 }}>
                                {isAuthed ? 'Set up my hotspot' : 'Start a hotspot'}
                            </Text>
                        </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {HOME_WIFI.map((h) => (
                            <View key={h.title} style={{ flexGrow: 1, flexBasis: wide ? 0 : 240, padding: 16, borderRadius: 18, gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
                                <Ionicons name={h.icon} size={22} color="#fff" />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{h.title}</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.82)', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 18 }}>{h.text}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ---------------- how it works */}
            <View style={{ backgroundColor: isDarkMode ? '#0b1220' : '#f1f5f9', paddingVertical: 44 }}>
                <View style={section}>
                    <SectionTitle eyebrow="How it works" title="Up and running in minutes" />
                    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
                        {STEPS.map((s, i) => (
                            <View key={s.title} style={{ flex: 1, flexDirection: 'row', gap: 14, padding: 18, borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: border }}>
                                <View style={[{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, gradient(theme.primary, '#06b6d4')]}>
                                    <Ionicons name={s.icon} size={21} color="#fff" />
                                </View>
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11.5, letterSpacing: 1 }}>STEP {i + 1}</Text>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{s.title}</Text>
                                    <Text style={[muted, { fontSize: 13.5, lineHeight: 19 }]}>{s.text}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* ---------------- sign-in options */}
            <View style={[section, { paddingVertical: 44 }]}>
                <SectionTitle eyebrow="Signing in" title="Sign in your way" sub="Shopping needs only your email. To open a business you'll add your phone number, a National ID or passport (with a photo) and your business location." />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
                    {SIGN_IN.map((s) => (
                        <View key={s.title} style={{ width: columns(4), minWidth: wide ? 220 : undefined, padding: 18, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${s.color}18` }}>
                                    <Ionicons name={s.icon} size={21} color={s.color} />
                                </View>
                                {s.soon ? (
                                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${theme.primary}14` }}>
                                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 10.5 }}>COMING SOON</Text>
                                    </View>
                                ) : null}
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{s.title}</Text>
                            <Text style={[muted, { fontSize: 13.5, lineHeight: 19 }]}>{s.text}</Text>
                        </View>
                    ))}
                </View>
                <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, backgroundColor: `${theme.primary}0d`, alignSelf: 'center', maxWidth: 760 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.primary} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.medium, fontSize: 13.5, lineHeight: 20 }}>
                        When you add a phone number we text you a one-time code. Entering it confirms you're happy for sellers and their staff to call or message you about your orders.
                    </Text>
                </View>
            </View>

            {/* ---------------- payments & trust */}
            <View style={[section, { paddingBottom: 44 }]}>
                <View style={[{ borderRadius: 28, padding: wide ? 36 : 22, gap: 22 }, gradient('#0f172a', '#1e3a8a')]}>
                    <View style={{ gap: 6 }}>
                        <Text style={{ color: '#93c5fd', fontFamily: theme.font.bold, fontSize: 12, letterSpacing: 1.6 }}>PAYMENTS & TRUST</Text>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: wide ? 28 : 22 }}>Safe payments, reliable records</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                        {TRUST.map((t) => (
                            <View key={t.title} style={{ width: columns(4), minWidth: wide ? 220 : undefined, gap: 8, padding: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                                <Ionicons name={t.icon} size={22} color="#93c5fd" />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{t.title}</Text>
                                <Text style={{ color: '#cbd5e1', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>{t.text}</Text>
                            </View>
                        ))}
                    </View>
                    {!isAuthed ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <Pressable onPress={() => register('customer')} style={{ height: 48, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#fff' }}>
                                <Text style={{ color: '#0f172a', fontFamily: theme.font.bold, fontSize: 15 }}>Get started — it's free</Text>
                                <Ionicons name="arrow-forward" size={16} color="#0f172a" />
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </View>

            {/* ---------------- footer */}
            <View style={[section, { borderTopWidth: 1, borderTopColor: border, paddingTop: 20, gap: 12, alignItems: 'center' }]}>
                {!isAuthed ? (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Text style={[muted, { fontSize: 14 }]}>Already have an account?</Text>
                        <Pressable onPress={login} hitSlop={8}>
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 14 }}>Sign in</Text>
                        </Pressable>
                    </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[muted, { fontSize: 13, letterSpacing: 0.3 }]}>Powered by</Text>
                    <View style={{ backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Image source={require('@/assets/images/jambopay_logo.png')} style={{ width: 102, height: 28 }} resizeMode="contain" accessibilityLabel="JamboPay" />
                    </View>
                </View>
                <Text style={[muted, { fontSize: 12 }]}>© {new Date().getFullYear()} WaziPOS</Text>
            </View>
        </ScrollView>
    );
}

/* ------------------------------------------------------------------ hero visual */

/** A phone showing the kind of live updates WaziPOS sends, with floating cards. */
function HeroMockup({ theme, isDark, border }: { theme: any; isDark: boolean; border: string }) {
    const card = (icon: IconName, color: string, title: string, sub: string, style: any) => (
        <View style={[{ position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: theme.panel, borderWidth: 1, borderColor: border }, shadow(0.12), style]}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1c` }}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{title}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{sub}</Text>
            </View>
        </View>
    );
    const row = (icon: IconName, color: string, title: string, meta: string, amount: string) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1c` }}>
                <Ionicons name={icon} size={16} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }} numberOfLines={1}>{title}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 10.5 }}>{meta}</Text>
            </View>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12 }}>{amount}</Text>
        </View>
    );

    return (
        <View style={{ width: 360, maxWidth: '100%', height: 440, alignItems: 'center', justifyContent: 'center' }}>
            {/* glow */}
            <View style={[{ position: 'absolute', width: 300, height: 300, borderRadius: 150, opacity: 0.35 }, gradient(theme.primary, '#06b6d4')]} />
            {/* phone */}
            <View style={[{ width: 230, height: 420, borderRadius: 34, padding: 10, backgroundColor: isDark ? '#020617' : '#0f172a' }, shadow(0.25)]}>
                <View style={{ flex: 1, borderRadius: 26, backgroundColor: theme.panel, padding: 12, gap: 9, overflow: 'hidden' }}>
                    <View style={{ alignSelf: 'center', width: 60, height: 5, borderRadius: 3, backgroundColor: border, marginBottom: 2 }} />
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10.5, letterSpacing: 1 }}>TODAY</Text>
                    <View style={[{ borderRadius: 16, padding: 12, gap: 2 }, gradient(theme.primary, '#06b6d4')]}>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 11 }}>Sales</Text>
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 20 }}>KES 48,250</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 10.5 }}>+18% on yesterday</Text>
                    </View>
                    {row('bag-handle', '#2563eb', 'Order WZ-1042', 'Packed · ready', 'KES 1,240')}
                    {row('restaurant', '#f97316', 'Table for 4 · 7:30 pm', 'Dine in · booked', 'KES 3,600')}
                    {row('cube', '#7c3aed', 'Retailer restock', 'Dispatched', 'KES 26,900')}
                    {row('medkit', '#10b981', 'Prescription quote', '3 pharmacies replied', '—')}
                </View>
            </View>
            {card('checkmark-circle', '#10b981', 'Mobile money received', 'KES 1,240 · JamboPay', { top: 36, left: -6 })}
            {card('bicycle', '#0ea5e9', 'Rider on the way', 'Arriving in 12 min', { bottom: 52, right: -8 })}
        </View>
    );
}
