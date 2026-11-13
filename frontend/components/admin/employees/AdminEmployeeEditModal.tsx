// components/admin/employees/AdminEmployeeEditModal.tsx
//
// Register / edit an employee: link a user account, then set designation,
// department, roles and employment dates.

import usersApi, { SearchUserResult } from '@/api/usersApi';
import { AdminAvatarTile, AdminFormSheet, FormRow, FormSection } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { useListTokens } from '@/components/common/listScreen/tokens';
import { useAuth } from '@/context/AuthContext';
import { useDepartmentsSync } from '@/context/DepartmentsSyncContext';
import { useDesignationsSync } from '@/context/DesignationsSyncContext';
import { useRolesSync } from '@/context/RolesSyncContext';
import useApi from '@/hooks/useApi';
import { Formik } from 'formik';
import { useCallback, useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import * as Yup from 'yup';

interface Props {
    visible: boolean;
    onClose: () => void;
    isDarkMode?: boolean;
    theme?: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
}

const schema = Yup.object({
    user_id: Yup.string().required('Pick the user account'),
    designation: Yup.string().required('Pick a designation'),
    department: Yup.string().nullable(),
    advert: Yup.string().nullable(),
    hire_date: Yup.string().required('Pick the hire date'),
    terminal_date: Yup.string().nullable(),
    roles: Yup.array().of(Yup.string()).min(1, 'Pick at least one role').required('Pick at least one role'),
});

function userName(f: any): string {
    return f?.title || [f?.first_name, f?.last_name].filter(Boolean).join(' ') || '';
}

export default function AdminEmployeeEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const searchUsersApi = useApi(usersApi.searchUsers);

    const { rolesList, forceRolesRefresh, isRolesSyncing } = useRolesSync();
    const { designationsList, forceDesignationsRefresh, isDesignationsSyncing } = useDesignationsSync();
    const { departmentsList, forceDepartmentsRefresh, isDepartmentsSyncing } = useDepartmentsSync();

    useEffect(() => {
        if (!visible) return;
        if (rolesList.length === 0) void forceRolesRefresh();
        if (designationsList.length === 0) void forceDesignationsRefresh();
        if (departmentsList.length === 0) void forceDepartmentsRefresh();
    }, [visible, rolesList.length, designationsList.length, departmentsList.length, forceRolesRefresh, forceDesignationsRefresh, forceDepartmentsRefresh]);

    const handleUserSearch = useCallback(
        (query: string) => {
            if (query.trim().length > 0) searchUsersApi.request(query);
        },
        [searchUsersApi]
    );

    const users = Array.isArray(searchUsersApi.data) ? (searchUsersApi.data as SearchUserResult[]) : [];

    const userOptions = useMemo(
        () =>
            users.map((u) => {
                const f: any = u.fields ?? u;
                const name = userName(f) || 'Unknown user';
                const phone = f.phone || 'no phone';
                const identifier = f.identifier_number || f.identifier || f.id_number || '';
                return { id: u.pk || u.id, title: identifier ? `${name} · ${phone} (${identifier})` : `${name} · ${phone}` };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [searchUsersApi.data]
    );

    const roleOptions = useMemo(() => (rolesList || []).map((r) => ({ id: r.id, title: r.title })), [rolesList]);
    const designationOptions = useMemo(() => (designationsList || []).map((d) => ({ id: d.id, title: d.title })), [designationsList]);
    const departmentOptions = useMemo(() => (departmentsList || []).map((d) => ({ id: d.id, title: d.title })), [departmentsList]);

    const initialRoleIds = Array.isArray(initialData?.roles) ? initialData.roles.map((r: any) => r.id) : [];
    const pickedUserTitle = initialData?.user_title || userOptions.find((o) => o.id === initialData?.user_id)?.title || '';

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                user_id: initialData?.user_id || '',
                designation: initialData?.designation || '',
                department: initialData?.department || '',
                advert: initialData?.advert || '',
                hire_date: initialData?.hire_date || '',
                terminal_date: initialData?.terminal_date || '',
                roles: initialRoleIds,
            }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(form) => {
                const selected: any = users.find((u) => (u.pk || u.id) === form.values.user_id);
                const f = selected?.fields ?? selected;
                const confirmName = userName(f) || (form.values.user_id ? pickedUserTitle : '');
                const confirmContact = [f?.phone, f?.email].filter(Boolean).join(' · ');

                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={isEdit ? 'Edit employee' : 'New employee'}
                        subtitle={isEdit ? initialData?.title || initialData?.user_title : 'Link a user to your entity'}
                        icon="people-outline"
                        submitLabel={isEdit ? 'Save changes' : 'Add employee'}
                        submitting={form.isSubmitting || isSubmittingRemote}
                        onSubmit={() => form.handleSubmit()}
                    >
                        <FormSection title="Person" hint="Search by phone, ID number or name." zIndex={60}>
                            <LiveSearchAutocompletePicker
                                name="user_id"
                                label="User account"
                                options={userOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={searchUsersApi.loading}
                                placeholder="Type phone, ID or name…"
                                loadingPlaceholder="Searching users…"
                                noMatchText="No users found."
                                emptyText="Start typing to search users."
                                onSearch={handleUserSearch}
                                initialTitle={pickedUserTitle}
                            />
                            {confirmName ? <PickedUser name={confirmName} contact={confirmContact} /> : null}
                        </FormSection>

                        <FormSection title="Position" zIndex={50}>
                            <FormRow zIndex={50}>
                                <CustomAutocompletePicker
                                    name="designation"
                                    label="Designation"
                                    options={designationOptions}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    placeholder="Select designation…"
                                    loadingPlaceholder="Loading designations…"
                                    loading={isDesignationsSyncing && designationOptions.length === 0}
                                    initialTitle={initialData?.designation_title}
                                />
                                <CustomAutocompletePicker
                                    name="department"
                                    label="Department (optional)"
                                    options={departmentOptions}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    placeholder="Select department…"
                                    loadingPlaceholder="Loading departments…"
                                    loading={isDepartmentsSyncing && departmentOptions.length === 0}
                                    initialTitle={initialData?.department_title}
                                />
                            </FormRow>
                            <CustomMultiselectAutocompletePicker
                                name="roles"
                                label="Roles"
                                options={roleOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={isRolesSyncing && roleOptions.length === 0}
                                placeholder="Select roles…"
                                loadingPlaceholder="Loading roles…"
                                noMatchText="No roles match."
                            />
                        </FormSection>

                        <FormSection title="Employment" zIndex={40}>
                            <FormRow zIndex={40}>
                                <DateField name="hire_date" label="Hire date" placeholder="Select date" required bare />
                                <DateField name="terminal_date" label="End date (optional)" placeholder="Select date" bare />
                            </FormRow>
                            <CustomTextField name="advert" label="Advert / source (optional)" placeholder="e.g. Referral, job board…" />
                        </FormSection>
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}

function PickedUser({ name, contact }: { name: string; contact: string }) {
    const { theme, chipBg } = useListTokens();
    return (
        <View className="flex-row items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: chipBg }}>
            <AdminAvatarTile title={name} size={40} />
            <View className="flex-1 min-w-0">
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>
                    {name}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                    {contact || 'No contact on file'}
                </Text>
            </View>
        </View>
    );
}
