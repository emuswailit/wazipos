// components/admin/agents/AgentFormSheet.tsx
//
// Admins: make an existing user an agent and set their commission — the share
// (percent) of each subscription fee paid by an entity the agent registered.
// Editing changes the rate (future payments only) or switches the agent off.

import type { Agent } from '@/api/agentsApi';
import usersApi, { type SearchUserResult } from '@/api/usersApi';
import { AdminFormSheet, FormSection } from '@/components/admin/kit';
import { CustomTextField } from '@/components/common/CustomTextField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import useApi from '@/hooks/useApi';
import { Formik } from 'formik';
import React, { useCallback, useMemo } from 'react';
import * as Yup from 'yup';

export interface AgentFormValues {
    user: string;
    commission_percentage: string;
    is_active: boolean;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    /** null: create. */
    agent: Agent | null;
    submitting: boolean;
    error?: string | null;
    onSubmit: (values: AgentFormValues) => void;
}

const rate = Yup.number()
    .typeError('Enter a number, e.g. 10')
    .min(0, 'At least 0')
    .max(100, 'At most 100')
    .required('Enter the commission');

export default function AgentFormSheet({ visible, onClose, agent, submitting, error, onSubmit }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!agent;
    const searchUsersApi = useApi(usersApi.searchUsers);

    const schema = useMemo(
        () => Yup.object({ user: isEdit ? Yup.string() : Yup.string().required('Pick the user'), commission_percentage: rate }),
        [isEdit],
    );

    const onSearch = useCallback(
        (q: string) => {
            if (q.trim().length > 0) searchUsersApi.request(q);
        },
        [searchUsersApi],
    );

    const userOptions = useMemo(() => {
        if (!Array.isArray(searchUsersApi.data)) return [];
        return (searchUsersApi.data as SearchUserResult[]).map((u) => {
            const f: any = u.fields ?? u;
            const name = f.title || [f.first_name, f.last_name].filter(Boolean).join(' ') || 'Unknown user';
            return { id: String(u.pk || u.id), title: `${name} · ${f.phone || f.email || 'no phone'}` };
        });
    }, [searchUsersApi.data]);

    return (
        <Formik<AgentFormValues>
            key={`${visible}-${agent?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                user: agent?.user ?? '',
                commission_percentage: agent ? String(Number(agent.commission_percentage)) : '',
                is_active: agent ? agent.is_active : true,
            }}
            validationSchema={schema}
            onSubmit={(v) => onSubmit({ ...v, commission_percentage: String(Number(v.commission_percentage)) })}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit agent' : 'New agent'}
                    subtitle={isEdit ? agent?.name || agent?.email : 'They will see the Agent panel the next time they sign in'}
                    icon="people-circle-outline"
                    submitLabel={isEdit ? 'Save' : 'Make agent'}
                    submitting={submitting}
                    onSubmit={() => f.handleSubmit()}
                    error={error}
                    width={560}
                >
                    {!isEdit ? (
                        <FormSection title="User" hint="An existing user. Register them under Users first if they are new." zIndex={20}>
                            <LiveSearchAutocompletePicker
                                name="user"
                                label="User"
                                options={userOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={searchUsersApi.loading}
                                placeholder="Type phone, ID or name…"
                                loadingPlaceholder="Searching users…"
                                noMatchText="No users found."
                                emptyText="Start typing to search users."
                                onSearch={onSearch}
                            />
                        </FormSection>
                    ) : null}

                    <FormSection
                        title="Commission"
                        hint="The agent's share of every subscription fee paid by a business they registered. The rest goes to WaziPOS. A new rate applies to future payments only."
                    >
                        <CustomTextField
                            name="commission_percentage"
                            label="Commission (%)"
                            required
                            placeholder="e.g. 10"
                            keyboardType="decimal-pad"
                        />
                    </FormSection>

                    {isEdit ? (
                        <FormSection title="Status">
                            <SwitchField
                                name="is_active"
                                label="Active agent"
                                hint="Inactive agents lose the Agent panel at their next sign-in and earn no new commission."
                            />
                        </FormSection>
                    ) : null}
                </AdminFormSheet>
            )}
        </Formik>
    );
}
