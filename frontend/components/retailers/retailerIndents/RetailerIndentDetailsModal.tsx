// components/retailers/retailerIndents/RetailerIndentDetailsModal.tsx
//
// Indent details on the shared details sheet: parameters, budget, line items,
// and the two actions — Edit indent and Submit orders.
//
// Drafts (ids `<user>:<entity>:<ts>`, not yet on the server) cannot be edited:
// the draft id cannot be sent to the API. Submitting a draft routes through the
// offline queue, which creates the indent on the server, flushes pending items
// and closes it. `closeIndent` reports failure without distinguishing "queued
// for retry" from "rejected", so the raw message is shown either way.

import { AdminAvatarTile, AdminBadgePill, AdminDetailsSheet, SheetButton, formatDate, textOr, useListTokens, useSheetIsWide, webPointer } from '@/components/common/listScreen';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import type { RetailerIndent, RetailerIndentItem } from '@/databases/types';
import { resolveImageUrl } from '@/lib/images';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { budgetPct, campaignTitleOf, formatKES, hasBudgetSet, indentBadges, indentTitle, isDraftIndent, toBool } from './indentsConfig';

interface Props {
    visible: boolean;
    indent: RetailerIndent | null;
    onClose: () => void;
    onOpenEditItem?: (itemId: string) => void;
    onUpdateIndent?: () => void;
}

interface Banner {
    kind: 'error' | 'success';
    title: string;
    detail?: string;
}

/** How long the success banner stays up before the sheet closes. */
const SUCCESS_BANNER_MS = 1200;

export function RetailerIndentDetailsModal({ visible, indent, onClose, onOpenEditItem, onUpdateIndent }: Props) {
    const wide = useSheetIsWide();
    const { closeIndent, pendingIndentOpCount } = useRetailerIndentsSync();

    const [closing, setClosing] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [banner, setBanner] = useState<Banner | null>(null);

    const items = useMemo(() => indent?.retailer_indent_items ?? [], [indent]);

    useEffect(() => {
        if (!visible) return;
        setClosing(false);
        setConfirmSubmit(false);
        setBanner(null);
    }, [visible, indent?.remote_id]);

    if (!indent) {
        return <AdminDetailsSheet visible={false} onClose={onClose} heading="" icon="document-text-outline" title="" sections={[]} />;
    }

    const isOpen = toBool(indent.is_open);
    const isDraft = isDraftIndent(indent);
    const busy = closing;
    const canEdit = isOpen && !isDraft && !busy;
    const pct = budgetPct(indent);
    const campaign = campaignTitleOf(indent);

    const performSubmit = async () => {
        setConfirmSubmit(false);
        setBanner(null);
        setClosing(true);
        try {
            const result = await closeIndent({ indentId: indent.remote_id });
            const errorsText = result.errors && result.errors.length > 0 ? result.errors.join('\n') : undefined;
            if (!result.ok) {
                setBanner({ kind: 'error', title: result.message ?? 'Indent was not closed.', detail: errorsText });
                return;
            }
            setBanner({ kind: 'success', title: result.message ?? 'Indent submitted as orders.', detail: errorsText });
            setTimeout(onClose, SUCCESS_BANNER_MS);
        } catch (e: any) {
            setBanner({
                kind: 'error',
                title: e?.response?.data?.response_message ?? e?.response?.data?.message ?? e?.message ?? 'Could not submit the indent.',
                detail: Array.isArray(e?.response?.data?.errors) ? e.response.data.errors.join('\n') : undefined,
            });
        } finally {
            setClosing(false);
        }
    };

    const notices = (
        <>
            {banner ? <Notice tone={banner.kind === 'error' ? 'danger' : 'success'} title={banner.title} detail={banner.detail} /> : null}
            {isDraft ? (
                <Notice
                    tone="warning"
                    title="Draft: not on the server yet"
                    detail={
                        pendingIndentOpCount > 0
                            ? `${pendingIndentOpCount} change${pendingIndentOpCount === 1 ? '' : 's'} will upload when you submit. Editing is available once it's on the server.`
                            : "Editing is available once it's on the server."
                    }
                />
            ) : null}
            {confirmSubmit ? (
                <ConfirmSubmit
                    isDraft={isDraft}
                    itemCount={items.length}
                    onCancel={() => setConfirmSubmit(false)}
                    onConfirm={performSubmit}
                />
            ) : null}
        </>
    );

    return (
        <AdminDetailsSheet
            visible={visible}
            onClose={busy ? () => { } : onClose}
            heading="Indent"
            icon="document-text-outline"
            title={indentTitle(indent)}
            subtitle={[textOr(indent.entity_title, ''), campaign].filter(Boolean).join(' · ') || null}
            avatar={{ icon: 'document-text-outline', color: isOpen ? '#10b981' : '#64748b' }}
            badges={indentBadges(indent)}
            stats={[
                { label: 'Total cost', value: formatKES(indent.total_cost) },
                { label: 'Profit', value: formatKES(indent.total_profit), color: Number(indent.total_profit) > 0 ? '#10b981' : undefined },
                { label: 'Items', value: items.length.toLocaleString() },
            ]}
            sections={[
                ...(banner || isDraft || confirmSubmit ? [{ title: 'Status', icon: 'information-circle-outline' as const, children: notices }] : []),
                {
                    title: 'Parameters',
                    icon: 'options-outline',
                    fields: [
                        { label: 'Lead time', value: `${indent.lead_time ?? 0} days` },
                        { label: 'Order days', value: `${indent.order_days ?? 0} days` },
                        { label: 'Average lead', value: `${indent.average_lead_time_days ?? '0'} days` },
                        { label: 'Pricing', value: `${indent.pricing_percentage ?? '0'}%` },
                        { label: 'Created', value: formatDate(indent.created) },
                        { label: 'Campaign', value: campaign },
                    ],
                },
                {
                    title: 'Budget',
                    icon: 'wallet-outline',
                    children: <BudgetBlock indent={indent} pct={pct} />,
                },
                {
                    title: `Items (${items.length})`,
                    icon: 'cube-outline',
                    children: (
                        <ItemList
                            items={items}
                            onEdit={canEdit && onOpenEditItem ? (item) => onOpenEditItem(item.remote_id ?? item.draft_id ?? String(item.id ?? '')) : undefined}
                        />
                    ),
                },
            ]}
            onEdit={canEdit && onUpdateIndent ? onUpdateIndent : undefined}
            editLabel="Edit indent"
            actions={
                isOpen ? (
                    <SheetButton
                        label="Submit orders"
                        icon="paper-plane-outline"
                        variant="danger"
                        onPress={() => {
                            setBanner(null);
                            setConfirmSubmit(true);
                        }}
                        loading={closing}
                        loadingLabel="Submitting…"
                        disabled={busy || confirmSubmit || items.length === 0}
                        grow={!wide}
                    />
                ) : null
            }
        />
    );
}

/* ------------------------------------------------------------------ */

const TONES = {
    danger: { fg: '#e11d48', bg: 'rgba(244,63,94,0.08)', icon: 'alert-circle' as const },
    success: { fg: '#059669', bg: 'rgba(16,185,129,0.10)', icon: 'checkmark-circle' as const },
    warning: { fg: '#b45309', bg: 'rgba(245,158,11,0.10)', icon: 'cloud-upload-outline' as const },
};

function Notice({ tone, title, detail }: { tone: keyof typeof TONES; title: string; detail?: string }) {
    const { theme } = useListTokens();
    const t = TONES[tone];
    return (
        <View style={{ flexDirection: 'row', gap: 10, borderRadius: 16, padding: 12, backgroundColor: t.bg }}>
            <Ionicons name={t.icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.fg, fontFamily: theme.font.bold, fontSize: 13 }}>{title}</Text>
                {detail ? <Text style={{ color: t.fg, fontFamily: theme.font.medium, fontSize: 12, marginTop: 2, opacity: 0.9 }}>{detail}</Text> : null}
            </View>
        </View>
    );
}

function ConfirmSubmit({ isDraft, itemCount, onCancel, onConfirm }: { isDraft: boolean; itemCount: number; onCancel: () => void; onConfirm: () => void }) {
    const { theme } = useListTokens();
    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 10, backgroundColor: 'rgba(244,63,94,0.08)', marginTop: 8 }}>
            <Text style={{ color: '#be123c', fontFamily: theme.font.bold, fontSize: 14 }}>Submit {itemCount.toLocaleString()} item{itemCount === 1 ? '' : 's'} as orders?</Text>
            <Text style={{ color: '#be123c', fontFamily: theme.font.medium, fontSize: 12.5 }}>
                {isDraft
                    ? 'The indent will be created on the server, its items uploaded, and the indent closed. This can take a moment when you are offline.'
                    : 'Each item becomes an order with its wholesaler and the indent closes. You cannot edit it afterwards.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <SheetButton label="Cancel" variant="secondary" onPress={onCancel} grow />
                <SheetButton label="Yes, submit" variant="danger" icon="paper-plane-outline" onPress={onConfirm} grow />
            </View>
        </View>
    );
}

function BudgetBlock({ indent, pct }: { indent: RetailerIndent; pct: number | null }) {
    const { theme, chipBg, divider } = useListTokens();
    if (!hasBudgetSet(indent)) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>No budget set for this indent.</Text>;
    }
    const used = Math.min(100, Math.max(0, pct ?? 0));
    const over = (pct ?? 0) >= 100;
    const enforced = toBool(indent.budget_enforced);
    return (
        <View style={{ borderRadius: 16, padding: 14, gap: 8, backgroundColor: chipBg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                    {formatKES(indent.total_cost)} <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>of {formatKES(indent.budget_amount)}</Text>
                </Text>
                <Text style={{ color: over ? '#f43f5e' : theme.primary, fontFamily: theme.font.bold, fontSize: 14 }}>{(pct ?? 0).toFixed(0)}%</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: divider }}>
                <View style={{ width: `${used}%`, height: '100%', borderRadius: 4, backgroundColor: over ? '#f43f5e' : theme.primary }} />
            </View>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                {enforced ? 'Enforced: items over budget are blocked.' : 'Not enforced: you are warned when over budget.'}
            </Text>
        </View>
    );
}

function ItemList({ items, onEdit }: { items: RetailerIndentItem[]; onEdit?: (item: RetailerIndentItem) => void }) {
    const { theme } = useListTokens();
    if (items.length === 0) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No items on this indent.</Text>;
    }
    return (
        <View style={{ gap: 8 }}>
            {items.map((item, idx) => (
                <ItemRow key={item.remote_id ?? item.draft_id ?? String(item.id ?? idx)} item={item} onEdit={onEdit ? () => onEdit(item) : undefined} />
            ))}
        </View>
    );
}

function ItemRow({ item, onEdit }: { item: RetailerIndentItem; onEdit?: () => void }) {
    const { theme, chipBg } = useListTokens();
    const it: any = item;
    const title = item.wholesale_receipt_title || it.product_title || 'Untitled product';
    const thumb = resolveImageUrl(it.images?.[0]);
    const price = it.final_unit_price ?? it.cost_per_unit;
    const pending = !item.remote_id && !!item.draft_id;
    const qty = Number(item.required_quantity ?? 0);
    const bonus = Number(item.bonus_quantity_earned ?? 0);
    const meta = [textOr(item.wholesaler_title, ''), price !== undefined && price !== null ? `${formatKES(price)} each` : '', textOr(item.source_label, '')].filter(Boolean).join(' · ');

    const body = (
        <>
            <AdminAvatarTile avatar={{ uri: thumb, icon: 'cube-outline' }} title={title} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={2} style={{ flexShrink: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                        {title}
                    </Text>
                    {pending ? <AdminBadgePill badge={{ label: 'Pending', tone: 'warning' }} /> : null}
                </View>
                {meta ? (
                    <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 2 }}>
                        {meta}
                    </Text>
                ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>×{qty.toLocaleString()}</Text>
                {bonus > 0 ? <Text style={{ color: '#10b981', fontFamily: theme.font.bold, fontSize: 11.5 }}>+{bonus.toLocaleString()} free</Text> : null}
            </View>
            {onEdit ? <Ionicons name="create-outline" size={18} color={theme.primary} /> : null}
        </>
    );

    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, borderRadius: 16, padding: 12, backgroundColor: chipBg };
    if (!onEdit) return <View style={rowStyle}>{body}</View>;
    return (
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${title}`} style={({ pressed }) => ({ ...rowStyle, opacity: pressed ? 0.8 : 1, ...webPointer })}>
            {body}
        </Pressable>
    );
}
