// components/admin/entities/AdminEntityEditModal.tsx
//
// Register / edit an entity (shop, hospital, bank, …).
// Bank code only for banks, level only for hospitals; county + town are required in
// Kenya; GPS + categories only for retailers / wholesalers.

import usersApi, { SearchUserResult } from '@/api/usersApi';
import { AdminFormSheet, FormRow, FormSection } from '@/components/admin/kit';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
import { CustomTextField } from '@/components/common/CustomTextField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useListTokens, webPointer } from '@/components/common/listScreen/tokens';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import useApi from '@/hooks/useApi';
import { useCategories } from '@/hooks/useCategories';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Formik } from 'formik';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
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

const RAW_ENTITY_TYPES = [
    'Bar', 'Bank', 'Clinic', 'Courier', 'Default', 'Delivery', 'Dispensary',
    'GeneralDistributor', 'PharmaceuticalDistributor', 'Farm', 'Grocery',
    'Hospital', 'Hotel', 'InternetServiceProvider', 'Insurance',
    'GeneralManufacturer', 'PharmaceuticalManufacturer', 'Park', 'Parking',
    'GeneralRetailer', 'PharmaceuticalRetailer', 'Realty', 'Restaurant',
    'Sacco', 'TransportCompany', 'Telco', 'GeneralWholesaler', 'PharmaceuticalWholesaler',
];

const RETAIL_WHOLESALE_TYPES = ['GeneralRetailer', 'PharmaceuticalRetailer', 'GeneralWholesaler', 'PharmaceuticalWholesaler'];

const KENYA_COUNTRY_ID = 'b4d0e91b-1600-4e1d-b147-f3f1c7e2f35f';

const humanizeEntityType = (val: string) => val.replace(/([a-z])([A-Z])/g, '$1 $2');

const ENTITY_TYPE_OPTIONS = RAW_ENTITY_TYPES.map((val) => ({ id: val, title: humanizeEntityType(val) }));

const OWNERSHIP_OPTIONS = [
    { value: 'PRIVATE', label: 'Private' },
    { value: 'PUBLIC', label: 'Public' },
];

const LEVEL_OPTIONS = ['0', '1', '2', '3'].map((v) => ({ value: v, label: `Level ${v}` }));

const schema = Yup.object({
    title: Yup.string().trim().min(2, 'At least 2 characters').required('Enter the entity name'),
    entity_type: Yup.string().required('Pick the entity type'),
    country: Yup.string().required('Pick the country'),
    county: Yup.string().when('country', {
        is: (val: string) => val === KENYA_COUNTRY_ID,
        then: (s) => s.required('Pick the county'),
        otherwise: (s) => s.notRequired().nullable(),
    }),
    town: Yup.string().when('country', {
        is: (val: string) => val === KENYA_COUNTRY_ID,
        then: (s) => s.required('Enter the town'),
        otherwise: (s) => s.notRequired().nullable(),
    }),
});

export default function AdminEntityEditModal({ visible, onClose, isSubmittingRemote, onSubmitTrigger, initialData }: Props) {
    const { theme, isDarkMode } = useAuth();
    const isEdit = !!initialData;
    const { countriesRaw, getCountiesByCountry, entitiesList } = useEntitiesSync();
    const { categories, loading: categoriesLoading } = useCategories();
    const searchUsersApi = useApi(usersApi.searchUsers);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);
    // Categories is the last section; its list opens upward over the sections
    // above, so it must be on top while open (sections stack by zIndex).
    const [categoriesOpen, setCategoriesOpen] = useState(false);

    const handleUserSearch = useCallback(
        (query: string) => {
            if (query.trim().length > 0) searchUsersApi.request(query);
        },
        [searchUsersApi]
    );

    const categoryOptions = useMemo(() => {
        const fetched = categories.map((c) => ({ id: c.id, title: c.title }));
        for (const cat of Array.isArray(initialData?.categories_array) ? initialData.categories_array : []) {
            if (!fetched.find((f) => f.id === cat.id)) fetched.push({ id: cat.id, title: cat.title });
        }
        return fetched;
    }, [categories, initialData]);

    const bankOptions = useMemo(
        () =>
            (Array.isArray(entitiesList) ? entitiesList : [])
                .filter((e) => e.entity_type === 'Bank')
                .map((b) => ({ id: String(b.remote_id || b.id), title: b.title })),
        [entitiesList]
    );

    const userOptions = useMemo(() => {
        if (!Array.isArray(searchUsersApi.data)) return [];
        return (searchUsersApi.data as SearchUserResult[]).map((user) => {
            const f: any = user.fields ?? user;
            const name = f.title || [f.first_name, f.last_name].filter(Boolean).join(' ') || 'Unknown user';
            const phone = f.phone || 'no phone';
            const identifier = f.identifier_number || f.identifier || f.id_number || '';
            return { id: user.pk || user.id, title: identifier ? `${name} · ${phone} (${identifier})` : `${name} · ${phone}` };
        });
    }, [searchUsersApi.data]);

    const countryOptions = useMemo(() => countriesRaw.map((c) => ({ id: c.id, title: c.title })), [countriesRaw]);

    const captureLocation = (setFieldValue: (k: string, v: any) => void) => {
        const warning =
            'Make sure you are physically at the shop before capturing its location — it is used for delivery routing.\n\nCapture now?';

        const nativeCapture = async () => {
            setIsFetchingLocation(true);
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Location permission needed', 'Allow location access to set the shop location.');
                    return;
                }
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                setFieldValue('latitude', loc.coords.latitude);
                setFieldValue('longitude', loc.coords.longitude);
            } catch {
                Alert.alert('Could not get location', 'Make sure GPS is turned on and try again.');
            } finally {
                setIsFetchingLocation(false);
            }
        };

        if (Platform.OS === 'web') {
            if (!window.confirm(warning)) return;
            setIsFetchingLocation(true);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setFieldValue('latitude', pos.coords.latitude);
                    setFieldValue('longitude', pos.coords.longitude);
                    setIsFetchingLocation(false);
                },
                (err) => {
                    window.alert(`Could not get location: ${err.message}`);
                    setIsFetchingLocation(false);
                },
                { enableHighAccuracy: true }
            );
        } else {
            Alert.alert('Set shop location', warning, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Capture', onPress: nativeCapture },
            ]);
        }
    };

    return (
        <Formik
            key={`${visible}-${initialData?.id ?? initialData?.remote_id ?? 'new'}`}
            enableReinitialize
            initialValues={{
                title: initialData?.title || '',
                entity_type: initialData?.entity_type || '',
                entity_ownership: initialData?.entity_ownership || 'PRIVATE',
                entity_level: initialData?.entity_level || '0',
                country: initialData?.country || KENYA_COUNTRY_ID,
                county: initialData?.county || '',
                town: initialData?.town || '',
                road: initialData?.road || '',
                building: initialData?.building || '',
                latitude: initialData?.latitude || null,
                longitude: initialData?.longitude || null,
                bank: initialData?.bank || '',
                account_name: initialData?.account_name || '',
                account_number: initialData?.account_number || '',
                code: initialData?.code || initialData?.bank_code || '',
                categories: Array.isArray(initialData?.categories) ? initialData.categories : [],
                owner: initialData?.owner || '',
                expanded: false,
                plan: '',
            }}
            validationSchema={schema}
            onSubmit={(values, helpers) => onSubmitTrigger(values, helpers)}
        >
            {(f) => {
                const { values, setFieldValue } = f;
                const isKenya = values.country === KENYA_COUNTRY_ID;
                const countyOpts = getCountiesByCountry(values.country).map((c) => ({ id: c.value, title: c.label }));
                const isRetailWholesale = RETAIL_WHOLESALE_TYPES.includes(values.entity_type);
                const isHospital = values.entity_type === 'Hospital';
                const isBank = values.entity_type === 'Bank';

                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title={isEdit ? 'Edit entity' : 'New entity'}
                        subtitle={isEdit ? initialData?.title : 'Shop, facility or partner'}
                        icon="storefront-outline"
                        submitLabel={isEdit ? 'Save changes' : 'Create entity'}
                        submitting={f.isSubmitting || isSubmittingRemote}
                        onSubmit={() => f.handleSubmit()}
                        width={760}
                    >
                        <FormSection title="Entity" zIndex={80}>
                            <FormRow zIndex={80}>
                                <CustomTextField name="title" label="Name" required placeholder="e.g. Chaka Pharmacy" autoCapitalize="words" />
                                <CustomAutocompletePicker
                                    name="entity_type"
                                    label="Type"
                                    options={ENTITY_TYPE_OPTIONS}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    placeholder="Search entity type…"
                                    initialTitle={humanizeEntityType(initialData?.entity_type || '')}
                                    onAfterSelect={(id) => {
                                        if (!RETAIL_WHOLESALE_TYPES.includes(id)) {
                                            setFieldValue('categories', []);
                                            setFieldValue('latitude', null);
                                            setFieldValue('longitude', null);
                                        }
                                        if (id !== 'Hospital') setFieldValue('entity_level', '0');
                                    }}
                                />
                            </FormRow>
                            <FormRow zIndex={70}>
                                <SelectDropdown name="entity_ownership" label="Ownership" options={OWNERSHIP_OPTIONS} placeholder="Select ownership…" required />
                                {isHospital ? <SelectDropdown name="entity_level" label="Level" options={LEVEL_OPTIONS} placeholder="Select level…" required /> : null}
                                {isBank ? <CustomTextField name="code" label="Bank code (routing / SWIFT)" required placeholder="e.g. 01-123-456" /> : null}
                            </FormRow>
                        </FormSection>

                        <FormSection title="Owner" hint="Search by name, phone or ID number." zIndex={60}>
                            <LiveSearchAutocompletePicker
                                name="owner"
                                label="Owner"
                                options={userOptions}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={searchUsersApi.loading}
                                placeholder="Type phone, ID or name…"
                                loadingPlaceholder="Searching users…"
                                noMatchText="No users found."
                                emptyText="Start typing to search users."
                                onSearch={handleUserSearch}
                                initialTitle={initialData?.owner_details}
                            />
                        </FormSection>

                        <FormSection title="Location" zIndex={50}>
                            <FormRow zIndex={50}>
                                <CustomAutocompletePicker
                                    name="country"
                                    label="Country"
                                    options={countryOptions}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    placeholder="Search country…"
                                    initialTitle={initialData?.country_title}
                                    onAfterSelect={() => setFieldValue('county', '')}
                                />
                                <CustomAutocompletePicker
                                    name="county"
                                    label={isKenya ? 'County' : 'County (optional)'}
                                    options={countyOpts}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    placeholder={values.country ? 'Search county…' : 'Pick a country first'}
                                    initialTitle={initialData?.county_title}
                                />
                            </FormRow>
                            <FormRow zIndex={40}>
                                <CustomTextField name="town" label={isKenya ? 'Town / city' : 'Town / city (optional)'} required={isKenya} placeholder="e.g. Nairobi" />
                                <CustomTextField name="road" label="Road / street" placeholder="e.g. Chaka Road, Kilimani" />
                            </FormRow>
                            <CustomTextField name="building" label="Building / exact spot" placeholder="e.g. Hospihome, House 1" />
                            {isRetailWholesale ? (
                                <GpsButton
                                    latitude={values.latitude}
                                    longitude={values.longitude}
                                    busy={isFetchingLocation}
                                    onPress={() => captureLocation(setFieldValue)}
                                />
                            ) : null}
                        </FormSection>

                        {isKenya ? (
                            <FormSection title="Bank account" hint="Optional — where payouts go." zIndex={30}>
                                <FormRow zIndex={30}>
                                    <CustomAutocompletePicker
                                        name="bank"
                                        label="Bank"
                                        options={bankOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        placeholder="Search bank…"
                                        noMatchText="No banks match."
                                        initialTitle={initialData?.bank_title}
                                    />
                                    <CustomTextField name="account_number" label="Account number" placeholder="e.g. 0123456789" keyboardType="number-pad" />
                                </FormRow>
                                <CustomTextField name="account_name" label="Account name (optional)" placeholder="e.g. Chaka Pharmacy Ltd" />
                            </FormSection>
                        ) : null}

                        {isRetailWholesale ? (
                            <FormSection title="Categories" hint="What the shop sells — used in the shopper directory." zIndex={categoriesOpen ? 100 : 20}>
                                <CustomMultiselectAutocompletePicker
                                    name="categories"
                                    label="Categories"
                                    options={categoryOptions}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    loading={categoriesLoading}
                                    placeholder="Select categories…"
                                    loadingPlaceholder="Loading categories…"
                                    noMatchText="No categories match."
                                    onDropdownOpenChange={setCategoriesOpen}
                                />
                            </FormSection>
                        ) : null}
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}

function GpsButton({ latitude, longitude, busy, onPress }: { latitude: number | null; longitude: number | null; busy: boolean; onPress: () => void }) {
    const { theme, chipBg } = useListTokens();
    const set = latitude !== null && latitude !== undefined;
    const color = set ? '#10b981' : theme.primary;
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={set ? 'Recapture shop location' : 'Capture shop location'}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: set ? 'rgba(16,185,129,0.10)' : chipBg,
                opacity: busy ? 0.7 : pressed ? 0.85 : 1,
                ...webPointer,
            })}
        >
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
                {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={set ? 'checkmark-circle' : 'locate-outline'} size={20} color={color} />}
            </View>
            <View className="flex-1 min-w-0">
                <Text style={{ color: set ? '#10b981' : theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>
                    {busy ? 'Getting location…' : set ? 'Shop location set' : 'Capture shop location'}
                </Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                    {set ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)} · tap to recapture` : 'Stand at the shop, then tap — used for delivery routing.'}
                </Text>
            </View>
        </Pressable>
    );
}
