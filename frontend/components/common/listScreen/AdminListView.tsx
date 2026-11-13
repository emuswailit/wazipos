// components/admin/kit/AdminListView.tsx
//
// Universal admin list (web + native), styled like Retailer → Out of Stock.
//
//   variant="mobile" — native apps and narrow web:
//     search · add bar, one line of context, optional filter chips,
//     a scrolling list of cards (whole filtered list, no pagination), pull to refresh.
//   variant="web" — wide screens:
//     compact header (title · source · stats · Add · Refresh), one table card with a
//     search/filter toolbar, column header, hoverable rows and the shared PaginationBar.
//
// Each admin module passes its shell's shared props plus a small `config` describing
// how to show one record (title, subtitle, avatar, badges, columns).

import ImageWithFallback from '@/components/common/ImageWithFallback';
import { PaginationBar, type PageSize } from '@/components/common/PaginationBar';
import {
    EmptyState,
    FilterChips,
    SearchField,
    StatChip,
    type FilterChipOption,
} from '@/components/common/listScreen/controls';
import { LIST_MAX_WIDTH, isWeb, useListTokens, webPointer } from '@/components/common/listScreen/tokens';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminSheet, SheetButton, useSheetIsWide } from './AdminSheet';
import { ActiveFilterPill } from './FilterSheetParts';
import { accentFor, initialsOf, plural } from './format';

export type IconName = keyof typeof Ionicons.glyphMap;
type SourceTone = 'server' | 'cache' | 'none';

/* =========================================================
 * Config types
 * ======================================================= */

export interface AdminAvatar {
    /** Image to show; falls back to initials / icon when missing or broken. */
    uri?: string | null;
    /** Text the initials are taken from (defaults to the record title). */
    label?: string | null;
    /** Icon instead of initials. */
    icon?: IconName;
    /** Accent colour (defaults to a stable colour per title). */
    color?: string;
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'violet';

export interface AdminBadge {
    label: string;
    tone?: BadgeTone;
    icon?: IconName;
}

export interface AdminColumn<T> {
    key: string;
    label: string;
    /** Flex weight of the column. */
    flex: number;
    align?: 'left' | 'center' | 'right';
    /** A string renders as a muted cell; return a node for anything richer. */
    render: (item: T) => React.ReactNode;
}

export interface AdminMetric {
    value: string;
    label: string;
    color?: string;
}

export interface AdminListConfig<T> {
    /** Screen title, e.g. "Routes". */
    title: string;
    /** Singular / plural noun, e.g. ['route', 'routes']. */
    noun: [string, string];
    /** Module icon (empty state, avatar fallback). */
    icon: IconName;
    searchPlaceholder?: string;
    addLabel?: string;
    emptyTitle?: string;
    emptyMessage?: string;

    keyOf: (item: T, index: number) => string;
    titleOf: (item: T) => string;
    subtitleOf?: (item: T) => string | null | undefined;
    avatarOf?: (item: T) => AdminAvatar;
    badgesOf?: (item: T) => AdminBadge[];
    /** Right side of a card's meta row, usually a date. */
    metaOf?: (item: T) => string | null | undefined;
    metaIcon?: IconName;
    /** Big number on the right of a card (e.g. quantity, price). */
    metricOf?: (item: T) => AdminMetric | null | undefined;

    /** Header label + flex of the first (title) column on web. */
    primaryColumn?: { label: string; flex: number };
    /** Extra web columns after the title column. */
    columns: AdminColumn<T>[];
}

export interface AdminStat {
    label: string;
    value: string;
    color?: string;
}

export interface AdminFilters<K extends string> {
    options: FilterChipOption<K>[];
    value: K;
    onChange: (key: K) => void;
    /** The value meaning "no filter" (clears to this). */
    allKey: K;
}

/** The props every admin shell already passes to its Mobile/Web views. */
interface AdminListBaseProps<T> {
    query: string;
    setQuery: (v: string) => void;
    onRefresh: () => void;
    refreshing: boolean;
    sourceLabel?: string;
    sourceTone?: SourceTone;
    lastSyncedTime?: string;
    /** Current page (web). */
    items: T[];
    /** Whole filtered list (mobile shows everything, no pagination). */
    allItems?: T[];
    emptyComponent?: React.ReactElement | null;
    onOpenCreate?: () => void;
    onPressItem: (item: T) => void;
    onEditItem?: (item: T) => void;
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

export interface AdminRowAction {
    icon: IconName;
    label: string;
    onPress: () => void;
    tone?: 'muted' | 'primary' | 'danger';
}

export interface AdminListViewProps<T, K extends string = string> extends AdminListBaseProps<T> {
    variant: 'mobile' | 'web';
    config: AdminListConfig<T>;
    /** Header stats (web) / filter-sheet tiles. Defaults to a total count. */
    stats?: AdminStat[];
    filters?: AdminFilters<K>;
    /** Extra per-record buttons (e.g. delete), shown on table rows and card meta rows. */
    rowActions?: (item: T) => AdminRowAction[];
    /** Extra controls (e.g. a date range): web toolbar / under the mobile search bar. */
    toolbar?: React.ReactNode;
    /** True when `toolbar` controls are narrowing the list (enables "Clear"). */
    toolbarActive?: boolean;
    /** Heading for `toolbar` in the phone filters sheet (default "Date"). */
    toolbarLabel?: string;
    /** Clears `toolbar` controls when "Clear" is pressed. */
    onClearToolbar?: () => void;
    /** Load error to show above the list. */
    error?: string | null;
    /** Sticky action bar under the list (e.g. "Submit request"). */
    footer?: React.ReactNode;
    /** Hide the page controls (short lists such as baskets). */
    hidePagination?: boolean;
}

/* =========================================================
 * Shared bits
 * ======================================================= */

const BADGE_COLORS: Record<BadgeTone, string> = {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f43f5e',
    info: '#3b82f6',
    neutral: '#64748b',
    primary: '', // theme primary
    violet: '#8b5cf6',
};

function sourceDotColor(tone?: SourceTone): string {
    return tone === 'server' ? '#10b981' : tone === 'cache' ? '#f59e0b' : '#94a3b8';
}

/** Small uppercase pill, e.g. "ACTIVE". */
export function AdminBadgePill({ badge, size = 'sm' }: { badge: AdminBadge; size?: 'sm' | 'md' }) {
    const { theme } = useListTokens();
    const color = BADGE_COLORS[badge.tone ?? 'neutral'] || theme.primary;
    return (
        <View
            className="flex-row items-center self-start rounded-full gap-1"
            style={{ backgroundColor: `${color}1f`, paddingHorizontal: size === 'sm' ? 8 : 10, paddingVertical: size === 'sm' ? 2 : 3 }}
        >
            {badge.icon ? <Ionicons name={badge.icon} size={size === 'sm' ? 10 : 12} color={color} /> : null}
            <Text className="uppercase tracking-wide" style={{ color, fontFamily: theme.font.bold, fontSize: size === 'sm' ? 9.5 : 10.5 }} numberOfLines={1}>
                {badge.label}
            </Text>
        </View>
    );
}

/** Rounded-square avatar: image, else icon, else initials on a tinted tile. */
export function AdminAvatarTile({ avatar, title, size = 44 }: { avatar?: AdminAvatar; title: string; size?: number }) {
    const { theme } = useListTokens();
    const color = avatar?.color ?? accentFor(avatar?.label ?? title);
    const radius = Math.round(size * 0.3);
    const initials = initialsOf(avatar?.label ?? title);

    if (avatar?.uri) {
        return (
            <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
                <ImageWithFallback
                    uri={avatar.uri}
                    width={size}
                    height={size}
                    borderRadius={radius}
                    fallback={initials}
                    fallbackSize={Math.round(size * 0.34)}
                    backgroundColor={`${color}1a`}
                />
            </View>
        );
    }
    return (
        <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: `${color}1a`, alignItems: 'center', justifyContent: 'center' }}>
            {avatar?.icon ? (
                <Ionicons name={avatar.icon} size={Math.round(size * 0.45)} color={color} />
            ) : (
                <Text style={{ color, fontFamily: theme.font.bold, fontSize: Math.round(size * 0.34) }}>{initials}</Text>
            )}
        </View>
    );
}

/** Muted single-line table cell text. */
export function CellText({ children, strong, align = 'left', lines = 1 }: { children: React.ReactNode; strong?: boolean; align?: 'left' | 'center' | 'right'; lines?: number }) {
    const { theme } = useListTokens();
    return (
        <Text
            style={{ color: strong ? theme.text : theme.textDark, fontFamily: strong ? theme.font.bold : theme.font.medium, fontSize: 12.5, textAlign: align }}
            numberOfLines={lines}
        >
            {children}
        </Text>
    );
}

function IconButton({
    icon,
    onPress,
    label,
    tone = 'muted',
    size = 32,
    disabled,
}: {
    icon: IconName;
    onPress: () => void;
    label: string;
    tone?: 'muted' | 'primary' | 'solid' | 'danger';
    size?: number;
    disabled?: boolean;
}) {
    const { theme, chipBg } = useListTokens();
    const bg = tone === 'solid' ? theme.primary : tone === 'primary' ? `${theme.primary}14` : tone === 'danger' ? 'rgba(244,63,94,0.10)' : chipBg;
    const fg = tone === 'solid' ? '#fff' : tone === 'primary' ? theme.primary : tone === 'danger' ? '#f43f5e' : theme.text;
    return (
        <Pressable
            onPress={(e: any) => {
                e?.stopPropagation?.();
                onPress();
            }}
            disabled={disabled}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => ({
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.34),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: bg,
                opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
                ...webPointer,
            })}
        >
            <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
        </Pressable>
    );
}

/* =========================================================
 * Entry
 * ======================================================= */

export function AdminListView<T, K extends string = string>(props: AdminListViewProps<T, K>) {
    return props.variant === 'web' ? <WebList {...props} /> : <MobileList {...props} />;
}

function useFilterState<T, K extends string>(props: AdminListViewProps<T, K>) {
    const { query, setQuery, filters, toolbarActive, onClearToolbar } = props;
    const filtered = !!filters && filters.value !== filters.allKey;
    const hasActiveFilter = filtered || query.trim() !== '' || !!toolbarActive;
    const clearFilters = () => {
        if (filters && filtered) filters.onChange(filters.allKey);
        if (query.trim() !== '') setQuery('');
        if (toolbarActive) onClearToolbar?.();
    };
    return { filtered, hasActiveFilter, clearFilters };
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
    const { theme } = useListTokens();
    return (
        <View accessibilityRole="alert" className="flex-row items-center gap-2 rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.10)' }}>
            <Ionicons name="alert-circle" size={16} color="#f43f5e" />
            <Text style={{ flex: 1, color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{message}</Text>
            {onRetry ? (
                <Pressable onPress={onRetry} hitSlop={8} style={webPointer}>
                    <Text style={{ color: '#f43f5e', fontFamily: theme.font.bold, fontSize: 12.5 }}>Retry</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function RowActions({ actions, size }: { actions: AdminRowAction[]; size: number }) {
    return (
        <>
            {actions.map((a) => (
                <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} size={size} tone={a.tone === 'danger' ? 'danger' : a.tone === 'primary' ? 'primary' : 'muted'} />
            ))}
        </>
    );
}

/* =========================================================
 * Mobile (cards)
 * ======================================================= */

function MobileList<T, K extends string>(props: AdminListViewProps<T, K>) {
    const { config, query, setQuery, onRefresh, refreshing, sourceTone, onOpenCreate, onPressItem, onEditItem, filters, emptyComponent } = props;
    const { theme, chipBg } = useListTokens();
    const { filtered, hasActiveFilter, clearFilters } = useFilterState(props);
    const [sheetOpen, setSheetOpen] = useState(false);
    const data = props.allItems ?? props.items;
    const total = props.allItems ? props.allItems.length : props.totalItems;

    // Filters other than search live in the sheet; the button shows a dot when any is on.
    const sheetActive = filtered || !!props.toolbarActive;
    const activeOption = filters && filtered ? filters.options.find((o) => o.key === filters.value) : undefined;
    const clearSheetFilters = () => {
        if (filters && filtered) filters.onChange(filters.allKey);
        if (props.toolbarActive) props.onClearToolbar?.();
    };

    const header = (
        <View style={{ paddingBottom: 12 }}>
            {/* Search · filters · add */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <SearchField variant="mobile" value={query} onChangeText={setQuery} placeholder={config.searchPlaceholder ?? `Search ${config.noun[1]}…`} />
                </View>
                <Pressable
                    onPress={() => setSheetOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={sheetActive ? 'Filters and sync, filters applied' : 'Filters and sync'}
                    style={({ pressed }) => ({
                        width: 44,
                        height: 44,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sheetActive ? `${theme.primary}18` : chipBg,
                        opacity: pressed ? 0.8 : 1,
                        ...webPointer,
                    })}
                >
                    <Ionicons name="options-outline" size={19} color={sheetActive ? theme.primary : theme.text} />
                    {sheetActive ? (
                        <View
                            style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: theme.primary,
                                borderWidth: 1.5,
                                borderColor: theme.background,
                            }}
                        />
                    ) : null}
                </Pressable>
                {onOpenCreate ? (
                    <Pressable
                        onPress={onOpenCreate}
                        accessibilityRole="button"
                        accessibilityLabel={config.addLabel ?? `Add ${config.noun[0]}`}
                        style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.primary,
                            opacity: pressed ? 0.85 : 1,
                            ...webPointer,
                        })}
                    >
                        <Ionicons name="add" size={22} color="#fff" />
                    </Pressable>
                ) : null}
            </View>

            {/* One line of context: source dot · count · active filter (tap to clear) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4, gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sourceDotColor(sourceTone) }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {plural(total, config.noun)}
                </Text>
                <View style={{ flex: 1 }} />
                {activeOption ? <ActiveFilterPill label={activeOption.label} onClear={() => filters!.onChange(filters!.allKey)} /> : null}
                {props.toolbarActive ? <ActiveFilterPill label={props.toolbarLabel ?? 'Date'} onClear={() => props.onClearToolbar?.()} /> : null}
            </View>

            {props.error ? (
                <View style={{ marginTop: 12 }}>
                    <ErrorBanner message={props.error} onRetry={onRefresh} />
                </View>
            ) : null}
        </View>
    );

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <FlatList
                data={data}
                keyExtractor={(item, idx) => config.keyOf(item, idx)}
                ListHeaderComponent={header}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                ListEmptyComponent={
                    refreshing && data.length === 0 ? (
                        <LoadingRows />
                    ) : !hasActiveFilter && emptyComponent ? (
                        emptyComponent
                    ) : (
                        <ListEmpty config={config} hasActiveFilter={hasActiveFilter} onClear={clearFilters} onAdd={onOpenCreate} />
                    )
                }
                renderItem={({ item }) => <Card item={item} config={config} onPress={onPressItem} onEdit={onEditItem} actions={props.rowActions?.(item)} />}
                ItemSeparatorComponent={Separator}
                ListFooterComponent={
                    !props.allItems && !props.hidePagination && props.totalPages > 1 ? (
                        <MobilePager page={props.page} totalPages={props.totalPages} onPrev={props.onPrev} onNext={props.onNext} disabled={refreshing} />
                    ) : null
                }
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                windowSize={11}
            />
            {props.footer ? <StickyFooter>{props.footer}</StickyFooter> : null}

            <MobileFiltersSheet
                {...props}
                visible={sheetOpen}
                onClose={() => setSheetOpen(false)}
                resultCount={total}
                anyActive={sheetActive}
                onReset={clearSheetFilters}
            />
        </View>
    );
}

/** Phone filters sheet: stats, filter options, extra filters (e.g. dates), sync + refresh. */
function MobileFiltersSheet<T, K extends string>(
    props: AdminListViewProps<T, K> & { visible: boolean; onClose: () => void; resultCount: number; anyActive: boolean; onReset: () => void }
) {
    const { config, filters, stats, toolbar, toolbarLabel, sourceLabel, sourceTone, lastSyncedTime, refreshing, onRefresh, visible, onClose, resultCount, anyActive, onReset } = props;
    const { theme, chipBg, divider } = useListTokens();
    const wide = useSheetIsWide();

    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title={`Filter ${config.noun[1]}`}
            subtitle={config.title}
            icon="options-outline"
            footer={
                <>
                    <SheetButton label="Reset" variant="ghost" onPress={onReset} disabled={!anyActive} grow={!wide} />
                    <SheetButton label={`Show ${plural(resultCount, config.noun)}`} onPress={onClose} grow={!wide} />
                </>
            }
        >
            {stats && stats.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {stats.map((s) => (
                        <View key={s.label} style={{ flexGrow: 1, flexBasis: 96, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: chipBg }}>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                                {s.label}
                            </Text>
                            <Text style={{ color: s.color ?? theme.text, fontFamily: theme.font.bold, fontSize: 16, marginTop: 2 }} numberOfLines={1}>
                                {s.value}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}

            {filters ? (
                <View style={{ gap: 4 }}>
                    <SheetLabel>Show</SheetLabel>
                    {filters.options.map((o) => {
                        const active = o.key === filters.value;
                        return (
                            <Pressable
                                key={o.key}
                                onPress={() => filters.onChange(o.key)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: active }}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingHorizontal: 12,
                                    paddingVertical: 11,
                                    borderRadius: 16,
                                    backgroundColor: active ? `${theme.primary}14` : pressed ? divider : 'transparent',
                                    ...webPointer,
                                })}
                            >
                                <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: `${theme.primary}14` }}>
                                    <Ionicons name={o.icon ?? 'ellipse-outline'} size={17} color={theme.primary} />
                                </View>
                                <Text style={{ flex: 1, color: active ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{o.label}</Text>
                                {o.count !== undefined ? (
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginRight: 10 }}>{o.count.toLocaleString()}</Text>
                                ) : null}
                                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textDark} />
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}

            {toolbar ? (
                <View style={{ gap: 8 }}>
                    <SheetLabel>{toolbarLabel ?? 'Date'}</SheetLabel>
                    {toolbar}
                </View>
            ) : null}

            {/* Sync status + manual refresh (pull-to-refresh on the list works too) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: divider }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 8, backgroundColor: sourceDotColor(sourceTone) }} />
                <Text style={{ flex: 1, color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                    {sourceLabel || 'Up to date'}
                    {lastSyncedTime ? ` · synced ${lastSyncedTime}` : ''}
                </Text>
                <Pressable
                    onPress={onRefresh}
                    disabled={refreshing}
                    accessibilityRole="button"
                    accessibilityLabel={`Refresh ${config.noun[1]}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: `${theme.primary}14`, opacity: refreshing ? 0.5 : 1, ...webPointer }}
                >
                    <Ionicons name="refresh" size={15} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
                </Pressable>
            </View>
        </AdminSheet>
    );
}

function SheetLabel({ children }: { children: React.ReactNode }) {
    const { theme } = useListTokens();
    return (
        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4, marginBottom: 2 }}>
            {children}
        </Text>
    );
}

/** Prev / next for server-paginated lists on phones. */
function MobilePager({ page, totalPages, onPrev, onNext, disabled }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void; disabled?: boolean }) {
    const { theme } = useListTokens();
    return (
        <View className="flex-row items-center justify-between mt-4">
            <IconButton icon="chevron-back" label="Previous page" onPress={onPrev} disabled={disabled || page <= 1} size={40} tone="primary" />
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                Page {page} of {totalPages}
            </Text>
            <IconButton icon="chevron-forward" label="Next page" onPress={onNext} disabled={disabled || page >= totalPages} size={40} tone="primary" />
        </View>
    );
}

/** Action bar pinned to the bottom of the phone list (above the home indicator). */
function StickyFooter({ children }: { children: React.ReactNode }) {
    const { theme, divider } = useListTokens();
    const insets = useSafeAreaInsets();
    return (
        <View
            style={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 12 + insets.bottom,
                borderTopWidth: 1,
                borderTopColor: divider,
                backgroundColor: theme.panel,
                ...(isWeb ? ({ boxShadow: '0 -4px 16px rgba(15,23,42,0.06)' } as any) : { elevation: 8 }),
            }}
        >
            {children}
        </View>
    );
}

function Separator() {
    return <View style={{ height: 10 }} />;
}

const Card = memo(function Card<T>({
    item,
    config,
    onPress,
    onEdit,
    actions = [],
}: {
    item: T;
    config: AdminListConfig<T>;
    onPress: (item: T) => void;
    onEdit?: (item: T) => void;
    actions?: AdminRowAction[];
}) {
    const { theme, divider, cardBorder, cardShadow } = useListTokens();
    const title = config.titleOf(item);
    const subtitle = config.subtitleOf?.(item);
    const badges = config.badgesOf?.(item) ?? [];
    const meta = config.metaOf?.(item);
    const metric = config.metricOf?.(item);
    const hasMetaRow = badges.length > 0 || !!meta || !!onEdit || actions.length > 0;

    return (
        <Pressable
            onPress={() => onPress(item)}
            // Cards hold action buttons; on web a button role here would nest <button>s.
            accessibilityRole={isWeb ? undefined : 'button'}
            accessibilityLabel={`Open ${title}`}
            style={({ pressed }) => ({
                backgroundColor: theme.panel,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: cardBorder,
                transform: [{ scale: pressed ? 0.985 : 1 }],
                ...cardShadow,
                ...webPointer,
            })}
        >
            <View className="p-4">
                <View className="flex-row items-start gap-3">
                    <AdminAvatarTile avatar={config.avatarOf?.(item)} title={title} size={46} />
                    <View className="flex-1 min-w-0">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15, lineHeight: 20 }}>{title}</Text>
                        {subtitle ? (
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 2, lineHeight: 17 }} numberOfLines={2}>
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                    {metric ? (
                        <View className="items-end">
                            <Text style={{ color: metric.color ?? theme.text, fontFamily: theme.font.bold, fontSize: 17 }} numberOfLines={1}>
                                {metric.value}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{metric.label}</Text>
                        </View>
                    ) : !hasMetaRow ? (
                        <Ionicons name="chevron-forward" size={16} color={theme.textDark} style={{ marginTop: 14 }} />
                    ) : null}
                </View>

                {hasMetaRow ? (
                    <View className="flex-row items-center flex-wrap mt-3 pt-3 gap-2" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                        {badges.map((b, i) => (
                            <AdminBadgePill key={`${b.label}-${i}`} badge={b} />
                        ))}
                        <View className="flex-1" />
                        {meta ? (
                            <View className="flex-row items-center gap-1">
                                <Ionicons name={config.metaIcon ?? 'calendar-outline'} size={12} color={theme.textDark} />
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                    {meta}
                                </Text>
                            </View>
                        ) : null}
                        <RowActions actions={actions} size={28} />
                        {onEdit ? <IconButton icon="create-outline" label={`Edit ${title}`} onPress={() => onEdit(item)} size={28} /> : null}
                        <Ionicons name="chevron-forward" size={16} color={theme.textDark} />
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
}) as <T>(p: { item: T; config: AdminListConfig<T>; onPress: (item: T) => void; onEdit?: (item: T) => void; actions?: AdminRowAction[] }) => React.ReactElement;

function LoadingRows() {
    const { theme, chipBg, cardBorder } = useListTokens();
    return (
        <View style={{ gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
                <View key={i} className="flex-row items-center gap-3 p-4 rounded-[20px] border" style={{ borderColor: cardBorder, backgroundColor: theme.panel, opacity: 1 - i * 0.18 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: chipBg }} />
                    <View className="flex-1" style={{ gap: 8 }}>
                        <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: chipBg }} />
                        <View style={{ height: 10, width: '40%', borderRadius: 5, backgroundColor: chipBg }} />
                    </View>
                </View>
            ))}
        </View>
    );
}

function ListEmpty<T>({ config, hasActiveFilter, onClear, onAdd }: { config: AdminListConfig<T>; hasActiveFilter: boolean; onClear: () => void; onAdd?: () => void }) {
    return hasActiveFilter ? (
        <EmptyState icon="search" title={`No matching ${config.noun[1]}`} message="Try a different search or filter." actionLabel="Clear filters" onAction={onClear} />
    ) : (
        <EmptyState
            icon={config.icon}
            title={config.emptyTitle ?? `No ${config.noun[1]} yet`}
            message={config.emptyMessage}
            actionLabel={onAdd ? (config.addLabel ?? `Add ${config.noun[0]}`) : undefined}
            onAction={onAdd}
        />
    );
}

/* =========================================================
 * Web (table)
 * ======================================================= */

function WebList<T, K extends string>(props: AdminListViewProps<T, K>) {
    const {
        config,
        query,
        setQuery,
        onRefresh,
        refreshing,
        sourceLabel,
        sourceTone,
        lastSyncedTime,
        items,
        emptyComponent,
        onOpenCreate,
        onPressItem,
        onEditItem,
        filters,
        stats,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev,
        onNext,
        onPageSizeChange,
    } = props;
    const { theme, border, headerBg, tableShadow } = useListTokens();
    const { hasActiveFilter, clearFilters } = useFilterState(props);
    const primary = config.primaryColumn ?? { label: config.noun[0], flex: 3 };
    const headerStats = stats ?? [{ label: 'Total', value: totalItems.toLocaleString() }];
    // Room for the edit button and any per-row actions (computed from the first row).
    const extraActions = items.length > 0 && props.rowActions ? props.rowActions(items[0]).length : 0;
    const actionsFlex = 0.4 + (onEditItem ? 0.4 : 0) + extraActions * 0.4;

    return (
        <View className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className="flex-1 w-full self-center px-6 pt-4 pb-4" style={{ maxWidth: LIST_MAX_WIDTH }}>
                {/* ============ Compact header ============ */}
                <View className="flex-row items-center mb-3 gap-3 flex-wrap">
                    <Text className="tracking-tight" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 18 }}>
                        {config.title}
                    </Text>
                    {sourceLabel ? (
                        <View className="flex-row items-center gap-1.5">
                            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceDotColor(sourceTone) }} />
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {sourceLabel}
                                {lastSyncedTime ? ` · ${lastSyncedTime}` : ''}
                            </Text>
                        </View>
                    ) : null}

                    <View className="flex-1" />

                    {headerStats.map((s) => (
                        <StatChip key={s.label} label={s.label} value={s.value} color={s.color} />
                    ))}

                    {onOpenCreate ? (
                        <Pressable
                            onPress={onOpenCreate}
                            accessibilityRole="button"
                            accessibilityLabel={config.addLabel ?? `Add ${config.noun[0]}`}
                            className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg border"
                            style={{ borderColor: theme.primary, backgroundColor: `${theme.primary}12`, ...webPointer }}
                        >
                            <Ionicons name="add" size={15} color={theme.primary} />
                            <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>{config.addLabel ?? 'Add'}</Text>
                        </Pressable>
                    ) : null}
                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        accessibilityRole="button"
                        accessibilityLabel={`Refresh ${config.noun[1]}`}
                        className="flex-row items-center gap-1.5 px-3 h-8 rounded-lg"
                        style={{ backgroundColor: theme.primary, opacity: refreshing ? 0.6 : 1, ...webPointer }}
                    >
                        <Ionicons name="refresh" size={14} color="#fff" />
                        <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 12 }}>
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </Text>
                    </Pressable>
                </View>

                {/* ============ Table card ============ */}
                <View className="flex-1 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.panel, borderColor: border, ...tableShadow }}>
                    {/* Toolbar */}
                    <View className="flex-row flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderBottomColor: border }}>
                        <SearchField value={query} onChangeText={setQuery} placeholder={config.searchPlaceholder ?? `Search ${config.noun[1]}…`} maxWidth={360} />
                        {filters ? <FilterChips options={filters.options} value={filters.value} onChange={filters.onChange} /> : null}
                        {props.toolbar}
                        {hasActiveFilter ? (
                            <Pressable onPress={clearFilters} hitSlop={6} style={webPointer}>
                                <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>Clear</Text>
                            </Pressable>
                        ) : null}
                        <View className="flex-1" />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{plural(totalItems, config.noun)}</Text>
                    </View>

                    {props.error ? (
                        <View className="px-4 pt-3">
                            <ErrorBanner message={props.error} onRetry={onRefresh} />
                        </View>
                    ) : null}

                    {/* Column header */}
                    <View className="flex-row items-center px-5 py-2.5" style={{ backgroundColor: headerBg }}>
                        <HeaderCell flex={primary.flex}>{primary.label}</HeaderCell>
                        {config.columns.map((c) => (
                            <HeaderCell key={c.key} flex={c.flex} align={c.align}>
                                {c.label}
                            </HeaderCell>
                        ))}
                        <View style={{ flex: actionsFlex }} />
                    </View>

                    {/* Rows */}
                    <FlatList
                        data={items}
                        keyExtractor={(item, idx) => config.keyOf(item, idx)}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
                        ListEmptyComponent={
                            refreshing && items.length === 0 ? (
                                <View className="py-16 items-center">
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Loading {config.noun[1]}…</Text>
                                </View>
                            ) : !hasActiveFilter && emptyComponent ? (
                                emptyComponent
                            ) : (
                                <ListEmpty config={config} hasActiveFilter={hasActiveFilter} onClear={clearFilters} onAdd={onOpenCreate} />
                            )
                        }
                        renderItem={({ item, index }) => (
                            <Row item={item} config={config} isFirst={index === 0} primaryFlex={primary.flex} actionsFlex={actionsFlex} onPress={onPressItem} onEdit={onEditItem} actions={props.rowActions?.(item)} />
                        )}
                        showsVerticalScrollIndicator={false}
                    />

                    {props.footer ? <View style={{ borderTopWidth: 1, borderTopColor: border, padding: 12 }}>{props.footer}</View> : null}

                    {totalItems > 0 && !props.hidePagination ? (
                        <View className="px-5 pb-3">
                            <PaginationBar
                                page={page}
                                pageSize={pageSize}
                                totalItems={totalItems}
                                totalPages={totalPages}
                                pageStart={pageStart}
                                pageEnd={pageEnd}
                                onPrev={onPrev}
                                onNext={onNext}
                                onPageSizeChange={onPageSizeChange}
                            />
                        </View>
                    ) : null}
                </View>
            </View>
        </View>
    );
}

function HeaderCell({ flex, align = 'left', children }: { flex: number; align?: 'left' | 'center' | 'right'; children: React.ReactNode }) {
    const { theme } = useListTokens();
    return (
        <Text
            style={{ flex, textAlign: align, color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', paddingRight: 12 }}
            numberOfLines={1}
        >
            {children}
        </Text>
    );
}

function Row<T>({
    item,
    config,
    isFirst,
    primaryFlex,
    actionsFlex,
    onPress,
    onEdit,
    actions = [],
}: {
    item: T;
    config: AdminListConfig<T>;
    isFirst: boolean;
    primaryFlex: number;
    actionsFlex: number;
    onPress: (item: T) => void;
    onEdit?: (item: T) => void;
    actions?: AdminRowAction[];
}) {
    const { theme, rowBorder, hoverBg } = useListTokens();
    const [hovered, setHovered] = useState(false);
    const title = config.titleOf(item);
    const subtitle = config.subtitleOf?.(item);

    return (
        <Pressable
            onPress={() => onPress(item)}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            // Rows hold action buttons; on web a button role here would nest <button>s.
            accessibilityRole={isWeb ? undefined : 'button'}
            accessibilityLabel={`Open ${title}`}
            className="flex-row items-center px-5 py-3"
            style={{ backgroundColor: hovered ? hoverBg : 'transparent', borderTopWidth: isFirst ? 0 : 1, borderTopColor: rowBorder, ...webPointer }}
        >
            <View style={{ flex: primaryFlex, paddingRight: 12 }} className="flex-row items-center gap-3">
                <AdminAvatarTile avatar={config.avatarOf?.(item)} title={title} size={36} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
            </View>

            {config.columns.map((c) => {
                const content = c.render(item);
                return (
                    <View key={c.key} style={{ flex: c.flex, paddingRight: 12, alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start' }}>
                        {typeof content === 'string' || typeof content === 'number' ? <CellText align={c.align}>{content}</CellText> : content}
                    </View>
                );
            })}

            <View style={{ flex: actionsFlex }} className="flex-row items-center justify-end gap-2">
                {actions.length > 0 ? (
                    <View style={{ opacity: hovered ? 1 : 0.55, flexDirection: 'row', gap: 6 }}>
                        <RowActions actions={actions} size={28} />
                    </View>
                ) : null}
                {onEdit ? (
                    <View style={{ opacity: hovered ? 1 : 0.55 }}>
                        <IconButton icon="create-outline" label={`Edit ${title}`} onPress={() => onEdit(item)} size={28} tone={hovered ? 'primary' : 'muted'} />
                    </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={hovered ? theme.primary : theme.textDark} />
            </View>
        </Pressable>
    );
}
