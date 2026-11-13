// components/common/ClientDashboard.tsx

import retailersApi from '@/api/retailersApi';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useRouter } from 'expo-router';
import {
    Activity,
    Building2,
    ChevronRight,
    Clock,
    Package,
    Pill,
    RefreshCw,
    ShoppingBag,
    Store,
    TrendingUp,
} from 'lucide-react-native';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    Text,
    Pressable,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native';

/* ═══════════════════════════════════════════════════════════
 * FETCH ADAPTER
 * ═══════════════════════════════════════════════════════════ */

interface DashboardEnvelope {
    response_code: number;
    response_message: string;
    dashboard: ClientDashboardData;
}

function useDashboardApi(entityId?: string) {
    const fetchFn = useCallback(
        () =>
            retailersApi.getClientDashboardAction({
                entity_id: entityId,
            }),
        [entityId],
    );

    const {
        data: raw,
        loading,
        error,
        errorMessage,
        request,
    } = useApi<DashboardEnvelope>(fetchFn);

    useEffect(() => {
        void request();
    }, [request]);

    // --- RAW JSON LOGGING ---
    useEffect(() => {
        if (__DEV__ && raw) {
            // eslint-disable-next-line no-console
            console.log("[ClientDashboard] Raw Dashboard JSON:", raw.dashboard);
        }
    }, [raw]);

    return {
        dashboard: raw?.dashboard ?? null,
        loading,
        error,
        errorMessage,
        refresh: () => {
            void request();
        },
    };
}

/* ═══════════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════════ */

export type Period = 'today' | 'week' | 'month' | 'year' | 'all';

interface OrderSlot {
    count: number;
    spend: string;
    average?: string;
}
interface RxSlot {
    count: number;
}

interface RecentOrder {
    id: string;
    order_number: string | null;
    entity_name: string | null;
    status: string;
    total: string;
    created: string;
}

interface RecentRx {
    id: string;
    patient_name: string;
    status: string;
    nature: string;
    entity_name: string | null;
    created: string;
}

interface OrderBucket {
    today?: OrderSlot;
    week?: OrderSlot;
    month?: OrderSlot;
    year?: OrderSlot;
    all?: OrderSlot;
    status_breakdown?: Record<string, number>;
    open_orders?: number;
    recent?: RecentOrder[];
}

interface RxBucket {
    today?: RxSlot;
    week?: RxSlot;
    month?: RxSlot;
    year?: RxSlot;
    all?: RxSlot;
    status_breakdown?: Record<string, number>;
    nature_breakdown?: Record<string, number>;
    open_count?: number;
    recent?: RecentRx[];
}

interface EntitySection {
    count: number;
    items: Array<{ id: string; name: string }>;
}

interface InventorySlot {
    item_count: number;
    total_value: string;
}

interface InventorySection {
    entity?: {
        id: string | null;
        name: string | null;
        type: string | null;
    };
    retail?: InventorySlot;
    wholesale?: InventorySlot;
}

export interface ClientDashboardData {
    orders?: { self?: OrderBucket; shop?: OrderBucket };
    prescriptions?: { self?: RxBucket; shop?: RxBucket };
    owned_wholesalers?: {
        general?: OrderBucket;
        pharmaceutical?: OrderBucket;
    };
    entities?: {
        retail?: EntitySection;
        general_wholesalers?: EntitySection;
        pharmaceutical_wholesalers?: EntitySection;
    };
    inventory?: InventorySection;
    generated_at?: string;
}

interface Props {
    data?: ClientDashboardData;
    title?: string;
    onReady?: (refresh: () => void) => void;
    entityId?: string;
}

/* ═══════════════════════════════════════════════════════════
 * CONSTANTS / FORMATTERS
 * ═══════════════════════════════════════════════════════════ */

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

const STAT_GRID_GAP = 6;
const SECTION_GRID_GAP = 8;

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
];

const formatMoney = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined || v === '') return '0.00';
    const n = Number(v);
    if (!Number.isFinite(n)) return '0.00';
    return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatCount = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '0';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const shortDate = (iso?: string): string => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return '—';
    }
};

/* ═══════════════════════════════════════════════════════════
 * PRIMITIVES
 * ═══════════════════════════════════════════════════════════ */

const StatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    subtitle: string;
    count: number;
    spend?: string;
    average?: string;
    accent?: string;
    theme: any;
    isDarkMode: boolean;
}> = ({
    icon,
    label,
    subtitle,
    count,
    spend,
    average,
    accent,
    theme,
    isDarkMode,
}) => {
        const accentColor = accent ?? theme.colors.primary;

        return (
            <View
                className="rounded-2xl border p-4 w-full"
                style={{
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.panel,
                    minHeight: 140,
                }}
            >
                <View className="flex-row items-center" style={{ flexShrink: 1 }}>
                    <View
                        className="h-8 w-8 rounded-xl items-center justify-center mr-2"
                        style={{ backgroundColor: `${accentColor}18` }}
                    >
                        {icon}
                    </View>
                    <View className="flex-1">
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                                color: theme.colors.textMuted,
                            }}
                        >
                            {label}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={{
                                marginTop: 2,
                                fontFamily: theme.font.regular,
                                fontSize: 10,
                                color: theme.colors.textMuted,
                                opacity: 0.85,
                            }}
                        >
                            {subtitle}
                        </Text>
                    </View>
                </View>

                <View className="mt-3 flex-row items-end">
                    <Text
                        numberOfLines={1}
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 28,
                            lineHeight: 34,
                            letterSpacing: -0.6,
                            color: theme.colors.text,
                            flexShrink: 1,
                        }}
                    >
                        {formatCount(count)}
                    </Text>
                    <Text
                        style={{
                            marginLeft: 6,
                            marginBottom: 4,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                            color: theme.colors.textMuted,
                        }}
                    >
                        {count === 1 ? 'record' : 'records'}
                    </Text>
                </View>

                {spend !== undefined && (
                    <View
                        className="mt-3 pt-3 flex-row items-center justify-between"
                        style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.border,
                        }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 8,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                    color: theme.colors.textMuted,
                                }}
                            >
                                Total value
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={{
                                    marginTop: 1,
                                    fontFamily: theme.font.bold,
                                    fontSize: 14,
                                    color: accentColor,
                                }}
                            >
                                KES {formatMoney(spend)}
                            </Text>
                        </View>
                        {average !== undefined && (
                            <View className="items-end ml-1">
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 8,
                                        letterSpacing: 0.6,
                                        textTransform: 'uppercase',
                                        color: theme.colors.textMuted,
                                    }}
                                >
                                    Average
                                </Text>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        marginTop: 1,
                                        fontFamily: theme.font.semibold,
                                        fontSize: 12,
                                        color: theme.colors.text,
                                    }}
                                >
                                    KES {formatMoney(average)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

const BreakdownRow: React.FC<{
    title: string;
    items: Record<string, number> | undefined;
    theme: any;
    isDarkMode: boolean;
    palette?: string[];
}> = ({ title, items, theme, isDarkMode, palette }) => {
    const entries = Object.entries(items || {});
    if (entries.length === 0) return null;

    const colors =
        palette ??
        ['#3b82f6', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2'];

    return (
        <View className="mt-3">
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    color: theme.colors.textMuted,
                    marginBottom: 6,
                }}
            >
                {title}
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {entries.map(([k, v], i) => {
                    const c = colors[i % colors.length];
                    return (
                        <View
                            key={k}
                            className="flex-row items-center rounded-full px-2.5 py-1 border"
                            style={{
                                borderColor: isDarkMode
                                    ? 'rgba(148,163,184,0.15)'
                                    : 'rgba(15,23,42,0.08)',
                                backgroundColor: isDarkMode
                                    ? 'rgba(148,163,184,0.06)'
                                    : 'rgba(15,23,42,0.03)',
                            }}
                        >
                            <View
                                className="h-1.5 w-1.5 rounded-full mr-1.5"
                                style={{ backgroundColor: c }}
                            />
                            <Text
                                style={{
                                    fontFamily: theme.font.semibold,
                                    fontSize: 10,
                                    color: theme.colors.textMuted,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                }}
                            >
                                {k}
                            </Text>
                            <Text
                                style={{
                                    marginLeft: 5,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    color: theme.colors.text,
                                }}
                            >
                                {formatCount(v)}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const RecentOrderRow: React.FC<{
    row: RecentOrder;
    theme: any;
}> = ({ row, theme }) => (
    <View
        className="py-3 flex-row items-center border-t"
        style={{ borderTopColor: theme.colors.border }}
    >
        <View className="flex-1 pr-2">
            <Text
                numberOfLines={1}
                style={{
                    fontFamily: theme.font.semibold,
                    fontSize: 12,
                    color: theme.colors.text,
                }}
            >
                {row.entity_name ?? '—'}
            </Text>
            <Text
                numberOfLines={1}
                style={{
                    marginTop: 2,
                    fontFamily: theme.font.mono,
                    fontSize: 10,
                    color: theme.colors.textMuted,
                }}
            >
                {row.order_number ?? '—'}
            </Text>
        </View>
        <View className="items-end">
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 12,
                    color: theme.colors.text,
                }}
            >
                KES {formatMoney(row.total)}
            </Text>
            <Text
                style={{
                    marginTop: 2,
                    fontFamily: theme.font.medium,
                    fontSize: 9,
                    letterSpacing: 0.4,
                    color: theme.colors.textMuted,
                }}
            >
                {row.status} · {shortDate(row.created)}
            </Text>
        </View>
    </View>
);

const RecentRxRow: React.FC<{
    row: RecentRx;
    theme: any;
    onPress?: () => void;
}> = ({ row, theme, onPress }) => (
    <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open prescription for ${row.patient_name}`}
        className="py-3 flex-row items-center border-t"
        style={({ pressed }) => ({
            borderTopColor: theme.colors.border,
            opacity: pressed ? 0.6 : 1,
            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
        })}
    >
        <View className="flex-1 pr-2">
            <Text
                numberOfLines={1}
                style={{
                    fontFamily: theme.font.semibold,
                    fontSize: 12,
                    color: theme.colors.text,
                }}
            >
                {row.patient_name}
            </Text>
            <Text
                numberOfLines={1}
                style={{
                    marginTop: 2,
                    fontFamily: theme.font.regular,
                    fontSize: 10,
                    color: theme.colors.textMuted,
                }}
            >
                {row.entity_name ?? '—'} · {row.nature}
            </Text>
        </View>
        <View className="items-end">
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.4,
                    color: theme.colors.text,
                }}
            >
                {row.status}
            </Text>
            <Text
                style={{
                    marginTop: 2,
                    fontFamily: theme.font.medium,
                    fontSize: 9,
                    color: theme.colors.textMuted,
                }}
            >
                {shortDate(row.created)}
            </Text>
        </View>
        {onPress ? <ChevronRight size={14} color={theme.colors.textMuted} style={{ marginLeft: 6 }} /> : null}
    </Pressable>
);

const SectionCard: React.FC<{
    title: string;
    icon: React.ReactNode;
    accent: string;
    theme: any;
    isDarkMode: boolean;
    children: React.ReactNode;
}> = ({ title, icon, accent, theme, isDarkMode, children }) => {
    return (
        <View
            className="rounded-2xl border overflow-hidden w-full"
            style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.panel,
            }}
        >
            <View
                className="flex-row items-center px-4 py-3 border-b"
                style={{ borderBottomColor: theme.colors.border }}
            >
                <View
                    className="h-8 w-8 rounded-lg items-center justify-center mr-3"
                    style={{ backgroundColor: `${accent}18` }}
                >
                    {icon}
                </View>
                <Text
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                        color: theme.colors.text,
                    }}
                >
                    {title}
                </Text>
            </View>
            <View className="px-4 py-3">{children}</View>
        </View>
    );
};

const PeriodSelector: React.FC<{
    value: Period;
    onChange: (p: Period) => void;
    theme: any;
    isDarkMode: boolean;
}> = ({ value, onChange, theme, isDarkMode }) => {
    return (
        <View
            className="flex-row p-1 rounded-xl border mb-4"
            style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                gap: 2,
            }}
        >
            {PERIODS.map((p) => {
                const active = value === p.key;
                return (
                    <TouchableOpacity
                        key={p.key}
                        onPress={() => onChange(p.key)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        className="flex-1 h-10 rounded-lg items-center justify-center"
                        style={{
                            backgroundColor: active ? theme.colors.panel : 'transparent',
                            ...webPointer,
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: active
                                    ? theme.font.bold
                                    : theme.font.medium,
                                fontSize: 11,
                                color: active ? theme.colors.text : theme.colors.textMuted,
                            }}
                        >
                            {p.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const EntityStrip: React.FC<{
    title: string;
    section?: EntitySection;
    theme: any;
    isDarkMode: boolean;
    icon: React.ReactNode;
    accent: string;
}> = ({ title, section, theme, isDarkMode, icon, accent }) => {
    if (!section) return null;

    return (
        <View
            className="rounded-2xl border w-full"
            style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.panel,
            }}
        >
            <View
                className="flex-row items-center px-4 py-3 border-b"
                style={{ borderBottomColor: theme.colors.border }}
            >
                <View
                    className="h-8 w-8 rounded-lg items-center justify-center mr-3"
                    style={{ backgroundColor: `${accent}18` }}
                >
                    {icon}
                </View>
                <Text
                    className="flex-1"
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                        color: theme.colors.text,
                    }}
                >
                    {title}
                </Text>
                <Text
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 13,
                        color: accent,
                    }}
                >
                    {formatCount(section.count)}
                </Text>
            </View>
            {(section.items || []).length === 0 ? (
                <View className="px-4 py-3">
                    <Text
                        style={{
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            color: theme.colors.textMuted,
                        }}
                    >
                        None yet.
                    </Text>
                </View>
            ) : (
                <View className="px-4 py-3 flex-row flex-wrap" style={{ gap: 8 }}>
                    {(section.items || []).map((e) => (
                        <View
                            key={e.id}
                            className="px-3 py-1.5 rounded-full"
                            style={{
                                backgroundColor: theme.colors.surfaceAlt,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.semibold,
                                    fontSize: 11,
                                    color: theme.colors.text,
                                }}
                            >
                                {e.name}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
};

const InventoryCard: React.FC<{
    inventory: InventorySection;
    theme: any;
    isDarkMode: boolean;
    isMobile: boolean;
}> = ({ inventory, theme, isDarkMode, isMobile }) => {
    const accent = theme.colors.info;

    const entity = inventory?.entity || { name: null, type: null };
    const retail = inventory?.retail || { item_count: 0, total_value: '0' };
    const wholesale = inventory?.wholesale || { item_count: 0, total_value: '0' };

    const isWholesaler =
        entity.type === 'GeneralWholesaler' ||
        entity.type === 'PharmaceuticalWholesaler';

    const Slot: React.FC<{
        label: string;
        data: InventorySlot;
        muted: boolean;
        slotAccent: string;
    }> = ({ label, data, muted, slotAccent }) => (
        <View
            className="flex-1 rounded-xl p-4 border"
            style={{
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
                opacity: muted ? 0.5 : 1,
            }}
        >
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 9,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: theme.colors.textMuted,
                }}
            >
                {label}
            </Text>

            <View className="mt-3 flex-row items-end">
                <Text
                    numberOfLines={1}
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 28,
                        lineHeight: 32,
                        letterSpacing: -0.6,
                        color: theme.colors.text,
                        flexShrink: 1,
                    }}
                >
                    {formatCount(data.item_count)}
                </Text>
                <Text
                    style={{
                        marginLeft: 6,
                        marginBottom: 4,
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                        color: theme.colors.textMuted,
                    }}
                >
                    {data.item_count === 1 ? 'item' : 'items'}
                </Text>
            </View>

            <View
                className="mt-3 pt-3 border-t"
                style={{ borderTopColor: theme.colors.border }}
            >
                <Text
                    style={{
                        fontFamily: theme.font.bold,
                        fontSize: 9,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: theme.colors.textMuted,
                    }}
                >
                    Total value
                </Text>
                <Text
                    numberOfLines={1}
                    style={{
                        marginTop: 1,
                        fontFamily: theme.font.bold,
                        fontSize: 16,
                        color: slotAccent,
                    }}
                >
                    KES {formatMoney(data.total_value)}
                </Text>
            </View>
        </View>
    );

    return (
        <SectionCard
            title="Inventory"
            icon={<Package size={16} color={accent} />}
            accent={accent}
            theme={theme}
            isDarkMode={isDarkMode}
        >
            <View
                className="pb-3 mb-3 flex-row items-center border-b"
                style={{ borderBottomColor: theme.colors.border }}
            >
                <View className="flex-1">
                    <Text
                        numberOfLines={1}
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 13,
                            color: theme.colors.text,
                        }}
                    >
                        {entity.name || 'No entity in context'}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{
                            marginTop: 2,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            color: theme.colors.textMuted,
                        }}
                    >
                        {entity.type ?? '—'}
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                <Slot
                    label="Retail"
                    data={retail}
                    muted={isWholesaler}
                    slotAccent={theme.colors.success}
                />
                <Slot
                    label="Wholesale"
                    data={wholesale}
                    muted={!isWholesaler}
                    slotAccent={theme.colors.warning}
                />
            </View>
        </SectionCard>
    );
};

/* ═══════════════════════════════════════════════════════════
 * MAIN
 * ═══════════════════════════════════════════════════════════ */

export default function ClientDashboard({
    data: dataProp,
    title = 'Dashboard',
    onReady,
    entityId,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const [period, setPeriod] = useState<Period>('month');

    // ── Responsive flags ──────────────────────────────────
    const isTablet = windowWidth >= TABLET_BREAKPOINT;
    const isDesktop = windowWidth >= DESKTOP_BREAKPOINT;
    const isMobile = windowWidth < TABLET_BREAKPOINT;

    // Make cards 100% width on mobile, multi-column on larger screens
    const statCellStyle: ViewStyle = useMemo(
        () => ({
            width: isTablet ? '50%' : '100%', // Changed to 100% for mobile
            paddingHorizontal: STAT_GRID_GAP,
            paddingBottom: STAT_GRID_GAP * 2,
        }),
        [isTablet],
    );

    const sectionCellStyle: ViewStyle = useMemo(
        () => ({
            width: isDesktop ? '50%' : '100%', // 100% for mobile and tablet
            paddingHorizontal: SECTION_GRID_GAP,
            paddingBottom: SECTION_GRID_GAP * 2,
        }),
        [isDesktop],
    );

    // ── Fetch (skipped when a parent supplies `data`) ─────
    const {
        dashboard: fetched,
        loading: fetchLoading,
        error: fetchError,
        errorMessage: fetchErrorMessage,
        refresh,
    } = useDashboardApi(entityId);

    const notified = useRef(false);
    useEffect(() => {
        if (!notified.current && refresh) {
            notified.current = true;
            onReady?.(refresh);
        }
    }, [refresh, onReady]);

    const data = dataProp ?? fetched;
    const loading = !dataProp && fetchLoading;

    const handleRefresh = useCallback(() => {
        refresh?.();
    }, [refresh]);

    const derived = useMemo(() => {
        if (!data) return null;

        const oSelf = data.orders?.self || {};
        const oShop = data.orders?.shop || {};
        const pSelf = data.prescriptions?.self || {};
        const pShop = data.prescriptions?.shop || {};

        const oSelfSlot = oSelf[period] || { count: 0, spend: '0', average: '0' };
        const oShopSlot = oShop[period] || { count: 0, spend: '0', average: '0' };
        const pSelfSlot = pSelf[period] || { count: 0 };
        const pShopSlot = pShop[period] || { count: 0 };

        const totalAcross =
            (oSelfSlot.count || 0) +
            (oShopSlot.count || 0) +
            (pSelfSlot.count || 0) +
            (pShopSlot.count || 0);

        return {
            oSelf,
            oShop,
            pSelf,
            pShop,
            oSelfSlot,
            oShopSlot,
            pSelfSlot,
            pShopSlot,
            totalAcross,
            hasGeneralWs: !!data.owned_wholesalers?.general,
            hasPharmaWs: !!data.owned_wholesalers?.pharmaceutical,
        };
    }, [data, period]);

    if (loading && !data) {
        return (
            <View className="flex-1 items-center justify-center py-20" style={{ backgroundColor: theme.colors.background }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 12, fontFamily: theme.font.regular, fontSize: 12, color: theme.colors.textMuted }}>
                    Loading dashboard…
                </Text>
            </View>
        );
    }

    if (fetchError && !data) {
        return (
            <View className="flex-1 items-center justify-center py-20 px-6" style={{ backgroundColor: theme.colors.background }}>
                <Text style={{ fontFamily: theme.font.bold, fontSize: 15, color: theme.colors.text }}>
                    Couldn't load dashboard
                </Text>
                <Text style={{ marginTop: 6, textAlign: 'center', fontFamily: theme.font.regular, fontSize: 12, color: theme.colors.textMuted }}>
                    {fetchErrorMessage ?? 'Something went wrong.'}
                </Text>
                <TouchableOpacity
                    onPress={handleRefresh}
                    activeOpacity={0.85}
                    className="mt-4 flex-row items-center px-4 h-11 rounded-xl"
                    style={{ backgroundColor: theme.colors.primary, ...webPointer }}
                >
                    <RefreshCw size={14} color="#fff" />
                    <Text style={{ marginLeft: 8, fontFamily: theme.font.bold, fontSize: 12, color: '#fff' }}>
                        Retry
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!derived || !data) {
        return (
            <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: theme.colors.background }}>
                <Text style={{ fontFamily: theme.font.medium, color: theme.colors.textMuted }}>No dashboard data available.</Text>
            </View>
        );
    }

    const {
        oSelf,
        oShop,
        pSelf,
        pShop,
        oSelfSlot,
        oShopSlot,
        pSelfSlot,
        pShopSlot,
        totalAcross,
        hasGeneralWs,
        hasPharmaWs,
    } = derived;

    const gwSlot = data.owned_wholesalers?.general?.[period] || { count: 0, spend: '0', average: '0' };
    const pwSlot = data.owned_wholesalers?.pharmaceutical?.[period] || { count: 0, spend: '0', average: '0' };

    const hasAnyBreakdown =
        Object.keys(oSelf.status_breakdown || {}).length > 0 ||
        Object.keys(oShop.status_breakdown || {}).length > 0 ||
        Object.keys(pSelf.status_breakdown || {}).length > 0;

    const hasAnyRecentOrders =
        (oSelf.recent || []).length > 0 || (oShop.recent || []).length > 0;

    const hasAnyRecentRx =
        (pSelf.recent || []).length > 0 || (pShop.recent || []).length > 0;

    return (
        <ScrollView
            className="flex-1"
            style={{ backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 12, paddingBottom: 64 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View className="mb-4 flex-row items-start">
                <View className="flex-1 pr-2">
                    <Text
                        numberOfLines={1}
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 22,
                            letterSpacing: -0.3,
                            color: theme.colors.text,
                        }}
                    >
                        {title}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{
                            marginTop: 3,
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            color: theme.colors.textMuted,
                        }}
                    >
                        {totalAcross} records · updated {shortDate(data.generated_at)}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={handleRefresh}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh dashboard"
                    className="h-10 w-10 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: theme.colors.surfaceAlt,
                        ...webPointer,
                    }}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                        <RefreshCw size={16} color={theme.colors.text} />
                    )}
                </TouchableOpacity>
            </View>

            {/* Period */}
            <PeriodSelector
                value={period}
                onChange={setPeriod}
                theme={theme}
                isDarkMode={isDarkMode}
            />

            {/* ═══ Stat-card grid ═══ */}
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -STAT_GRID_GAP }}>
                <View style={statCellStyle}>
                    <StatCard
                        theme={theme}
                        isDarkMode={isDarkMode}
                        icon={<ShoppingBag size={16} color={theme.colors.primary} />}
                        label="My orders"
                        subtitle="Placed as customer"
                        accent={theme.colors.primary}
                        count={oSelfSlot.count}
                        spend={oSelfSlot.spend}
                        average={oSelfSlot.average}
                    />
                </View>

                <View style={statCellStyle}>
                    <StatCard
                        theme={theme}
                        isDarkMode={isDarkMode}
                        icon={<Store size={16} color={theme.colors.success} />}
                        label="Shop orders"
                        subtitle="Placed at my shops"
                        accent={theme.colors.success}
                        count={oShopSlot.count}
                        spend={oShopSlot.spend}
                        average={oShopSlot.average}
                    />
                </View>

                <View style={statCellStyle}>
                    <StatCard
                        theme={theme}
                        isDarkMode={isDarkMode}
                        icon={<Pill size={16} color={theme.colors.accent} />}
                        label="My prescriptions"
                        subtitle="Created by me"
                        accent={theme.colors.accent}
                        count={pSelfSlot.count}
                    />
                </View>

                <View style={statCellStyle}>
                    <StatCard
                        theme={theme}
                        isDarkMode={isDarkMode}
                        icon={<Pill size={16} color={theme.colors.info} />}
                        label="Shop prescriptions"
                        subtitle="At my shops"
                        accent={theme.colors.info}
                        count={pShopSlot.count}
                    />
                </View>

                {hasGeneralWs && (
                    <View style={statCellStyle}>
                        <StatCard
                            theme={theme}
                            isDarkMode={isDarkMode}
                            icon={<Building2 size={16} color={theme.colors.warning} />}
                            label="General wholesaler"
                            subtitle="Orders at my entity"
                            accent={theme.colors.warning}
                            count={gwSlot.count}
                            spend={gwSlot.spend}
                            average={gwSlot.average}
                        />
                    </View>
                )}

                {hasPharmaWs && (
                    <View style={statCellStyle}>
                        <StatCard
                            theme={theme}
                            isDarkMode={isDarkMode}
                            icon={<Building2 size={16} color={theme.colors.danger} />}
                            label="Pharma wholesaler"
                            subtitle="Orders at my entity"
                            accent={theme.colors.danger}
                            count={pwSlot.count}
                            spend={pwSlot.spend}
                            average={pwSlot.average}
                        />
                    </View>
                )}
            </View>

            {/* ═══ Section grid ═══ */}
            <View
                className="flex-row flex-wrap items-start"
                style={{ marginHorizontal: -SECTION_GRID_GAP }}
            >
                {/* Inventory */}
                {data.inventory && (
                    <View style={sectionCellStyle}>
                        <InventoryCard
                            inventory={data.inventory}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            isMobile={isMobile}
                        />
                    </View>
                )}

                {/* Breakdowns */}
                {hasAnyBreakdown && (
                    <View style={sectionCellStyle}>
                        <SectionCard
                            title="Breakdowns"
                            icon={<TrendingUp size={16} color={theme.colors.primary} />}
                            accent={theme.colors.primary}
                            theme={theme}
                            isDarkMode={isDarkMode}
                        >
                            <BreakdownRow
                                title="My orders · status"
                                items={oSelf.status_breakdown}
                                theme={theme}
                                isDarkMode={isDarkMode}
                            />
                            <BreakdownRow
                                title="Shop orders · status"
                                items={oShop.status_breakdown}
                                theme={theme}
                                isDarkMode={isDarkMode}
                            />
                            <BreakdownRow
                                title="My prescriptions · status"
                                items={pSelf.status_breakdown}
                                theme={theme}
                                isDarkMode={isDarkMode}
                            />
                            <BreakdownRow
                                title="My prescriptions · nature"
                                items={pSelf.nature_breakdown}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                palette={[theme.colors.accent, theme.colors.info]}
                            />
                            {hasGeneralWs && (
                                <BreakdownRow
                                    title="General wholesaler · status"
                                    items={data.owned_wholesalers?.general?.status_breakdown}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                />
                            )}
                            {hasPharmaWs && (
                                <BreakdownRow
                                    title="Pharma wholesaler · status"
                                    items={data.owned_wholesalers?.pharmaceutical?.status_breakdown}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                />
                            )}
                        </SectionCard>
                    </View>
                )}

                {/* Recent orders */}
                {hasAnyRecentOrders && (
                    <View style={sectionCellStyle}>
                        <SectionCard
                            title="Recent orders"
                            icon={<Clock size={16} color={theme.colors.primary} />}
                            accent={theme.colors.primary}
                            theme={theme}
                            isDarkMode={isDarkMode}
                        >
                            {(oSelf.recent || []).length > 0 && (
                                <>
                                    <Text
                                        style={{
                                            fontFamily: theme.font.bold,
                                            fontSize: 9,
                                            letterSpacing: 0.7,
                                            textTransform: 'uppercase',
                                            color: theme.colors.textMuted,
                                            marginBottom: 4,
                                        }}
                                    >
                                        Placed by me
                                    </Text>
                                    {(oSelf.recent || []).map((r) => (
                                        <RecentOrderRow
                                            key={r.id}
                                            row={r}
                                            theme={theme}
                                        />
                                    ))}
                                </>
                            )}
                            {(oShop.recent || []).length > 0 && (
                                <>
                                    <Text
                                        style={{
                                            marginTop: 12,
                                            fontFamily: theme.font.bold,
                                            fontSize: 9,
                                            letterSpacing: 0.7,
                                            textTransform: 'uppercase',
                                            color: theme.colors.textMuted,
                                            marginBottom: 4,
                                        }}
                                    >
                                        At my shops
                                    </Text>
                                    {(oShop.recent || []).map((r) => (
                                        <RecentOrderRow
                                            key={r.id}
                                            row={r}
                                            theme={theme}
                                        />
                                    ))}
                                </>
                            )}
                        </SectionCard>
                    </View>
                )}

                {/* Recent prescriptions */}
                {hasAnyRecentRx && (
                    <View style={sectionCellStyle}>
                        <SectionCard
                            title="Recent prescriptions"
                            icon={<Activity size={16} color={theme.colors.accent} />}
                            accent={theme.colors.accent}
                            theme={theme}
                            isDarkMode={isDarkMode}
                        >
                            {(pSelf.recent || []).map((r) => (
                                <RecentRxRow
                                    key={`pSelf-${r.id}`}
                                    row={r}
                                    theme={theme}
                                    onPress={() => router.push({ pathname: '/userPrescriptions', params: { prescription: String(r.id) } } as any)}
                                />
                            ))}
                            {(pShop.recent || []).map((r) => (
                                <RecentRxRow
                                    key={`pShop-${r.id}`}
                                    row={r}
                                    theme={theme}
                                    onPress={() => router.push({ pathname: '/entityPrescriptions', params: { prescription: String(r.id) } } as any)}
                                />
                            ))}
                        </SectionCard>
                    </View>
                )}

                {/* Retail shops */}
                <View style={sectionCellStyle}>
                    <EntityStrip
                        title="Retail shops"
                        section={data.entities?.retail}
                        theme={theme}
                        isDarkMode={isDarkMode}
                        icon={<Store size={16} color={theme.colors.success} />}
                        accent={theme.colors.success}
                    />
                </View>

                {/* General wholesalers */}
                {data.entities?.general_wholesalers && (
                    <View style={sectionCellStyle}>
                        <EntityStrip
                            title="General wholesalers"
                            section={data.entities.general_wholesalers}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            icon={<Building2 size={16} color={theme.colors.warning} />}
                            accent={theme.colors.warning}
                        />
                    </View>
                )}

                {/* Pharmaceutical wholesalers */}
                {data.entities?.pharmaceutical_wholesalers && (
                    <View style={sectionCellStyle}>
                        <EntityStrip
                            title="Pharmaceutical wholesalers"
                            section={data.entities.pharmaceutical_wholesalers}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            icon={<Building2 size={16} color={theme.colors.danger} />}
                            accent={theme.colors.danger}
                        />
                    </View>
                )}
            </View>
        </ScrollView>
    );
}