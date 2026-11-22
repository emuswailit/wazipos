// components/stocktakes/StockTakeReportView.tsx
//
// Counted vs book stock for one stock take: totals (matched / short / over /
// not counted, value of the differences) and every counted line. Vendors decide
// per line — set stock to the count, or keep book stock; agents can drop a wrong
// line before the count is submitted so it can be counted again.

import type { CountLine, StockTakeReport } from '@/api/stockTakesApi';
import { useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const n = (v?: string | null) => Number(v ?? 0);
const fmtQty = (v?: string | null) => n(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function StockTakeReportView({
    report,
    mode,
    busyLine,
    onDecide,
    onRemove,
}: {
    report: StockTakeReport;
    mode: 'agent' | 'vendor' | 'admin';
    busyLine?: string | null;
    onDecide?: (line: CountLine, decision: 'APPLY' | 'KEEP') => void;
    onRemove?: (line: CountLine) => void;
}) {
    const { theme, border, chipBg } = useListTokens();
    const [showUncounted, setShowUncounted] = useState(false);
    const s = report.summary;
    const tile = (label: string, value: string, color?: string) => (
        <View style={{ flexGrow: 1, flexBasis: 120, padding: 10, borderRadius: 12, backgroundColor: chipBg, gap: 2 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{label}</Text>
            <Text style={{ color: color ?? theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{value}</Text>
        </View>
    );

    return (
        <View style={{ gap: 10 }}>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {tile('Counted', String(s.counted))}
                {tile('Matched', String(s.matched), '#10b981')}
                {tile('Short', `${s.short} · ${formatKES(Math.abs(n(s.value_short)))}`, s.short ? '#f43f5e' : undefined)}
                {tile('Over', `${s.over} · ${formatKES(s.value_over)}`, s.over ? '#f59e0b' : undefined)}
                {tile('Net difference', formatKES(s.net_value), n(s.net_value) < 0 ? '#f43f5e' : undefined)}
                {s.uncounted ? tile('Not counted', String(s.uncounted), '#f59e0b') : null}
                {s.found ? tile('Not on the books', `${s.found} · ${formatKES(s.found_value ?? '0')}`, '#f43f5e') : null}
            </View>

            {report.found?.length ? (
                <View style={{ gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f43f5e55', backgroundColor: '#f43f5e0d' }}>
                    <Text style={{ color: '#f43f5e', fontFamily: theme.font.bold, fontSize: 13 }}>
                        Found on the premises but not on your books
                    </Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        These are not added to your stock. Goods you never bought are often someone's own stock being sold in your shop.
                    </Text>
                    {report.found.map((f) => (
                        <View key={f.id} style={{ flexDirection: 'row', gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: border }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{f.title} × {fmtQty(f.quantity)}</Text>
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                    {[f.barcode && `barcode ${f.barcode}`, f.batch_number && `batch ${f.batch_number}`, f.where_found, f.note, f.recorded_by && `by ${f.recorded_by}`].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                            {f.value_seen ? <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{formatKES(f.value_seen)}</Text> : null}
                        </View>
                    ))}
                </View>
            ) : null}

            {report.lines.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Nothing counted yet.</Text>
            ) : null}
            {report.lines.map((l) => {
                const v = n(l.variance);
                const color = v === 0 ? '#10b981' : v < 0 ? '#f43f5e' : '#f59e0b';
                return (
                    <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: border }}>
                        <View style={{ flex: 1, gap: 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>{l.title}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={2}>
                                Book {fmtQty(l.book_quantity)} · counted {fmtQty(l.counted_quantity)} {l.unit}
                                {l.counted_by ? ` · by ${l.counted_by}` : ''}
                                {l.note ? ` · “${l.note}”` : ''}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 13.5 }}>{v > 0 ? `+${fmtQty(l.variance)}` : fmtQty(l.variance)}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>{formatKES(l.variance_value)}</Text>
                        </View>
                        {mode === 'vendor' && l.decision === 'PENDING' && onDecide ? (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                                <Chip label="Apply" icon="checkmark" color={theme.primary} busy={busyLine === l.id} onPress={() => onDecide(l, 'APPLY')} />
                                <Chip label="Keep" icon="close" color={theme.textDark} busy={busyLine === l.id} onPress={() => onDecide(l, 'KEEP')} />
                            </View>
                        ) : l.decision && l.decision !== 'PENDING' ? (
                            <Text style={{ color: l.decision === 'APPLIED' ? '#10b981' : theme.textDark, fontFamily: theme.font.bold, fontSize: 11.5, minWidth: 64, textAlign: 'right' }}>
                                {l.decision === 'APPLIED' ? 'Applied' : 'Kept book'}
                            </Text>
                        ) : mode === 'agent' && onRemove ? (
                            <Chip label="Recount" icon="refresh" color="#f43f5e" busy={busyLine === l.id} onPress={() => onRemove(l)} />
                        ) : null}
                    </View>
                );
            })}

            {report.uncounted.length ? (
                <View style={{ gap: 6 }}>
                    <Pressable onPress={() => setShowUncounted((x) => !x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={showUncounted ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.textDark} />
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 12.5 }}>
                            {report.uncounted.length} item{report.uncounted.length === 1 ? '' : 's'} in stock but not counted
                        </Text>
                    </Pressable>
                    {showUncounted
                        ? report.uncounted.map((u) => (
                            <Text key={`${u.kind}-${u.item}`} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, paddingLeft: 20 }}>
                                {u.title} — book {fmtQty(u.book_quantity)} {u.unit}
                            </Text>
                        ))
                        : null}
                </View>
            ) : null}
        </View>
    );
}

function Chip({ label, icon, color, busy, onPress }: { label: string; icon: any; color: string; busy?: boolean; onPress: () => void }) {
    const { theme, border } = useListTokens();
    return (
        <Pressable
            disabled={busy}
            onPress={onPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: border, opacity: busy ? 0.5 : 1 }}
        >
            <Ionicons name={icon} size={13} color={color} />
            <Text style={{ color, fontFamily: theme.font.bold, fontSize: 12 }}>{label}</Text>
        </Pressable>
    );
}
