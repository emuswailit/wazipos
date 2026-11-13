// components/admin/clusters/AdminClusterEditModal.tsx
//
// Create / edit a cluster.

import { AdminFormSheet, FormSection } from '@/components/admin/kit';
import { CustomTextField } from '@/components/common/CustomTextField';
import { Formik } from 'formik';
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
    title: Yup.string().trim().required('Enter the cluster name'),
});

export default function AdminClusterEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const isEdit = !!initialData;
    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '' }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit cluster' : 'New cluster'}
                    subtitle={isEdit ? initialData?.title : 'Group of roles and cadres'}
                    icon="grid-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create cluster'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                    width={520}
                >
                    <FormSection title="Cluster">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. ACCOUNTS" autoCapitalize="characters" />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
