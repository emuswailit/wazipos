export interface SidebarRoute {
    id: number;
    title: string;
    route: string;
    allowedRoles: string[]; // e.g. ["Client"], ["Admin"], ["Vendor"]
    showInSidebar: boolean;
    subRoutes?: SidebarRoute[];
}

export const SIDEBAR_NAV_MANIFEST: SidebarRoute[] = [
    {
        id: 1,
        title: "Dashboard",
        route: "/(tabs)",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        id: 2,
        title: "Admin Panel",
        route: "/routes", // 🌟 FIXED: Pluralized to match your routes folder exactly
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            {
                id: 1,
                title: "Body Systems",
                route: "/bodySystems?tab=bodySystems", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 2,
                title: "Drug Classes",
                route: "/drugClasses?tab=drugClasses", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 3,
                title: "Drug Sub Classes",
                route: "/drugSubClasses?tab=drugSubClasses", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },

            {
                id: 4,
                title: "Formulations",
                route: "/formulations?tab=formulations", // Points directly to app/(admin)/formulations/index.tsx
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 5,
                title: "Frequencies",
                route: "/frequencies?tab=frequencies", // Points directly to app/(admin)/frequencies/index.tsx
                allowedRoles: ["Admin"],
                showInSidebar: true
            },

            {
                id: 6,
                title: "Generic Drugs",
                route: "/generics?tab=generics", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 7,
                title: "Preparations",
                route: "/preparations?tab=preparations", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            }, {
                id: 8,
                title: "Routes",
                route: "/routes?tab=index", // 🌟 FIXED: Pluralized string to resolve straight to app/(admin)/routes/index.tsx
                allowedRoles: ["Admin", "Vendor"],
                showInSidebar: true
            },
            {
                id: 9,
                title: "Products",
                route: "/products?tab=products", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            }
        ]
    },
    {
        id: 3,
        title: "Wholesalers",
        route: "/routes", // 🌟 FIXED: Pluralized to match your routes folder exactly
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            {
                id: 1,
                title: "New Order",
                route: "/newWholesaleOrder?tab=newWholesaleOrder", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 2,
                title: "Orders",
                route: "/wholesaleOrders?tab=wholesaleOrders", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 3,
                title: "Inventory",
                route: "/wholesaleInventory?tab=wholesaleInventory", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
            {
                id: 4,
                title: "Payments",
                route: "/wholesalePayments?tab=wholesalePayments", // Points directly to app/(admin)/
                allowedRoles: ["Admin"],
                showInSidebar: true
            },
        ]
    }

    ,
    {
        id: 4,
        title: "Orders",
        route: "/(tabs)/business",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            { id: 1, title: "Orders Monitor", route: "/(tabs)/business?tab=stock", allowedRoles: ["Admin", "Vendor"], showInSidebar: true },
            { id: 2, title: "Restock Orders", route: "/(tabs)/business?tab=orders", allowedRoles: ["Admin"], showInSidebar: true },
        ]
    },
    {
        id: 5,
        title: "Accounts Ledger",
        route: "/(tabs)/business",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        id: 6,
        title: "Adjacent Stores",
        route: "/(tabs)",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        id: 7,
        title: "Client Orders Ledger",
        route: "/(home)/orders", // Points correctly to the standalone stacks route
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        id: 8,
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
        id: 9,
        title: "Account",
        route: "/(tabs)/account",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            { title: "Account", route: "/(tabs)/account?tab=account", allowedRoles: ["Admin", "Vendor"], showInSidebar: true },
            { title: "Subscriptions", route: "/(tabs)/account?tab=subscriptions", allowedRoles: ["Admin"], showInSidebar: true },
        ]
    },
    {
        id: 10,
        title: "Accounts Ledger",
        route: "/(tabs)/business",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        id: 11,
        title: "My Profile",
        route: "/(tabs)/profile",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
];

export const checkAccessPermission = (currentUserRole: string, routeAllowedRoles: string[]): boolean => {
    return routeAllowedRoles.includes(currentUserRole);
};
