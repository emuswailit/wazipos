export interface SidebarRoute {
    title: string;
    route: string;
    allowedRoles: string[]; // e.g. ["Client"], ["Admin"], ["Vendor"]
    showInSidebar: boolean;
    subRoutes?: SidebarRoute[];
}

export const SIDEBAR_NAV_MANIFEST: SidebarRoute[] = [
    {
        title: "Dashboard",
        route: "/(tabs)",
        allowedRoles: ["Client", "Admin", "Vendor"],
        showInSidebar: true,
    },
    {
        title: "Admin Panel",
        route: "/(admin)/routes",
        allowedRoles: ["Admin", "Vendor"],
        showInSidebar: true,
        subRoutes: [
            { title: "Routes", route: "/(admin)/routes?tab=index", allowedRoles: ["Admin", "Vendor"], showInSidebar: true },
            { title: "Frequencies", route: "/(admin)/frequencies?tab=frequencies", allowedRoles: ["Admin"], showInSidebar: true },
        ]
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

export const checkAccessPermission = (currentUserRole: string, routeAllowedRoles: string[]): boolean => {
    return routeAllowedRoles.includes(currentUserRole);
};
