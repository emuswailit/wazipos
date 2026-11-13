// components/admin/kit/AdminFormSheet.tsx
//
// Create / edit form chrome for admin records, styled like the Out of Stock form:
// AdminSheet + titled sections + Cancel / Save footer. Fields come from the shared
// form kit (CustomTextField, SelectDropdown, SwitchField, pickers) bound to Formik.
//
//   <Formik ...>
//     {(f) => (
//       <AdminFormSheet visible={visible} onClose={onClose} title="New route"
//         submitting={f.isSubmitting} onSubmit={() => f.handleSubmit()}>
//         <FormSection title="Basics"><CustomTextField name="title" label="Name" /></FormSection>
//       </AdminFormSheet>
//     )}
//   </Formik>

import { useListTokens, webPointer } from '@/components/common/listScreen/tokens';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { IconName } from './AdminListView';
import { AdminSheet, SheetButton, useSheetIsWide } from './AdminSheet';

interface AdminFormSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string | null;
    icon?: IconName;
    submitLabel?: string;
    submitting?: boolean;
    onSubmit: () => void;
    /** Message shown above the fields (e.g. a server error). */
    error?: string | null;
    width?: number;
    children: React.ReactNode;
}

export function AdminFormSheet({
    visible,
    onClose,
    title,
    subtitle,
    icon,
    submitLabel = 'Save',
    submitting = false,
    onSubmit,
    error,
    width = 640,
    children,
}: AdminFormSheetProps) {
    const wide = useSheetIsWide();
    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            icon={icon}
            width={width}
            dismissible={!submitting}
            footer={
                <>
                    <SheetButton label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} grow={!wide} />
                    <SheetButton label={submitLabel} icon="checkmark" onPress={onSubmit} loading={submitting} grow={!wide} />
                </>
            }
        >
            {error ? <FormErrorBanner message={error} /> : null}
            {children}
        </AdminSheet>
    );
}

/** Titled group of fields with an optional hint line. */
export function FormSection({ title, hint, children, zIndex }: { title: string; hint?: string; children: React.ReactNode; zIndex?: number }) {
    const { theme } = useListTokens();
    return (
        <View style={{ gap: 10, zIndex }}>
            <View>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>{title}</Text>
                {hint ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5, marginTop: 2, lineHeight: 16 }}>{hint}</Text> : null}
            </View>
            <View style={{ gap: 12 }}>{children}</View>
        </View>
    );
}

/** Lays children side by side on wide sheets, stacked on phones. */
export function FormRow({ children, zIndex }: { children: React.ReactNode; zIndex?: number }) {
    const wide = useSheetIsWide();
    const kids = React.Children.toArray(children).filter(Boolean);
    return (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, zIndex }}>
            {kids.map((child, i) => (
                <View key={i} style={{ flex: wide ? 1 : undefined, zIndex: kids.length - i }}>
                    {child}
                </View>
            ))}
        </View>
    );
}

export function FormErrorBanner({ message }: { message: string }) {
    const { theme } = useListTokens();
    return (
        <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-2xl px-3.5 py-3" style={{ backgroundColor: 'rgba(244,63,94,0.10)' }}>
            <Ionicons name="alert-circle" size={16} color="#f43f5e" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5, lineHeight: 18 }}>{message}</Text>
        </View>
    );
}

export interface ChoiceOption<V extends string> {
    value: V;
    label: string;
    icon?: IconName;
    /** Accent when selected (defaults to theme primary). */
    color?: string;
}

/** Single-choice pill selector with a field label and error (form-kit styled). */
export function ChoiceChips<V extends string>({
    label,
    required,
    options,
    value,
    onChange,
    error,
    hint,
    disabled,
}: {
    label?: string;
    required?: boolean;
    options: ChoiceOption<V>[];
    value: V | null | undefined;
    onChange: (v: V) => void;
    error?: string;
    hint?: string;
    disabled?: boolean;
}) {
    const { theme, border } = useListTokens();
    return (
        <View style={{ gap: 6 }}>
            {label ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 2 }}>
                    {label}
                    {required ? <Text style={{ color: '#ef4444' }}> *</Text> : null}
                </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {options.map((o) => {
                    const active = o.value === value;
                    const color = o.color ?? theme.primary;
                    return (
                        <Pressable
                            key={o.value}
                            onPress={() => onChange(o.value)}
                            disabled={disabled}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active, disabled }}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                height: 36,
                                paddingHorizontal: 14,
                                borderRadius: 18,
                                borderWidth: 1,
                                borderColor: active ? color : border,
                                backgroundColor: active ? `${color}14` : 'transparent',
                                opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
                                ...webPointer,
                            })}
                        >
                            {o.icon ? <Ionicons name={o.icon} size={14} color={active ? color : theme.textDark} /> : null}
                            <Text style={{ color: active ? color : theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{o.label}</Text>
                        </Pressable>
                    );
                })}
            </View>
            {error ? (
                <Text style={{ color: '#ef4444', fontFamily: theme.font.medium, fontSize: 11.5 }}>{error}</Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>{hint}</Text>
            ) : null}
        </View>
    );
}

/** Soft tinted panel, e.g. around a switch. */
export function FormPanel({ children, tint }: { children: React.ReactNode; tint?: string }) {
    const { chipBg } = useListTokens();
    return (
        <View className="rounded-2xl px-3.5 py-3" style={{ backgroundColor: tint ? `${tint}14` : chipBg }}>
            {children}
        </View>
    );
}
