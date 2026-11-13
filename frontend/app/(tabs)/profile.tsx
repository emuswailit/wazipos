// app/(tabs)/profile.tsx
//
// Account screen. Everything shown comes from the signed-in user (the decoded JWT in
// AuthContext): identity, the active entity, every role grouped by entity, the session,
// and a catch-all "Other details" section, so no field the token carries is hidden.
// Empty fields are left out rather than shown as "—".

import { useAuth, type UserRole } from '@/context/AuthContext';
import { isTrueFlag } from '@/utils/flags';
import {
    BadgeCheck,
    Building2,
    CalendarClock,
    CheckCircle2,
    CircleDashed,
    Clock,
    CreditCard,
    FileText,
    Hash,
    Heart,
    Info,
    Layers,
    LogOut,
    Mail,
    Phone,
    Shield,
    User as UserIcon,
    Wallet,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
const WIDE_MIN_WIDTH = 900;

/* ── Helpers ────────────────────────────────────────────── */

/** "PharmaceuticalRetailerSuperAdmin" / "date_of_birth" → "Pharmaceutical Retailer Super Admin" / "Date Of Birth" */
function humanize(v: unknown): string {
    return String(v ?? '')
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isBlank(v: unknown): boolean {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function isFlagLike(v: unknown): boolean {
    if (typeof v === 'boolean') return true;
    return typeof v === 'string' && /^(true|false)$/i.test(v.trim());
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** IDs mean nothing to the user, so any value that is or holds a UUID is left off the screen. */
function hasUuid(v: unknown): boolean {
    if (typeof v === 'string') return UUID.test(v);
    if (v && typeof v === 'object') return UUID.test(JSON.stringify(v));
    return false;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function formatDate(v: unknown, withTime = false): string {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    return withTime
        ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** JWT exp/iat are seconds since the epoch. */
function formatEpoch(v: unknown): string | null {
    const n = Number(v);
    if (!n) return null;
    return formatDate(new Date(n * 1000).toISOString(), true);
}

function formatMoney(v: unknown): string {
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Best-effort display of any scalar value from the token. */
function formatValue(v: unknown): string {
    if (isFlagLike(v)) return isTrueFlag(v) ? 'Yes' : 'No';
    if (typeof v === 'string' && ISO_DATE.test(v.trim())) return formatDate(v, v.includes('T'));
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

function nameOf(user: any): string {
    const composed = `${String(user?.first_name ?? '').trim()} ${String(user?.last_name ?? '').trim()}`.trim();
    return String(user?.name ?? '').trim() || composed || user?.username || user?.email || 'Guest';
}

function initialsOf(name: string): string {
    const parts = name.replace(/@.*/, '').split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? 'U').slice(0, 2);
    return letters.toUpperCase() || 'U';
}

/* Fields that get a dedicated place on the screen; everything else lands in "Other details". */
const PERSONAL_FIELDS: Array<{ key: string; label: string; icon: any }> = [
    { key: 'email', label: 'Email address', icon: Mail },
    { key: 'phone', label: 'Phone', icon: Phone },
    { key: 'phone_number', label: 'Phone', icon: Phone },
    { key: 'username', label: 'Username', icon: UserIcon },
    { key: 'first_name', label: 'First name', icon: UserIcon },
    { key: 'middle_name', label: 'Middle name', icon: UserIcon },
    { key: 'last_name', label: 'Last name', icon: UserIcon },
    { key: 'gender', label: 'Gender', icon: UserIcon },
    { key: 'date_of_birth', label: 'Date of birth', icon: CalendarClock },
    { key: 'marital_status', label: 'Marital status', icon: Heart },
    { key: 'national_id', label: 'National ID', icon: Hash },
    { key: 'id_number', label: 'ID number', icon: Hash },
];

const HANDLED_KEYS = new Set<string>([
    ...PERSONAL_FIELDS.map((f) => f.key),
    'name', 'id', 'user_id', 'roles',
    'entity', 'entity_id', 'entity_type', 'entity_title',
    'monthly_subscription', 'entity_registration_fee', 'entity_trial_done', 'documents_uploaded',
    // JWT internals, shown under "Session"
    'exp', 'iat', 'jti', 'token_type', 'nbf',
]);

/* ── Building blocks ────────────────────────────────────── */

type RowData = { key: string; label: string; value: string; icon?: any; tone?: 'good' | 'warn' | 'muted' };

function useColors(theme: any, isDarkMode: boolean) {
    return useMemo(
        () => ({
            border: isDarkMode ? '#1e293b' : '#e8edf2',
            divider: isDarkMode ? '#1e293b' : '#f1f5f9',
            iconBg: isDarkMode ? '#0f172a' : '#f1f5f9',
            good: '#10b981',
            warn: '#f59e0b',
            primary: theme.primary,
        }),
        [isDarkMode, theme.primary],
    );
}

const Row: React.FC<{ row: RowData; theme: any; colors: any; last?: boolean }> = ({ row, theme, colors, last }) => {
    const Icon = row.icon ?? Info;
    const toneColor = row.tone === 'good' ? colors.good : row.tone === 'warn' ? colors.warn : theme.text;
    return (
        <View
            className="flex-row items-center px-4 py-3"
            style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}
        >
            <View className="h-8 w-8 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: colors.iconBg }}>
                <Icon size={14} color={row.tone && row.tone !== 'muted' ? toneColor : theme.textDark} />
            </View>
            <View className="flex-1 min-w-0">
                <Text
                    numberOfLines={1}
                    style={{ fontFamily: theme.font.bold, fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', color: theme.textDark }}
                >
                    {row.label}
                </Text>
                <Text selectable numberOfLines={2} style={{ marginTop: 2, fontFamily: theme.font.medium, fontSize: 13, color: toneColor }}>
                    {row.value}
                </Text>
            </View>
        </View>
    );
};

const Section: React.FC<{
    title: string;
    subtitle?: string;
    theme: any;
    colors: any;
    children: React.ReactNode;
}> = ({ title, subtitle, theme, colors, children }) => (
    <View className="mb-5">
        <View className="flex-row items-baseline justify-between mb-2 mx-1">
            <Text style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: theme.textDark }}>
                {title}
            </Text>
            {subtitle ? (
                <Text style={{ fontFamily: theme.font.medium, fontSize: 10, color: theme.textDark }}>{subtitle}</Text>
            ) : null}
        </View>
        <View className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: theme.panel }}>
            {children}
        </View>
    </View>
);

const RowList: React.FC<{ rows: RowData[]; theme: any; colors: any }> = ({ rows, theme, colors }) => (
    <>
        {rows.map((r, i) => (
            <Row key={r.key} row={r} theme={theme} colors={colors} last={i === rows.length - 1} />
        ))}
    </>
);

const Chip: React.FC<{ label: string; color: string; theme: any; icon?: any }> = ({ label, color, theme, icon: Icon }) => (
    <View className="flex-row items-center rounded-full px-2.5 py-1 mr-1.5 mb-1.5" style={{ backgroundColor: `${color}1A` }}>
        {Icon ? <Icon size={11} color={color} style={{ marginRight: 4 }} /> : null}
        <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.3, color }}>
            {label}
        </Text>
    </View>
);

const Stat: React.FC<{ label: string; value: string; theme: any; colors: any }> = ({ label, value, theme, colors }) => (
    <View className="flex-1 min-w-[45%] rounded-xl border px-3 py-2.5 m-1" style={{ borderColor: colors.border, backgroundColor: theme.panel }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: 16, color: theme.text }}>
            {value}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: theme.font.bold, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: theme.textDark }}>
            {label}
        </Text>
    </View>
);

/* ── Screen ─────────────────────────────────────────────── */

export default function ProfileScreen() {
    const { user, logout, theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isWide = width >= WIDE_MIN_WIDTH;
    const colors = useColors(theme, isDarkMode);
    const u: any = user ?? {};

    const name = nameOf(u);
    const initials = initialsOf(name);
    const roles: UserRole[] = Array.isArray(u.roles) ? u.roles : [];
    const activeEntityId = u.entity_id || u.entity;

    // Roles at the active entity, used for the header chips
    const activeRoles = useMemo(
        () => roles.filter((r) => !activeEntityId || String(r.entity) === String(activeEntityId)),
        [roles, activeEntityId],
    );

    // All roles grouped by entity, the active entity first
    const rolesByEntity = useMemo(() => {
        const groups = new Map<string, { entityId: string; title: string; type?: string; roles: UserRole[] }>();
        for (const r of roles) {
            const key = String(r.entity ?? 'none');
            if (!groups.has(key)) {
                groups.set(key, { entityId: key, title: r.entity_title || 'Unassigned', type: r.entity_type, roles: [] });
            }
            groups.get(key)!.roles.push(r);
        }
        return [...groups.values()].sort((a, b) =>
            a.entityId === String(activeEntityId) ? -1 : b.entityId === String(activeEntityId) ? 1 : a.title.localeCompare(b.title),
        );
    }, [roles, activeEntityId]);

    const personalRows = useMemo<RowData[]>(() => {
        const seen = new Set<string>();
        const rows: RowData[] = [];
        for (const f of PERSONAL_FIELDS) {
            const v = u[f.key];
            if (isBlank(v)) continue;
            const value = f.key === 'marital_status' || f.key === 'gender' ? humanize(v) : formatValue(v);
            if (seen.has(f.label + value)) continue; // phone and phone_number carrying the same number
            seen.add(f.label + value);
            rows.push({ key: f.key, label: f.label, value, icon: f.icon });
        }
        return rows;
    }, [u]);

    const entityRows = useMemo<RowData[]>(() => {
        const rows: RowData[] = [];
        if (!isBlank(u.entity_title)) rows.push({ key: 'title', label: 'Business', value: String(u.entity_title), icon: Building2 });
        if (!isBlank(u.entity_type)) rows.push({ key: 'type', label: 'Business type', value: humanize(u.entity_type), icon: Layers });
        if (!isBlank(u.monthly_subscription))
            rows.push({ key: 'sub', label: 'Monthly subscription', value: formatMoney(u.monthly_subscription), icon: Wallet });
        if (!isBlank(u.entity_registration_fee))
            rows.push({ key: 'reg', label: 'Registration fee', value: formatMoney(u.entity_registration_fee), icon: CreditCard });
        if (!isBlank(u.entity_trial_done)) {
            const done = isTrueFlag(u.entity_trial_done);
            rows.push({ key: 'trial', label: 'Free trial', value: done ? 'Used' : 'Available', icon: done ? CheckCircle2 : CircleDashed, tone: done ? 'muted' : 'good' });
        }
        if (!isBlank(u.documents_uploaded)) {
            const ok = isTrueFlag(u.documents_uploaded);
            rows.push({ key: 'docs', label: 'Business documents', value: ok ? 'Uploaded' : 'Not uploaded yet', icon: FileText, tone: ok ? 'good' : 'warn' });
        }
        return rows;
    }, [u, activeEntityId]);

    const sessionRows = useMemo<RowData[]>(() => {
        const rows: RowData[] = [];
        const issued = formatEpoch(u.iat);
        if (issued) rows.push({ key: 'iat', label: 'Signed in', value: issued, icon: Clock });
        const expires = formatEpoch(u.exp);
        if (expires) {
            const expired = Number(u.exp) * 1000 < Date.now();
            rows.push({ key: 'exp', label: 'Session expires', value: expired ? `${expires} (expired)` : expires, icon: CalendarClock, tone: expired ? 'warn' : undefined });
        }
        return rows;
    }, [u]);

    // Any other field in the token, so nothing the backend sends goes unseen
    const otherRows = useMemo<RowData[]>(
        () =>
            Object.keys(u)
                .filter((k) => !HANDLED_KEYS.has(k) && !isBlank(u[k]) && typeof u[k] !== 'function' && !hasUuid(u[k]))
                .sort()
                .map((k) => ({ key: k, label: humanize(k), value: formatValue(u[k]), icon: Info })),
        [u],
    );

    const docsMissing = !isBlank(u.documents_uploaded) && !isTrueFlag(u.documents_uploaded);

    /* ── Pieces ── */

    const header = (
        <View className="rounded-2xl border mb-4 p-5" style={{ borderColor: colors.border, backgroundColor: theme.panel }}>
            <View className={isWide ? 'flex-row items-center' : 'items-center'}>
                <View
                    className="h-20 w-20 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${theme.primary}20`, marginBottom: isWide ? 0 : 12, marginRight: isWide ? 18 : 0 }}
                >
                    <Text style={{ fontFamily: theme.font.bold, fontSize: 28, letterSpacing: -0.6, color: theme.primary }}>{initials}</Text>
                </View>
                <View className={isWide ? 'flex-1 min-w-0' : 'items-center'}>
                    <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.3, color: theme.text }}>
                        {name}
                    </Text>
                    {u.email ? (
                        <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: theme.font.regular, fontSize: 12, color: theme.textDark }}>
                            {u.email}
                        </Text>
                    ) : null}
                    <View className={`flex-row flex-wrap mt-3 ${isWide ? '' : 'justify-center'}`}>
                        {u.entity_title ? <Chip label={String(u.entity_title)} color={theme.primary} theme={theme} icon={Building2} /> : null}
                        {activeRoles.slice(0, 3).map((r) => (
                            <Chip key={r.id} label={r.title || humanize(r.value)} color="#8b5cf6" theme={theme} icon={Shield} />
                        ))}
                        {activeRoles.length > 3 ? <Chip label={`+${activeRoles.length - 3} more`} color="#8b5cf6" theme={theme} /> : null}
                        {!isBlank(u.documents_uploaded) ? (
                            docsMissing ? (
                                <Chip label="Documents pending" color={colors.warn} theme={theme} icon={FileText} />
                            ) : (
                                <Chip label="Verified documents" color={colors.good} theme={theme} icon={BadgeCheck} />
                            )
                        ) : null}
                    </View>
                </View>
            </View>
        </View>
    );

    const stats = (
        <View className="flex-row flex-wrap -m-1 mb-4">
            <Stat label="Roles" value={String(roles.length)} theme={theme} colors={colors} />
            <Stat label="Businesses" value={String(rolesByEntity.filter((g) => g.entityId !== 'none').length)} theme={theme} colors={colors} />
            {!isBlank(u.monthly_subscription) ? (
                <Stat label="Monthly plan" value={formatMoney(u.monthly_subscription)} theme={theme} colors={colors} />
            ) : null}
            {!isBlank(u.entity_trial_done) ? (
                <Stat label="Free trial" value={isTrueFlag(u.entity_trial_done) ? 'Used' : 'Available'} theme={theme} colors={colors} />
            ) : null}
        </View>
    );

    const rolesSection =
        rolesByEntity.length > 0 ? (
            <Section title="Roles & access" subtitle={`${roles.length} role${roles.length === 1 ? '' : 's'}`} theme={theme} colors={colors}>
                {rolesByEntity.map((g, gi) => {
                    const isActive = g.entityId === String(activeEntityId);
                    return (
                        <View key={g.entityId} style={{ borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: colors.border }}>
                            <View className="flex-row items-center px-4 pt-3 pb-1">
                                <Building2 size={13} color={isActive ? theme.primary : theme.textDark} />
                                <Text
                                    numberOfLines={1}
                                    style={{ marginLeft: 6, flex: 1, fontFamily: theme.font.bold, fontSize: 12, color: isActive ? theme.primary : theme.text }}
                                >
                                    {g.title}
                                </Text>
                                {isActive ? <Chip label="Current" color={theme.primary} theme={theme} /> : null}
                            </View>
                            {g.type ? (
                                <Text style={{ marginLeft: 35, marginBottom: 4, fontFamily: theme.font.regular, fontSize: 10, color: theme.textDark }}>
                                    {humanize(g.type)}
                                </Text>
                            ) : null}
                            {g.roles.map((r, ri) => (
                                <View
                                    key={r.id || `${g.entityId}-${ri}`}
                                    className="flex-row items-center px-4 py-2.5"
                                    style={{ borderTopWidth: 1, borderTopColor: colors.divider }}
                                >
                                    <View className="h-7 w-7 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: '#8b5cf61A' }}>
                                        <Shield size={13} color="#8b5cf6" />
                                    </View>
                                    <View className="flex-1 min-w-0">
                                        <Text numberOfLines={1} style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.text }}>
                                            {r.title || humanize(r.value)}
                                        </Text>
                                        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: theme.font.regular, fontSize: 10, color: theme.textDark }}>
                                            {[r.level && `Level ${humanize(r.level)}`, r.cluster && humanize(r.cluster), r.value && r.value !== r.title && r.value]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    );
                })}
            </Section>
        ) : null;

    const left = (
        <>
            {personalRows.length > 0 ? (
                <Section title="Personal details" theme={theme} colors={colors}>
                    <RowList rows={personalRows} theme={theme} colors={colors} />
                </Section>
            ) : null}
            {entityRows.length > 0 ? (
                <Section title="Current business" theme={theme} colors={colors}>
                    <RowList rows={entityRows} theme={theme} colors={colors} />
                </Section>
            ) : null}
            {sessionRows.length > 0 ? (
                <Section title="Session" theme={theme} colors={colors}>
                    <RowList rows={sessionRows} theme={theme} colors={colors} />
                </Section>
            ) : null}
        </>
    );

    const right = (
        <>
            {rolesSection}
            {otherRows.length > 0 ? (
                <Section title="Other details" theme={theme} colors={colors}>
                    <RowList rows={otherRows} theme={theme} colors={colors} />
                </Section>
            ) : null}
        </>
    );

    return (
        <ScrollView
            className="flex-1"
            style={{ backgroundColor: theme.background }}
            contentContainerStyle={{ padding: isWide ? 24 : 16, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
        >
            <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center' }}>
                {header}
                {stats}

                {isWide ? (
                    <View className="flex-row" style={{ gap: 20 }}>
                        <View className="flex-1 min-w-0">{left}</View>
                        <View className="flex-1 min-w-0">{right}</View>
                    </View>
                ) : (
                    <>
                        {left}
                        {right}
                    </>
                )}

                <Pressable
                    onPress={logout}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                    className="flex-row items-center justify-center rounded-2xl border py-4"
                    style={({ pressed }) => ({
                        borderColor: 'rgba(239,68,68,0.35)',
                        backgroundColor: pressed ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
                        alignSelf: isWide ? 'center' : 'stretch',
                        paddingHorizontal: 40,
                        ...webPointer,
                    })}
                >
                    <LogOut size={16} color="#ef4444" />
                    <Text style={{ marginLeft: 8, fontFamily: theme.font.bold, fontSize: 14, letterSpacing: 0.2, color: '#ef4444' }}>Sign out</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}
