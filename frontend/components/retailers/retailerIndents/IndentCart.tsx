// components/retailers/retailerIndents/IndentCart.tsx
//
// An indent shown like a shopping cart: items grouped by wholesaler (each
// group becomes one retailer order on close), editable while the indent is
// open, with a pinned footer — total, budget, and "Close indent & place
// orders". Orders are paid separately afterwards (retailer orders screen).
//
// Used as the left pane of the indents screen on wide screens, and full
// screen (IndentCartScreen) on phones.
//
// Editing rules
//   - Open indent, item on the server -> quantity stepper + remove.
//   - Item still uploading (no remote_id), draft indent, or closed indent
//     -> read-only (the server can't edit what it doesn't have yet).
//   - Quantity changes are saved ~0.5 s after the last tap.

import { AdminAvatarTile, AdminBadgePill, SheetButton, useListTokens, webPointer } from '@/components/common/listScreen';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type { RetailerIndent, RetailerIndentItem } from '@/databases/types';
import { confirmCloseIndent, useIndentBridge } from '@/hooks/useIndentBridge';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Pressable } from '@/components/common/StablePressable';

import {
    budgetPct,
    formatKES,
    groupItemsByWholesaler,
    hasBudgetSet,
    indentTitle,
    isDraftIndent,
    isOverBudget,
    isPendingItem,
    itemLineTotal,
    itemUnitCost,
    pendingItems,
    toBool,
} from './indentsConfig';

const SAVE_DELAY_MS = 500;

function confirmRemove(title: string): Promise<boolean> {
    const message = `Remove ${title} from this indent?`;
    if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
    return new Promise((resolve) =>
        Alert.alert('Remove item', message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) }),
    );
}

const itemKey = (it: RetailerIndentItem, idx: number) => it.remote_id ?? it.draft_id ?? String(it.id ?? idx);

interface Props {
    indent: RetailerIndent | null;
    /** Opens the full details (parameters, edit indent settings). */
    onShowDetails?: (indent: RetailerIndent) => void;
    /** Go to the wholesale marketplace. */
    onAddProducts?: () => void;
    /** Shown as a close (×) button in the header, e.g. on phones. */
    onDismiss?: () => void;
    /** Bottom safe-area padding for the pinned footer. */
    bottomInset?: number;
}

export function IndentCart({ indent, onShowDetails, onAddProducts, onDismiss, bottomInset = 0 }: Props) {
    const { theme, divider, cardBorder, chipBg } = useListTokens();
    const { updateIndentItem, removeOfferFromIndent, pendingIndentOpCount, flushPendingOps } = useRetailerIndentsSync();
    const { closeOpenIndent, currentOpenIndent } = useIndentBridge();

    const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
    const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
    const [closing, setClosing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        setQtyDraft({});
        setError(null);
        setNotice(null);
        return () => Object.values(timers.current).forEach(clearTimeout);
    }, [indent?.remote_id]);

    const items = useMemo(() => indent?.retailer_indent_items ?? [], [indent]);
    const groups = useMemo(() => groupItemsByWholesaler(items), [items]);

    if (!indent) {
        return (
            <View className="flex-1 items-center justify-center p-8" style={{ gap: 10 }}>
                <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: `${theme.primary}14` }}>
                    <Ionicons name="cart-outline" size={26} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>No open indent</Text>
                <Text className="text-center" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    Add products from wholesalers to start one, or pick an indent from the list.
                </Text>
                {onAddProducts ? <SheetButton label="Browse wholesalers" icon="storefront-outline" onPress={onAddProducts} /> : null}
            </View>
        );
    }

    const isOpen = toBool(indent.is_open);
    const draft = isDraftIndent(indent);
    const isCurrent = !!currentOpenIndent && currentOpenIndent.remote_id === indent.remote_id;
    const canEdit = isOpen && !draft && !closing;
    const waiting = pendingItems(indent).length;
    const over = isOverBudget(indent);
    const pct = budgetPct(indent);

    // Totals follow the edits immediately (server totals refresh after save).
    const lineTotalOf = (it: RetailerIndentItem, key: string) => {
        const q = qtyDraft[key];
        if (q === undefined) return itemLineTotal(it);
        return (itemUnitCost(it) ?? 0) * q;
    };
    const total = items.reduce((sum, it, idx) => sum + lineTotalOf(it, itemKey(it, idx)), 0);

    const saveQty = (it: RetailerIndentItem, key: string, qty: number) => {
        setQtyDraft((d) => ({ ...d, [key]: qty }));
        clearTimeout(timers.current[key]);
        timers.current[key] = setTimeout(async () => {
            setSavingIds((s) => ({ ...s, [key]: true }));
            setError(null);
            const res = await updateIndentItem({ indentId: indent.remote_id, itemId: it.remote_id!, required_quantity: qty });
            setSavingIds((s) => ({ ...s, [key]: false }));
            if (res.ok) {
                setQtyDraft((d) => {
                    const { [key]: _done, ...rest } = d;
                    return rest;
                });
            } else {
                setError(res.message || res.errors?.[0] || 'Quantity not saved.');
                setQtyDraft((d) => {
                    const { [key]: _failed, ...rest } = d;
                    return rest; // fall back to the saved quantity
                });
            }
        }, SAVE_DELAY_MS);
    };

    const remove = async (it: RetailerIndentItem, key: string, title: string) => {
        if (!(await confirmRemove(title))) return;
        setSavingIds((s) => ({ ...s, [key]: true }));
        setError(null);
        const res = await removeOfferFromIndent({ indentId: indent.remote_id, itemId: it.remote_id ?? it.draft_id ?? '' });
        setSavingIds((s) => ({ ...s, [key]: false }));
        if (!res.ok) setError(res.message || res.errors?.[0] || 'Item not removed.');
    };

    const close = async () => {
        setError(null);
        setNotice(null);
        if (!(await confirmCloseIndent(items.length, formatKES(total)))) return;
        setClosing(true);
        try {
            const res = await closeOpenIndent();
            if (res.ok) setNotice(`${res.message} Pay for them from Retailer orders.`);
            else setError(res.message);
        } catch (e: any) {
            setError(e?.message ?? 'Could not close the indent.');
        } finally {
            setClosing(false);
        }
    };

    /* ---------------- header ---------------- */
    const header = (
        <View className="flex-row items-center gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: divider }}>
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${isOpen ? '#10b981' : '#64748b'}18` }}>
                <Ionicons name={isOpen ? 'cart' : 'receipt-outline'} size={19} color={isOpen ? '#10b981' : '#64748b'} />
            </View>
            <View className="flex-1 min-w-0">
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>
                    {isOpen ? 'Open indent' : indentTitle(indent)}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                    {isOpen ? `${indentTitle(indent)} · ` : 'Closed · '}
                    {items.length} item{items.length === 1 ? '' : 's'} · {groups.length} wholesaler{groups.length === 1 ? '' : 's'}
                </Text>
            </View>
            {onShowDetails ? (
                <Pressable onPress={() => onShowDetails(indent)} accessibilityRole="button" accessibilityLabel="Indent details" hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: chipBg, ...webPointer }}>
                    <Ionicons name="information-circle-outline" size={19} color={theme.text} />
                </Pressable>
            ) : null}
            {onDismiss ? (
                <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close cart" hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: chipBg, ...webPointer }}>
                    <Ionicons name="close" size={19} color={theme.text} />
                </Pressable>
            ) : null}
        </View>
    );

    /* ---------------- items ---------------- */
    const renderItem = (it: RetailerIndentItem, idx: number, last: boolean) => {
        const key = itemKey(it, idx);
        const anyIt: any = it;
        const title = it.wholesale_receipt_title || anyIt.product_title || 'Untitled product';
        const qty = qtyDraft[key] ?? Number(it.required_quantity ?? 0);
        const unit = itemUnitCost(it);
        const pending = isPendingItem(it);
        const editable = canEdit && !pending;
        const saving = !!savingIds[key];
        const bonus = Number(it.bonus_quantity_earned ?? 0);
        const discount = it.wholesaler_price_discount_title || it.wholesaler_quantity_discount_title;

        return (
            <View key={key} className="flex-row gap-3 p-3" style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: divider, opacity: saving ? 0.6 : 1 }}>
                <AdminAvatarTile avatar={{ uri: resolveImageUrl(anyIt.images?.[0]), icon: 'cube-outline' }} title={title} size={52} />
                <View className="flex-1 min-w-0" style={{ gap: 3 }}>
                    {/* Full title */}
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5, lineHeight: 18 }}>{title}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {unit !== null ? formatKES(unit) : '—'}
                        {anyIt.unit_of_receipt ? ` / ${anyIt.unit_of_receipt}` : ' each'}
                    </Text>
                    {pending || bonus > 0 || discount ? (
                        <View className="flex-row flex-wrap gap-1.5">
                            {pending ? <AdminBadgePill badge={{ label: 'Uploading', tone: 'warning', icon: 'cloud-upload-outline' }} /> : null}
                            {bonus > 0 ? <AdminBadgePill badge={{ label: `+${bonus.toLocaleString()} free`, tone: 'success' }} /> : null}
                            {discount ? <AdminBadgePill badge={{ label: discount, tone: 'violet' }} /> : null}
                        </View>
                    ) : null}

                    <View className="flex-row items-center justify-between mt-1.5 gap-2">
                        {editable ? (
                            <View className="flex-row items-center rounded-full" style={{ backgroundColor: chipBg }}>
                                <StepButton icon={qty <= 1 ? 'trash-outline' : 'remove'} danger={qty <= 1} disabled={saving} onPress={() => (qty <= 1 ? remove(it, key, title) : saveQty(it, key, qty - 1))} label={qty <= 1 ? `Remove ${title}` : 'Fewer'} />
                                <Text style={{ minWidth: 34, textAlign: 'center', color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{qty.toLocaleString()}</Text>
                                <StepButton icon="add" disabled={saving} onPress={() => saveQty(it, key, qty + 1)} label="More" />
                            </View>
                        ) : (
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>× {qty.toLocaleString()}</Text>
                        )}
                        <View className="flex-row items-center gap-2">
                            {saving ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>{formatKES(lineTotalOf(it, key))}</Text>
                        </View>
                    </View>
                </View>
                {editable && qty > 1 ? (
                    <Pressable onPress={() => remove(it, key, title)} accessibilityRole="button" accessibilityLabel={`Remove ${title}`} hitSlop={8} style={{ alignSelf: 'flex-start', padding: 4, ...webPointer }}>
                        <Ionicons name="trash-outline" size={17} color="#e11d48" />
                    </Pressable>
                ) : null}
            </View>
        );
    };

    const body = (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
            {!isOpen ? <Notice tone="info" text="This indent is closed: its items became retailer orders. Pay for them from Retailer orders." /> : null}
            {draft ? <Notice tone="warning" text="Draft: this indent isn't on the server yet. Items can be edited once it has uploaded." /> : null}
            {isOpen && waiting > 0 ? (
                <Notice
                    tone="warning"
                    text={`${waiting} item${waiting === 1 ? ' is' : 's are'} still uploading. You can close the indent once ${waiting === 1 ? 'it has' : 'they have'} uploaded.`}
                    action={pendingIndentOpCount > 0 ? { label: 'Retry upload', onPress: () => void flushPendingOps() } : undefined}
                />
            ) : null}
            {items.length === 0 ? (
                <Text className="text-center py-8" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    No items yet.
                </Text>
            ) : (
                groups.map((g) => (
                    <View key={g.key} className="rounded-2xl border overflow-hidden" style={{ borderColor: cardBorder, backgroundColor: theme.panel }}>
                        <View className="flex-row items-center gap-2 px-3 py-2.5" style={{ backgroundColor: chipBg }}>
                            <Ionicons name="business-outline" size={14} color={theme.primary} />
                            <Text className="flex-1" style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }} numberOfLines={1}>
                                {g.title}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                                {isOpen ? '1 order · ' : ''}
                                {formatKES(g.items.reduce((s, it) => s + lineTotalOf(it, itemKey(it, items.indexOf(it))), 0))}
                            </Text>
                        </View>
                        {g.items.map((it, i) => renderItem(it, items.indexOf(it), i === g.items.length - 1))}
                    </View>
                ))
            )}
            {isOpen && onAddProducts ? (
                <Pressable onPress={onAddProducts} accessibilityRole="button" className="flex-row items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed" style={{ borderColor: cardBorder, ...webPointer }}>
                    <Ionicons name="add-circle-outline" size={17} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>Add more products</Text>
                </Pressable>
            ) : null}
        </ScrollView>
    );

    /* ---------------- footer ---------------- */
    const closeBlocked = !isCurrent || !items.length || waiting > 0 || draft;
    const footer = (
        <View className="px-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: divider, paddingBottom: 12 + bottomInset, gap: 10, backgroundColor: theme.panel }}>
            {error ? <Notice tone="danger" text={error} /> : null}
            {notice ? <Notice tone="success" text={notice} /> : null}
            {hasBudgetSet(indent) ? (
                <View style={{ gap: 4 }}>
                    <View className="flex-row justify-between">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>Budget {formatKES(indent.budget_amount)}</Text>
                        <Text style={{ color: over ? '#f43f5e' : theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>{(pct ?? 0).toFixed(0)}%</Text>
                    </View>
                    <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: divider }}>
                        <View style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, height: '100%', backgroundColor: over ? '#f43f5e' : theme.primary, borderRadius: 999 }} />
                    </View>
                </View>
            ) : null}
            <View className="flex-row items-end justify-between">
                <View>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>TOTAL</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{formatKES(total)}</Text>
                </View>
                {Number(indent.total_profit) > 0 ? (
                    <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 12.5 }}>est. profit {formatKES(indent.total_profit)}</Text>
                ) : null}
            </View>
            {isOpen ? (
                <SheetButton
                    label={`Close indent & place ${groups.length > 1 ? `${groups.length} orders` : 'order'}`}
                    icon="paper-plane-outline"
                    onPress={close}
                    loading={closing}
                    loadingLabel="Placing orders…"
                    disabled={closeBlocked || closing}
                    grow
                />
            ) : null}
        </View>
    );

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            {header}
            {body}
            {footer}
        </View>
    );
}

function StepButton({ icon, onPress, disabled, danger, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; danger?: boolean; label: string }) {
    const { theme } = useListTokens();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={4}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1, ...webPointer })}
        >
            <Ionicons name={icon} size={16} color={danger ? '#e11d48' : theme.text} />
        </Pressable>
    );
}

const TONES = {
    danger: { fg: '#e11d48', bg: 'rgba(244,63,94,0.08)', icon: 'alert-circle' as const },
    success: { fg: '#059669', bg: 'rgba(16,185,129,0.10)', icon: 'checkmark-circle' as const },
    warning: { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', icon: 'cloud-upload-outline' as const },
    info: { fg: '#2563eb', bg: 'rgba(59,130,246,0.08)', icon: 'information-circle' as const },
};

function Notice({ tone, text, action }: { tone: keyof typeof TONES; text: string; action?: { label: string; onPress: () => void } }) {
    const { theme } = useListTokens();
    const t = TONES[tone];
    return (
        <View className="flex-row items-start gap-2 rounded-xl p-3" style={{ backgroundColor: t.bg }}>
            <Ionicons name={t.icon} size={16} color={t.fg} style={{ marginTop: 1 }} />
            <Text className="flex-1" style={{ color: t.fg, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                {text}
            </Text>
            {action ? (
                <Pressable onPress={action.onPress} hitSlop={6} style={webPointer}>
                    <Text style={{ color: t.fg, fontFamily: theme.font.bold, fontSize: 12.5 }}>{action.label}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export default IndentCart;
