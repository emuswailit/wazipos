// components/admin/kit/AdminDetailsSheet.tsx
//
// Read-only record details in an AdminSheet: hero (avatar · title · subtitle · badges),
// optional stat tiles, field sections, and Close / Edit in the footer.

import { useListTokens } from '@/components/common/listScreen/tokens';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

import { AdminAvatarTile, AdminBadgePill, type AdminAvatar, type AdminBadge, type AdminStat, type IconName } from './AdminListView';
import { AdminSheet, SheetButton, useSheetIsWide } from './AdminSheet';

interface DetailField {
    label: string;
    /** Strings render as text; pass a node for chips, links, etc. Empty → "—". */
    value: React.ReactNode;
    icon?: IconName;
    /** Span the whole row (long text such as descriptions). */
    full?: boolean;
    mono?: boolean;
}

interface DetailSection {
    title: string;
    icon?: IconName;
    fields?: DetailField[];
    /** Custom content instead of / after the field grid. */
    children?: React.ReactNode;
}

interface AdminDetailsSheetProps {
    visible: boolean;
    onClose: () => void;
    /** Sheet header, e.g. "Route details". */
    heading: string;
    icon: IconName;
    title: string;
    subtitle?: string | null;
    avatar?: AdminAvatar;
    badges?: AdminBadge[];
    stats?: AdminStat[];
    sections: DetailSection[];
    onEdit?: () => void;
    editLabel?: string;
    /** Extra footer buttons, placed before Edit. */
    actions?: React.ReactNode;
}

export function AdminDetailsSheet({
    visible,
    onClose,
    heading,
    icon,
    title,
    subtitle,
    avatar,
    badges = [],
    stats = [],
    sections,
    onEdit,
    editLabel = 'Edit',
    actions,
}: AdminDetailsSheetProps) {
    const { theme } = useListTokens();
    const wide = useSheetIsWide();

    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title={heading}
            icon={icon}
            footer={
                <>
                    <SheetButton label="Close" variant="ghost" onPress={onClose} grow={!wide} />
                    {actions}
                    {onEdit ? <SheetButton label={editLabel} icon="create-outline" onPress={onEdit} grow={!wide} /> : null}
                </>
            }
        >
            {/* Hero */}
            <View className="flex-row items-center gap-3.5">
                <AdminAvatarTile avatar={avatar} title={title} size={60} />
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 19, lineHeight: 25 }}>{title}</Text>
                    {subtitle ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                            {subtitle}
                        </Text>
                    ) : null}
                    {badges.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1.5 mt-2">
                            {badges.map((b, i) => (
                                <AdminBadgePill key={`${b.label}-${i}`} badge={b} size="md" />
                            ))}
                        </View>
                    ) : null}
                </View>
            </View>

            {stats.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                    {stats.map((s) => (
                        <StatTile key={s.label} stat={s} />
                    ))}
                </View>
            ) : null}

            {sections.map((s) => (
                <Section key={s.title} section={s} wide={wide} />
            ))}
        </AdminSheet>
    );
}

function StatTile({ stat }: { stat: AdminStat }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View className="rounded-2xl px-3.5 py-3" style={{ backgroundColor: chipBg, flexGrow: 1, flexBasis: 96 }}>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11 }} numberOfLines={1}>
                {stat.label}
            </Text>
            <Text style={{ color: stat.color ?? theme.text, fontFamily: theme.font.bold, fontSize: 17, marginTop: 2 }} numberOfLines={1}>
                {stat.value}
            </Text>
        </View>
    );
}

function Section({ section, wide }: { section: DetailSection; wide: boolean }) {
    const { theme, chipBg } = useListTokens();
    const fields = section.fields ?? [];
    return (
        <View style={{ gap: 8 }}>
            <View className="flex-row items-center gap-1.5 px-1">
                {section.icon ? <Ionicons name={section.icon} size={13} color={theme.textDark} /> : null}
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>{section.title}</Text>
            </View>
            {fields.length > 0 ? (
                <View className="rounded-2xl p-4 flex-row flex-wrap" style={{ backgroundColor: chipBg, rowGap: 14, columnGap: 16 }}>
                    {fields.map((f) => (
                        <Field key={f.label} field={f} wide={wide} />
                    ))}
                </View>
            ) : null}
            {section.children}
        </View>
    );
}

function Field({ field, wide }: { field: DetailField; wide: boolean }) {
    const { theme } = useListTokens();
    const empty = field.value === null || field.value === undefined || (typeof field.value === 'string' && field.value.trim() === '');
    const basis = field.full ? '100%' : wide ? '30%' : '44%';
    return (
        <View style={{ flexGrow: 1, flexBasis: basis as any, minWidth: field.full ? '100%' : 120 }}>
            <View className="flex-row items-center gap-1">
                {field.icon ? <Ionicons name={field.icon} size={11} color={theme.textDark} /> : null}
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{field.label}</Text>
            </View>
            {typeof field.value === 'string' || typeof field.value === 'number' || empty ? (
                <Text
                    selectable
                    style={{
                        color: empty ? theme.textDark : theme.text,
                        fontFamily: field.mono ? (theme.font.medium as string) : theme.font.bold,
                        fontSize: 14,
                        marginTop: 3,
                        lineHeight: 20,
                        letterSpacing: field.mono ? 0.3 : 0,
                    }}
                >
                    {empty ? '—' : String(field.value)}
                </Text>
            ) : (
                <View style={{ marginTop: 4 }}>{field.value}</View>
            )}
        </View>
    );
}

/** Wrapping row of small chips (e.g. linked records). */
export function ChipList({ items, empty = 'None' }: { items: string[]; empty?: string }) {
    const { theme, border } = useListTokens();
    if (items.length === 0) {
        return <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>{empty}</Text>;
    }
    return (
        <View className="flex-row flex-wrap gap-1.5">
            {items.map((t, i) => (
                <View key={`${t}-${i}`} className="px-2.5 py-1 rounded-full border" style={{ borderColor: border, backgroundColor: theme.panel }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 12 }}>{t}</Text>
                </View>
            ))}
        </View>
    );
}
