// components/admin/drugClasses/AdminDrugClassEditModal.tsx
//
// Create / edit a drug class, linked to a drug category.

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
    category: string;
}

const schema = Yup.object({
    title: Yup.string().trim().min(3, 'At least 3 characters').required('Enter the class name'),
    category: Yup.string().required('Pick a category'),
    description: Yup.string().trim().min(5, 'At least 5 characters'),
});

export default function AdminDrugClassEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const categories = useLookupOptions(drugsApi.categoriesAction, 'GetCategories', visible);

    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '', description: initialData?.description || '', category: initialData?.category || '' }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit class' : 'New class'}
                    subtitle={isEdit ? initialData?.title : 'Drug class'}
                    icon="layers-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create class'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Class" zIndex={20}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Beta blockers" />
                        <CustomAutocompletePicker
                            name="category"
                            label="Category"
                            options={categories.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            initialTitle={initialData?.category_title}
                            loading={categories.loading}
                            placeholder="Search categories…"
                            loadingPlaceholder="Loading categories…"
                        />
                    </FormSection>
                    <FormSection title="Description" hint="Optional — what drugs in this class do.">
                        <CustomTextField name="description" label="Description" placeholder="Mechanism, typical uses…" multiline numberOfLines={4} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
