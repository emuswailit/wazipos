// components/admin/formulations/AdminFormulationEditModal.tsx
//
// Create / edit a formulation (dosage form).

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
    remoteErrors?: any;
}

interface FormValues {
    title: string;
    description: string;
}

const schema = Yup.object({
    title: Yup.string().trim().min(2, 'At least 2 characters').required('Enter the formulation name'),
    description: Yup.string().trim().min(5, 'At least 5 characters').required('Describe the formulation'),
});

export default function AdminFormulationEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const isEdit = !!initialData;
    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '', description: initialData?.description || '' }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit formulation' : 'New formulation'}
                    subtitle={isEdit ? initialData?.title : 'Dosage form'}
                    icon="flask-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create formulation'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Formulation">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Tablet, Syrup, Injection" />
                        <CustomTextField name="description" label="Description" required placeholder="Physical form, how it's packaged…" multiline numberOfLines={4} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
