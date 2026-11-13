// components/admin/cadres/AdminCadreEditModal.tsx
//
// Create / edit a cadre, linked to a cluster.

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
    title: Yup.string().trim().required('Enter the cadre name'),
    cluster: Yup.string().required('Pick a cluster'),
});

export default function AdminCadreEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
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
            initialValues={{ title: initialData?.title || '', cluster: initialData?.cluster || '' }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit cadre' : 'New cadre'}
                    subtitle={isEdit ? initialData?.title : 'Staff grade'}
                    icon="ribbon-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create cadre'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Cadre" zIndex={20}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Pharmacist" />
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
                </AdminFormSheet>
            )}
        </Formik>
    );
}
