// components/admin/generics/AdminGenericEditModal.tsx
//
// Create / edit a generic (active ingredient) and its drug classes / sub-classes.
// Picking a sub-class also adds its parent class.

import drugsApi from '@/api/drugsApi';
import { AdminFormSheet, FormSection, useLookupOptions } from '@/components/admin/kit';
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
    drug_classes: string[];
    drug_sub_classes: string[];
}

const schema = Yup.object({
    title: Yup.string().trim().min(3, 'At least 3 characters').required('Enter the generic name'),
    description: Yup.string().trim().min(3, 'At least 3 characters'),
});

export default function AdminGenericEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const classes = useLookupOptions(drugsApi.drugClassesAction, 'GetDrugClasses', visible);
    const subclasses = useLookupOptions(drugsApi.drugSubClassesAction, 'GetDrugSubClasses', visible, {
        metaOf: (f) => ({ parentId: f?.drug_class || f?.drug_class_id || null }),
    });

    return (
        <Formik<FormValues>
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                description: initialData?.description || '',
                drug_classes: initialData?.drug_class ?? initialData?.drug_classes ?? [],
                drug_sub_classes: initialData?.drug_sub_class ?? initialData?.drug_sub_classes ?? [],
            }}
            validationSchema={schema}
            onSubmit={onSubmitTrigger}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit generic' : 'New generic'}
                    subtitle={isEdit ? initialData?.title : 'Active ingredient'}
                    icon="beaker-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create generic'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Generic">
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Amoxicillin" />
                        <CustomTextField name="description" label="Description" placeholder="Chemical or clinical notes (optional)…" multiline numberOfLines={3} />
                    </FormSection>
                    <FormSection title="Classification" hint="Picking a sub-class adds its drug class too." zIndex={20}>
                        <CustomMultiselectAutocompletePicker
                            name="drug_classes"
                            label="Drug classes"
                            options={classes.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={classes.loading}
                            placeholder="Search to add drug classes…"
                            loadingPlaceholder="Loading drug classes…"
                        />
                        <CustomMultiselectAutocompletePicker
                            name="drug_sub_classes"
                            label="Sub-classes"
                            options={subclasses.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={subclasses.loading}
                            placeholder="Search to add sub-classes…"
                            loadingPlaceholder="Loading sub-classes…"
                            onAfterSelect={(_id, _title, opt) => {
                                const parentId = opt.meta?.parentId;
                                if (!parentId) return;
                                const current = Array.isArray(f.values.drug_classes) ? f.values.drug_classes : [];
                                if (!current.includes(parentId)) f.setFieldValue('drug_classes', [...current, parentId]);
                            }}
                        />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
