// utils/navigationData.ts

interface SidebarRoute {
    id: number;
    title: string;
    route: string;
    allowedRoles: string[];
    showInSidebar: boolean;

    /**
     * Lucide icon name. Resolved at render time against
     * LUCIDE_ICONS in SidebarNavigationList. Ignored if the
     * icon isn't in the map — falls back to initials.
     */
    icon?: string;

    /**
     * Hex accent used for the icon's tinted square. If omitted,
     * the sidebar derives a stable hue from the item id.
     */
    tint?: string;

    subRoutes?: SidebarRoute[];

    /**
     * Sections people may hide from their menu (Profile -> Menu sections, or the
     * section's own "Hide this menu" item). Saved on the account: Users.hidden_menus.
     */
    hideKey?: string;
}

/** Menu sections a person can hide (key -> what it is called in Preferences). */
export const HIDEABLE_SECTIONS: { key: string; title: string; description: string }[] = [
    { key: 'church', title: 'Church', description: 'Find a church, your church’s notices and programme, your family register.' },
];

/* Section tints — one hue per top-level entry, sub-routes inherit. */
const TINTS = {
    blue: '#3b82f6',
    violet: '#8b5cf6',
    sky: '#0ea5e9',
    amber: '#f59e0b',
    teal: '#14b8a6',
    pink: '#ec4899',
    emerald: '#10b981',
    indigo: '#6366f1',
    orange: '#f97316',
    red: '#ef4444',
    slate: '#64748b',
} as const;

/* Jobs board: every signed-in user browses and applies; only a business's own admins post adverts for it. */
const JOB_EMPLOYERS: string[] = ['GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin', 'GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'];
/* Businesses on WaziPOS Tokens (Publishers are not billed: backend billing.pricing.BILLING_EXEMPT). */
const BILLED_ADMINS: string[] = JOB_EMPLOYERS.filter((r) => r !== 'PublisherSuperAdmin');
const JOB_SEEKERS: string[] = ['Client', 'Admin', 'Agent', 'Onboarder', ...JOB_EMPLOYERS];
/* Churches: everyone signed in (Client / Admin are in every token); officials run their church. */
const CHURCH_EVERYONE: string[] = ['Client', 'Admin', 'Agent', 'Onboarder', 'ChurchSuperAdmin', 'ChurchOfficial'];
const CHURCH_ADMINS: string[] = ['ChurchSuperAdmin', 'ChurchOfficial'];
/* Denomination head office (overseer, admins, communications); WaziPOS admins can open any. */
const DENOMINATION_ADMINS: string[] = ['DenominationAdmin', 'RegionAdmin', 'Admin'];

export const SIDEBAR_NAV_MANIFEST: SidebarRoute[] = [
    {
        id: 1,
        title: 'Dashboard',
        route: '/(tabs)',
        allowedRoles: ['Client', 'Admin'],
        showInSidebar: true,
        icon: 'LayoutDashboard',
        tint: TINTS.blue,
    },
    {
        id: 15,
        title: 'Shopping',
        route: '/shopFront?tab=shopFront',
        // Every signed-in user shops and eats.
        allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
        showInSidebar: true,
        icon: 'ShoppingCart',
        tint: TINTS.violet,
        subRoutes: [
            {
                // Shops and pharmacies near you, by distance.
                id: 6,
                title: 'Adjacent Stores',
                route: '/shopFront?tab=shopFront',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Store',
                tint: TINTS.violet,
            },
            {
                // Restaurants near you: order in, pick up or book a table.
                id: 7,
                title: 'Adjacent Restaurants',
                route: '/(tabs)/restaurants',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'UtensilsCrossed',
                tint: TINTS.violet,
            },
            {
                id: 1,
                title: 'Orders',
                route: '/myOrders',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'ShoppingBag',
                tint: TINTS.violet,
            },
            {
                id: 2,
                title: 'Prescriptions',
                route: '/userPrescriptions',
                // ADDED PharmaceuticalRetailerSuperAdmin and GeneralRetailerSuperAdmin
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'ClipboardPlus',
                tint: TINTS.violet,
            },
            {
                // Dosing schedule of medicines bought on prescriptions: confirm
                // each dose, see when a partly-bought medicine runs out.
                id: 5,
                title: 'My Medicines',
                route: '/medications',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Pill',
                tint: TINTS.violet,
            },
            {
                id: 3,
                title: 'My Wallet',
                route: '/shopping/wallet',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.violet,
            },
            {
                id: 4,
                title: 'My Plans',
                // Shopping plans (wishlists) on this phone: real prices, budgets, pay when ready.
                route: '/plans',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'CalendarDays',
                tint: TINTS.violet,
            },
        ],
    },
    {
        id: 24,
        title: 'Jobs',
        route: '/jobs',
        allowedRoles: JOB_SEEKERS,
        showInSidebar: true,
        icon: 'Briefcase',
        tint: TINTS.indigo,
        subRoutes: [
            { id: 1, title: 'Job board', route: '/jobs', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'Search', tint: TINTS.indigo },
            { id: 2, title: 'My applications', route: '/jobs?tab=applications', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'FileCheck', tint: TINTS.indigo },
            { id: 3, title: 'Saved jobs', route: '/jobs?tab=saved', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'Bookmark', tint: TINTS.indigo },
            { id: 5, title: 'My CV', route: '/myCv', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'FileText', tint: TINTS.indigo },
            { id: 4, title: 'Post & hire', route: '/jobAdverts', allowedRoles: JOB_EMPLOYERS, showInSidebar: true, icon: 'Megaphone', tint: TINTS.indigo },
        ],
    },
    {
        // Open to everyone, like Shopping; anyone can hide it (hideKey). Backend churches app.
        id: 28,
        title: 'Church',
        route: '/churches',
        allowedRoles: CHURCH_EVERYONE,
        showInSidebar: true,
        icon: 'Church',
        tint: TINTS.teal,
        hideKey: 'church',
        subRoutes: [
            { id: 1, title: 'My church', route: '/churches', allowedRoles: CHURCH_EVERYONE, showInSidebar: true, icon: 'Church', tint: TINTS.teal },
            { id: 2, title: 'Find a church', route: '/churchFind', allowedRoles: CHURCH_EVERYONE, showInSidebar: true, icon: 'MapPin', tint: TINTS.teal },
            { id: 3, title: 'My family', route: '/churchFamily', allowedRoles: CHURCH_EVERYONE, showInSidebar: true, icon: 'HouseHeart', tint: TINTS.teal },
            { id: 4, title: 'Hide this menu', route: '/churches?hide=1', allowedRoles: CHURCH_EVERYONE, showInSidebar: true, icon: 'EyeOff', tint: TINTS.teal },
        ],
    },
    {
        // People who help run a church: its owner / super admin, and officials it appointed
        // (pastor, secretary, treasurer, welfare, group leaders). What each may do is checked by the backend.
        id: 29,
        title: 'Church admin',
        route: '/churchDashboard',
        allowedRoles: CHURCH_ADMINS,
        showInSidebar: true,
        icon: 'HeartHandshake',
        tint: TINTS.teal,
        subRoutes: [
            { id: 1, title: 'Dashboard', route: '/churchDashboard', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'LayoutDashboard', tint: TINTS.teal },
            { id: 2, title: 'Families', route: '/churchFamilies', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'HouseHeart', tint: TINTS.teal },
            { id: 3, title: 'Members', route: '/churchMembers', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'Users', tint: TINTS.teal },
            { id: 4, title: 'Groups', route: '/churchGroups', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'UsersRound', tint: TINTS.teal },
            { id: 5, title: 'Send SMS', route: '/churchMessages', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'MessageSquare', tint: TINTS.teal },
            { id: 6, title: 'Announcements', route: '/churchAnnouncements', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'Megaphone', tint: TINTS.teal },
            { id: 7, title: 'Programme & events', route: '/churchSchedule', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'CalendarDays', tint: TINTS.teal },
            { id: 8, title: 'Officials & settings', route: '/churchOfficials', allowedRoles: CHURCH_ADMINS, showInSidebar: true, icon: 'UserCog', tint: TINTS.teal },
        ],
    },
    {
        // A denomination's head office (e.g. Free Pentecostal Fellowship in Kenya) and its region
        // admins (scoped to their region): regions, parishes, join requests, parish officials,
        // notices / events. Roles flow down: WaziPOS -> denomination -> region -> parish -> group.
        id: 30,
        title: 'Denomination',
        route: '/denomination',
        allowedRoles: DENOMINATION_ADMINS,
        showInSidebar: true,
        icon: 'Landmark',
        tint: TINTS.teal,
        subRoutes: [
            { id: 1, title: 'Overview', route: '/denomination', allowedRoles: DENOMINATION_ADMINS, showInSidebar: true, icon: 'LayoutDashboard', tint: TINTS.teal },
            { id: 5, title: 'Regions', route: '/denominationRegions', allowedRoles: DENOMINATION_ADMINS, showInSidebar: true, icon: 'Map', tint: TINTS.teal },
            { id: 2, title: 'Parishes', route: '/denominationParishes', allowedRoles: DENOMINATION_ADMINS, showInSidebar: true, icon: 'Church', tint: TINTS.teal },
            { id: 3, title: 'Notices & events', route: '/denominationNotices', allowedRoles: DENOMINATION_ADMINS, showInSidebar: true, icon: 'Megaphone', tint: TINTS.teal },
            { id: 4, title: 'Head office', route: '/denominationAdmins', allowedRoles: ['DenominationAdmin', 'Admin'], showInSidebar: true, icon: 'UserCog', tint: TINTS.teal },
        ],
    },
    {
        id: 25,
        title: 'Insurance',
        route: '/insurance',
        // Every signed-in user sees the cover meant for them; the claims desk is for platform admins.
        allowedRoles: JOB_SEEKERS,
        showInSidebar: true,
        icon: 'ShieldCheck',
        tint: TINTS.emerald,
        subRoutes: [
            { id: 1, title: 'Cover for you', route: '/insurance', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'ShieldCheck', tint: TINTS.emerald },
            { id: 2, title: 'My policies', route: '/insurance?tab=policies', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'FileCheck', tint: TINTS.emerald },
            { id: 3, title: 'Claims', route: '/insurance?tab=claims', allowedRoles: JOB_SEEKERS, showInSidebar: true, icon: 'FileText', tint: TINTS.emerald },
            { id: 4, title: 'Claims desk', route: '/insurance?tab=desk', allowedRoles: ['Admin'], showInSidebar: true, icon: 'ClipboardCheck', tint: TINTS.emerald },
        ],
    },
    {
        id: 26,
        title: 'Credit',
        route: '/credit',
        // Lipa Baadaye: everyone sees their loans; Bank / Facilitator admins lend; WaziPOS admins approve lenders.
        allowedRoles: [...JOB_SEEKERS, 'BankSuperAdmin', 'FacilitatorSuperAdmin'],
        showInSidebar: true,
        icon: 'HandCoins',
        tint: TINTS.violet,
        subRoutes: [
            { id: 1, title: 'My loans', route: '/credit', allowedRoles: [...JOB_SEEKERS, 'BankSuperAdmin', 'FacilitatorSuperAdmin'], showInSidebar: true, icon: 'Wallet', tint: TINTS.violet },
            { id: 2, title: 'Lending', route: '/credit?tab=lending', allowedRoles: ['BankSuperAdmin', 'FacilitatorSuperAdmin'], showInSidebar: true, icon: 'Building2', tint: TINTS.violet },
            { id: 3, title: 'Lenders desk', route: '/credit?tab=desk', allowedRoles: ['Admin'], showInSidebar: true, icon: 'ShieldCheck', tint: TINTS.violet },
        ],
    },
    {
        id: 27,
        title: 'Billing',
        route: '/billing',
        // WaziPOS Tokens: every business's staff see the balance; its admins top up. WaziPOS admins see all wallets.
        allowedRoles: ['Admin', ...BILLED_ADMINS, 'BankSuperAdmin', 'FacilitatorSuperAdmin'],
        showInSidebar: true,
        icon: 'Coins',
        tint: TINTS.amber,
        subRoutes: [
            { id: 1, title: 'Tokens & usage', route: '/billing', allowedRoles: ['Admin', ...BILLED_ADMINS, 'BankSuperAdmin', 'FacilitatorSuperAdmin'], showInSidebar: true, icon: 'Coins', tint: TINTS.amber },
            { id: 2, title: 'History', route: '/billing?tab=history', allowedRoles: ['Admin', ...BILLED_ADMINS, 'BankSuperAdmin', 'FacilitatorSuperAdmin'], showInSidebar: true, icon: 'History', tint: TINTS.amber },
            { id: 3, title: 'All wallets', route: '/billing?tab=wallets', allowedRoles: ['Admin'], showInSidebar: true, icon: 'Wallet', tint: TINTS.amber },
        ],
    },
    {
        id: 2,
        title: 'Admin Panel',
        route: '/routes',
        // Each item below still has its own allowedRoles; this only lets the
        // group show for these roles.
        allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'CourierSuperAdmin', 'DeliverySuperAdmin'],
        showInSidebar: true,
        icon: 'ShieldCheck',
        tint: TINTS.violet,
        subRoutes: [
            {
                id: 30,
                title: 'Sign-ups & approvals',
                route: '/signups?tab=approvals',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'UserPlus',
                tint: TINTS.violet,
            },
            {
                // Church denominations / fellowships above parishes (churches app).
                id: 31,
                title: 'Denominations',
                route: '/denominationsDesk',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Landmark',
                tint: TINTS.violet,
            },
            {
                id: 1,
                title: 'Cadres',
                route: '/cadres?tab=cadres',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 2,
                title: 'Clusters',
                route: '/clusters?tab=clusters',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 3,
                title: 'Departments',
                route: '/departments?tab=departments',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 4,
                title: 'Designations',
                route: '/designations?tab=designations',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 5,
                title: 'Drug Categories',
                route: '/drugCategories?tab=drugCategories',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'FolderTree',
                tint: TINTS.violet,
            },
            {
                id: 6,
                title: 'Drug Classes',
                route: '/drugClasses?tab=drugClasses',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Layers',
                tint: TINTS.violet,
            },
            {
                id: 7,
                title: 'Drug Sub Classes',
                route: '/drugSubClasses?tab=drugSubClasses',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Layers2',
                tint: TINTS.violet,
            },
            {
                id: 8,
                title: 'Employees',
                route: '/employees?tab=employees',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 9,
                title: 'Entities',
                route: '/entities?tab=entities',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 10,
                title: 'Formulations',
                route: '/formulations?tab=formulations',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'FlaskConical',
                tint: TINTS.violet,
            },
            {
                id: 11,
                title: 'Frequencies',
                route: '/frequencies?tab=frequencies',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Clock',
                tint: TINTS.violet,
            },
            {
                id: 12,
                title: 'Generic Drugs',
                route: '/generics?tab=generics',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Pill',
                tint: TINTS.violet,
            },
            {
                id: 13,
                title: 'Preparations',
                route: '/preparations?tab=preparations',
                allowedRoles: ['Admin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'TestTube',
                tint: TINTS.violet,
            },
            {
                // All users' prescriptions (platform admins only — the
                // backend endpoint is IsAdminUser). Lives at /adminPrescriptions
                // so it doesn't collide with the shopper's /userPrescriptions.
                id: 19,
                title: 'Prescriptions',
                route: '/adminPrescriptions?tab=adminPrescriptions',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'ClipboardList',
                tint: TINTS.violet,
            },
            {
                id: 14,
                title: 'Products',
                route: '/products?tab=products',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'Package',
                tint: TINTS.violet,
            },
            {
                id: 15,
                title: 'Roles',
                route: '/roles?tab=roles',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 16,
                title: 'Routes',
                route: '/routes?tab=index',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Route',
                tint: TINTS.violet,
            },
            {
                // Where an entity is paid out to. Platform admins manage every
                // entity's accounts; entity super admins only their own (the
                // backend scopes it: payments/utils/admin_payout_accounts.py).
                id: 20,
                title: 'Payout accounts',
                route: '/payoutAccounts?tab=payoutAccounts',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'CourierSuperAdmin', 'DeliverySuperAdmin'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.violet,
            },
            {
                // Delivery earnings owed (finished shipment legs); platform admins only.
                id: 21,
                title: 'Delivery payouts',
                route: '/deliveryPayouts?tab=deliveryPayouts',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Truck',
                tint: TINTS.violet,
            },
            {
                // People on WaziPOS: create / edit, ID or passport, entity, SMS & call consent.
                id: 22,
                title: 'Users',
                route: '/users?tab=users',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Users',
                tint: TINTS.violet,
            },
            {
                // Agents: commission rate, users / entities they registered, commission owed.
                id: 93,
                title: 'Agents',
                route: '/agents?tab=agents',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'HandCoins',
                tint: TINTS.violet,
            },
            {
                // Stock takes sold by agents, and stocktakers' dues to pay out.
                id: 94,
                title: 'Stock takes',
                route: '/adminStockTakes?tab=adminStockTakes',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'ClipboardCheck',
                tint: TINTS.violet,
            },
            {
                // Delivery companies and couriers, their riders / drivers and vehicles: whitelisted centrally.
                id: 95,
                title: 'Delivery providers',
                route: '/deliveryProviders?tab=deliveryProviders',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Truck',
                tint: TINTS.orange,
            },
            {
                // Every request to the API: IP, signed-in user and business, action.
                id: 92,
                title: 'Access logs',
                route: '/accessLogs?tab=accessLogs',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Activity',
                tint: TINTS.violet,
            },
            {
                id: 17,
                title: 'Subscription payments',
                route: '/subscriptionPayments?tab=subscriptionPayments',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.violet,
            },
            {
                id: 18,
                title: 'Subscriptions',
                route: '/subscriptions?tab=subscriptions',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'CalendarCheck',
                tint: TINTS.violet,
            },
        ],
    },
    {
        // Agents sign up users, then their businesses, and earn a share of the
        // subscription fees (backend authentication/agents.py). The "Agent" role
        // is added to the login token for active agents.
        id: 18,
        title: 'Agent Panel',
        route: '/agentUsers',
        allowedRoles: ['Agent'],
        showInSidebar: true,
        icon: 'HandCoins',
        tint: TINTS.emerald,
        subRoutes: [
            {
                id: 1,
                title: 'My users',
                route: '/agentUsers?tab=agentUsers',
                allowedRoles: ['Agent'],
                showInSidebar: true,
                icon: 'Users',
                tint: TINTS.emerald,
            },
            {
                id: 2,
                title: 'My entities',
                route: '/agentEntities?tab=agentEntities',
                allowedRoles: ['Agent'],
                showInSidebar: true,
                icon: 'Store',
                tint: TINTS.emerald,
            },
            {
                // Stock-take helpers: the agent's own users with phone, email and ID on file.
                id: 4,
                title: 'My onboarders',
                route: '/agentOnboarders?tab=agentOnboarders',
                allowedRoles: ['Agent'],
                showInSidebar: true,
                icon: 'ClipboardList',
                tint: TINTS.emerald,
            },
            {
                // Paid stock takes sold to the agent's businesses (stocktakes/).
                id: 5,
                title: 'Stock takes',
                route: '/agentStockTakes?tab=agentStockTakes',
                allowedRoles: ['Agent'],
                showInSidebar: true,
                icon: 'ClipboardCheck',
                tint: TINTS.emerald,
            },
            {
                id: 3,
                title: 'My commissions',
                route: '/agentCommissions?tab=agentCommissions',
                allowedRoles: ['Agent'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.emerald,
            },
        ],
    },
    {
        // Onboarders: an agent's helpers. Create-only stock entry for the
        // businesses they're attached to, on the agent's dates (backend
        // authentication/onboarders.py). "Onboarder" role is added on login.
        id: 20,
        title: 'Onboarding',
        route: '/onboarding',
        allowedRoles: ['Onboarder'],
        showInSidebar: true,
        icon: 'ClipboardList',
        tint: TINTS.emerald,
        subRoutes: [
            { id: 1, title: 'Add stock', route: '/onboarding?tab=onboarding', allowedRoles: ['Onboarder'], showInSidebar: true, icon: 'PackagePlus', tint: TINTS.emerald },
            // Paid stock takes: blind counts on the booked days (stocktakes/).
            { id: 2, title: 'Stock takes', route: '/stockTaking?tab=stockTaking', allowedRoles: ['Onboarder'], showInSidebar: true, icon: 'ClipboardCheck', tint: TINTS.emerald },
        ],
    },
    {
        // A business's stock takes (its super admin): pay, review counted vs book,
        // decide what changes (stocktakes/, vendor endpoint).
        id: 21,
        title: 'Stock takes',
        route: '/stockTakes',
        allowedRoles: ['GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin'],
        showInSidebar: true,
        icon: 'ClipboardCheck',
        tint: TINTS.indigo,
        subRoutes: [
            { id: 1, title: 'Stock takes', route: '/stockTakes?tab=stockTakes', allowedRoles: ['GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin'], showInSidebar: true, icon: 'ClipboardCheck', tint: TINTS.indigo },
        ],
    },
    {
        // Distributors sell to wholesalers as wholesalers sell to retailers
        // (backend distributors/api.py, services/).
        id: 22,
        title: 'Distributors',
        route: '/distributorOrders',
        allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
        showInSidebar: true,
        icon: 'Truck',
        tint: TINTS.indigo,
        subRoutes: [
            { id: 1, title: 'Wholesaler orders', route: '/distributorOrders?tab=distributorOrders', allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'], showInSidebar: true, icon: 'ClipboardList', tint: TINTS.indigo },
            { id: 2, title: 'Stock', route: '/distributorStock?tab=distributorStock', allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'], showInSidebar: true, icon: 'Boxes', tint: TINTS.indigo },
            { id: 3, title: 'Discounts', route: '/distributorDiscounts?tab=distributorDiscounts', allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'], showInSidebar: true, icon: 'BadgePercent', tint: TINTS.indigo },
            // Distributors buy from manufacturers remotely (manufacturers/buy).
            { id: 4, title: 'Buy from manufacturers', route: '/manufacturerMarketplace?tab=manufacturerMarketplace', allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'], showInSidebar: true, icon: 'ShoppingBasket', tint: TINTS.indigo },
            { id: 5, title: 'Manufacturer orders', route: '/manufacturerPurchases?tab=manufacturerPurchases', allowedRoles: ['GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'], showInSidebar: true, icon: 'PackageOpen', tint: TINTS.indigo },
        ],
    },
    {
        // Manufacturers (and book publishers, who sell their titles the same way): the product
        // master (the source of every product on WaziPOS), production batches, discounts and
        // distributors' orders (backend manufacturers/api.py).
        id: 23,
        title: 'Manufacturers',
        route: '/manufacturerProducts',
        allowedRoles: ['GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin'],
        showInSidebar: true,
        icon: 'Factory',
        tint: TINTS.amber,
        subRoutes: [
            { id: 1, title: 'Products', route: '/manufacturerProducts?tab=manufacturerProducts', allowedRoles: ['GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin'], showInSidebar: true, icon: 'Package', tint: TINTS.amber },
            { id: 2, title: 'Batches', route: '/manufacturerBatches?tab=manufacturerBatches', allowedRoles: ['GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin'], showInSidebar: true, icon: 'Boxes', tint: TINTS.amber },
            { id: 3, title: 'Discounts', route: '/manufacturerDiscounts?tab=manufacturerDiscounts', allowedRoles: ['GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin'], showInSidebar: true, icon: 'BadgePercent', tint: TINTS.amber },
            { id: 4, title: 'Distributor orders', route: '/manufacturerOrders?tab=manufacturerOrders', allowedRoles: ['GeneralManufacturerSuperAdmin', 'PharmaceuticalManufacturerSuperAdmin', 'PublisherSuperAdmin'], showInSidebar: true, icon: 'ClipboardList', tint: TINTS.amber },
        ],
    },
    {
        id: 3,
        title: 'Wholesalers',
        route: '/routes',
        allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
        showInSidebar: true,
        icon: 'Warehouse',
        tint: TINTS.sky,
        subRoutes: [
            {
                // Wholesalers buy from distributors remotely (distributors/buy).
                id: 20,
                title: 'Buy from distributors',
                route: '/distributorMarketplace?tab=distributorMarketplace',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ShoppingBasket',
                tint: TINTS.sky,
            },
            {
                id: 21,
                title: 'Distributor orders',
                route: '/distributorPurchases?tab=distributorPurchases',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackageOpen',
                tint: TINTS.sky,
            },
            {
                id: 1,
                title: 'New Order',
                route: '/newWholesaleOrder?tab=newWholesaleOrder',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'PlusCircle',
                tint: TINTS.sky,
            },
            {
                id: 2,
                title: 'Retailer Orders',
                route: '/retailerOrders?tab=retailerOrders',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Truck',
                tint: TINTS.sky,
            },
            {
                // Paid retailer orders: prepare, pack, hand over or dispatch.
                id: 90,
                title: 'Fulfilment',
                route: '/retailerOrderFulfilment?tab=retailerOrderFulfilment',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackageCheck',
                tint: TINTS.sky,
            },
            {
                id: 3,
                title: 'Inventory',
                route: '/inventory?tab=inventory',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Boxes',
                tint: TINTS.sky,
            },
            {
                id: 92,
                title: 'Forecasting',
                route: '/wholesaleForecasting',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'TrendingUp',
                tint: TINTS.sky,
            },
            {
                id: 4,
                title: 'Payments',
                route: '/wholesalePayments?tab=wholesalePayments',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Banknote',
                tint: TINTS.sky,
            },
            {
                id: 5,
                title: 'Products Requests',
                route: '/productsRequests?tab=productsRequests',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'ClipboardList',
                tint: TINTS.sky,
            },
            {
                id: 6,
                title: 'Campaigns',
                route: '/wholesalerCampaigns?tab=wholesalerCampaigns',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Megaphone',
                tint: TINTS.sky,
            },
            {
                id: 7,
                title: 'Price Discounts',
                route: '/priceDiscounts?tab=priceDiscounts',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'BadgePercent',
                tint: TINTS.sky,
            },
            {
                id: 8,
                title: 'Quantity Discounts',
                route: '/quantityDiscounts?tab=quantityDiscounts',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Gift',
                tint: TINTS.sky,
            },
            {
                id: 9,
                title: 'Receipts & Returns',
                route: '/wholesalerReceiptsReturns?tab=wholesalerReceiptsReturns',
                allowedRoles: ['GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Undo2',
                tint: TINTS.sky,
            },
        ],
    },
    {
        // Wi-Fi hotspot businesses (entity type InternetServiceProvider):
        // routers, packages, connected customers and their payments.
        id: 91,
        title: 'Wi-Fi Hotspots',
        route: '/wifiRouters',
        allowedRoles: ['Admin', 'InternetServiceProviderSuperAdmin'],
        showInSidebar: true,
        icon: 'Wifi',
        tint: TINTS.sky,
        subRoutes: [
            {
                id: 1,
                title: 'Routers',
                route: '/wifiRouters',
                allowedRoles: ['Admin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Wifi',
                tint: TINTS.sky,
            },
            {
                id: 2,
                title: 'Packages',
                route: '/wifiTarrifs',
                allowedRoles: ['Admin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Tag',
                tint: TINTS.sky,
            },
            {
                id: 3,
                title: 'Subscriptions',
                route: '/wifiSubscriptions',
                allowedRoles: ['Admin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Users',
                tint: TINTS.sky,
            },
            {
                id: 4,
                title: 'Payments',
                route: '/wifiPayments',
                allowedRoles: ['Admin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.sky,
            },
        ],
    },
    {
        // Running a restaurant (an entity of type Restaurant): orders & table
        // bookings board, the menu, and tables. Customers use the Restaurants tab.
        // Hotels have their own section below (same screens + accommodation).
        id: 17,
        title: 'Restaurant',
        route: '/restaurantOrders',
        allowedRoles: ['Admin', 'RestaurantSuperAdmin'],
        showInSidebar: true,
        icon: 'UtensilsCrossed',
        tint: TINTS.orange,
        subRoutes: [
            {
                // The restaurant POS: food and drinks for a walk-in customer, paid at the counter.
                id: 8,
                title: 'New order',
                route: '/newRestaurantOrder',
                allowedRoles: ['Admin', 'RestaurantSuperAdmin'],
                showInSidebar: true,
                icon: 'PlusCircle',
                tint: TINTS.orange,
            },
            { id: 1, title: 'Orders & bookings', route: '/restaurantOrders', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'ClipboardList', tint: TINTS.orange },
            { id: 2, title: 'Menu', route: '/restaurantMenu', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'BookOpen', tint: TINTS.orange },
            { id: 3, title: 'Tables', route: '/restaurantTables', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'Layers', tint: TINTS.orange },
            // Customers' own dishes (ingredients + instructions) to price.
            { id: 4, title: 'Custom requests', route: '/restaurantRecipeRequests', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'ClipboardCheck', tint: TINTS.orange },
            { id: 5, title: 'Ingredients', route: '/restaurantIngredients', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'Boxes', tint: TINTS.orange },
            // Drinks billed apart from food: bottles & tots, tabs, bar stock (offline-first).
            { id: 6, title: 'Bar', route: '/restaurantBar', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'ShoppingCart', tint: TINTS.orange },
            // Food stock, cleaning materials, utilities, packaging (offline-first).
            { id: 7, title: 'Supplies', route: '/restaurantSupplies', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'Package', tint: TINTS.orange },
            { id: 8, title: 'Forecasting', route: '/restaurantForecast', allowedRoles: ['Admin', 'RestaurantSuperAdmin'], showInSidebar: true, icon: 'TrendingUp', tint: TINTS.orange },
        ],
    },
    {
        // Running a hotel (an entity of type Hotel): its own section — accommodation
        // (stays, rooms) plus the restaurant screens for its kitchen and bar, worded
        // for a hotel (app/(hotel)). Customers use the Hotels tab.
        id: 19,
        title: 'Hotel',
        route: '/hotelBookings',
        allowedRoles: ['HotelSuperAdmin'],
        showInSidebar: true,
        icon: 'BedDouble',
        tint: TINTS.teal,
        subRoutes: [
            // The front desk: stays, check-in / out, payment.
            { id: 1, title: 'Stays', route: '/hotelBookings', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'CalendarCheck', tint: TINTS.teal },
            // The rooms guests can book.
            { id: 2, title: 'Rooms', route: '/hotelRooms', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'BedDouble', tint: TINTS.teal },
            { id: 3, title: 'New order', route: '/newHotelOrder', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'PlusCircle', tint: TINTS.teal },
            { id: 4, title: 'Orders & bookings', route: '/hotelOrders', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'ClipboardList', tint: TINTS.teal },
            { id: 5, title: 'Menu', route: '/hotelMenu', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'BookOpen', tint: TINTS.teal },
            { id: 6, title: 'Tables', route: '/hotelTables', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'Layers', tint: TINTS.teal },
            { id: 7, title: 'Custom requests', route: '/hotelRecipeRequests', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'ClipboardCheck', tint: TINTS.teal },
            { id: 8, title: 'Ingredients', route: '/hotelIngredients', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'Boxes', tint: TINTS.teal },
            { id: 9, title: 'Bar', route: '/hotelBar', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'ShoppingCart', tint: TINTS.teal },
            { id: 10, title: 'Supplies', route: '/hotelSupplies', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'Package', tint: TINTS.teal },
            { id: 11, title: 'Forecasting', route: '/hotelForecast', allowedRoles: ['HotelSuperAdmin'], showInSidebar: true, icon: 'TrendingUp', tint: TINTS.teal },
        ],
    },
    {
        // Deliveries: a seller's setup (delivery persons, rates, partners) and
        // every user's own delivery jobs (anyone can be a delivery person).
        id: 16,
        title: 'Deliveries',
        route: '/myDeliveries',
        allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
        showInSidebar: true,
        icon: 'Truck',
        tint: TINTS.orange,
        subRoutes: [
            {
                // Couriers' and delivery companies' own staff: parcels, riders on duty, fleet, money.
                id: 8,
                title: 'Courier dashboard',
                route: '/courierDashboard?tab=courierDashboard',
                allowedRoles: ['CourierSuperAdmin', 'DeliverySuperAdmin'],
                showInSidebar: true,
                icon: 'LayoutDashboard',
                tint: TINTS.orange,
            },
            {
                id: 1,
                title: 'My deliveries',
                route: '/myDeliveries',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
                showInSidebar: true,
                icon: 'Bike',
                tint: TINTS.orange,
            },
            {
                id: 2,
                title: 'Delivery settings',
                route: '/deliverySettings?tab=deliverySettings',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
                showInSidebar: true,
                icon: 'Sliders',
                tint: TINTS.orange,
            },
            {
                // Own delivery vehicles: papers, running costs, trips (logistics/utils/fleet.py).
                id: 6,
                title: 'Fleet',
                route: '/deliveryFleet?tab=deliveryFleet',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
                showInSidebar: true,
                icon: 'Truck',
                tint: TINTS.orange,
            },
            {
                // Couriers publish what their long-haul legs cost (logistics/utils/rate_charts.py).
                id: 7,
                title: 'Rate charts',
                route: '/courierRates?tab=courierRates',
                allowedRoles: ['Admin', 'CourierSuperAdmin'],
                showInSidebar: true,
                icon: 'ReceiptText',
                tint: TINTS.orange,
            },
            {
                // Buyers pay once: goods to the seller on release, delivery pay to riders / couriers (payments.OrderPayouts).
                id: 9,
                title: 'Payouts',
                route: '/orderPayouts?tab=orderPayouts',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.emerald,
            },
            {
                // Where a delivery person's earnings are paid (UserPayoutAccounts).
                id: 3,
                title: 'My payout accounts',
                route: '/myPayoutAccounts',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'DeliverySuperAdmin', 'CourierSuperAdmin', 'GeneralDistributorSuperAdmin', 'PharmaceuticalDistributorSuperAdmin'],
                showInSidebar: true,
                icon: 'Wallet',
                tint: TINTS.orange,
            },
        ],
    },
    {
        id: 4,
        title: 'Orders',
        route: '/(tabs)/business',
        allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
        showInSidebar: true,
        icon: 'ShoppingBasket',
        tint: TINTS.amber,
        subRoutes: [
            {
                id: 1,
                title: 'Orders Monitor',
                route: '/(tabs)/business?tab=stock',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Activity',
                tint: TINTS.amber,
            },
            {
                id: 2,
                title: 'Restock Orders',
                route: '/(tabs)/business?tab=orders',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'RotateCw',
                tint: TINTS.amber,
            },
        ],
    },
    {
        id: 7,
        title: 'Inventory Control',
        route: '/(tabs)/business',
        allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
        showInSidebar: true,
        icon: 'PackageCheck',
        tint: TINTS.emerald,
        subRoutes: [
            {
                id: 1,
                title: 'Stock Monitor',
                route: '/(tabs)/business?tab=stock',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'Gauge',
                tint: TINTS.emerald,
            },
            {
                id: 2,
                title: 'Restock Orders',
                route: '/(tabs)/business?tab=orders',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'Repeat2',
                tint: TINTS.emerald,
            },
        ],
    },
    {
        id: 8,
        title: 'Account',
        route: '/(tabs)/account',
        // Shown to everyone signed in (My businesses / My Profile); each item keeps its own roles.
        allowedRoles: JOB_SEEKERS,
        showInSidebar: true,
        icon: 'UserCircle',
        tint: TINTS.indigo,
        subRoutes: [
            {
                id: 1,
                title: 'Account',
                route: '/(tabs)/account?tab=account',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'User',
                tint: TINTS.indigo,
            },
            {
                id: 2,
                title: 'Subscriptions',
                route: '/(tabs)/account?tab=subscriptions',
                allowedRoles: ['Admin'],
                showInSidebar: true,
                icon: 'CreditCard',
                tint: TINTS.indigo,
            },
            {
                id: 4,
                title: 'My businesses',
                // Strictly the businesses the signed-in user owns; switching asks them to sign in again.
                route: '/accounts',
                allowedRoles: JOB_SEEKERS,
                showInSidebar: true,
                icon: 'Building2',
                tint: TINTS.indigo,
            },
            {
                id: 3,
                title: 'My Profile',
                route: '/(tabs)/profile',
                allowedRoles: ['Client', 'Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'UserCircle',
                tint: TINTS.indigo,
            },
        ],
    },
    {
        // Money out and the books, for every business.
        id: 9,
        title: 'Finance',
        route: '/(entities)/expenses',
        allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'InternetServiceProviderSuperAdmin'],
        showInSidebar: true,
        icon: 'Wallet',
        tint: TINTS.orange,
        subRoutes: [
            {
                id: 1,
                title: 'Expenses',
                route: '/(entities)/expenses',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Receipt',
                tint: TINTS.orange,
            },
            {
                id: 2,
                title: 'Expense Categories',
                route: '/(entities)/expenseCategories',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin', 'PharmaceuticalWholesalerSuperAdmin', 'RestaurantSuperAdmin', 'HotelSuperAdmin', 'InternetServiceProviderSuperAdmin'],
                showInSidebar: true,
                icon: 'Tag',
                tint: TINTS.orange,
            },
            {
                id: 3,
                title: 'Accounts Ledger',
                route: '/(tabs)/business',
                allowedRoles: ['Admin', 'GeneralWholesalerSuperAdmin'],
                showInSidebar: true,
                icon: 'BookOpen',
                tint: TINTS.orange,
            },
        ],
    },
    {
        id: 13,
        title: 'Retailers',
        route: '/routes',
        allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
        showInSidebar: true,
        icon: 'Users',
        tint: TINTS.sky,
        subRoutes: [
            {
                // Owner-away protection: shifts, blind cash counts, staff vs owner sales, commissions, alerts.
                id: 96,
                title: 'Shop guard',
                route: '/shopGuard?tab=shopGuard',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'ClipboardCheck',
                tint: TINTS.red,
            },
            {
                // Staff: clock in / out with a blind cash count; their sales commission.
                id: 97,
                title: 'My shift',
                route: '/myShift?tab=myShift',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'CalendarDays',
                tint: TINTS.emerald,
            },
            {
                id: 1,
                title: 'New Customer Order',
                route: '/newCustomerOrder?tab=newCustomerOrder',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackagePlus',
                tint: TINTS.sky,
            },
            {
                id: 2,
                title: 'Customer Orders',
                route: '/customerOrders?tab=customerOrders',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'ListOrdered',
                tint: TINTS.sky,
            },
            {
                // Paid customer orders: prepare, pack, hand over or dispatch.
                id: 90,
                title: 'Fulfilment',
                route: '/customerOrderFulfilment?tab=customerOrderFulfilment',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackageCheck',
                tint: TINTS.sky,
            },
            {
                id: 3,
                title: 'Retailer Inventory',
                route: '/retailerInventory?tab=retailerInventory',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackageOpen',
                tint: TINTS.sky,
            },
            {
                id: 4,
                title: 'Payments',
                route: '/customerOrderPayments?tab=customerOrderPayments',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'HandCoins',
                tint: TINTS.sky,
            },
            {
                id: 5,
                title: 'Requisitions',
                route: '/retailerRequisitions?tab=retailerRequisitions',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'ClipboardCheck',
                tint: TINTS.sky,
            },
            {
                id: 6,
                title: 'Forecasting',
                route: '/forecasting?tab=forecasting',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'TrendingUp',
                tint: TINTS.sky,
            },
            {
                id: 7,
                title: 'Request Drafts',
                route: '/requestDrafts?tab=requestDrafts',
                allowedRoles: ['GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'FileEdit',
                tint: TINTS.sky,
            },
            {
                id: 8,
                title: 'Retailer Indents',
                route: '/retailerIndents?tab=retailerIndents',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'FileCheck',
                tint: TINTS.sky,
            },
            {
                id: 9,
                title: 'Stock Outs',
                route: '/stockOuts?tab=stockOuts',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'AlertTriangle',
                tint: TINTS.sky,
            },
            {
                id: 10,
                title: 'Wholesale Marketplace',
                route: '/wholesaleMarketplace?tab=wholesaleMarketplace',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'Building2',
                tint: TINTS.sky,
            },
            {
                id: 11,
                title: 'Products Requests',
                route: '/productRequests?tab=productRequests',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'FileSearch',
                tint: TINTS.sky,
            },
            {
                id: 12,
                title: 'Opted In Campaigns',
                route: '/retailerCampaigns?tab=retailerCampaigns',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'Radio',
                tint: TINTS.sky,
            },
            {
                id: 13,
                title: 'Purchases Returns',
                route: '/purchasesReturns?tab=purchasesReturns',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'PackageX',
                tint: TINTS.sky,
            },
            {
                id: 14,
                title: 'Sales Returns',
                route: '/salesReturns?tab=salesReturns',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'RotateCcw',
                tint: TINTS.sky,
            },
            {
                id: 15,
                title: 'Stock Adjustments',
                route: '/stockAdjustments?tab=stockAdjustments',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'Sliders',
                tint: TINTS.sky,
            },
            {
                id: 16,
                // Prescriptions sent to this pharmacy by many users (uploaded
                // to it, or forwarded for quotation). The user's own
                // prescriptions stay at /userPrescriptions.
                title: 'Pharmacy Prescriptions',
                route: '/entityPrescriptions?tab=entityPrescriptions',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'ClipboardPlus',
                tint: TINTS.sky,
            },
        ],
    },
    {
        id: 14,
        title: 'Retailer Reports',
        route: '/retailerReports?tab=retailerReports',
        allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
        showInSidebar: true,
        icon: 'BarChart3',
        tint: TINTS.violet,
        subRoutes: [
            {
                id: 1,
                title: 'Sales Reports',
                route: '/reports/dailySales',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'LineChart',
                tint: TINTS.violet,
            },
            {
                id: 2,
                title: 'Profit & Loss Reports',
                route: '/reports/profitAndLoss',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'CircleDollarSign',
                tint: TINTS.violet,
            },
            {
                id: 3,
                title: 'Expiries Reports',
                route: '/reports/expiries',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'CalendarX',
                tint: TINTS.violet,
            },
            {
                id: 4,
                title: 'Stock Reports',
                route: '/reports/stock',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'Package2',
                tint: TINTS.violet,
            },
            {
                id: 5,
                title: 'Low Stock Reports',
                route: '/reports/lowStock',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'AlertCircle',
                tint: TINTS.violet,
            },
            {
                id: 6,
                title: 'Product Movement Reports',
                route: '/reports/productMovement',
                allowedRoles: ['Admin', 'GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'],
                showInSidebar: true,
                icon: 'ArrowLeftRight',
                tint: TINTS.violet,
            },
        ],
    },
];

export const checkAccessPermission = (
    currentUserRole: string,
    routeAllowedRoles: string[],
): boolean => routeAllowedRoles.includes(currentUserRole);