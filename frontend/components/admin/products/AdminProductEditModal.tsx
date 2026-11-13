// components/admin/products/AdminProductEditModal.tsx
//
// Create / edit a catalogue product (web + native — one form for every screen size).

import drugsApi from '@/api/drugsApi';
import { AdminFormSheet, FormPanel, FormRow, FormSection, useLookupOptions } from '@/components/admin/kit';
import { BarcodeScannerInput } from '@/components/common/BarcodeScannerInput';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import ProductImagesPicker from '@/components/common/ProductImagesPicker';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { SwitchField } from '@/components/common/SwitchField';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useCategories } from '@/hooks/useCategories';
import { Formik } from 'formik';
import { useMemo } from 'react';
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

const ENTITY_TYPES: readonly string[] = [
    'Bar', 'Bank', 'Clinic', 'Courier', 'Default', 'Delivery', 'Dispensary',
    'GeneralDistributor', 'PharmaceuticalDistributor', 'Farm',
    'Grocery', 'Hospital', 'Hotel', 'InternetServiceProvider',
    'Insurance', 'GeneralManufacturer', 'PharmaceuticalManufacturer',
    'Park', 'Parking', 'GeneralRetailer', 'PharmaceuticalRetailer',
    'Realty', 'Restaurant', 'Sacco', 'TransportCompany', 'Telco',
    'GeneralWholesaler', 'PharmaceuticalWholesaler',
];

const ENTITY_TYPE_OPTIONS = ENTITY_TYPES.map((v) => ({ id: v, title: v.replace(/([a-z])([A-Z])/g, '$1 $2') }));

const DEFAULT_CATEGORY_ID = '4cadab9a-a116-44b4-b25a-3aea006119f9';

const normalizeType = (v: any) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MANUFACTURER_TYPES = new Set(['GeneralManufacturer', 'PharmaceuticalManufacturer'].map(normalizeType));

const schema = Yup.object({
    title: Yup.string().trim().min(2, 'At least 2 characters').required('Enter the brand name'),
    description: Yup.string().ensure(),
    preparation: Yup.string().ensure(),
    units_per_pack: Yup.number().typeError('Enter a whole number').positive('Must be more than 0').integer('Enter a whole number').required('Enter units per pack'),
    pack_tag: Yup.string().trim().required("Enter the pack tag, e.g. 100'S"),
    manufacturer_title: Yup.string().required('Pick the manufacturer'),
    category: Yup.string().required('Pick a category'),
    is_vatable: Yup.string().required(),
    allowed_entities: Yup.array().of(Yup.string()).min(1, 'Pick at least one entity type'),
});

export default function AdminProductEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { entitiesList, isEntitiesSyncing } = useEntitiesSync();
    const { categories } = useCategories();
    const preparations = useLookupOptions(drugsApi.preparationsAction, 'GetPreparations', visible, {
        titleOf: (f) => f?.long_title || f?.title || 'Untitled',
    });

    const categoryOptions = useMemo(() => {
        const fetched = categories.map((c) => ({ value: c.id, label: c.title }));
        if (initialData?.category && initialData?.category_title && !fetched.find((f) => f.value === initialData.category)) {
            fetched.push({ value: initialData.category, label: initialData.category_title });
        }
        return fetched;
    }, [categories, initialData]);

    const manufacturerOptions = useMemo(
        () =>
            (Array.isArray(entitiesList) ? entitiesList : [])
                .filter((e: any) => MANUFACTURER_TYPES.has(normalizeType(e.entity_type)))
                .map((e: any) => ({ id: String(e.remote_id ?? e.id ?? ''), title: e.title ?? 'Untitled' }))
                .filter((o) => !!o.id),
        [entitiesList]
    );

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                description: initialData?.description || '',
                preparation: initialData?.preparation || '',
                units_per_pack: initialData?.units_per_pack !== undefined ? String(initialData.units_per_pack) : '',
                pack_tag: initialData?.pack_tag || "100'S",
                manufacturer: initialData?.manufacturer || '',
                manufacturer_title: initialData?.manufacturer_title || '',
                category: initialData?.category || DEFAULT_CATEGORY_ID,
                is_vatable: initialData?.is_vatable !== undefined ? String(initialData.is_vatable) : 'false',
                allowed_entities: Array.isArray(initialData?.allowed_entities) ? initialData.allowed_entities : [],
                bar_code: initialData?.bar_code || '',
                images: Array.isArray(initialData?.images) ? initialData.images : [],
            }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={isEdit ? 'Edit product' : 'New product'}
                    subtitle={isEdit ? initialData?.title : 'Catalogue product'}
                    icon="cube-outline"
                    submitLabel={isEdit ? 'Save changes' : 'Create product'}
                    submitting={f.isSubmitting || isSubmittingRemote}
                    onSubmit={() => f.handleSubmit()}
                    width={720}
                >
                    <FormSection title="Product" zIndex={40}>
                        <CustomTextField name="title" label="Brand name" required placeholder="e.g. AMPIMOX" autoCapitalize="characters" />
                        <FormRow zIndex={30}>
                            <SelectDropdown name="category" label="Category" options={categoryOptions} placeholder="Select category…" required />
                            <CustomAutocompletePicker
                                name="manufacturer"
                                label="Manufacturer"
                                options={manufacturerOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                initialTitle={initialData?.manufacturer_title}
                                loading={isEntitiesSyncing}
                                placeholder="Search manufacturers…"
                                onAfterSelect={(_id, title) => f.setFieldValue('manufacturer_title', title)}
                            />
                        </FormRow>
                        <CustomAutocompletePicker
                            name="preparation"
                            label="Preparation"
                            options={preparations.options}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            initialTitle={initialData?.long_preparation_title || initialData?.preparation_title}
                            loading={preparations.loading}
                            placeholder="Search preparations…"
                        />
                        <CustomTextField name="description" label="Description" placeholder="Optional…" multiline numberOfLines={3} />
                    </FormSection>

                    <FormSection title="Packaging" zIndex={20}>
                        <FormRow>
                            <CustomTextField name="units_per_pack" label="Units per pack" required placeholder="100" keyboardType="number-pad" transform={(t: string) => t.replace(/[^0-9]/g, '')} />
                            <CustomTextField name="pack_tag" label="Pack tag" required placeholder="100'S" />
                        </FormRow>
                        <BarcodeScannerInput name="bar_code" label="Barcode (SKU / GTIN)" placeholder="Scan or type…" />
                    </FormSection>

                    <FormSection title="Who can stock it" hint="Entity types allowed to list this product." zIndex={10}>
                        <CustomMultiselectAutocompletePicker
                            name="allowed_entities"
                            label="Allowed entity types"
                            options={ENTITY_TYPE_OPTIONS}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            placeholder="Search entity types…"
                            noMatchText="No entity types match."
                        />
                        <FormPanel tint={f.values.is_vatable === 'true' ? '#8b5cf6' : undefined}>
                            <SwitchField
                                label="Charge VAT"
                                hint="Turn on if this product is VAT-able."
                                row
                                value={f.values.is_vatable === 'true'}
                                onChange={(v) => f.setFieldValue('is_vatable', v ? 'true' : 'false')}
                            />
                        </FormPanel>
                    </FormSection>

                    <FormSection title="Images">
                        <ProductImagesPicker theme={theme} isDarkMode={isDarkMode} images={f.values.images} onImagesChange={(next) => f.setFieldValue('images', next)} />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
