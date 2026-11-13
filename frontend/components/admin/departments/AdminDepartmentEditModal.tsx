// components/admin/departments/AdminDepartmentEditModal.tsx
//
// Create / edit a department.

import { AdminFormSheet, FormSection } from '@/components/admin/kit';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SelectDropdown } from '@/components/common/SelectDropdown';
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

const DEPARTMENT_TYPE_OPTIONS = [
    { value: 'CLINIC', label: 'Clinic' },
    { value: 'LABORATORY', label: 'Laboratory' },
    { value: 'NUTRITION', label: 'Nutrition' },
    { value: 'PHYSIOTHERAPY', label: 'Physiotherapy' },
    { value: 'PHARMACY', label: 'Pharmacy' },
    { value: 'RADIOLOGY', label: 'Radiology' },
    { value: 'OUTPATIENT', label: 'Outpatient' },
    { value: 'OTHER', label: 'Other' },
    { value: 'WARD', label: 'Ward' },
];

const schema = Yup.object({
    title: Yup.string().trim().required('Enter the department name'),
    department_type: Yup.string().nullable(),
    description: Yup.string().nullable(),
});

export default function AdminDepartmentEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const isEdit = !!initialData;
    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{ title: initialData?.title || '', department_type: initialData?.department_type || '', description: initialData?.description || '' }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit department' : 'New department'}
                    subtitle={isEdit ? initialData?.title : 'Facility department'}
                    icon="business-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create department'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Department" zIndex={20}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Human Resources" />
                        <SelectDropdown name="department_type" label="Type" options={DEPARTMENT_TYPE_OPTIONS} placeholder="Select a type…" />
                    </FormSection>
                    <FormSection title="Description" hint="Optional.">
                        <CustomTextField name="description" label="Description" placeholder="What this department does…" multiline numberOfLines={3} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
