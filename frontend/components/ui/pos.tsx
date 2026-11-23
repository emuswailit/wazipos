// components/ui/pos.tsx
//
// Building blocks shared by every "new order" / till screen (retail, wholesale,
// restaurant, hotel) so they look and behave the same: soft cards, a page header,
// numbered section titles, a quantity stepper, amount fields, totals, the primary
// call to action, a sticky phone checkout bar and an offline notice.
// Everything reads the brand theme from AuthContext (light + dark).

import { useAuth } from '@/context/AuthContext';
import { Banknote, Check, ChevronRight, CreditCard, HandCoins, Landmark, Minus, Plus, Smartphone, Wallet, WifiOff } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

const isWeb = Platform.OS === 'web';
const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;
const noOutline = isWeb ? ({ outlineStyle: 'none' } as any) : null;

export const money = (n: number | string | null | undefined) =>
    Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const softShadow = { shadowColor: '#0b1733', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 };
export const liftShadow = { shadowColor: '#0b1733', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3 };

/** Brand cobalt → sky on web; solid cobalt with a coloured glow on native. */
export function ctaStyle(theme: any, disabled?: boolean): ViewStyle {
    return {
        backgroundColor: theme.primary,
        shadowColor: theme.primary, shadowOpacity: disabled ? 0 : 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: disabled ? 0 : 6,
        opacity: disabled ? 0.5 : 1,
        ...(isWeb ? ({ backgroundImage: `linear-gradient(120deg, ${theme.primary}, ${theme.accent})`, cursor: disabled ? 'default' : 'pointer' } as any) : {}),
    };
}

/* ------------------------------------------------------------- cards */

export function PosCard({ children, style, active, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; active?: boolean; padded?: boolean }) {
    const { theme } = useAuth();
    return (
        <View style={[{ backgroundColor: theme.panel, borderRadius: 18, borderWidth: 1, borderColor: active ? theme.primary : theme.border, padding: padded ? 14 : 0, ...softShadow }, style]}>
            {children}
        </View>
    );
}

/* ------------------------------------------------------------ header */

export function PosHeader({ icon: Icon, title, subtitle, right }: { icon?: any; title: string; subtitle?: string | null; right?: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                {Icon ? (
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} color={theme.primary} strokeWidth={2.2} />
                    </View>
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text, letterSpacing: -0.2 }}>{title}</Text>
                    {subtitle ? <Text numberOfLines={1} style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs, color: theme.textMuted }}>{subtitle}</Text> : null}
                </View>
            </View>
            {right}
        </View>
    );
}

/** "1  Customer" style section heading. */
export function SectionTitle({ step, title, hint, right }: { step?: number | string; title: string; hint?: string | null; right?: React.ReactNode }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {step !== undefined ? (
                <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12 }}>{step}</Text>
                </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: theme.font.bold, fontSize: 14.5, color: theme.text }}>{title}</Text>
                {hint ? <Text style={{ fontFamily: theme.font.regular, fontSize: 12, color: theme.textMuted, marginTop: 1 }}>{hint}</Text> : null}
            </View>
            {right}
        </View>
    );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
    const { theme } = useAuth();
    return <Text style={{ fontFamily: theme.font.semibold, fontSize: 10, color: theme.textMuted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{children}</Text>;
}

/* ------------------------------------------------------------ inputs */

/** − [qty] + — typing still works (decimals when `decimal`). */
export function QtyStepper({
    value, onChangeText, onStep, decimal, danger, label, onFocus, onBlur,
}: { value: string; onChangeText: (t: string) => void; onStep: (delta: number) => void; decimal?: boolean; danger?: boolean; label?: string; onFocus?: () => void; onBlur?: () => void }) {
    const { theme } = useAuth();
    return (
        <View>
            {label ? <FieldLabel>{label}</FieldLabel> : null}
            <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 12, borderWidth: 1.5, borderColor: danger ? theme.danger : 'transparent', padding: 3 }}>
                <Pressable onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel="Decrease quantity" style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel, ...pointer }}>
                    <Minus size={14} color={theme.text} strokeWidth={2.5} />
                </Pressable>
                <TextInput
                    keyboardType={decimal ? 'decimal-pad' : 'numeric'}
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                    style={{ width: 46, textAlign: 'center', fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: danger ? theme.danger : theme.text, paddingVertical: 0, ...noOutline }}
                />
                <Pressable onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel="Increase quantity" style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, ...pointer }}>
                    <Plus size={14} color="#fff" strokeWidth={2.5} />
                </Pressable>
            </View>
        </View>
    );
}

/** Filled amount field with a "KES" prefix (discounts, prices). */
export function AmountField({ label, prefix = 'KES', tone, style, ...input }: TextInputProps & { label?: string; prefix?: string; tone?: 'danger' | 'default'; style?: StyleProp<ViewStyle> }) {
    const { theme } = useAuth();
    return (
        <View style={style}>
            {label ? <FieldLabel>{label}</FieldLabel> : null}
            <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 10, gap: 4 }}>
                <Text style={{ fontFamily: theme.font.semibold, fontSize: 11, color: theme.textMuted }}>{prefix}</Text>
                <TextInput
                    keyboardType="numeric"
                    selectTextOnFocus
                    placeholderTextColor={theme.textMuted}
                    {...input}
                    style={{ flex: 1, minWidth: 0, height: '100%', textAlign: 'right', fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: tone === 'danger' ? theme.danger : theme.text, paddingVertical: 0, ...noOutline }}
                />
            </View>
        </View>
    );
}

/** Read-only value in the same shape as the inputs (unit price, line total). */
export function ValueTile({ label, value, align = 'right', strong, tone }: { label: string; value: string; align?: 'left' | 'right'; strong?: boolean; tone?: 'success' | 'danger' | 'warning' | 'muted' }) {
    const { theme } = useAuth();
    const color = tone === 'success' ? theme.success : tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : tone === 'muted' ? theme.textMuted : theme.text;
    return (
        <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', justifyContent: 'center', minHeight: 44 }}>
            <Text style={{ fontFamily: theme.font.semibold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
            <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: strong ? theme.fontSize.base : theme.fontSize.sm, color }}>{value}</Text>
        </View>
    );
}

/** Two-or-more option segmented switch (Whole / By kg, Pickup / Delivery…). */
export function Segmented<V extends string>({ options, value, onChange }: { options: [V, string][]; value: V; onChange: (v: V) => void }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 3 }}>
            {options.map(([v, label]) => {
                const active = v === value;
                return (
                    <Pressable
                        key={v}
                        onPress={() => onChange(v)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={{ flex: 1, height: 38, paddingHorizontal: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.panel : 'transparent', ...(active ? softShadow : null), ...pointer }}
                    >
                        <Text style={{ fontFamily: theme.font.bold, fontSize: 12.5, color: active ? theme.primary : theme.textMuted }}>{label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/* ------------------------------------------------------------ totals */

export interface TotalRow {
    label: string;
    value: string;
    tone?: 'danger' | 'warning' | 'muted';
}

export function TotalsCard({ rows, totalLabel = 'Total', total }: { rows: TotalRow[]; totalLabel?: string; total: number }) {
    const { theme } = useAuth();
    return (
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 14, padding: 14, gap: 6 }}>
            {rows.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.sm, color: theme.textMuted }}>{r.label}</Text>
                    <Text style={{ fontFamily: theme.font.semibold, fontSize: theme.fontSize.sm, color: r.tone === 'danger' ? theme.danger : r.tone === 'warning' ? theme.warning : theme.text }}>{r.value}</Text>
                </View>
            ))}
            {rows.length ? <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>{totalLabel}</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: 22, color: theme.text, letterSpacing: -0.3 }}>
                    <Text style={{ fontSize: 13, color: theme.textMuted }}>KES </Text>
                    {money(total)}
                </Text>
            </View>
        </View>
    );
}

/* ----------------------------------------------------------- buttons */

export function PrimaryCTA({ label, onPress, disabled, loading, icon: Icon, height = 52, style }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: any; height?: number; style?: StyleProp<ViewStyle> }) {
    const { theme } = useAuth();
    const off = disabled || loading;
    return (
        <Pressable
            onPress={onPress}
            disabled={off}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!off, busy: !!loading }}
            style={[{ height, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }, ctaStyle(theme, off), style]}
        >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : Icon ? <Icon size={18} color="#fff" strokeWidth={2.4} /> : null}
            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: '#fff' }} numberOfLines={1}>{label}</Text>
        </Pressable>
    );
}

export function SoftButton({ label, onPress, icon: Icon, tone = 'primary', disabled, style }: { label: string; onPress: () => void; icon?: any; tone?: 'primary' | 'navy' | 'neutral' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
    const { theme } = useAuth();
    const bg = tone === 'navy' ? theme.navy : tone === 'neutral' ? theme.surfaceAlt : tone === 'danger' ? theme.dangerSoft : theme.primarySoft;
    const fg = tone === 'navy' ? '#fff' : tone === 'neutral' ? theme.text : tone === 'danger' ? theme.danger : theme.primary;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            style={[{ height: 46, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: bg, opacity: disabled ? 0.5 : 1, ...pointer }, style]}
        >
            {Icon ? <Icon size={16} color={fg} strokeWidth={2.4} /> : null}
            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: fg }} numberOfLines={1}>{label}</Text>
        </Pressable>
    );
}

/** Dashed "+ Add item" row. */
export function AddRowButton({ label = 'Add item', onPress, disabled, disabledLabel }: { label?: string; onPress: () => void; disabled?: boolean; disabledLabel?: string }) {
    const { theme } = useAuth();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            style={{
                flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
                borderColor: disabled ? theme.border : theme.primary, backgroundColor: disabled ? 'transparent' : theme.primarySoft,
                opacity: disabled ? 0.5 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...pointer,
            }}
        >
            <Plus size={16} color={disabled ? theme.textMuted : theme.primary} strokeWidth={2.5} />
            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: disabled ? theme.textMuted : theme.primary }}>{disabled && disabledLabel ? disabledLabel : label}</Text>
        </Pressable>
    );
}

/** Sticky phone footer: item count + total + action. Hide it on wide layouts. */
export function CheckoutBar({ caption, total, actionLabel, onPress, disabled, loading }: { caption: string; total: number; actionLabel: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
    const { theme } = useAuth();
    return (
        <View
            style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
                backgroundColor: theme.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: theme.border,
                shadowColor: '#0b1733', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 12,
                flexDirection: 'row', alignItems: 'center', gap: 12,
            }}
        >
            <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.font.semibold, fontSize: 11, color: theme.textMuted }}>{caption}</Text>
                <Text style={{ fontFamily: theme.font.bold, fontSize: 20, color: theme.text, letterSpacing: -0.3 }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>KES </Text>
                    {money(total)}
                </Text>
            </View>
            <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" style={[{ height: 48, minWidth: 150, paddingHorizontal: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, ctaStyle(theme, disabled || loading)]}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: '#fff' }}>{actionLabel}</Text>
                {!loading ? <ChevronRight size={16} color="#fff" strokeWidth={2.6} /> : null}
            </Pressable>
        </View>
    );
}

/* ------------------------------------------------------------ notices */

export function OfflineNotice({ title = 'Offline — cash sales only', message }: { title?: string; message: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.warningSoft, marginBottom: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: `${theme.warning}26`, alignItems: 'center', justifyContent: 'center' }}>
                <WifiOff size={17} color={theme.warning} strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.text }}>{title}</Text>
                <Text style={{ fontFamily: theme.font.regular, fontSize: 12.5, lineHeight: 18, color: theme.textMuted, marginTop: 2 }}>{message}</Text>
            </View>
        </View>
    );
}

export function StatusPill({ tone, label }: { tone: 'success' | 'warning' | 'danger' | 'info'; label: string }) {
    const { theme } = useAuth();
    const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : tone === 'danger' ? theme.danger : theme.primary;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: `${color}18` }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ fontFamily: theme.font.bold, fontSize: 11.5, color }}>{label}</Text>
        </View>
    );
}

/* ------------------------------------------------------- payment methods */

export function paymentMethodIcon(title: string) {
    const t = String(title || '').toUpperCase();
    if (t.includes('MOBILE') || t.includes('MPESA') || t.includes('M-PESA')) return Smartphone;
    if (t.includes('CASH')) return Banknote;
    if (t.includes('CREDIT')) return HandCoins;
    if (t.includes('CARD')) return CreditCard;
    if (t.includes('BANK')) return Landmark;
    return Wallet;
}

/** Big tappable method cards (Cash / Mobile money / Card…) with a tick on the chosen one. */
export function PaymentMethodCards({ methods, value, onChange, disabled }: { methods: { id: string | number; title: string }[]; value: string | null | undefined; onChange: (id: string) => void; disabled?: boolean }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {methods.map((m) => {
                const id = String(m.id);
                const on = id === String(value ?? '');
                const Icon = paymentMethodIcon(m.title);
                return (
                    <Pressable
                        key={id}
                        onPress={() => onChange(id)}
                        disabled={disabled}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled }}
                        style={{
                            flexGrow: 1, flexBasis: '30%', minWidth: 92, paddingVertical: 12, paddingHorizontal: 8,
                            borderRadius: 14, borderWidth: 1.5, alignItems: 'center', gap: 6,
                            borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel,
                            opacity: disabled ? 0.55 : 1, ...pointer,
                        }}
                    >
                        {on ? (
                            <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={10} color="#fff" strokeWidth={3} />
                            </View>
                        ) : null}
                        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surfaceAlt }}>
                            <Icon size={17} color={on ? '#fff' : theme.textMuted} strokeWidth={2.2} />
                        </View>
                        <Text numberOfLines={1} style={{ fontFamily: theme.font.bold, fontSize: 11.5, color: on ? theme.primary : theme.text, textTransform: 'capitalize' }}>
                            {String(m.title || '').toLowerCase()}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Inline error / hint banner inside a form or panel. */
export function InlineNotice({ tone = 'danger', message }: { tone?: 'danger' | 'warning' | 'info' | 'success'; message: string }) {
    const { theme } = useAuth();
    const color = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : tone === 'success' ? theme.success : theme.primary;
    return (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: `${color}14` }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 7 }} />
            <Text style={{ flex: 1, color: tone === 'danger' ? color : theme.text, fontFamily: theme.font.medium, fontSize: 13, lineHeight: 19 }}>{message}</Text>
        </View>
    );
}
