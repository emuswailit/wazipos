// components/admin/preparations/AdminPreparationEditModal.tsx
//
// Create / edit a preparation: a formulation plus one or more generics.

import drugsApi from '@/api/drugsApi';
import { AdminFormSheet, FormSection, useLookupOptions } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
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
    formulation_id: string;
    generics: string[];
}

const schema = Yup.object({
    title: Yup.string().trim().min(2, 'At least 2 characters').required('Enter the preparation name'),
    description: Yup.string().ensure(),
    formulation_id: Yup.string().required('Pick a formulation'),
    generics: Yup.array().min(1, 'Add at least one generic').required('Add at least one generic'),
});

export default function AdminPreparationEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const formulations = useLookupOptions(drugsApi.formulationsAction, 'GetFormulations', visible);
    const generics = useLookupOptions(drugsApi.genericsAction, 'GetGenerics', visible);

    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                description: initialData?.description || '',
                formulation_id: initialData?.formulation_id || initialData?.formulation || '',
                generics: Array.isArray(initialData?.generics) ? initialData.generics : [],
            }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit preparation' : 'New preparation'}
                    subtitle={isEdit ? initialData?.long_title || initialData?.title : 'Formulation + generics'}
                    icon="eyedrop-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create preparation'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Preparation" zIndex={30}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. 500MG" />
                        <CustomAutocompletePicker
                            name="formulation_id"
                            label="Formulation"
                            options={formulations.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            initialTitle={initialData?.formulation_title}
                            loading={formulations.loading}
                            placeholder="Search formulations…"
                            loadingPlaceholder="Loading formulations…"
                        />
                    </FormSection>
                    <FormSection title="Generics" hint="The active ingredients in this preparation." zIndex={20}>
                        <CustomMultiselectAutocompletePicker
                            name="generics"
                            label="Generics"
                            options={generics.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={generics.loading}
                            placeholder="Search to add generics…"
                            loadingPlaceholder="Loading generics…"
                        />
                    </FormSection>
                    <FormSection title="Description" hint="Optional.">
                        <CustomTextField name="description" label="Description" placeholder="Strength, notes…" multiline numberOfLines={3} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
