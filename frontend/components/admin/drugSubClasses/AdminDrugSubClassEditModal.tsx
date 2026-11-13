// components/admin/drugSubClasses/AdminDrugSubClassEditModal.tsx
//
// Create / edit a drug sub-class, linked to a drug class.

import drugsApi from '@/api/drugsApi';
import { AdminFormSheet, FormSection, useLookupOptions } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { useAuth } from '@/context/AuthContext';
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
    drug_class: string;
}

const schema = Yup.object({
    title: Yup.string().trim().min(3, 'At least 3 characters').required('Enter the sub-class name'),
    drug_class: Yup.string().required('Pick a drug class'),
});

export default function AdminDrugSubClassEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const classes = useLookupOptions(drugsApi.drugClassesAction, 'GetDrugClasses', visible);

    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '', description: initialData?.description || '', drug_class: initialData?.drug_class || '' }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit sub-class' : 'New sub-class'}
                    subtitle={isEdit ? initialData?.title : 'Drug sub-class'}
                    icon="git-network-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create sub-class'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Sub-class" zIndex={20}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Cardioselective beta blockers" />
                        <CustomAutocompletePicker
                            name="drug_class"
                            label="Drug class"
                            options={classes.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            initialTitle={initialData?.drug_class_title}
                            loading={classes.loading}
                            placeholder="Search drug classes…"
                            loadingPlaceholder="Loading drug classes…"
                        />
                    </FormSection>
                    <FormSection title="Description" hint="Optional.">
                        <CustomTextField name="description" label="Description" placeholder="What sets this sub-class apart…" multiline numberOfLines={4} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
