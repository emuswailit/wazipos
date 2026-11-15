// components/admin/payoutAccounts/AdminPayoutAccountEditModal.tsx
//
// Create / edit a payout account for any entity. Fields adapt to the type:
// paybills need the business (paybill) number, banks take a bank/branch code.

import type { PayoutAccount, PayoutAccountDetails, PayoutAccountType } from '@/api/payoutAccountsApi';
import { AdminFormSheet, ChoiceChips, FormSection } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import entitiesApi from '@/api/entitiesApi';
import { Formik } from 'formik';
import { useEffect, useMemo, useState } from 'react';
import * as Yup from 'yup';

import { ACCOUNT_TYPE_META, ACCOUNT_TYPES, isActiveAccount } from './payoutAccountsConfig';

interface Props {
    visible: boolean;
    onClose: () => void;
    initialData: PayoutAccount | null;
    submitting: boolean;
    /** Server error to show above the fields. */
    error?: string | null;
    onSubmit: (details: PayoutAccountDetails) => Promise<void>;
    /** Entity admins: the account is always for their own entity. */
    lockedEntity?: { id: string; title: string } | null;
    /** Only platform admins can mark an account verified. */
    canVerify?: boolean;
    /** A person's own account (UserPayoutAccounts): no entity, no verify switch. */
    forUser?: boolean;
}

/** GetBanks row: EntitySerializer fields + active branches. */
interface BankEntity {
    id: string;
    title: string | null;
    bank_code: string | null;
    branches?: { id: string; title: string | null; branch_code: string | null }[];
}

const NUMBER_LABEL: Record<PayoutAccountType, { label: string; placeholder: string }> = {
    BANK: { label: 'Bank account number', placeholder: 'e.g. 0123456789' },
    MOBILE: { label: 'Phone number', placeholder: 'e.g. 0712345678' },
    PAYBILL: { label: 'Account number', placeholder: 'Account at the paybill' },
    TILL: { label: 'Till number', placeholder: 'e.g. 123456' },
    SACCO: { label: 'Sacco account number', placeholder: 'Member / account number' },
    WALLET: { label: 'Wallet account number', placeholder: 'Wallet number' },
};

const makeSchema = (forUser: boolean) => Yup.object({
    entity: forUser ? Yup.string().optional() : Yup.string().required('Pick the entity being paid'),
    account_type: Yup.string().oneOf(ACCOUNT_TYPES).required('Pick an account type'),
    account_name: Yup.string().trim().required('Enter the account name'),
    account_number: Yup.string().trim().required('Enter the account number'),
    business_number: Yup.string().trim().when('account_type', {
        is: 'PAYBILL',
        then: (s) => s.required('Enter the paybill number'),
        otherwise: (s) => s.optional(),
    }),
    account_code: Yup.string().trim().optional(),
    account_entity: Yup.string().when('account_type', {
        is: 'BANK',
        then: (s) => s.required('Pick the bank'),
        otherwise: (s) => s.optional(),
    }),
    bank_branch: Yup.string().when('account_type', {
        is: 'BANK',
        then: (s) => s.required('Pick the branch'),
        otherwise: (s) => s.optional(),
    }),
    description: Yup.string().trim().max(256, 'Keep it under 256 characters').optional(),
});

export default function AdminPayoutAccountEditModal({ visible, onClose, initialData, submitting, error, onSubmit, lockedEntity = null, canVerify = true, forUser = false }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { entitiesList, forceEntitiesRefresh, isEntitiesSyncing } = useEntitiesSync();

    useEffect(() => {
        if (visible && !lockedEntity && !forUser && entitiesList.length === 0) void forceEntitiesRefresh();
    }, [visible, lockedEntity, forUser, entitiesList.length, forceEntitiesRefresh]);
    const schema = useMemo(() => makeSchema(forUser), [forUser]);

    // Banks and their branches come from GetBanks (works for every role; the
    // entities list on the device may not include banks).
    const [banks, setBanks] = useState<BankEntity[]>([]);
    const [banksLoading, setBanksLoading] = useState(false);
    // Why the bank list is empty, when it's an error rather than "no banks".
    const [banksError, setBanksError] = useState<string | null>(null);
    useEffect(() => {
        if (!visible || banks.length) return;
        let alive = true;
        setBanksLoading(true);
        setBanksError(null);
        entitiesApi
            .getBanks()
            .then((res: any) => {
                if (!alive) return;
                const list = res?.data?.results ?? (Array.isArray(res?.data) ? res.data : null);
                if (res?.ok && Array.isArray(list)) {
                    setBanks(list);
                    return;
                }
                // e.g. a server without GetBanks answers 400 "Action GetBanks is unknown".
                const d = res?.data;
                const detail = (Array.isArray(d) ? d[0] : d?.detail || d?.response_message || d?.errors?.[0]) || res?.problem;
                setBanksError(`Couldn't load banks${detail ? `: ${detail}` : ''}.`);
            })
            .catch((e: any) => {
                if (alive) setBanksError(`Couldn't load banks: ${e?.message || 'network error'}.`);
            })
            .finally(() => {
                if (alive) setBanksLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [visible, banks.length]);

    const entityOptions = useMemo(
        () =>
            entitiesList
                .filter((e) => e.remote_id)
                .map((e) => ({ id: String(e.remote_id), title: (e as any).title || 'Unnamed entity' })),
        [entitiesList],
    );

    // The bank's bank_code becomes the account code (the server sets it too).
    const bankOptions = useMemo(
        () => banks.map((b) => ({ id: String(b.id), title: `${b.title || 'Unnamed bank'}${b.bank_code ? ` (${b.bank_code})` : ''}` })),
        [banks],
    );
    const bankOf = (id: string) => banks.find((b) => String(b.id) === id);
    const bankCodeOf = (id: string) => bankOf(id)?.bank_code ?? '';
    const branchOptionsOf = (bankId: string) =>
        (bankOf(bankId)?.branches ?? []).map((br) => ({ id: String(br.id), title: `${br.title || 'Unnamed branch'}${br.branch_code ? ` (${br.branch_code})` : ''}` }));
    const branchCodeOf = (bankId: string, branchId: string) =>
        bankOf(bankId)?.branches?.find((br) => String(br.id) === branchId)?.branch_code ?? '';

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                entity: initialData?.entity ?? lockedEntity?.id ?? '',
                account_type: (initialData?.account_type ?? 'PAYBILL') as PayoutAccountType,
                account_name: initialData?.account_name ?? '',
                account_number: initialData?.account_number ?? '',
                business_number: initialData?.business_number ?? '',
                account_code: initialData?.account_code ?? '',
                account_entity: initialData?.account_entity ?? '',
                bank_branch: initialData?.bank_branch ?? '',
                description: initialData?.description ?? '',
                is_active: initialData ? isActiveAccount(initialData) : true,
                is_verified: initialData?.is_verified ?? false,
            }}
            validationSchema={schema}
            onSubmit={async (v) => {
                await onSubmit({
                    entity: v.entity,
                    account_type: v.account_type,
                    account_name: v.account_name.trim(),
                    account_number: v.account_number.trim(),
                    business_number: v.account_type === 'PAYBILL' ? v.business_number.trim() : '',
                    account_code: v.account_type === 'BANK' ? bankCodeOf(v.account_entity) : v.account_code.trim(),
                    account_entity: v.account_type === 'BANK' ? v.account_entity : '',
                    bank_branch: v.account_type === 'BANK' ? v.bank_branch : '',
                    description: v.description.trim(),
                    is_active: v.is_active,
                    is_verified: canVerify && !forUser ? v.is_verified : (initialData?.is_verified ?? false),
                });
            }}
        >
            {(f) => {
                const type = f.values.account_type;
                const numberField = NUMBER_LABEL[type] ?? NUMBER_LABEL.BANK;
                const typeError = f.touched.account_type ? (f.errors.account_type as string | undefined) : undefined;
                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={isEdit ? 'Edit payout account' : 'New payout account'}
                        subtitle={forUser ? 'Where your delivery earnings are paid' : isEdit ? initialData?.entity_title : 'Where an entity is paid out to'}
                        icon="wallet-outline"
                        submitLabel={isEdit ? 'Save changes' : 'Create account'}
                        submitting={f.isSubmitting || submitting}
                        error={error}
                        onSubmit={() => f.handleSubmit()}
                    >
                        {forUser ? null : (
                        <FormSection title="Entity" zIndex={30}>
                            {lockedEntity ? (
                                <CustomTextField label="Entity being paid" value={initialData?.entity_title || lockedEntity.title} editable={false} />
                            ) : (
                            <CustomAutocompletePicker
                                name="entity"
                                label="Entity being paid"
                                options={entityOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={isEntitiesSyncing && entityOptions.length === 0}
                                placeholder="Search entities…"
                                loadingPlaceholder="Loading entities…"
                                initialTitle={initialData?.entity_title ?? undefined}
                            />
                            )}
                        </FormSection>
                        )}

                        <FormSection title="Account" hint="Only one account per entity is active; activating this one switches the others off.">
                            <ChoiceChips<PayoutAccountType>
                                label="Account type"
                                required
                                options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_META[t].label, icon: ACCOUNT_TYPE_META[t].icon, color: ACCOUNT_TYPE_META[t].color }))}
                                value={type}
                                onChange={(t) => f.setFieldValue('account_type', t)}
                                error={typeError}
                            />
                            <CustomTextField name="account_name" label="Account name" required placeholder="Name registered on the account" />
                            {type === 'PAYBILL' ? (
                                <CustomTextField name="business_number" label="Paybill number" required placeholder="e.g. 247247" keyboardType="number-pad" />
                            ) : null}
                            <CustomTextField
                                name="account_number"
                                label={numberField.label}
                                required
                                placeholder={numberField.placeholder}
                                keyboardType={type === 'MOBILE' || type === 'TILL' ? 'phone-pad' : 'default'}
                            />
                            {type === 'BANK' ? (
                                <CustomAutocompletePicker
                                    name="account_entity"
                                    label="Bank"
                                    options={bankOptions}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    loading={banksLoading && bankOptions.length === 0}
                                    placeholder="Search banks…"
                                    loadingPlaceholder="Loading banks…"
                                    emptyText={banksError ?? 'No banks yet. Load banksFixture, or add the bank as an entity of type Bank with its bank code.'}
                                    initialTitle={initialData?.account_entity_title ?? undefined}
                                    onAfterSelect={(id) => {
                                        f.setFieldValue('account_code', bankCodeOf(id));
                                        // A branch of the previous bank no longer applies.
                                        if (id !== f.values.account_entity) f.setFieldValue('bank_branch', '');
                                    }}
                                />
                            ) : null}
                            {type === 'BANK' && f.values.account_entity ? (
                                <CustomAutocompletePicker
                                    key={`branch-${f.values.account_entity}`}
                                    name="bank_branch"
                                    label="Branch"
                                    options={branchOptionsOf(f.values.account_entity)}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    loading={banksLoading}
                                    placeholder="Search branches…"
                                    loadingPlaceholder="Loading branches…"
                                    emptyText="This bank has no active branches yet."
                                    initialTitle={f.values.account_entity === initialData?.account_entity ? initialData?.bank_branch_title ?? undefined : undefined}
                                />
                            ) : null}
                            {type === 'BANK' && f.values.account_entity ? (
                                <CustomTextField
                                    label="Bank / branch code"
                                    value={[
                                        bankCodeOf(f.values.account_entity) || f.values.account_code || 'No bank code set',
                                        branchCodeOf(f.values.account_entity, f.values.bank_branch) ||
                                            (f.values.bank_branch === initialData?.bank_branch ? initialData?.bank_branch_code : '') ||
                                            '—',
                                    ].join(' · ')}
                                    editable={false}
                                    hint="Taken from the bank and branch records."
                                />
                            ) : null}
                            {type === 'SACCO' ? <CustomTextField name="account_code" label="Sacco code" placeholder="Optional" /> : null}
                            <CustomTextField name="description" label="Notes" placeholder="Optional" multiline />
                        </FormSection>

                        <FormSection title="Status" hint={canVerify ? undefined : 'A WaziPOS admin verifies new accounts; changing the number or type of a verified account needs re-verification.'}>
                            <SwitchField name="is_active" label="Active" hint="Payouts for this entity go to the active account." />
                            {canVerify ? (
                                <SwitchField name="is_verified" label="Verified" hint="Confirm the details were checked against the entity's documents." />
                            ) : null}
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
