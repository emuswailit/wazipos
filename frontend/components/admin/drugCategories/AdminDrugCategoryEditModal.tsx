// components/admin/drugCategories/AdminDrugCategoryEditModal.tsx
//
// Create / edit a drug category. `initialData` presence decides the mode.

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
    title: Yup.string().trim().min(3, 'At least 3 characters').required('Enter the category name'),
    description: Yup.string().trim().min(5, 'At least 5 characters').required('Describe the category'),
});

export default function AdminDrugCategoryEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
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
                    title={isEdit ? 'Edit category' : 'New category'}
                    subtitle={isEdit ? initialData?.title : 'Drug category · body system'}
                    icon="albums-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create category'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Category">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Cardiovascular system" />
                        <CustomTextField name="description" label="Description" required placeholder="What this category covers…" multiline numberOfLines={4} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
