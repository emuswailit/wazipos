// components/admin/roles/AdminRoleEditModal.tsx
//
// Create / edit a role, linked to a cluster.

import { AdminFormSheet, FormSection } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { useAuth } from '@/context/AuthContext';
import { useClustersSync } from '@/context/ClustersSyncContext';
import { Formik } from 'formik';
import { useEffect, useMemo } from 'react';
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
    title: Yup.string().trim().required('Enter the role name'),
    cluster: Yup.string().required('Pick a cluster'),
    description: Yup.string().nullable(),
});

export default function AdminRoleEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { clustersList, forceClustersRefresh, isClustersSyncing } = useClustersSync();

    useEffect(() => {
        if (visible && clustersList.length === 0) void forceClustersRefresh();
    }, [visible, clustersList.length, forceClustersRefresh]);

    const clusterOptions = useMemo(() => (clustersList || []).map((c) => ({ id: c.id, title: c.title || 'Unnamed cluster' })), [clustersList]);

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '', cluster: initialData?.cluster || '', description: initialData?.description || '' }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit role' : 'New role'}
                    subtitle={isEdit ? initialData?.title : 'Staff access role'}
                    icon="shield-checkmark-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create role'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Role" zIndex={20}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Accounts" />
                        <CustomAutocompletePicker
                            name="cluster"
                            label="Cluster"
                            options={clusterOptions}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={isClustersSyncing && clusterOptions.length === 0}
                            placeholder="Search clusters…"
                            loadingPlaceholder="Loading clusters…"
                            initialTitle={initialData?.cluster_title}
                        />
                    </FormSection>
                    <FormSection title="Description" hint="Optional.">
                        <CustomTextField name="description" label="Description" placeholder="What this role can do…" multiline numberOfLines={3} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
