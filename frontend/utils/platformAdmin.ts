// utils/platformAdmin.ts
//
// Platform administrators: staff / superusers, or users with the "Admin" role.
// Same rule as the backend (core.app_permissions.AdminRoleOnly and
// authentication.utils.admin_users.is_platform_admin).

const truthy = (v: unknown) => v === true || String(v).toLowerCase() === 'true';

export function isPlatformAdmin(user: any): boolean {
    if (!user) return false;
    if (truthy(user.is_staff) || truthy(user.is_superuser)) return true;
    return Array.isArray(user.roles) && user.roles.some((r: any) => r?.value === 'Admin');
}

/** Agents: an active agent record gives the "Agent" role in the login token (backend Users.tokens). */
export function isAgent(user: any): boolean {
    if (!user) return false;
    if (truthy(user.is_agent)) return true;
    return Array.isArray(user.roles) && user.roles.some((r: any) => r?.value === 'Agent');
}

/** Onboarders: an active agent's stock-take helper ("Onboarder" role in the login token). */
export function isOnboarder(user: any): boolean {
    if (!user) return false;
    if (truthy(user.is_onboarder)) return true;
    return Array.isArray(user.roles) && user.roles.some((r: any) => r?.value === 'Onboarder');
}
