// components/retailers/reports/ReportKit.tsx
//
// Shared parts for the retailer reports. Each report is an AdminListView (cards on
// phones, table on wide screens) whose rows are the report's main lines, with:
//   - stats    → the headline numbers
//   - header   → period picker + breakdown cards (by payment method, category…)
//   - details  → DetailsDock / ConfigDetailsSheet
// Reports are kept on the device per filter, so the last one opens offline.

import { DateRangeFilter, FilterChips, useListTokens } from '@/components/common/listScreen';
import { useCachedList } from '@/hooks/useCachedList';
import { Ionicons } from '@expo/vector-icons';
import type { ApiResponse } from 'apisauce';
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* --------------------------------------------------------------- format */

export const money = (v: unknown) => `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const num = (v: unknown) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const pct = (v: unknown) => `${Number(v || 0).toFixed(1)}%`;
export const titleCase = (s?: string | null) =>
    String(s || '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
export const matches = (q: string, ...parts: unknown[]) => !q.trim() || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase());

/* --------------------------------------------------------------- data */

/** Loads one report (the `report` object in the reply), cached per `key`. */
export function useReport<R>(key: string, fetch: () => Promise<ApiResponse<any>>, enabled = true) {
    const list = useCachedList<R>({ key: `report:${key}`, fetch, pick: (d) => (d?.report ? [d.report] : []), enabled });
    return { ...list, report: (list.items[0] ?? null) as R | null };
}

/** Wide screens get the table; phones the cards. */
export function useVariant(): 'web' | 'mobile' {
    const { width } = useWindowDimensions();
    return width >= 768 ? 'web' : 'mobile';
}

/* --------------------------------------------------------------- period */

export type Period = 'TODAY' | '7D' | '30D' | 'MONTH' | 'LAST_MONTH' | 'YEAR' | 'CUSTOM';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodRange(p: Period): { from: string; to: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const ago = (n: number) => iso(new Date(y, m, now.getDate() - n));
    switch (p) {
        case 'TODAY':
            return { from: iso(now), to: iso(now) };
        case '7D':
            return { from: ago(6), to: iso(now) };
        case '30D':
            return { from: ago(29), to: iso(now) };
        case 'MONTH':
            return { from: iso(new Date(y, m, 1)), to: iso(now) };
        case 'LAST_MONTH':
            return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
        case 'YEAR':
            return { from: iso(new Date(y, 0, 1)), to: iso(now) };
        default:
            return { from: '', to: '' };
    }
}

const PERIOD_LABELS: Record<Period, string> = {
    TODAY: 'Today',
    '7D': '7 days',
    '30D': '30 days',
    MONTH: 'This month',
    LAST_MONTH: 'Last month',
    YEAR: 'This year',
    CUSTOM: 'Custom',
};

/** Period state: a preset, or custom dates. */
export function usePeriod(initial: Period) {
    const [period, setPeriodState] = React.useState<Period>(initial);
    const [range, setRange] = React.useState(periodRange(initial));
    const setPeriod = (p: Period) => {
        setPeriodState(p);
        if (p !== 'CUSTOM') setRange(periodRange(p));
    };
    return {
        period,
        from: range.from,
        to: range.to,
        setPeriod,
        setFrom: (from: string) => {
            setPeriodState('CUSTOM');
            setRange((r) => ({ ...r, from }));
        },
        setTo: (to: string) => {
            setPeriodState('CUSTOM');
            setRange((r) => ({ ...r, to }));
        },
    };
}

export function PeriodBar({
    state,
    options = ['TODAY', '7D', 'MONTH', 'LAST_MONTH', 'YEAR', 'CUSTOM'],
}: {
    state: ReturnType<typeof usePeriod>;
    options?: Period[];
}) {
    const variant = useVariant();
    return (
        <View style={{ gap: 8 }}>
            <FilterChips<Period> options={options.map((k) => ({ key: k, label: PERIOD_LABELS[k], icon: k === 'CUSTOM' ? 'calendar-outline' : undefined }))} value={state.period} onChange={state.setPeriod} />
            {state.period === 'CUSTOM' ? <DateRangeFilter from={state.from} to={state.to} onFromChange={state.setFrom} onToChange={state.setTo} variant={variant} /> : null}
        </View>
    );
}

/** Chips for a numeric window (e.g. "cover 30 days"). */
export function DaysChips({ label, value, onChange, options }: { label: string; value: number; onChange: (n: number) => void; options: number[] }) {
    const { theme } = useListTokens();
    return (
        <View style={{ gap: 6 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
            <FilterChips<string> options={options.map((n) => ({ key: String(n), label: `${n} days` }))} value={String(value)} onChange={(k) => onChange(Number(k))} />
        </View>
    );
}

/* --------------------------------------------------------------- cards */

export interface BreakdownRow {
    label: string;
    value: string;
    sub?: string;
    /** 0–1 share, drawn as a bar under the row. */
    share?: number;
    color?: string;
}

/** A titled card of label → value lines, optionally with share bars. */
export function BreakdownCard({ title, icon, rows, empty = 'Nothing in this period.', accent }: { title: string; icon: IconName; rows: BreakdownRow[]; empty?: string; accent?: string }) {
    const { theme, cardBorder, cardShadow, divider } = useListTokens();
    const tint = accent || theme.primary;
    return (
        <View style={{ flexGrow: 1, flexBasis: 280, minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: cardBorder, backgroundColor: theme.panel, padding: 14, gap: 10, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}18` }}>
                    <Ionicons name={icon} size={15} color={tint} />
                </View>
                <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                    {title}
                </Text>
            </View>
            {rows.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>{empty}</Text>
            ) : (
                rows.map((r, i) => (
                    <View key={`${r.label}-${i}`} style={{ gap: 5, paddingTop: i ? 8 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: divider }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    {r.label}
                                </Text>
                                {r.sub ? (
                                    <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                        {r.sub}
                                    </Text>
                                ) : null}
                            </View>
                            <Text style={{ color: r.color || theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{r.value}</Text>
                        </View>
                        {r.share !== undefined ? (
                            <View style={{ height: 5, borderRadius: 3, backgroundColor: `${tint}14`, overflow: 'hidden' }}>
                                <View style={{ width: `${Math.max(2, Math.min(100, r.share * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: r.color || tint }} />
                            </View>
                        ) : null}
                    </View>
                ))
            )}
        </View>
    );
}

/** Rows with share bars, sized against the largest value. */
export function shareRows<T>(items: T[], valueOf: (t: T) => number, row: (t: T) => Omit<BreakdownRow, 'share'>): BreakdownRow[] {
    const max = Math.max(1, ...items.map(valueOf));
    return items.map((t) => ({ ...row(t), share: valueOf(t) / max }));
}

/** Header layout: controls on top, then cards that wrap to columns on wide screens. */
export function ReportHeader({ controls, children, note }: { controls?: React.ReactNode; children?: React.ReactNode; note?: string | null }) {
    const { theme } = useListTokens();
    return (
        <View style={{ gap: 12 }}>
            {controls ? <View style={{ gap: 10 }}>{controls}</View> : null}
            {note ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {note}
                </Text>
            ) : null}
            {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View> : null}
        </View>
    );
}

/** A big headline line, e.g. net profit. */
export function HeadlineCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: IconName }) {
    const { theme, cardBorder, cardShadow } = useListTokens();
    const tint = color || theme.primary;
    return (
        <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0, borderRadius: 18, borderWidth: 1, borderColor: cardBorder, backgroundColor: theme.panel, padding: 14, gap: 4, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={icon} size={14} color={tint} />
                <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {label}
                </Text>
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: tint, fontFamily: theme.font.bold, fontSize: 22, letterSpacing: -0.4 }}>
                {value}
            </Text>
            {sub ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>{sub}</Text> : null}
        </View>
    );
}
