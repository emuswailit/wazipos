// components/agents/OnboardingTermsSection.tsx
//
// The agent's deal with a business, inside the entity form (AgentEntitiesList):
//   - the negotiated monthly subscription, with the agent's commission on it,
//   - start on a one-month free trial, or pay right away (mobile money prompt
//     to the owner's phone when the form is saved),
//   - optional stock-take help to build the first inventory (shop stock for
//     retailers / wholesalers; supplies, utilities and bar drinks for
//     restaurants / hotels): how many people, the pay per person per day, the
//     days, which onboarders go, and the dates they may enter the stock.
//     Outside those dates their access ends until the agent changes them.
// Fields are flat Formik values prefixed `ob_` (see termsInitialValues / toTerms).

import type { EntityOnboarding, OnboardingTerms, StockTakeStatus, SubscriptionStart } from '@/api/agentsApi';
import { ChoiceChips, FormRow, FormSection, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import type { FormikProps } from 'formik';
import React from 'react';
import { Text, View } from 'react-native';
import * as Yup from 'yup';

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export function termsInitialValues(o?: EntityOnboarding | null) {
    return {
        ob_monthly_subscription: o ? String(num(o.monthly_subscription)) : '',
        ob_subscription_start: (o?.subscription_start ?? '') as SubscriptionStart | '',
        ob_stock_take_help: o ? o.stock_take_help : false,
        ob_stock_take_persons: o?.stock_take_help ? String(o.stock_take_persons) : '',
        ob_stock_take_daily_rate: o?.stock_take_help ? String(num(o.stock_take_daily_rate)) : '',
        ob_stock_take_days: o?.stock_take_help ? String(o.stock_take_days) : '',
        ob_onboarders: o?.onboarders ?? [],
        ob_access_from: o?.onboarder_access_from ?? '',
        ob_access_to: o?.onboarder_access_to ?? '',
        ob_stock_take_status: (o?.stock_take_status && o.stock_take_status !== 'NOT_NEEDED' ? o.stock_take_status : 'PLANNED') as StockTakeStatus,
        ob_notes: o?.notes ?? '',
    };
}

/** Businesses onboarders can enter opening stock for (backend agents.receipt_kind). */
const STOCKABLE = ['GeneralRetailer', 'PharmaceuticalRetailer', 'GeneralWholesaler', 'PharmaceuticalWholesaler', 'Restaurant', 'Hotel'];
const isStockable = (entityType: unknown) => STOCKABLE.includes(String(entityType || ''));

const whenHelping = (s: Yup.AnySchema) =>
    Yup.mixed().when(['ob_stock_take_help', 'entity_type'], {
        is: (help: boolean, type: string) => !!help && isStockable(type),
        then: () => s,
        otherwise: () => Yup.mixed().notRequired(),
    });

export function termsSchema(creating: boolean): Record<string, Yup.AnySchema> {
    return {
        ob_monthly_subscription: Yup.number().typeError('Enter an amount').min(1, 'At least KES 1').required('Enter the monthly subscription'),
        ...(creating ? { ob_subscription_start: Yup.string().oneOf(['TRIAL', 'PAY_NOW'], 'Choose trial or pay now').required('Choose trial or pay now') } : {}),
        ob_stock_take_persons: whenHelping(Yup.number().typeError('Enter a number').integer('Whole people').min(1, 'At least 1').max(100).required('How many people?')),
        ob_stock_take_daily_rate: whenHelping(Yup.number().typeError('Enter an amount').min(1, 'At least KES 1').required('Pay per person per day')),
        ob_stock_take_days: whenHelping(Yup.number().typeError('Enter a number').integer('Whole days').min(1, 'At least 1').max(60).required('How many days?')),
        // Dates only when onboarders are attached (onboarders are optional: staff can do it too).
        ob_access_from: whenHelping(
            Yup.string().test('needed', 'First day onboarders may work', function (v) {
                return !(this.parent?.ob_onboarders?.length > 0) || !!v;
            }),
        ),
        ob_access_to: whenHelping(
            Yup.string()
                .test('needed', 'Last day onboarders may work', function (v) {
                    return !(this.parent?.ob_onboarders?.length > 0) || !!v;
                })
                .test('after', 'Must be on or after the first day', function (v) {
                    const from = this.parent?.ob_access_from;
                    return !v || !from || String(v) >= String(from);
                }),
        ),
    };
}

export function toTerms(v: any, creating: boolean): OnboardingTerms {
    const help = isStockable(v.entity_type) && !!v.ob_stock_take_help;
    return {
        monthly_subscription: String(num(v.ob_monthly_subscription)),
        ...(creating ? { subscription_start: v.ob_subscription_start as SubscriptionStart } : {}),
        stock_take_help: help,
        stock_take_persons: help ? num(v.ob_stock_take_persons) : 0,
        stock_take_daily_rate: help ? String(num(v.ob_stock_take_daily_rate)) : '0',
        stock_take_days: help ? num(v.ob_stock_take_days) : 0,
        onboarders: help && Array.isArray(v.ob_onboarders) ? v.ob_onboarders : [],
        onboarder_access_from: help && v.ob_onboarders?.length ? String(v.ob_access_from || '').slice(0, 10) || null : null,
        onboarder_access_to: help && v.ob_onboarders?.length ? String(v.ob_access_to || '').slice(0, 10) || null : null,
        ...(help && !creating ? { stock_take_status: v.ob_stock_take_status } : {}),
        notes: String(v.ob_notes || ''),
    };
}

interface Props {
    f: FormikProps<any>;
    creating: boolean;
    /** The agent's commission rate, e.g. "10.00". */
    commissionPercentage: string;
    onboarderOptions: { id: string; title: string }[];
    /** The business has paid: the fee can no longer change. */
    feeLocked?: boolean;
}

export default function OnboardingTermsSection({ f, creating, commissionPercentage, onboarderOptions, feeLocked }: Props) {
    const { theme, isDarkMode } = useAuth();
    const { border } = useListTokens();
    const v = f.values;
    const fee = num(v.ob_monthly_subscription);
    const rate = num(commissionPercentage);
    const share = (fee * rate) / 100;
    // Onboarders only create retailer / wholesaler receipts, so stock-take help is for those.
    const stockable = isStockable(v.entity_type);
    const help = stockable && !!v.ob_stock_take_help;
    const total = num(v.ob_stock_take_persons) * num(v.ob_stock_take_daily_rate) * num(v.ob_stock_take_days);
    const err = (k: string) => (f.touched[k] && typeof f.errors[k] === 'string' ? (f.errors[k] as string) : undefined);
    const note = (text: string) => (
        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, lineHeight: 17 }}>{text}</Text>
    );

    return (
        <>
            <FormSection
                title="Subscription"
                hint={feeLocked ? 'Fixed: this business has already paid at this price.' : 'The monthly fee you agreed with the business.'}
                zIndex={58}
            >
                <CustomTextField
                    name="ob_monthly_subscription"
                    label="Monthly subscription (KES)"
                    required
                    placeholder="e.g. 1500"
                    keyboardType="decimal-pad"
                    editable={!feeLocked}
                />
                {fee > 0 ? note(`Your commission: ${rate}% = ${formatKES(share)} of every month paid. WaziPOS keeps ${formatKES(fee - share)}.`) : null}
                {creating ? (
                    <ChoiceChips<SubscriptionStart>
                        label="Start"
                        required
                        options={[
                            { value: 'TRIAL', label: 'One month free trial', icon: 'gift-outline' },
                            { value: 'PAY_NOW', label: 'Pay right away', icon: 'phone-portrait-outline' },
                        ]}
                        value={(v.ob_subscription_start || null) as SubscriptionStart | null}
                        onChange={(x) => f.setFieldValue('ob_subscription_start', x)}
                        error={err('ob_subscription_start')}
                        hint={
                            v.ob_subscription_start === 'PAY_NOW'
                                ? "A mobile money prompt for the first month goes to the owner's phone when you save."
                                : v.ob_subscription_start === 'TRIAL'
                                    ? 'The business uses WaziPOS free for 30 days, then pays the monthly fee.'
                                    : undefined
                        }
                    />
                ) : null}
            </FormSection>

            <FormSection
                title="Stock-take help"
                hint={
                    stockable
                        ? "Optional. The business's own staff can enter its first stock themselves. Or offer people to count it — shop stock, or a restaurant's food, cleaning, utilities, packaging and bar drinks — at a daily rate you agree with the business. Your onboarders can only add stock, only on the dates you set."
                        : 'Pick the business type first.'
                }
                zIndex={56}
            >
                {stockable ? <SwitchField name="ob_stock_take_help" label="Help with the stock take" /> : null}
                {help ? (
                    <View style={{ gap: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: border }}>
                        <FormRow>
                            <CustomTextField name="ob_stock_take_persons" label="People" required placeholder="e.g. 3" keyboardType="number-pad" />
                            <CustomTextField name="ob_stock_take_daily_rate" label="Pay per person per day (KES)" required placeholder="e.g. 800" keyboardType="decimal-pad" />
                            <CustomTextField name="ob_stock_take_days" label="Days" required placeholder="e.g. 2" keyboardType="number-pad" />
                        </FormRow>
                        {Array.isArray(v.ob_onboarders) && v.ob_onboarders.length ? (
                            <>
                                <FormRow>
                                    <DateField name="ob_access_from" label="Onboarders from" required />
                                    <DateField name="ob_access_to" label="Onboarders until" required />
                                </FormRow>
                                {note('On these days your onboarders can add stock to this business — nothing else, and no edits. After the last day their access ends unless you change the dates here.')}
                            </>
                        ) : (
                            note("No onboarders picked: the business's own staff will do the stock take. Pick onboarders to send your people.")
                        )}
                        {total > 0 ? note(`Agreed cost: ${num(v.ob_stock_take_persons)} × ${formatKES(v.ob_stock_take_daily_rate)} × ${num(v.ob_stock_take_days)} days = ${formatKES(total)}`) : null}
                        <CustomMultiselectAutocompletePicker
                            name="ob_onboarders"
                            label="Onboarders going"
                            options={onboarderOptions}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            placeholder={onboarderOptions.length ? 'Pick onboarders…' : 'Add onboarders under My onboarders first'}
                            emptyText="No active onboarders. Add them under My onboarders."
                            allPickedText="All your onboarders are picked."
                        />
                        {!creating ? (
                            <ChoiceChips<StockTakeStatus>
                                label="Progress"
                                options={[
                                    { value: 'PLANNED', label: 'Planned', icon: 'calendar-outline' },
                                    { value: 'IN_PROGRESS', label: 'In progress', icon: 'hourglass-outline' },
                                    { value: 'DONE', label: 'Done', icon: 'checkmark-done' },
                                ]}
                                value={v.ob_stock_take_status as StockTakeStatus}
                                onChange={(x) => f.setFieldValue('ob_stock_take_status', x)}
                            />
                        ) : null}
                    </View>
                ) : null}
                <CustomTextField name="ob_notes" label="Notes" placeholder="Anything else you agreed" multiline />
            </FormSection>
        </>
    );
}
