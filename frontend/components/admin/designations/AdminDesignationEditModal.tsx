// components/admin/designations/AdminDesignationEditModal.tsx
//
// Create / edit a designation (job position) under a cadre.

import { AdminFormSheet, FormRow, FormSection } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { useCadresSync } from '@/context/CadresSyncContext';
import { Formik } from 'formik';
import { useEffect, useMemo } from 'react';
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

// Matches the backend TENURE_CHOICES.
const TENURE_OPTIONS = [
    { value: 'CONTRACTUAL', label: 'Contractual' },
    { value: 'INTERNSHIP', label: 'Internship' },
    { value: 'LOCUM', label: 'Locum' },
    { value: 'PERMANENT', label: 'Permanent' },
    { value: 'TEMPORARY', label: 'Temporary' },
];

const digits = (t: string) => t.replace(/[^0-9]/g, '');

const schema = Yup.object({
    title: Yup.string().trim().required('Enter the designation name'),
    cadre: Yup.string().required('Pick a cadre'),
    tenure: Yup.string().required('Pick a tenure'),
    total_slots: Yup.number().typeError('Enter a whole number').integer('Enter a whole number').min(0, "Can't be negative").required('Enter the number of slots'),
    duration_in_months: Yup.number().typeError('Enter a whole number').integer('Enter a whole number').min(0, "Can't be negative").required('Enter the duration'),
    description: Yup.string().nullable(),
});

export default function AdminDesignationEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { cadresList, forceCadresRefresh, isCadresSyncing } = useCadresSync();

    useEffect(() => {
        if (visible && cadresList.length === 0) void forceCadresRefresh();
    }, [visible, cadresList.length, forceCadresRefresh]);

    const cadreOptions = useMemo(() => (cadresList || []).map((c) => ({ id: c.id, title: c.title || 'Unnamed cadre' })), [cadresList]);

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                cadre: initialData?.cadre || '',
                tenure: initialData?.tenure || 'LOCUM',
                total_slots: initialData?.total_slots?.toString() || '1',
                duration_in_months: initialData?.duration_in_months?.toString() || '1',
                description: initialData?.description || '',
            }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit designation' : 'New designation'}
                    subtitle={isEdit ? initialData?.title : 'Job position'}
                    icon="id-card-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create designation'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Position" zIndex={30}>
                        <CustomTextField name="title" label="Name" required placeholder="e.g. Chief Pharmaceutical Technologist" />
                        <CustomAutocompletePicker
                            name="cadre"
                            label="Cadre"
                            options={cadreOptions}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={isCadresSyncing && cadreOptions.length === 0}
                            placeholder="Search cadres…"
                            loadingPlaceholder="Loading cadres…"
                            initialTitle={initialData?.cadre_title}
                        />
                    </FormSection>
                    <FormSection title="Terms" zIndex={20}>
                        <SelectDropdown name="tenure" label="Tenure" options={TENURE_OPTIONS} placeholder="Select tenure…" required />
                        <FormRow>
                            <CustomTextField name="total_slots" label="Slots" required placeholder="e.g. 3" keyboardType="number-pad" transform={digits} />
                            <CustomTextField name="duration_in_months" label="Duration (months)" required placeholder="e.g. 12" keyboardType="number-pad" transform={digits} />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Description" hint="Optional.">
                        <CustomTextField name="description" label="Description" placeholder="Responsibilities, requirements…" multiline numberOfLines={3} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
