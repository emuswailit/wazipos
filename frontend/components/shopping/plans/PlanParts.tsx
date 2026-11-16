// components/shopping/plans/PlanParts.tsx
//
// Shared pieces for shopping plans (wishlists kept on the device):
//   PlanFormSheet  name a plan (create / edit / "save cart as plan")
//   PlanBanner     strip on the shop front while building a plan

import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, FilterChips, FormRow, FormSection, formatDate, useListTokens, webPointer } from '@/components/common/listScreen';
import type { ShoppingPlan } from '@/utils/shoppingPlans';
import { Ionicons } from '@expo/vector-icons';
import { Formik } from 'formik';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Yup from 'yup';

export interface PlanDetails {
    title: string;
    for_whom?: string;
    need_by?: string;
    note?: string;
    budget?: number;
}

const IDEAS = ['Back to school', 'Monthly groceries', 'Baby essentials', 'Holiday shopping', 'Home restock'];

export function PlanFormSheet({
    visible,
    onClose,
    onSubmit,
    initial,
    mode = 'create',
    submitting,
    error,
}: {
    visible: boolean;
    onClose: () => void;
    onSubmit: (d: PlanDetails) => void;
    initial?: Partial<PlanDetails>;
    mode?: 'create' | 'edit' | 'save';
    submitting?: boolean;
    error?: string | null;
}) {
    const title = mode === 'edit' ? 'Edit plan' : mode === 'save' ? 'Save as a plan' : 'New plan';
    const subtitle =
        mode === 'save'
            ? 'Keep this basket for later. Pay by mobile money when you’re ready.'
            : 'A list for one shop, kept on this phone. Pay when you’re ready.';
    return (
        <Formik
            key={`${visible}-${initial?.title ?? ''}`}
            initialValues={{
                title: initial?.title ?? '',
                for_whom: initial?.for_whom ?? '',
                need_by: initial?.need_by ?? '',
                note: initial?.note ?? '',
                budget: initial?.budget ? String(initial.budget) : '',
            }}
            validationSchema={Yup.object({
                title: Yup.string().trim().required('Name your plan, e.g. Back to school'),
                budget: Yup.number().typeError('Enter an amount').min(0, 'Enter an amount'),
            })}
            onSubmit={(v) =>
                onSubmit({
                    title: v.title.trim(),
                    for_whom: v.for_whom.trim() || undefined,
                    need_by: v.need_by || undefined,
                    note: v.note.trim() || undefined,
                    budget: Number(v.budget) > 0 ? Number(v.budget) : undefined,
                })
            }
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={title}
                    subtitle={subtitle}
                    icon="calendar-outline"
                    submitLabel={mode === 'edit' ? 'Save changes' : mode === 'save' ? 'Save plan' : 'Create & choose shop'}
                    submitting={submitting}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Plan">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Back to school 2027" />
                        <FilterChips<string> options={IDEAS.map((k) => ({ key: k, label: k }))} value={f.values.title} onChange={(k) => f.setFieldValue('title', k)} />
                        <FormRow>
                            <CustomTextField name="for_whom" label="For" placeholder="e.g. Amani · Grade 4" />
                            <DateField name="need_by" label="Needed by" />
                        </FormRow>
                        <CustomTextField name="budget" label="Budget (KES)" placeholder="e.g. 15000 · optional" keyboardType="decimal-pad" />
                        <Text style={{ color: '#64748b', fontSize: 12 }}>
                            Add products from a real shop at today’s prices to see what your plan really costs against this budget.
                        </Text>
                        <CustomTextField name="note" label="Note" placeholder="Optional, e.g. school list from the class teacher" multiline />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

/** Strip above the shop front while the cart is a plan. */
export function PlanBanner({ plan, onDone }: { plan: ShoppingPlan; onDone: () => void }) {
    const { theme } = useListTokens();
    const bits = [plan.for_whom, plan.need_by ? `needed by ${formatDate(plan.need_by)}` : null].filter(Boolean).join(' · ');
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#8b5cf614', borderBottomWidth: 1, borderBottomColor: '#8b5cf633' }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf622' }}>
                <Ionicons name="calendar" size={16} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                    Planning: {plan.title}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 11.5 }}>
                    {bits ? `${bits} · ` : ''}Saved on this phone · pay by M-Pesa when ready
                </Text>
            </View>
            <Pressable onPress={onDone} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: '#8b5cf6', ...webPointer }}>
                <Ionicons name="checkmark" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 12.5 }}>Done</Text>
            </Pressable>
        </View>
    );
}
