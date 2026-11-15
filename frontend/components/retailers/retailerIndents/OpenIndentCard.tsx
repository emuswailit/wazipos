// components/retailers/retailerIndents/OpenIndentCard.tsx
//
// Top of the indents list: the indent the retailer is building right now.
// A retailer has one open indent at a time — it fills from the wholesale
// marketplace and is then submitted (each wholesaler's items become one
// order). This card shows its size, value, budget and wholesalers, with the
// two next steps: keep adding products, or review and submit.
// With no open indent it points to the marketplace instead.
// Mobile first: stacked with full-width buttons; side by side on wide screens.

import { AdminBadgePill, SheetButton, useListTokens } from '@/components/common/listScreen';
import type { RetailerIndent } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { budgetPct, formatKES, groupItemsByWholesaler, hasBudgetSet, indentTitle, isDraftIndent, isOverBudget } from './indentsConfig';

const WIDE = 720;

interface Props {
    indent: RetailerIndent | null;
    pendingOpCount: number;
    onAddProducts: () => void;
    onReview: (indent: RetailerIndent) => void;
}

export function OpenIndentCard({ indent, pendingOpCount, onAddProducts, onReview }: Props) {
    const { theme, cardBorder, cardShadow, divider, chipBg } = useListTokens();
    const { width } = useWindowDimensions();
    const wide = width >= WIDE;

    if (!indent) {
        return (
            <View className="rounded-2xl border p-4 flex-row items-center gap-3" style={{ backgroundColor: theme.panel, borderColor: cardBorder, ...cardShadow }}>
                <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                    <Ionicons name="cart-outline" size={20} color={theme.primary} />
                </View>
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>No open indent</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, marginTop: 1 }}>
                        Add products from wholesalers to start one.
                    </Text>
                </View>
                <SheetButton label={wide ? 'Browse wholesalers' : 'Browse'} icon="storefront-outline" onPress={onAddProducts} />
            </View>
        );
    }

    const items = indent.retailer_indent_items ?? [];
    const groups = groupItemsByWholesaler(items);
    const draft = isDraftIndent(indent);
    const over = isOverBudget(indent);
    const pct = budgetPct(indent);
    const accent = over ? '#f43f5e' : theme.primary;

    const summary = (
        <View className="flex-1 min-w-0" style={{ gap: 10 }}>
            <View className="flex-row items-center gap-2 flex-wrap">
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>OPEN INDENT</Text>
                {draft ? <AdminBadgePill badge={{ label: 'Draft', tone: 'warning', icon: 'cloud-upload-outline' }} /> : null}
                {over ? <AdminBadgePill badge={{ label: 'Over budget', tone: 'danger', icon: 'alert-circle' }} /> : null}
                {pendingOpCount > 0 ? <AdminBadgePill badge={{ label: `${pendingOpCount} waiting to upload`, tone: 'warning' }} /> : null}
            </View>

            <View className="flex-row items-end justify-between gap-3 flex-wrap">
                <View className="min-w-0 flex-shrink">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{formatKES(indent.total_cost)}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }} numberOfLines={1}>
                        {indentTitle(indent)} · {items.length} item{items.length === 1 ? '' : 's'} · {groups.length} wholesaler{groups.length === 1 ? '' : 's'}
                    </Text>
                </View>
                {Number(indent.total_profit) > 0 ? (
                    <View className="items-end">
                        <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(indent.total_profit)}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }}>est. profit</Text>
                    </View>
                ) : null}
            </View>

            {hasBudgetSet(indent) ? (
                <View style={{ gap: 4 }}>
                    <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: divider }}>
                        <View style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, height: '100%', backgroundColor: accent, borderRadius: 999 }} />
                    </View>
                    <Text style={{ color: over ? '#f43f5e' : theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                        {(pct ?? 0).toFixed(0)}% of {formatKES(indent.budget_amount)} budget
                    </Text>
                </View>
            ) : null}

            {groups.length ? (
                <View className="flex-row flex-wrap gap-1.5">
                    {groups.slice(0, 4).map((g) => (
                        <View key={g.key} className="flex-row items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: chipBg }}>
                            <Ionicons name="business-outline" size={11} color={theme.textDark} />
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 11 }} numberOfLines={1}>
                                {g.title} · {g.items.length}
                            </Text>
                        </View>
                    ))}
                    {groups.length > 4 ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, alignSelf: 'center' }}>+{groups.length - 4} more</Text>
                    ) : null}
                </View>
            ) : null}
        </View>
    );

    const actions = (
        <View className={wide ? 'gap-2' : 'flex-row gap-2'} style={wide ? { width: 200 } : undefined}>
            <SheetButton label="Add products" icon="add-circle-outline" variant="secondary" onPress={onAddProducts} grow={!wide} />
            <SheetButton label="Review & submit" icon="paper-plane-outline" onPress={() => onReview(indent)} disabled={!items.length} grow={!wide} />
        </View>
    );

    return (
        <View
            className={`rounded-2xl border p-4 ${wide ? 'flex-row items-center gap-5' : 'gap-4'}`}
            style={{ backgroundColor: theme.panel, borderColor: over ? 'rgba(244,63,94,0.35)' : cardBorder, ...cardShadow }}
        >
            {summary}
            {actions}
        </View>
    );
}

export default OpenIndentCard;
