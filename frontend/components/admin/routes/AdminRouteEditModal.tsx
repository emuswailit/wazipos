// components/admin/routes/AdminRouteEditModal.tsx
//
// Create / edit a route of administration. `initialData` presence decides the mode.

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

interface FormValues {
    title: string;
    description: string;
}

const schema = Yup.object({
    title: Yup.string().trim().min(3, 'At least 3 characters').max(50, 'At most 50 characters').required('Enter the route name'),
    description: Yup.string().trim().min(10, 'At least 10 characters').required('Describe how the medicine is given'),
});

export default function AdminRouteEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
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
                    title={isEdit ? 'Edit route' : 'New route'}
                    subtitle={isEdit ? initialData?.title : 'Route of administration'}
                    icon="git-branch-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create route'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Route">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. ORAL, INTRAVENOUS" autoCapitalize="characters" />
                        <CustomTextField
                            name="description"
                            label="Description"
                            required
                            placeholder="How the medicine is given, and any intake notes…"
                            multiline
                            numberOfLines={4}
                        />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
