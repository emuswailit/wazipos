// components/admin/products/AdminProductEditModal.tsx
//
// Admin create/edit form modal for products.
//
// Universal: web + native.
//
// Manufacturer entities sourced from useEntitiesSync().entitiesList,
// filtered by normalized entity_type match (handles casing and
// separator differences).

import drugsApi from '@/api/drugsApi';
import { BarcodeScannerInput } from '@/components/common/BarcodeScannerInput';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import { EntityAutocomplete } from '@/components/common/EntityAutocomplete';
import ProductImagesPicker from '@/components/common/ProductImagesPicker';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import useApi from '@/hooks/useApi';
import { Formik } from 'formik';
import { useEffect, useMemo } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import * as Yup from 'yup';

/* =========================================================
 * Types
 * ======================================================= */

interface Props {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (
        values: any,
        formikHelpers: any
    ) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

/* =========================================================
 * Entity type catalogue
 * ======================================================= */

const ENTITY_TYPES: readonly string[] = [
    'Bar',
    'Bank',
    'Clinic',
    'Default',
    'Dispensary',
    'GeneralDistributor',
    'PharmaceuticalDistributor',
    'Farm',
    'Grocery',
    'Hospital',
    'Hotel',
    'InternetServiceProvider',
    'Insurance',
    'GeneralManufacturer',
    'PharmaceuticalManufacturer',
    'Park',
    'Parking',
    'GeneralRetailer',
    'PharmaceuticalRetailer',
    'Realty',
    'Restaurant',
    'Sacco',
    'TransportCompany',
    'Telco',
    'GeneralWholesaler',
    'PharmaceuticalWholesaler',
];

function humanizeType(v: string): string {
    return v.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const ENTITY_TYPE_OPTIONS = ENTITY_TYPES.map((v) => ({
    id: v,
    title: humanizeType(v),
}));

/* =========================================================
 * Constants
 * ======================================================= */

const DEFAULT_CATEGORY_ID =
    '4cadab9a-a116-44b4-b25a-3aea006119f9';

/** Case- and separator-tolerant entity_type comparison. */
function normalizeEntityType(v: any): string {
    return String(v ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

const MANUFACTURER_TYPES: Set<string> = new Set(
    [
        'GeneralManufacturer',
        'PharmaceuticalManufacturer',
    ].map(normalizeEntityType)
);

/* =========================================================
 * Schema
 * ======================================================= */

const AdminProductFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(2, 'Brand title must be at least 2 characters')
        .required('Commercial brand name is required'),
    description: Yup.string().ensure(),
    preparation: Yup.string().ensure(),
    units_per_pack: Yup.number()
        .positive('Value must be greater than zero')
        .integer()
        .required('Units per package count is required'),
    pack_tag: Yup.string().required(
        'Packaging metric reference label is required'
    ),
    manufacturer_title: Yup.string().required(
        'Manufacturer selection is required'
    ),
    category: Yup.string().required(
        'Base catalog category classification code is required'
    ),
    is_vatable: Yup.string().required(
        'VAT configuration parameter selection is required'
    ),
    allowed_entities: Yup.array()
        .of(Yup.string())
        .min(1, 'Select at least one allowed entity type'),
});

/* =========================================================
 * Component
 * ======================================================= */

export default function AdminProductEditModal({
    visible,
    onClose,
    isDarkMode,
    theme,
    isSubmittingRemote,
    onSubmitTrigger,
    initialData,
    remoteErrors,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();

    /* ---------------- Entities from context ---------------- */
    const { entitiesList, isEntitiesSyncing } =
        useEntitiesSync();

    console.log("entitiesList", entitiesList)

    /* ---------------- Local fetches ---------------- */
    const getPreparationsApi = useApi<any>(async (payload: any) =>
        drugsApi.preparationsAction(payload)
    );
    const getCategoriesApi = useApi<any>(async (payload: any) =>
        drugsApi.categoriesAction(payload)
    );

    useEffect(() => {
        if (visible) {
            getPreparationsApi.request({
                action: 'GetPreparations',
            });
            getCategoriesApi.request({
                action: 'GetCategories',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    /* ---------------------------------------------------------
     * Diagnostic — remove once the dropdown populates
     * ------------------------------------------------------- */
    useEffect(() => {
        if (!visible) return;
        const list = entitiesList ?? [];
        const types = new Set(
            list.map((e: any) => e.entity_type)
        );
        const matched = list.filter((e: any) =>
            MANUFACTURER_TYPES.has(
                normalizeEntityType(e.entity_type)
            )
        );
        console.log(
            '[Products] entities count:',
            list.length
        );
        console.log(
            '[Products] entity_type values present:',
            [...types]
        );
        console.log(
            '[Products] manufacturer matches:',
            matched.length
        );
    }, [visible, entitiesList]);

    /* ---------------- Option builders ---------------- */

    const preparationOptions = useMemo(() => {
        if (!Array.isArray(getPreparationsApi.data)) return [];
        return getPreparationsApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title:
                    f?.long_title ||
                    f?.title ||
                    'UNSPECIFIED',
            };
        });
    }, [getPreparationsApi.data]);

    const categoryOptions = useMemo(() => {
        if (!Array.isArray(getCategoriesApi.data)) return [];
        return getCategoriesApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
            };
        });
    }, [getCategoriesApi.data]);

    /**
     * Manufacturer entities — pulled from the context's
     * `entitiesList` with a normalized type check.
     *
     * `remote_id` alias added because EntityAutocomplete reads
     * `.remote_id` but the context stores it as `.id`.
     */
    const manufacturerEntities = useMemo(() => {
        if (!Array.isArray(entitiesList)) return [];
        console.log("entitiesList", entitiesList)
        return entitiesList
            .filter((e: any) =>
                MANUFACTURER_TYPES.has(
                    normalizeEntityType(e.entity_type)
                )
            )
            .map((e: any) => ({
                ...e,
                remote_id: e.id,
            }));
    }, [entitiesList]);
    console.log("manufacturerEntities", manufacturerEntities)
    useEffect(() => {
        if (remoteErrors) {
            console.log(
                `❌ [Admin API Error Matrix] Catalog Refused Mutation:`,
                JSON.stringify(remoteErrors)
            );
        }
    }, [remoteErrors]);

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={
                    Platform.OS === 'ios' ? 'padding' : 'height'
                }
                keyboardVerticalOffset={
                    Platform.OS === 'ios' ? 0 : 20
                }
                style={{
                    flex: 1,
                    backgroundColor: theme.background,
                }}
            >
                <View
                    style={{ height: screenHeight }}
                    className="flex-1 flex-col w-full"
                >
                    {/* ───── Header ───── */}
                    <View
                        style={{
                            backgroundColor: theme.panel,
                            borderBottomColor: theme.border,
                        }}
                        className="h-16 w-full border-b px-6 flex-row justify-between items-center"
                    >
                        <View className="flex-row items-center gap-x-3">
                            <View
                                style={{
                                    backgroundColor:
                                        theme.primary + '15',
                                }}
                                className="px-2.5 py-1 rounded-md"
                            >
                                <Text
                                    style={{ color: theme.primary }}
                                    className="text-[10px] font-black tracking-widest uppercase"
                                >
                                    Catalog Entry
                                </Text>
                            </View>
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                {initialData
                                    ? 'Modify Brand Attributes'
                                    : 'Register Brand Product'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20"
                        >
                            <Text
                                className="text-red-500 font-bold text-xs px-2"
                                style={{
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                ✕ Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* ───── Form ───── */}
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        className="flex-1 w-full px-6 py-6"
                    >
                        <View className="w-full max-w-2xl mx-auto">
                            <Formik
                                enableReinitialize={true}
                                initialValues={{
                                    title:
                                        initialData?.title || '',
                                    description:
                                        initialData?.description || '',
                                    preparation:
                                        initialData?.preparation || '',
                                    units_per_pack:
                                        initialData?.units_per_pack !==
                                            undefined
                                            ? String(
                                                initialData.units_per_pack
                                            )
                                            : '0',
                                    pack_tag:
                                        initialData?.pack_tag || "100'S",
                                    manufacturer:
                                        initialData?.manufacturer || '',
                                    manufacturer_title:
                                        initialData?.manufacturer_title ||
                                        '',
                                    category:
                                        initialData?.category ||
                                        DEFAULT_CATEGORY_ID,
                                    is_vatable:
                                        initialData?.is_vatable !==
                                            undefined
                                            ? String(
                                                initialData.is_vatable
                                            )
                                            : 'false',
                                    allowed_entities: Array.isArray(
                                        initialData?.allowed_entities
                                    )
                                        ? initialData.allowed_entities
                                        : [],
                                    bar_code:
                                        initialData?.bar_code || '',
                                    images: Array.isArray(
                                        initialData?.images
                                    )
                                        ? initialData.images
                                        : [],
                                }}
                                validationSchema={
                                    AdminProductFormSchema
                                }
                                onSubmit={(values, formikHelpers) => {
                                    console.log(
                                        `📦 [Admin Payload Monitor] action: "${initialData
                                            ? 'UpdateProduct'
                                            : 'CreateProduct'
                                        }" | data:`,
                                        JSON.stringify(values)
                                    );
                                    onSubmitTrigger(
                                        values,
                                        formikHelpers
                                    );
                                }}
                            >
                                {({
                                    handleSubmit,
                                    setFieldValue,
                                    values,
                                }) => (
                                    <View
                                        style={{
                                            backgroundColor:
                                                theme.panel,
                                            borderColor: theme.primary,
                                        }}
                                        className="p-6 rounded-2xl border flex-col w-full gap-y-4"
                                    >
                                        {/* Title */}
                                        <CustomTextField
                                            name="title"
                                            label="Commercial Product Brand Name"
                                            placeholder="e.g. AMPIMOX"
                                            required
                                            autoCapitalize="characters"
                                            textAlign="center"
                                        />

                                        {/* Description */}
                                        <CustomTextField
                                            name="description"
                                            label="Description"
                                            placeholder="Optional description..."
                                            multiline
                                            numberOfLines={3}
                                        />

                                        {/* Preparation */}
                                        <CustomAutocompletePicker
                                            name="preparation"
                                            label="Preparation"
                                            options={preparationOptions}
                                            theme={theme}
                                            isDarkMode={isDarkMode}
                                            initialTitle={
                                                initialData?.long_preparation_title ||
                                                initialData?.preparation_title
                                            }
                                            loading={
                                                getPreparationsApi.loading
                                            }
                                            placeholder="Select preparation..."
                                            loadingPlaceholder="Loading preparations..."
                                            noMatchText="No preparations match."
                                        />

                                        {/* Manufacturer — entities from context */}
                                        <EntityAutocomplete
                                            name="manufacturer"
                                            fieldMap={{
                                                id: 'manufacturer',
                                                title: 'manufacturer_title',
                                            }}
                                            entities={manufacturerEntities}
                                            label="Manufacturer"
                                            placeholder="Search manufacturers..."
                                            required
                                            loading={isEntitiesSyncing}
                                            showMeta
                                        />

                                        {/* Category */}
                                        <CustomAutocompletePicker
                                            name="category"
                                            label="Category"
                                            options={categoryOptions}
                                            theme={theme}
                                            isDarkMode={isDarkMode}
                                            initialTitle={
                                                initialData?.category_title
                                            }
                                            loading={
                                                getCategoriesApi.loading
                                            }
                                            placeholder="Select category..."
                                            loadingPlaceholder="Loading categories..."
                                            noMatchText="No categories match."
                                        />

                                        {/* Allowed entities — entity TYPES */}
                                        <CustomMultiselectAutocompletePicker
                                            name="allowed_entities"
                                            label="Allowed Entity Types"
                                            options={ENTITY_TYPE_OPTIONS}
                                            theme={theme}
                                            isDarkMode={isDarkMode}
                                            placeholder="Search entity types..."
                                            loadingPlaceholder="Loading entity types..."
                                            noMatchText="No entity types match."
                                        />

                                        {/* Units + pack tag */}
                                        <View className="w-full flex-row gap-x-4">
                                            <View className="flex-1">
                                                <CustomTextField
                                                    name="units_per_pack"
                                                    label="Units Quantity per Pack"
                                                    placeholder="100"
                                                    required
                                                    keyboardType="numeric"
                                                    textAlign="center"
                                                />
                                            </View>
                                            <View className="flex-1">
                                                <CustomTextField
                                                    name="pack_tag"
                                                    label="Packaging Display Tag"
                                                    placeholder="100'S"
                                                    required
                                                    textAlign="center"
                                                />
                                            </View>
                                        </View>

                                        {/* Barcode */}
                                        <View className="items-start w-full">
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                }}
                                                className="text-[10px] uppercase tracking-wider mb-1"
                                            >
                                                Product Barcode SKU / GTIN
                                                Number
                                            </Text>
                                            <BarcodeScannerInput
                                                name="bar_code"
                                                placeholder="Scanned data string mounts here natively"
                                            />
                                        </View>

                                        {/* Vatable radio */}
                                        <View className="items-start w-full">
                                            <Text
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                }}
                                                className="text-[10px] uppercase tracking-wider mb-1"
                                            >
                                                Is Vatable Supply Node
                                                Parameter
                                            </Text>
                                            <View className="flex-row items-center gap-x-4 mt-1">
                                                {['true', 'false'].map(
                                                    (opt) => (
                                                        <TouchableOpacity
                                                            key={opt}
                                                            onPress={() =>
                                                                setFieldValue(
                                                                    'is_vatable',
                                                                    opt
                                                                )
                                                            }
                                                            className="flex-row items-center gap-x-2"
                                                        >
                                                            <View
                                                                style={{
                                                                    borderColor:
                                                                        theme.primary,
                                                                }}
                                                                className="w-4 h-4 rounded-full border items-center justify-center"
                                                            >
                                                                {values.is_vatable ===
                                                                    opt && (
                                                                        <View
                                                                            style={{
                                                                                backgroundColor:
                                                                                    theme.primary,
                                                                            }}
                                                                            className="w-2.5 h-2.5 rounded-full"
                                                                        />
                                                                    )}
                                                            </View>
                                                            <Text
                                                                style={{
                                                                    color: theme.text,
                                                                    fontFamily:
                                                                        theme.font.bold,
                                                                }}
                                                                className="text-xs uppercase"
                                                            >
                                                                {opt === 'true'
                                                                    ? 'Standard VAT Tax Rate'
                                                                    : 'Zero Rated / Exempt'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )
                                                )}
                                            </View>
                                        </View>

                                        {/* Images */}
                                        <View className="items-start w-full">
                                            <ProductImagesPicker
                                                theme={theme}
                                                isDarkMode={isDarkMode}
                                                images={values.images}
                                                onImagesChange={(next) =>
                                                    setFieldValue(
                                                        'images',
                                                        next
                                                    )
                                                }
                                            />
                                        </View>

                                        {/* ───── Actions ───── */}
                                        <View className="flex-row items-center gap-x-3 mt-4 w-full">
                                            <TouchableOpacity
                                                onPress={onClose}
                                                disabled={
                                                    isSubmittingRemote
                                                }
                                                className="flex-1 h-12 rounded-xl items-center justify-center border active:opacity-70"
                                                style={{
                                                    borderColor:
                                                        theme.border,
                                                }}
                                            >
                                                <Text
                                                    className="font-bold uppercase tracking-wider"
                                                    style={{
                                                        color: theme.textDark,
                                                        fontFamily:
                                                            theme.font.bold,
                                                        fontSize:
                                                            theme.fontSize.sm,
                                                    }}
                                                >
                                                    Cancel
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    handleSubmit()
                                                }
                                                disabled={
                                                    isSubmittingRemote
                                                }
                                                style={{
                                                    backgroundColor:
                                                        theme.primary,
                                                }}
                                                className="flex-1 h-12 rounded-xl items-center justify-center active:opacity-90"
                                            >
                                                {isSubmittingRemote ? (
                                                    <ActivityIndicator
                                                        color="#ffffff"
                                                        size="small"
                                                    />
                                                ) : (
                                                    <Text
                                                        className="text-white uppercase tracking-wider"
                                                        style={{
                                                            fontFamily:
                                                                theme.font.bold,
                                                            fontSize:
                                                                theme.fontSize.sm,
                                                        }}
                                                    >
                                                        Save Product
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </Formik>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}