// components/admin/frequencies/AdminFrequencyEditModal.tsx
//
// Create / edit a dosing frequency.

import { AdminFormSheet, FormRow, FormSection } from '@/components/admin/kit';
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
    abbreviation: string;
    latin: string;
    numerical: string;
    description: string;
}

const schema = Yup.object({
    title: Yup.string().trim().min(3, 'At least 3 characters').required('Enter the frequency name'),
    abbreviation: Yup.string().trim().required('Enter the prescription code'),
    latin: Yup.string().trim().required('Enter the Latin term'),
    numerical: Yup.number().typeError('Enter a whole number').integer('Enter a whole number').min(0, "Can't be negative").required('Enter doses per day'),
    description: Yup.string().trim().min(5, 'At least 5 characters').required('Describe the frequency'),
});

export default function AdminFrequencyEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const isEdit = !!initialData;
    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                abbreviation: initialData?.abbreviation || '',
                latin: initialData?.latin || '',
                numerical: initialData?.numerical !== undefined && initialData?.numerical !== null ? String(initialData.numerical) : '',
                description: initialData?.description || '',
            }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit frequency' : 'New frequency'}
                    subtitle={isEdit ? initialData?.title : 'Dosing frequency'}
                    icon="time-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create frequency'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Frequency">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Twice daily" />
                        <FormRow>
                            <CustomTextField name="abbreviation" label="Code (SIG)" required placeholder="e.g. BD" autoCapitalize="characters" />
                            <CustomTextField name="numerical" label="Doses per day" required placeholder="e.g. 2" keyboardType="number-pad" transform={(t: string) => t.replace(/[^0-9]/g, '')} />
                        </FormRow>
                        <CustomTextField name="latin" label="Latin term" required placeholder="e.g. bis in die" />
                    </FormSection>
                    <FormSection title="Description">
                        <CustomTextField name="description" label="Description" required placeholder="When doses are taken…" multiline numberOfLines={3} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
