// app/welcome/index.tsx
//
// The WaziPOS landing page. It tells every visitor what the platform does for them:
// one connected chain from the manufacturer to the client (manufacturers,
// distributors, wholesalers, retailers & pharmacies, restaurants & hotels, shoppers),
// offline shops turned into online shops, secure mobile-money payments with payouts
// on release, deliveries across the country (own riders, WaziPOS riders, courier
// partners), inventory that stays honest (batches, expiry, independent stock takes,
// owner-away protection), and the agent network that onboards and serves businesses.
// It ends with WaziPOS's other services (WiFi billing, rent collection, cashless
// matatu fares).
//
// Returning users who are signed out go straight to login; signed-in users get a
// "Go to dashboard" shortcut. Colours come from the theme (context/AuthContext.tsx
// PALETTE: cobalt -> sky gradient, deep navy). Photos are free Unsplash images
// (hotlinked, as Unsplash asks).

import { BRAND_GRADIENT, PALETTE, useAuth } from '@/context/AuthContext';
import { readHasAccount } from '@/utils/hasAccountFlag';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from '@/components/common/StablePressable';

type IconName = keyof typeof Ionicons.glyphMap;

const isWeb = Platform.OS === 'web';
const NAVY = PALETTE.navy;
const [G1, G2] = BRAND_GRADIENT;

const photo = (id: string, w = 1200) => ({ uri: `https://images.unsplash.com/${id}?w=${w}&q=75&auto=format&fit=crop` });
const PHOTOS = {
    hero: 'photo-1687422808311-a776f467a468', // shopkeeper at her counter
    duka: 'photo-1687422808384-c896d0efd4ab', // duka owner serving a customer
    vendorPhone: 'photo-1687422809654-579d81c29d32', // fruit vendor on her phone
    happyBuyer: 'photo-1687422808565-929533931584', // thumbs up at the market
    foodVendor: 'photo-1687422808248-f807f4ea2a2e', // food vendor with his phone
    butcher: 'photo-1687422808191-93810cd07ab0', // shop owner at his door
    boda: 'photo-1641295437743-2ea0b8453392', // boda boda rider, Nairobi
    cargoRider: 'photo-1598890335561-884eccb92531', // rider with goods
    handover: 'photo-1566576721346-d4a3b4eaeb55', // parcel handed over
    warehouse: 'photo-1586528116311-ad8dd3c8310d', // warehouse
    supermarket: 'photo-1578916171728-46686eac8d58', // supermarket aisle
    pharmacy: 'photo-1576091358783-a212ec293ff3', // pharmacist with a customer
    market: 'photo-1773858440916-ba53d27d22e0', // shopper at the market
    payPhone: 'photo-1595079676339-1534801ad6cf', // paying by phone
};

const gradient = (a: string, b: string, angle = 135): any => (isWeb ? { backgroundImage: `linear-gradient(${angle}deg, ${a}, ${b})` } : { backgroundColor: a });
const gradientText = (fallback: string): any =>
    isWeb ? { backgroundImage: `linear-gradient(90deg, ${G1}, ${G2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: fallback };
const glass = (dark: boolean): any =>
    isWeb
        ? { backgroundColor: dark ? 'rgba(8,18,43,0.72)' : 'rgba(255,255,255,0.75)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }
        : { backgroundColor: dark ? '#0f1d40' : '#ffffff' };
const shadow = (strength = 0.1, color = '11,23,51'): any =>
    isWeb
        ? { boxShadow: `0 18px 50px rgba(${color},${strength})` }
        : { shadowColor: '#0b1733', shadowOpacity: strength, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 };

/* ------------------------------------------------------------------ content */

const CHAIN: { icon: IconName; title: string; text: string }[] = [
    { icon: 'construct', title: 'Manufacturers', text: 'Own the product master, batches & expiry' },
    { icon: 'business', title: 'Distributors', text: 'Order from makers, sell to wholesalers' },
    { icon: 'cube', title: 'Wholesalers', text: 'Supply retailers, placements & discounts' },
    { icon: 'storefront', title: 'Retailers', text: 'Counter, online shop & pharmacy' },
    { icon: 'happy', title: 'Clients', text: 'Shop, dine, pay & track live' },
];

interface Stakeholder {
    key: string;
    label: string;
    icon: IconName;
    image: string;
    headline: string;
    points: string[];
    cta: string;
}

const STAKEHOLDERS: Stakeholder[] = [
    {
        key: 'manufacturers', label: 'Manufacturers', icon: 'construct', image: PHOTOS.warehouse,
        headline: 'Your products are the source of the whole chain.',
        points: [
            'One product master — name, barcode, pack size and weights — stocked by everyone downstream',
            'Production batches with expiry, price and quantity discounts',
            'Distributors order and pay remotely; you prepare, pack and dispatch',
            'See how far each product reaches: distributors, wholesalers, retailers',
        ],
        cta: 'Sell to distributors',
    },
    {
        key: 'distributors', label: 'Distributors', icon: 'business', image: PHOTOS.supermarket,
        headline: 'Buy from manufacturers, sell to wholesalers — one screen.',
        points: [
            'Order from manufacturers near you or anywhere, pay by mobile money',
            'Goods received straight into stock, costed per pack',
            'Wholesalers order remotely with live price and quantity deals',
            'Fulfilment board and deliveries priced for every order',
        ],
        cta: 'Start distributing',
    },
    {
        key: 'wholesalers', label: 'Wholesalers', icon: 'cube', image: PHOTOS.warehouse,
        headline: 'Reach every retailer in your region — and get paid on time.',
        points: [
            'Retailers find you, order and pay from their phones',
            'Campaigns, placements and discounts that sell stock faster',
            'Prepare → pack → hand over or dispatch with a code',
            'The goods amount paid to your account once goods leave',
        ],
        cta: 'Grow your wholesale',
    },
    {
        key: 'retailers', label: 'Shops & pharmacies', icon: 'storefront', image: PHOTOS.duka,
        headline: 'Your duka, now an online shop — without changing how you work.',
        points: [
            'A point of sale that keeps selling offline and syncs later',
            'Your stock listed online for buyers nearby, with delivery or pickup',
            'Prescriptions, quotes and medicine batches handled for pharmacies',
            'Restock from wholesalers in a few taps; shop guard while you’re away',
        ],
        cta: 'Open your shop online',
    },
    {
        key: 'restaurants', label: 'Restaurants & hotels', icon: 'restaurant', image: PHOTOS.foodVendor,
        headline: 'Menus, tables, rooms and a live kitchen board.',
        points: [
            'Online menu, table bookings and custom dishes priced by the kitchen',
            'Hotels add rooms and stays to the same tools',
            'Delivery orders handed to riders automatically',
            'Bar, supplies and ingredient stock kept honest',
        ],
        cta: 'List your restaurant',
    },
    {
        key: 'clients', label: 'Shoppers & diners', icon: 'happy', image: PHOTOS.vendorPhone,
        headline: 'Everything near you, with live discounts — delivered.',
        points: [
            'Shops, pharmacies and restaurants around you in one app',
            'Pay by M-Pesa or Airtel Money, never cash to a stranger',
            'Track your rider live; hand over only with your delivery code',
            'Upload a prescription and compare pharmacy quotes',
        ],
        cta: 'Start shopping',
    },
    {
        key: 'riders', label: 'Riders & couriers', icon: 'bicycle', image: PHOTOS.boda,
        headline: 'Deliveries near you, paid the moment you deliver.',
        points: [
            'Go on duty and get jobs from sellers close by',
            'Walk, ride or drive — jobs matched to your load and distance',
            'Pay lands in your own payout account on delivery',
            'Courier companies: offices, rate charts and parcels in one dashboard',
        ],
        cta: 'Ride with WaziPOS',
    },
    {
        key: 'jobs', label: 'Job seekers & employers', icon: 'briefcase', image: PHOTOS.pharmacy,
        headline: 'Hire your next pharmacist, cashier or chef — or get hired.',
        points: [
            'A jobs board inside WaziPOS, open to every member',
            'Permanent posts and locum cover, with pay and dates up front',
            'Employers run the whole pipeline: shortlist → interview → offer → hire',
            'Share any opening with a link; full details for WaziPOS members',
        ],
        cta: 'Find your next job',
    },
    {
        key: 'lenders', label: 'Banks & lenders', icon: 'business', image: PHOTOS.payPhone,
        headline: 'Lend to thousands of traders — and see exactly what they sell.',
        points: [
            'Fund real orders, paid straight to the supplier — not cash loans',
            'Set your own rates for 7, 14 and 28 days, fees, limits and minimum WaziScore',
            'Repayments land in your own wallet by M-Pesa; due-date prompts sent for you',
            'A live loan book: disbursed, outstanding, due this week, overdue, PAR30',
        ],
        cta: 'Lend on WaziPOS',
    },
    {
        key: 'agents', label: 'Agents & stocktakers', icon: 'people', image: PHOTOS.butcher,
        headline: 'Build a business onboarding businesses.',
        points: [
            'Register shops, wholesalers, restaurants and hotels in your area',
            'Earn commission on every token top-up your businesses make',
            'Book paid stock takes; your stocktakers paid per day worked',
            'Your own team, your own clients — all in your agent dashboard',
        ],
        cta: 'Become an agent',
    },
];

const PILLARS: { icon: IconName; title: string; text: string; color: string }[] = [
    { icon: 'git-network', title: 'Manufacturer to client', text: 'Products, prices and discounts flow down the chain; orders and payments flow back up — one platform, no re-typing.', color: G1 },
    { icon: 'globe', title: 'Offline to online', text: 'Every shop’s stock becomes an online catalogue for buyers nearby — pickup or delivery, paid by mobile money.', color: '#8b5cf6' },
    { icon: 'shield-checkmark', title: 'Secure payments', text: 'Buyers pay into the WaziPOS till. Sellers are paid when goods leave; riders and couriers when they deliver.', color: PALETTE.success },
    { icon: 'navigate', title: 'Deliveries countrywide', text: 'Walk, boda, van or courier: own fleet, WaziPOS riders and partner couriers, priced by distance, weight and value.', color: G2 },
    { icon: 'layers', title: 'Inventory that adds up', text: 'Batches and expiry, offline sales, independent stock takes and owner-away protection keep every count honest.', color: PALETTE.warning },
    { icon: 'people-circle', title: 'Agents everywhere', text: 'A network of agents onboards businesses, sets up payouts and books stock takes in every town.', color: '#ec4899' },
];

const PAYMENT_FLOW: { icon: IconName; title: string; text: string }[] = [
    { icon: 'phone-portrait', title: 'Buyer pays once', text: 'One mobile-money prompt for goods and delivery, into the WaziPOS till.' },
    { icon: 'lock-closed', title: 'Held safely', text: 'Nobody touches the money until each party has done their part.' },
    { icon: 'cube', title: 'Seller paid on release', text: 'The goods amount goes to the seller once goods leave with the rider.' },
    { icon: 'bicycle', title: 'Riders paid on delivery', text: 'Riders on delivery, couriers when parcels reach their office.' },
];

const DELIVERY_MODES: { icon: IconName; title: string; text: string }[] = [
    { icon: 'walk', title: 'On foot', text: 'Up to 3 km, light parcels' },
    { icon: 'bicycle', title: 'Bike & boda', text: 'Across town, up to 60 kg' },
    { icon: 'car', title: 'Car, van, lorry', text: 'Bulk and regional loads' },
    { icon: 'airplane', title: 'Courier partners', text: 'Long haul to an office near the buyer' },
];

const INVENTORY: { icon: IconName; title: string; text: string }[] = [
    { icon: 'barcode', title: 'Batches & expiry', text: 'Every lot traced to where it came from; expiring stock flagged.' },
    { icon: 'cloud-offline', title: 'Sells offline', text: 'Cash sales saved on the device and synced when you’re back online.' },
    { icon: 'clipboard', title: 'Independent stock takes', text: 'Blind counts by WaziPOS stocktakers, with a variance report you approve.' },
    { icon: 'eye', title: 'Owner-away protection', text: 'Shifts, blind cash counts, staff vs owner sales and alerts when something’s off.' },
];

/* Sectors WaziPOS is built for — the same chain tools, tuned to how each one trades. */
const INDUSTRIES: { icon: IconName; title: string; examples: string; points: string[]; colors: [string, string] }[] = [
    {
        icon: 'cart', title: 'FMCG', examples: 'Groceries, beverages, toiletries, household goods',
        points: ['Fast restocking from distributors and wholesalers', 'Quantity deals and placements that move volume', 'Barcode scanning at the till, even offline'],
        colors: ['#2a6ff3', '#22b8f0'],
    },
    {
        icon: 'medkit', title: 'Pharmaceuticals', examples: 'Manufacturers, distributors, wholesalers, pharmacies',
        points: ['Batches and expiry tracked lot by lot', 'Prescriptions, quotes and dispensing', 'Licensed locum and permanent staff from the jobs board'],
        colors: ['#10b981', '#14b8a6'],
    },
    {
        icon: 'restaurant', title: 'Food & catering', examples: 'Restaurants, hotels, bars, caterers, food vendors',
        points: ['Menus, tables, rooms and a live kitchen board', 'Ingredients, supplies and bar stock kept honest', 'Delivery orders handed to riders automatically'],
        colors: ['#f97316', '#ec4899'],
    },
    {
        icon: 'flash', title: 'Electricals & electronics', examples: 'Phones, appliances, hardware, electrical supplies',
        points: ['High-value stock with owner-away protection', 'Barcode scanning and independent stock takes', 'Courier delivery priced by weight and value'],
        colors: ['#8b5cf6', '#6366f1'],
    },
];

const JOBS_SEEKERS = [
    'Browse permanent posts and locum cover from businesses across Kenya',
    'Apply in a minute — licence number, experience and CV',
    'Follow every step: shortlisted, interview, offer, hired',
    'Save jobs and read them offline; share any job with a link',
];
const JOBS_EMPLOYERS = [
    'Post an opening for your business in minutes — pay, dates, licence needed',
    'Locum shifts by the day or shift; permanent roles by the month',
    'Shortlist, invite to interview, make an offer and hire from one screen',
    'Applicants updated automatically by email and app — SMS for interviews and offers',
];

/* WaziPOS Credit (Lipa Baadaye) and WaziPOS Cover (micro-insurance). */
const CREDIT_POINTS = [
    'A licensed lender pays your supplier the moment you order',
    'Repay in 7, 14 or 28 days — early or in parts, by M-Pesa',
    'Every cost shown before you accept: interest, fee, excise duty, APR',
    'Repay on time and your WaziScore and limit grow',
];
const CREDIT_SEGMENTS: { icon: IconName; t: string }[] = [
    { icon: 'storefront-outline', t: 'Retailers restocking from wholesalers' },
    { icon: 'cube-outline', t: 'Wholesalers buying from distributors' },
    { icon: 'cart-outline', t: 'Shop customers buying on credit' },
    { icon: 'restaurant-outline', t: 'Diners at restaurants' },
];
const COVER_PLANS: { icon: IconName; name: string; price: string; text: string; color: string }[] = [
    { icon: 'cube', name: 'SafeParcel', price: 'from KES 15 a parcel', text: 'Theft, loss or damage on the way', color: '#2a6ff3' },
    { icon: 'bicycle', name: 'RiderShield', price: 'from KES 10 a day', text: 'Accident, hospital and medical cover for riders', color: '#f97316' },
    { icon: 'storefront', name: 'DukaCover', price: 'from KES 99 a month', text: 'Stock and cash: fire, burglary, robbery', color: '#10b981' },
    { icon: 'cash', name: 'TradeGuard', price: 'per credit sale', text: '80% back when a credit customer doesn’t pay', color: '#8b5cf6' },
    { icon: 'shield-checkmark', name: 'TillGuard', price: 'from KES 129 a month', text: 'Staff theft, SIM swap and fake M-Pesa', color: '#ec4899' },
];

const MORE_SERVICES: { icon: IconName; title: string; text: string; colors: [string, string] }[] = [
    { icon: 'wifi', title: 'WiFi billing', text: 'Sell hotspot packages by mobile money — vouchers, speed plans and sessions managed for you.', colors: ['#2a6ff3', '#22b8f0'] },
    { icon: 'home', title: 'Rent collection', text: 'Tenants pay by mobile money, landlords see every unit’s balance and get paid out automatically.', colors: ['#8b5cf6', '#ec4899'] },
    { icon: 'bus', title: 'Cashless matatu fares', text: 'Passengers pay fares by phone, saccos and owners see every trip’s takings in real time.', colors: ['#10b981', '#22b8f0'] },
];

/* ------------------------------------------------------------------ screen */

export default function WelcomeScreen() {
    const { user, theme, isDarkMode } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const wide = width >= 980;
    const mid = width >= 680;
    const isAuthed = !!user;
    const [hasAccount, setHasAccount] = useState<boolean | null>(null);
    const [active, setActive] = useState(STAKEHOLDERS[0].key);
    const scroll = useRef<ScrollView>(null);
    const anchors = useRef<Record<string, number>>({});

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

    const register = (role = 'customer') => router.push(`/(auth)/register?role=${role}` as any);
    const login = () => router.push('/(auth)/login');
    const dashboard = () => router.push('/(tabs)');
    const goTo = (key: string) => scroll.current?.scrollTo({ y: Math.max(0, (anchors.current[key] ?? 0) - 70), animated: true });
    const anchor = (key: string) => ({ onLayout: (e: any) => (anchors.current[key] = e.nativeEvent.layout.y) });

    const border = theme.border;
    const muted = { color: theme.textDark, fontFamily: theme.font.medium } as const;
    const section = { maxWidth: 1180, width: '100%' as const, alignSelf: 'center' as const, paddingHorizontal: 20 };
    const h2 = wide ? 40 : 28;

    const PrimaryButton = ({ label, onPress, icon = 'arrow-forward', light }: { label: string; onPress: () => void; icon?: IconName; light?: boolean }) => (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [
                { height: 50, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.88 : 1 },
                light ? { backgroundColor: '#ffffff' } : gradient(G1, G2, 100),
                shadow(light ? 0.18 : 0.22, light ? '0,0,0' : '42,111,243'),
            ]}
        >
            <Text style={{ color: light ? NAVY : '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{label}</Text>
            <Ionicons name={icon} size={17} color={light ? NAVY : '#fff'} />
        </Pressable>
    );
    const GhostButton = ({ label, onPress, icon, dark }: { label: string; onPress: () => void; icon?: IconName; dark?: boolean }) => (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 50, paddingHorizontal: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1.5, borderColor: dark ? 'rgba(255,255,255,0.25)' : border, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : theme.panel, opacity: pressed ? 0.85 : 1 })}
        >
            <Text style={{ color: dark ? '#fff' : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{label}</Text>
            {icon ? <Ionicons name={icon} size={17} color={dark ? '#fff' : theme.text} /> : null}
        </Pressable>
    );
    const Eyebrow = ({ text, dark }: { text: string; dark?: boolean }) => (
        <Text style={{ color: dark ? '#7cc4ff' : theme.primary, fontFamily: theme.font.bold, fontSize: 12, letterSpacing: 2 }}>{text.toUpperCase()}</Text>
    );
    const Title = ({ eyebrow, title, accent, sub, center = true, dark }: { eyebrow: string; title: string; accent?: string; sub?: string; center?: boolean; dark?: boolean }) => (
        <View style={{ gap: 10, alignItems: center ? 'center' : 'flex-start', marginBottom: 32 }}>
            <Eyebrow text={eyebrow} dark={dark} />
            <Text style={{ color: dark ? '#fff' : theme.text, fontFamily: theme.font.bold, fontSize: h2, lineHeight: h2 * 1.15, letterSpacing: -1, textAlign: center ? 'center' : 'left', maxWidth: 820 }}>
                {title}
                {accent ? <Text style={gradientText(theme.primary)}> {accent}</Text> : null}
            </Text>
            {sub ? <Text style={[muted, { color: dark ? '#b7c4e4' : theme.textDark, fontSize: 16, lineHeight: 25, textAlign: center ? 'center' : 'left', maxWidth: 680 }]}>{sub}</Text> : null}
        </View>
    );
    const Photo = ({ id, height, radius = 28, style }: { id: string; height: number; radius?: number; style?: any }) => (
        <View style={[{ height, borderRadius: radius, overflow: 'hidden', backgroundColor: isDarkMode ? '#13244d' : '#dfe8fb' }, style]}>
            <Image source={photo(id)} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
        </View>
    );
    const FloatCard = ({ icon, color, title, sub, style, progress }: { icon: IconName; color: string; title: string; sub: string; style: any; progress?: number }) => (
        <View style={[{ position: 'absolute', minWidth: 196, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, gap: 8, borderWidth: 1, borderColor: isDarkMode ? '#1e2e57' : 'rgba(255,255,255,0.9)' }, glass(isDarkMode), shadow(0.16), style]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1f` }}>
                    <Ionicons name={icon} size={17} color={color} />
                </View>
                <View>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{sub}</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{title}</Text>
                </View>
            </View>
            {progress != null ? (
                <View style={{ height: 5, borderRadius: 3, backgroundColor: `${color}22`, overflow: 'hidden' }}>
                    <View style={[{ width: `${progress * 100}%`, height: '100%', borderRadius: 3 }, gradient(G1, G2, 90)]} />
                </View>
            ) : null}
        </View>
    );
    const Check = ({ text, color = theme.primary, dark }: { text: string; color?: string; dark?: boolean }) => (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1f`, marginTop: 1 }}>
                <Ionicons name="checkmark" size={13} color={color} />
            </View>
            <Text style={{ flex: 1, color: dark ? '#dbe4f8' : theme.text, fontFamily: theme.font.regular, fontSize: 14.5, lineHeight: 21 }}>{text}</Text>
        </View>
    );

    const current = STAKEHOLDERS.find((s) => s.key === active) ?? STAKEHOLDERS[0];
    const NAV: { key: string; label: string }[] = [
        { key: 'chain', label: 'Supply chain' },
        { key: 'industries', label: 'Industries' },
        { key: 'stakeholders', label: 'For businesses' },
        { key: 'credit', label: 'Credit' },
        { key: 'cover', label: 'Insurance' },
        { key: 'jobs', label: 'Jobs' },
        { key: 'payments', label: 'Payments' },
        { key: 'delivery', label: 'Delivery' },
        { key: 'services', label: 'More services' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 0 }} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
                {/* ================= top bar (sticky, glass) */}
                <View style={[{ borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#13244d' : 'rgba(225,232,245,0.8)' }, glass(isDarkMode)]}>
                    <View style={[section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 }]}>
                        <Pressable onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Image source={require('@/assets/images/wazipos_icon.png')} style={{ width: 34, height: 34, borderRadius: 10 }} />
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.6 }}>WaziPOS</Text>
                        </Pressable>
                        {wide ? (
                            <View style={{ flexDirection: 'row', gap: 26 }}>
                                {NAV.map((n) => (
                                    <Pressable key={n.key} onPress={() => goTo(n.key)} hitSlop={8}>
                                        <Text style={{ color: theme.textDark, fontFamily: theme.font.semibold, fontSize: 14 }}>{n.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}
                        {isAuthed ? (
                            <PrimaryButton label="Dashboard" icon="grid" onPress={dashboard} />
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Pressable onPress={login} hitSlop={8}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Sign in</Text>
                                </Pressable>
                                {mid ? (
                                    <Pressable onPress={() => register()} style={[{ height: 40, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center' }, gradient(G1, G2, 100)]}>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>Get the app</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        )}
                    </View>
                </View>

                {/* ================= hero */}
                <View style={{ overflow: 'hidden' }}>
                    {/* soft glows */}
                    <View style={[{ position: 'absolute', width: 620, height: 620, borderRadius: 310, top: -260, right: -180, opacity: isDarkMode ? 0.22 : 0.16 }, gradient(G1, G2)]} />
                    <View style={[{ position: 'absolute', width: 420, height: 420, borderRadius: 210, bottom: -220, left: -160, opacity: isDarkMode ? 0.18 : 0.1 }, gradient(G2, '#8b5cf6')]} />
                    <View style={[section, { flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: wide ? 48 : 30, paddingTop: wide ? 64 : 30, paddingBottom: wide ? 80 : 44 }]}>
                        <View style={{ flex: wide ? 1.05 : undefined, gap: 22, alignItems: wide ? 'flex-start' : 'center' }}>
                            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: `${G1}33` }, glass(isDarkMode)]}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE.success }} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 12.5 }}>From the factory to the client — one platform</Text>
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: wide ? 60 : 38, lineHeight: wide ? 64 : 43, letterSpacing: wide ? -2 : -1.2, textAlign: wide ? 'left' : 'center' }}>
                                Commerce that connects{' '}
                                <Text style={gradientText(theme.primary)}>manufacturers, distributors, wholesalers, retailers</Text>
                                {' '}and their clients.
                            </Text>
                            <Text style={[muted, { fontSize: 17.5, lineHeight: 28, maxWidth: 590, textAlign: wide ? 'left' : 'center' }]}>
                                Turn your shop into an online store, sell with live discounts across the chain, get paid securely by mobile money, deliver anywhere in the country, buy stock now and pay later, insure what you move — and hire the people you need. Built for FMCG, pharmaceuticals, food & catering, and electricals & electronics.
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: wide ? 'flex-start' : 'center' }}>
                                {isAuthed ? (
                                    <PrimaryButton label="Go to your dashboard" icon="grid" onPress={dashboard} />
                                ) : (
                                    <>
                                        <PrimaryButton label="Grow your business" onPress={() => register('retailer')} />
                                        <GhostButton label="Explore the marketplace" icon="arrow-forward" onPress={() => register('customer')} />
                                    </>
                                )}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 34 : 20, justifyContent: wide ? 'flex-start' : 'center', marginTop: 6 }}>
                                {[
                                    { t: 'Stock', s: 'Connected supply chain' },
                                    { t: 'Sell', s: 'Online & offline, live deals' },
                                    { t: 'Get paid', s: 'Secure mobile money' },
                                    { t: 'Deliver', s: 'Countrywide partners' },
                                ].map((x) => (
                                    <View key={x.t} style={{ gap: 2 }}>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>{x.t}</Text>
                                        <Text style={[muted, { fontSize: 12.5 }]}>{x.s}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* photo with live cards */}
                        <View style={{ flex: wide ? 0.95 : undefined, width: wide ? undefined : '100%', maxWidth: 560, alignSelf: 'center', paddingVertical: 26, paddingHorizontal: wide ? 10 : 0 }}>
                            <View style={[{ position: 'absolute', top: 0, bottom: 0, left: wide ? -10 : 10, right: wide ? 30 : 10, borderRadius: 40, opacity: 0.9 }, gradient(`${G1}22`, `${G2}22`)]} />
                            <Photo id={PHOTOS.hero} height={wide ? 500 : 380} radius={32} style={shadow(0.25)} />
                            <FloatCard icon="checkmark-circle" color={PALETTE.success} sub="M-Pesa · paid" title="KES 4,850 received" style={{ top: 2, left: wide ? -34 : 8 }} />
                            <FloatCard icon="bicycle" color={G1} sub="Rider on the way" title="Arriving in 6 min" progress={0.68} style={{ bottom: 6, right: wide ? -28 : 8 }} />
                            {wide ? <FloatCard icon="cube" color="#8b5cf6" sub="Restock from wholesaler" title="Packed · dispatching" style={{ top: '42%', right: -46 }} /> : null}
                        </View>
                    </View>
                </View>

                {/* ================= capability strip */}
                <View style={[section, { marginTop: -8, marginBottom: 40 }]}>
                    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 18, paddingVertical: 18, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1, borderColor: border }, glass(isDarkMode), shadow(0.06)]}>
                        {[
                            { icon: 'phone-portrait-outline' as IconName, t: 'M-Pesa & Airtel Money' },
                            { icon: 'cloud-offline-outline' as IconName, t: 'Sells offline' },
                            { icon: 'navigate-outline' as IconName, t: 'Live delivery tracking' },
                            { icon: 'shield-checkmark-outline' as IconName, t: 'Paid out on release' },
                            { icon: 'people-outline' as IconName, t: 'Agents in your town' },
                            { icon: 'briefcase-outline' as IconName, t: 'Jobs board' },
                            { icon: 'time-outline' as IconName, t: 'Lipa Baadaye' },
                            { icon: 'umbrella-outline' as IconName, t: 'Micro-insurance' },
                        ].map((c) => (
                            <View key={c.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name={c.icon} size={18} color={theme.primary} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>{c.t}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* ================= industries */}
                <View {...anchor('industries')} style={[section, { paddingTop: wide ? 50 : 30, paddingBottom: wide ? 80 : 50 }]}>
                    <Title eyebrow="Industries" title="Built for the way your" accent="industry trades." sub="FMCG, pharmaceuticals, food & catering, and electricals & electronics — from the factory floor to the customer’s door." />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        {INDUSTRIES.map((ind) => (
                            <View key={ind.title} style={[{ flexGrow: 1, flexBasis: wide ? 250 : mid ? 300 : 280, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: theme.panel }, shadow(0.06)]}>
                                <View style={[{ padding: 20, gap: 12, minHeight: 150, justifyContent: 'flex-end', overflow: 'hidden' }, gradient(ind.colors[0], ind.colors[1])]}>
                                    <View style={{ position: 'absolute', right: -14, top: -16, opacity: 0.18 }}>
                                        <Ionicons name={ind.icon} size={140} color="#fff" />
                                    </View>
                                    <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' }}>
                                        <Ionicons name={ind.icon} size={23} color="#fff" />
                                    </View>
                                    <View>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.4 }}>{ind.title}</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 2 }}>{ind.examples}</Text>
                                    </View>
                                </View>
                                <View style={{ padding: 20, gap: 10 }}>
                                    {ind.points.map((pt) => (
                                        <Check key={pt} text={pt} color={ind.colors[0]} />
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* ================= the chain (navy band) */}
                <View {...anchor('chain')} style={[{ paddingVertical: wide ? 90 : 56, overflow: 'hidden' }, gradient('#0b1733', '#102a63', 160)]}>
                    <View style={[{ position: 'absolute', width: 520, height: 520, borderRadius: 260, top: -200, left: '55%', opacity: 0.25 }, gradient(G1, G2)]} />
                    <View style={section}>
                        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 40 }}>
                            <View style={{ gap: 10, maxWidth: 620 }}>
                                <Eyebrow text="B2B2C, made simple" dark />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: h2, lineHeight: h2 * 1.12, letterSpacing: -1 }}>
                                    From manufacturer to client in <Text style={gradientText('#7cc4ff')}>one flow.</Text>
                                </Text>
                            </View>
                            <Text style={{ color: '#b7c4e4', fontFamily: theme.font.medium, fontSize: 15, lineHeight: 24, maxWidth: 420 }}>
                                One product master, live prices and discounts all the way down, orders and payments all the way up. Nobody re-types a thing.
                            </Text>
                        </View>
                        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 0 : 12, alignItems: 'stretch' }}>
                            {CHAIN.map((c, i) => (
                                <View key={c.title} style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: 'center' }}>
                                    <View style={{ flex: 1, width: '100%', padding: 18, gap: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                                        <View style={[{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, gradient(G1, G2)]}>
                                            <Ionicons name={c.icon} size={22} color="#fff" />
                                        </View>
                                        <Text style={{ color: '#7cc4ff', fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 1.4 }}>0{i + 1}</Text>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 17 }}>{c.title}</Text>
                                        <Text style={{ color: '#b7c4e4', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>{c.text}</Text>
                                    </View>
                                    {i < CHAIN.length - 1 ? (
                                        <View style={{ paddingHorizontal: wide ? 6 : 0, paddingVertical: wide ? 0 : 2 }}>
                                            <Ionicons name={wide ? 'chevron-forward' : 'chevron-down'} size={20} color="#7cc4ff" />
                                        </View>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 34 }}>
                            {PILLARS.map((p) => (
                                <View key={p.title} style={{ flexGrow: 1, flexBasis: wide ? 300 : 260, padding: 20, gap: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: `${p.color}2e` }}>
                                        <Ionicons name={p.icon} size={20} color={p.color === G1 ? '#7cc4ff' : p.color} />
                                    </View>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16.5 }}>{p.title}</Text>
                                    <Text style={{ color: '#b7c4e4', fontFamily: theme.font.medium, fontSize: 13.5, lineHeight: 21 }}>{p.text}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                {/* ================= every stakeholder */}
                <View {...anchor('stakeholders')} style={[section, { paddingVertical: wide ? 90 : 56 }]}>
                    <Title eyebrow="No one left out" title="Built for every link in the chain" accent="— and the people in between." sub="Pick who you are. Every role gets its own tools, its own payouts and the same connected network." />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6, justifyContent: wide ? 'center' : 'flex-start', flexGrow: 1 }}>
                        {STAKEHOLDERS.map((s) => {
                            const on = s.key === active;
                            return (
                                <Pressable
                                    key={s.key}
                                    onPress={() => setActive(s.key)}
                                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: on ? 'transparent' : border }, on ? gradient(G1, G2, 100) : { backgroundColor: theme.panel }]}
                                >
                                    <Ionicons name={s.icon} size={16} color={on ? '#fff' : theme.textDark} />
                                    <Text style={{ color: on ? '#fff' : theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>{s.label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    <View style={[{ marginTop: 24, flexDirection: wide ? 'row' : 'column', gap: wide ? 40 : 22, alignItems: 'center', padding: wide ? 28 : 16, borderRadius: 32, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }, shadow(0.07)]}>
                        <Photo id={current.image} height={wide ? 380 : 240} radius={24} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }} />
                        <View style={{ flex: wide ? 1.05 : undefined, gap: 16, width: wide ? undefined : '100%' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, gradient(G1, G2)]}>
                                    <Ionicons name={current.icon} size={20} color="#fff" />
                                </View>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13, letterSpacing: 1.2 }}>{current.label.toUpperCase()}</Text>
                            </View>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: wide ? 28 : 22, lineHeight: wide ? 34 : 28, letterSpacing: -0.6 }}>{current.headline}</Text>
                            <View style={{ gap: 11 }}>
                                {current.points.map((pt) => <Check key={pt} text={pt} />)}
                            </View>
                            {!isAuthed ? (
                                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                                    <PrimaryButton label={current.cta} onPress={() => register(current.key)} />
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>

                {/* ================= offline shop -> e-commerce */}
                <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: wide ? 90 : 56 }}>
                    <View style={[section, { flexDirection: wide ? 'row' : 'column-reverse', gap: wide ? 56 : 28, alignItems: 'center' }]}>
                        <View style={{ flex: 1, gap: 20 }}>
                            <Title center={false} eyebrow="Offline to online" title="Your duka is now" accent="an online shop." sub="No website to build, no second stock list. What you sell at the counter is what buyers nearby can order from their phones." />
                            {[
                                { n: '1', t: 'Sell at the counter as usual', s: 'Barcode scanning, receipts, cash or mobile money — even with no internet.' },
                                { n: '2', t: 'Buyers nearby see your stock', s: 'Your shop appears in the marketplace with live prices and discounts.' },
                                { n: '3', t: 'Orders arrive, already paid', s: 'Prepare, pack and hand over with a code — or let a rider deliver it.' },
                            ].map((x) => (
                                <View key={x.n} style={{ flexDirection: 'row', gap: 14, marginTop: -10, marginBottom: 14 }}>
                                    <View style={[{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, gradient(G1, G2)]}>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>{x.n}</Text>
                                    </View>
                                    <View style={{ flex: 1, gap: 3 }}>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{x.t}</Text>
                                        <Text style={[muted, { fontSize: 14, lineHeight: 21 }]}>{x.s}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View style={{ flex: 1, width: '100%', maxWidth: 560 }}>
                            <Photo id={PHOTOS.duka} height={wide ? 460 : 320} style={shadow(0.18)} />
                            <FloatCard icon="globe-outline" color={G1} sub="Now online" title="Mama Njeri's Shop · 1.2 km" style={{ top: 18, left: wide ? -30 : 10 }} />
                            <FloatCard icon="bag-check" color={PALETTE.success} sub="New order · paid" title="3 items · pickup at 5 pm" style={{ bottom: 18, right: wide ? -24 : 10 }} />
                        </View>
                    </View>
                </View>

                {/* ================= secure payments */}
                <View {...anchor('payments')} style={[section, { paddingVertical: wide ? 90 : 56 }]}>
                    <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 28, alignItems: 'center' }}>
                        <View style={{ flex: 1, width: '100%', maxWidth: 540 }}>
                            <Photo id={PHOTOS.payPhone} height={wide ? 420 : 280} style={shadow(0.16)} />
                            <FloatCard icon="lock-closed" color={PALETTE.success} sub="Held securely" title="Released on hand-over" style={{ bottom: 20, left: wide ? -26 : 10 }} />
                        </View>
                        <View style={{ flex: 1.1, gap: 8 }}>
                            <Title center={false} eyebrow="Secure payments" title="Everyone paid," accent="nobody exposed." sub="Buyers pay once by mobile money. WaziPOS holds it and pays each party when they've done their part — straight into their verified payout account." />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: -12 }}>
                                {PAYMENT_FLOW.map((p, i) => (
                                    <View key={p.title} style={{ flexGrow: 1, flexBasis: 230, padding: 16, gap: 8, borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft }}>
                                                <Ionicons name={p.icon} size={18} color={theme.primary} />
                                            </View>
                                            <Text style={{ color: theme.colors.textSubtle, fontFamily: theme.font.bold, fontSize: 12 }}>STEP {i + 1}</Text>
                                        </View>
                                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{p.title}</Text>
                                        <Text style={[muted, { fontSize: 13, lineHeight: 19 }]}>{p.text}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </View>

                {/* ================= deliveries */}
                <View {...anchor('delivery')} style={[{ paddingVertical: wide ? 90 : 56 }, gradient(isDarkMode ? '#0b1733' : '#eaf2ff', isDarkMode ? '#08122b' : '#f5f8ff', 180)]}>
                    <View style={section}>
                        <Title eyebrow="Seamless delivery" title="Across town or across the country —" accent="it arrives." sub="Sellers dispatch with their own staff and fleet, or the nearest on-duty WaziPOS rider. Long distances go through whitelisted courier partners to an office near the buyer. Every handover is confirmed with a code." />
                        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
                            <View style={{ flex: 1.3 }}>
                                <Photo id={PHOTOS.boda} height={wide ? 420 : 260} style={shadow(0.16)} />
                                <FloatCard icon="location" color={G1} sub="Delivery code confirmed" title="Delivered · rider paid" style={{ top: 18, right: 18 }} />
                            </View>
                            <View style={{ flex: 1, gap: 12 }}>
                                {DELIVERY_MODES.map((d) => (
                                    <View key={d.title} style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: border }, glass(isDarkMode)]}>
                                        <View style={[{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, gradient(G1, G2)]}>
                                            <Ionicons name={d.icon} size={21} color="#fff" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{d.title}</Text>
                                            <Text style={[muted, { fontSize: 13 }]}>{d.text}</Text>
                                        </View>
                                    </View>
                                ))}
                                <Photo id={PHOTOS.handover} height={wide ? 120 : 150} radius={20} />
                            </View>
                        </View>
                    </View>
                </View>

                {/* ================= inventory + agents */}
                <View style={[section, { paddingVertical: wide ? 90 : 56 }]}>
                    <Title eyebrow="Inventory you can trust" title="Every item counted," accent="every shilling accounted for." sub="From the manufacturer's batch to the retailer's shelf, stock stays traceable — even when the owner isn't in." />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                        {INVENTORY.map((x) => (
                            <View key={x.title} style={[{ flexGrow: 1, flexBasis: wide ? 240 : 260, padding: 20, gap: 10, borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }, shadow(0.04)]}>
                                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft }}>
                                    <Ionicons name={x.icon} size={21} color={theme.primary} />
                                </View>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16.5 }}>{x.title}</Text>
                                <Text style={[muted, { fontSize: 13.5, lineHeight: 20 }]}>{x.text}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={[{ marginTop: 28, flexDirection: wide ? 'row' : 'column', borderRadius: 32, overflow: 'hidden' }, gradient('#0b1733', '#14306e', 120), shadow(0.18)]}>
                        <View style={{ flex: 1.1, padding: wide ? 40 : 24, gap: 14 }}>
                            <Eyebrow text="A robust agency network" dark />
                            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: wide ? 32 : 24, lineHeight: wide ? 38 : 30, letterSpacing: -0.6 }}>
                                Real people in every town, <Text style={gradientText('#7cc4ff')}>getting businesses online.</Text>
                            </Text>
                            <View style={{ gap: 10 }}>
                                <Check dark color="#7cc4ff" text="Agents register businesses, capture their location and set up their payout accounts" />
                                <Check dark color="#7cc4ff" text="Free first month, then pay per order with WaziPOS Tokens — no monthly fee" />
                                <Check dark color="#7cc4ff" text="Stocktakers help count opening stock and run independent stock takes" />
                            </View>
                            {!isAuthed ? (
                                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                    <PrimaryButton light label="Become an agent" onPress={() => register('agent')} />
                                </View>
                            ) : null}
                        </View>
                        <View style={{ flex: 0.9, minHeight: 260 }}>
                            <Image source={photo(PHOTOS.butcher)} style={{ width: '100%', height: '100%', minHeight: 260 }} resizeMode="cover" />
                        </View>
                    </View>
                </View>

                {/* ================= people mosaic */}
                <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: wide ? 90 : 56 }}>
                    <View style={section}>
                        <Title eyebrow="The people we serve" title="Made for Kenyan commerce," accent="from the duka to the depot." />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                            {[
                                { id: PHOTOS.vendorPhone, t: 'Market traders', s: 'Orders and payments on the phone they already have' },
                                { id: PHOTOS.happyBuyer, t: 'Happy buyers', s: 'Live discounts, delivery codes, no surprises' },
                                { id: PHOTOS.cargoRider, t: 'Riders', s: 'Jobs nearby, paid on delivery' },
                                { id: PHOTOS.pharmacy, t: 'Pharmacies', s: 'Prescriptions, quotes and batch-tracked medicine' },
                                { id: PHOTOS.foodVendor, t: 'Food vendors', s: 'Menus, orders and riders in one place' },
                                { id: PHOTOS.market, t: 'Shoppers', s: 'Everything near you, in one app' },
                            ].map((x) => (
                                <View key={x.t} style={[{ flexGrow: 1, flexBasis: wide ? 340 : 280, height: wide ? 300 : 260, borderRadius: 26, overflow: 'hidden' }, shadow(0.1)]}>
                                    <Image source={photo(x.id, 900)} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                    <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 50, paddingBottom: 16 }, isWeb ? { backgroundImage: 'linear-gradient(180deg, rgba(11,23,51,0) 0%, rgba(11,23,51,0.88) 100%)' } : { backgroundColor: 'rgba(11,23,51,0.7)', paddingTop: 12 }]}>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 17 }}>{x.t}</Text>
                                        <Text style={{ color: '#dbe4f8', fontFamily: theme.font.medium, fontSize: 13 }}>{x.s}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                {/* ================= WaziPOS Credit (Lipa Baadaye) */}
                <View {...anchor('credit')} style={[{ paddingVertical: wide ? 90 : 56, overflow: 'hidden' }, gradient('#2e1065', '#6d28d9', 150)]}>
                    <View style={[{ position: 'absolute', width: 520, height: 520, borderRadius: 260, top: -220, right: -140, opacity: 0.3 }, gradient('#a78bfa', '#22b8f0')]} />
                    <View style={[section, { flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 28, alignItems: wide ? 'center' : 'stretch' }]}>
                        <View style={{ flex: wide ? 1.05 : undefined }}>
                            <Title dark center={!wide} eyebrow="WaziPOS Credit" title="Lipa Baadaye —" accent="stock now, pay later." sub="A licensed lender pays your supplier the moment you order. You repay in 7, 14 or 28 days by M-Pesa — early, or in parts." />
                            <View style={{ gap: 11, marginTop: -8 }}>
                                {CREDIT_POINTS.map((pt) => (
                                    <Check key={pt} text={pt} color="#c4b5fd" dark />
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
                                {CREDIT_SEGMENTS.map((c) => (
                                    <View key={c.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                        <Ionicons name={c.icon} size={16} color="#c4b5fd" />
                                        <Text style={{ color: '#ede9fe', fontFamily: theme.font.semibold, fontSize: 13 }}>{c.t}</Text>
                                    </View>
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28, justifyContent: wide ? 'flex-start' : 'center' }}>
                                {isAuthed ? (
                                    <PrimaryButton label="My credit" icon="time-outline" onPress={() => router.push('/credit' as any)} light />
                                ) : (
                                    <>
                                        <PrimaryButton label="Buy now, pay later" onPress={() => register('retailer')} light />
                                        <GhostButton label="Lend on WaziPOS" icon="business-outline" onPress={() => register('lenders')} dark />
                                    </>
                                )}
                            </View>
                        </View>

                        {/* the offer card a trader sees at checkout */}
                        <View style={[{ flex: wide ? 0.95 : undefined, maxWidth: 480, width: '100%', alignSelf: 'center', borderRadius: 28, padding: 22, gap: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, isWeb ? ({ backdropFilter: 'blur(14px)' } as any) : null]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6' }}>
                                    <Ionicons name="time" size={22} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16 }}>Restock order · KES 20,000</Text>
                                    <Text style={{ color: '#c4b5fd', fontFamily: theme.font.medium, fontSize: 12.5 }}>Paid now by your lender</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {[{ d: 7, x: '+KES 540' }, { d: 14, x: '+KES 840' }, { d: 28, x: '+KES 1,240' }].map((t, i) => (
                                    <View key={t.d} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: i === 1 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }}>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 18 }}>{t.d} days</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: theme.font.semibold, fontSize: 11.5 }}>{t.x}</Text>
                                    </View>
                                ))}
                            </View>
                            <View style={{ gap: 6, padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.18)' }}>
                                {[['Interest (3% · 14 days)', 'KES 600'], ['Admin fee (1%)', 'KES 200'], ['Excise duty (20% of the fee)', 'KES 40']].map(([k, v]) => (
                                    <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: '#ddd6fe', fontFamily: theme.font.medium, fontSize: 13 }}>{k}</Text>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.semibold, fontSize: 13 }}>{v}</Text>
                                    </View>
                                ))}
                                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 }} />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>You repay in 14 days</Text>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16 }}>KES 20,840</Text>
                                </View>
                            </View>
                            <Text style={{ color: '#c4b5fd', fontFamily: theme.font.medium, fontSize: 12, lineHeight: 18 }}>
                                Example with a lender's sample rates. Loans come from CBK- and SASRA-licensed lenders; repayments go straight to them by M-Pesa.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ================= WaziPOS Cover (micro-insurance) */}
                <View {...anchor('cover')} style={[section, { paddingVertical: wide ? 90 : 56 }]}>
                    <Title eyebrow="WaziPOS Cover" title="Insurance that costs less" accent="than a soda." sub="Five micro-policies made for small businesses and riders. Opt in with one tap at checkout, when you go on duty or at the till — and see exactly what you'd get back before you pay." />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                        {COVER_PLANS.map((c) => (
                            <View key={c.name} style={[{ flexGrow: 1, flexBasis: wide ? 200 : mid ? 260 : 280, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: theme.panel }, shadow(0.06)]}>
                                <View style={[{ padding: 18, gap: 10, minHeight: 120, justifyContent: 'flex-end', overflow: 'hidden' }, gradient(c.color, `${c.color}cc`, 140)]}>
                                    <View style={{ position: 'absolute', right: -12, top: -12, opacity: 0.18 }}>
                                        <Ionicons name={c.icon} size={110} color="#fff" />
                                    </View>
                                    <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' }}>
                                        <Ionicons name={c.icon} size={21} color="#fff" />
                                    </View>
                                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 19, letterSpacing: -0.3 }}>{c.name}</Text>
                                </View>
                                <View style={{ padding: 16, gap: 8 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 14, lineHeight: 20 }}>{c.text}</Text>
                                    <Text style={{ color: c.color, fontFamily: theme.font.bold, fontSize: 13.5 }}>{c.price}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 24 }}>
                        {[
                            { icon: 'flash-outline' as IconName, t: 'Opt in where the risk is' },
                            { icon: 'calculator-outline' as IconName, t: 'Live price & payout' },
                            { icon: 'pricetag-outline' as IconName, t: 'Cheaper with Shop guard' },
                            { icon: 'phone-portrait-outline' as IconName, t: 'Pay by M-Pesa' },
                            { icon: 'document-text-outline' as IconName, t: 'Claim in the app' },
                        ].map((x) => (
                            <View key={x.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt }}>
                                <Ionicons name={x.icon} size={16} color={theme.primary} />
                                <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13 }}>{x.t}</Text>
                            </View>
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 26 }}>
                        {isAuthed ? (
                            <PrimaryButton label="Get covered" icon="shield-checkmark-outline" onPress={() => router.push('/insurance' as any)} />
                        ) : (
                            <PrimaryButton label="Get covered" icon="shield-checkmark-outline" onPress={() => register('customer')} />
                        )}
                    </View>
                    <Text style={[muted, { fontSize: 12, textAlign: 'center', marginTop: 12 }]}>Arranged with a licensed insurance partner. Opt in now to lock your quote.</Text>
                </View>

                {/* ================= jobs board */}
                <View {...anchor('jobs')} style={[{ paddingVertical: wide ? 90 : 56, overflow: 'hidden' }, gradient('#0b1733', '#14306e', 150)]}>
                    <View style={[{ position: 'absolute', width: 480, height: 480, borderRadius: 240, bottom: -220, right: -120, opacity: 0.28 }, gradient(G2, '#8b5cf6')]} />
                    <View style={section}>
                        <Title dark eyebrow="WaziPOS Jobs" title="Hire the right people." accent="Find the right job." sub="A jobs board built into WaziPOS: businesses advertise permanent posts and locum cover, and every member can apply — from pharmacists and technologists to cashiers, chefs, riders and sales staff." />
                        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
                            {[
                                { icon: 'person' as IconName, title: 'For job seekers', points: JOBS_SEEKERS },
                                { icon: 'business' as IconName, title: 'For employers', points: JOBS_EMPLOYERS },
                            ].map((col) => (
                                <View key={col.title} style={{ flex: wide ? 1 : undefined, padding: wide ? 28 : 20, gap: 16, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <View style={[{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, gradient(G1, G2)]}>
                                            <Ionicons name={col.icon} size={21} color="#fff" />
                                        </View>
                                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 20 }}>{col.title}</Text>
                                    </View>
                                    <View style={{ gap: 11 }}>
                                        {col.points.map((pt) => (
                                            <Check key={pt} text={pt} color="#7cc4ff" dark />
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 28 }}>
                            {[
                                { icon: 'briefcase-outline' as IconName, t: 'Permanent & locum' },
                                { icon: 'shield-checkmark-outline' as IconName, t: 'Licence-ready (PPB, KMPDC, NCK)' },
                                { icon: 'share-social-outline' as IconName, t: 'Share jobs anywhere' },
                                { icon: 'notifications-outline' as IconName, t: 'Applicants kept in the loop' },
                            ].map((c) => (
                                <View key={c.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                    <Ionicons name={c.icon} size={16} color="#7cc4ff" />
                                    <Text style={{ color: '#dbe4f8', fontFamily: theme.font.semibold, fontSize: 13 }}>{c.t}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 28 }}>
                            {isAuthed ? (
                                <>
                                    <PrimaryButton label="Browse jobs" icon="search" onPress={() => router.push('/jobs' as any)} light />
                                    <GhostButton label="Post a job" icon="megaphone-outline" onPress={() => router.push('/jobAdverts' as any)} dark />
                                </>
                            ) : (
                                <>
                                    <PrimaryButton label="Find a job" icon="search" onPress={() => register('jobs')} light />
                                    <GhostButton label="Hire with WaziPOS" icon="megaphone-outline" onPress={() => register('retailer')} dark />
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* ================= more services */}
                <View {...anchor('services')} style={[section, { paddingVertical: wide ? 90 : 56 }]}>
                    <Title eyebrow="More from WaziPOS" title="One account," accent="many ways to get paid." sub="The same secure mobile-money rails power services beyond the shop counter." />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        {MORE_SERVICES.map((m) => (
                            <View key={m.title} style={[{ flexGrow: 1, flexBasis: wide ? 320 : 280, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: theme.panel }, shadow(0.06)]}>
                                <View style={[{ height: 120, padding: 20, justifyContent: 'flex-end' }, gradient(m.colors[0], m.colors[1])]}>
                                    <View style={{ position: 'absolute', right: -10, top: -14, opacity: 0.2 }}>
                                        <Ionicons name={m.icon} size={130} color="#fff" />
                                    </View>
                                    <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' }}>
                                        <Ionicons name={m.icon} size={24} color="#fff" />
                                    </View>
                                </View>
                                <View style={{ padding: 20, gap: 8 }}>
                                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 19 }}>{m.title}</Text>
                                    <Text style={[muted, { fontSize: 14, lineHeight: 21 }]}>{m.text}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* ================= final CTA */}
                <View style={[section, { paddingBottom: wide ? 80 : 48 }]}>
                    <View style={[{ borderRadius: 36, padding: wide ? 56 : 28, gap: 18, alignItems: 'center', overflow: 'hidden' }, gradient(G1, '#0f4bd1', 120), shadow(0.25, '42,111,243')]}>
                        <View style={[{ position: 'absolute', width: 420, height: 420, borderRadius: 210, right: -120, top: -180, opacity: 0.35 }, gradient(G2, '#ffffff')]} />
                        <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: wide ? 42 : 28, lineHeight: wide ? 48 : 34, letterSpacing: -1, textAlign: 'center', maxWidth: 760 }}>
                            Join the chain that connects the whole country.
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.88)', fontFamily: theme.font.medium, fontSize: 16, lineHeight: 25, textAlign: 'center', maxWidth: 620 }}>
                            Free to start. Shop as a customer today, open your business when you're ready — an agent near you can set it all up.
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                            {isAuthed ? (
                                <PrimaryButton light label="Go to your dashboard" icon="grid" onPress={dashboard} />
                            ) : (
                                <>
                                    <PrimaryButton light label="Create a free account" onPress={() => register()} />
                                    <GhostButton dark label="Sign in" icon="log-in-outline" onPress={login} />
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* ================= footer */}
                <View style={{ backgroundColor: NAVY, paddingVertical: 34 }}>
                    <View style={[section, { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 20 }]}>
                        <View style={{ gap: 8, maxWidth: 380 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Image source={require('@/assets/images/wazipos_icon.png')} style={{ width: 30, height: 30, borderRadius: 9 }} />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 18 }}>WaziPOS</Text>
                            </View>
                            <Text style={{ color: '#9fb0d6', fontFamily: theme.font.medium, fontSize: 13, lineHeight: 20 }}>
                                Commerce from the manufacturer to the client — stock, sell, get paid, deliver, finance, insure and hire, all in one place. For FMCG, pharmaceuticals, food & catering, and electricals & electronics.
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22 }}>
                            {NAV.map((n) => (
                                <Pressable key={n.key} onPress={() => goTo(n.key)} hitSlop={6}>
                                    <Text style={{ color: '#dbe4f8', fontFamily: theme.font.semibold, fontSize: 13.5 }}>{n.label}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <View style={{ gap: 8, alignItems: wide ? 'flex-end' : 'flex-start' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ color: '#9fb0d6', fontFamily: theme.font.medium, fontSize: 12.5 }}>Payments powered by</Text>
                                <View style={{ backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                                    <Image source={require('@/assets/images/jambopay_logo.png')} style={{ width: 96, height: 26 }} resizeMode="contain" accessibilityLabel="JamboPay" />
                                </View>
                            </View>
                            <Text style={{ color: '#7584a8', fontFamily: theme.font.medium, fontSize: 12 }}>© {new Date().getFullYear()} WaziPOS · Photos: Unsplash</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
