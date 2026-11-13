// components/shopping/prescriptions/CreatePrescriptionModal.tsx

import retailerPrescriptionsApi, {
    CreateRetailPrescriptionPayload,
    PrescriptionGender,
    PrescriptionNature,
    PrescriptionRelationship,
} from '@/api/retailerPrescriptionsApi';
import ApiErrorModal, { FlatFieldError } from '@/components/common/ApiErrorModal';
import CustomTextField from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { EntityAutocomplete } from '@/components/common/EntityAutocomplete';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Formik, FormikHelpers } from 'formik';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import * as Yup from 'yup';

const GENDER_OPTIONS = ['FEMALE', 'MALE', 'OTHER'] as const;
const RELATIONSHIP_OPTIONS = ['SELF', 'CHILD', 'SPOUSE', 'PARENT', 'SIBLING', 'OTHER'] as const;
const NATURE_OPTIONS = ['ACUTE', 'REPEAT'] as const;

const mapOptions = (arr: readonly string[]) =>
    arr.map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));

interface FormValues {
    entity: string;
    entity_title: string;
    patientName: string;
    gender: PrescriptionGender;
    dob: string;
    relationship: PrescriptionRelationship;
    nature: PrescriptionNature;
    image: ImagePicker.ImagePickerAsset | null;
}

const INITIAL_VALUES: FormValues = {
    entity: '',
    entity_title: '',
    patientName: '',
    gender: 'FEMALE',
    dob: '',
    relationship: 'SELF',
    nature: 'ACUTE',
    image: null,
};

const VALIDATION_SCHEMA = Yup.object().shape({
    entity: Yup.string(), // optional: without a pharmacy, WaziPOS digitizes it and the owner then sends it to one pharmacy
    patientName: Yup.string().trim().required('Patient name is required'),
    dob: Yup.string().required('Date of birth is required'),
    image: Yup.mixed().required('A prescription image is required'),
});

interface Props {
    visible: boolean;
    onClose: () => void;
    onSuccess: (id: string) => void;
}

export function CreatePrescriptionModal({ visible, onClose, onSuccess }: Props) {
    const { theme } = useAuth();

    const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
    const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
    const [apiErrors, setApiErrors] = useState<FlatFieldError[]>([]);

    const [nearbyEntities, setNearbyEntities] = useState<any[]>([]);
    const [loadingEntities, setLoadingEntities] = useState(false);

    // The uploader's location is required: the pharmacy prices delivery
    // (intracity shipping) from it. No location → no upload.
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [locationProblem, setLocationProblem] = useState<string | null>(null);

    /** Ask for permission, make sure location services are on, and read the position. */
    const captureLocation = useCallback(async () => {
        setLocationProblem(null);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            setCoords(null);
            setLocationProblem('Allow location access for this app to upload a prescription.');
            return null;
        }
        let servicesOn = await Location.hasServicesEnabledAsync();
        if (!servicesOn && Platform.OS === 'android') {
            // Shows the system dialog asking the user to turn location on.
            try {
                await Location.enableNetworkProviderAsync();
                servicesOn = await Location.hasServicesEnabledAsync();
            } catch {
                servicesOn = false;
            }
        }
        if (!servicesOn) {
            setCoords(null);
            setLocationProblem('Turn on location services on your phone to upload a prescription.');
            return null;
        }
        try {
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            setCoords(next);
            return next;
        } catch {
            setCoords(null);
            setLocationProblem("Couldn't read your location. Move to an open area and try again.");
            return null;
        }
    }, []);

    const fetchNearbyEntities = useCallback(async () => {
        setLoadingEntities(true);
        try {
            const here = await captureLocation();
            if (!here) return;
            const { latitude, longitude } = here;

            const res = await retailerPrescriptionsApi.getAdjacentPharmaciesAction({
                action: "GetAdjacentPharmacies",
                latitude,
                longitude
            });

            if (res.ok && res.data?.response_code === 0) {
                setNearbyEntities(res.data.pharmacies || []);
            } else {
                Alert.alert('Error', 'Could not retrieve nearby pharmacies.');
            }

        } catch (error) {
            console.error("Location error:", error);
            Alert.alert('Error', 'Could not retrieve current location.');
        } finally {
            setLoadingEntities(false);
        }
    }, [captureLocation]);

    useEffect(() => {
        if (visible) {
            fetchNearbyEntities();
        }
    }, [visible, fetchNearbyEntities]);

    const handleSubmit = async (
        values: FormValues,
        { setSubmitting, resetForm }: FormikHelpers<FormValues>
    ) => {
        if (!values.image) return;

        // Refresh the position at upload time; refuse to upload without one.
        const here = (await captureLocation()) ?? coords;
        if (!here) {
            setSubmitting(false);
            return;
        }

        const payload: CreateRetailPrescriptionPayload = {
            entity: values.entity,
            origin_latitude: here.latitude,
            origin_longitude: here.longitude,
            images: [values.image],
            patient_name: values.patientName.trim(),
            patient_gender: values.gender,
            patient_date_of_birth: values.dob.trim(),
            relationship: values.relationship,
            nature: values.nature,
        };

        try {
            const res = await retailerPrescriptionsApi.createRetailPrescriptionAction(payload);

            if (!res.ok) {
                throw new Error(res.data?.response_message || "Network request failed");
            }

            if (res.data?.response_code === 0 && res.data.prescription) {
                resetForm();
                onSuccess(res.data.prescription.id);
            } else {
                const backendErrors = res.data?.errors || [];
                const formattedErrors: FlatFieldError[] = backendErrors.map(err => {
                    const parts = err.split(":");
                    if (parts.length > 1) {
                        return { field: parts[0].trim(), message: parts.slice(1).join(":").trim() };
                    }
                    return { field: "", message: err };
                });

                setApiErrorMessage(res.data?.response_message || "Failed to create prescription.");
                setApiErrors(formattedErrors);
                setIsErrorModalVisible(true);
            }
        } catch (e: any) {
            setApiErrorMessage(e?.message || "An unexpected error occurred.");
            setApiErrors([]);
            setIsErrorModalVisible(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
                <KeyboardAvoidingView
                    style={styles.backdrop}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                    <View className="w-full max-w-[600px] max-h-[90%] rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.panel, borderColor: theme.border }}>
                        {/* Header */}
                        <View className="flex-row items-center justify-between p-4 border-b" style={{ borderBottomColor: theme.border }}>
                            <View className="flex-1">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }}>New Prescription</Text>
                                <Text className="mt-0.5" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }}>Upload an image and let AI extract details.</Text>
                            </View>
                            <Pressable onPress={onClose} hitSlop={10} className="p-1.5">
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.base }}>✕</Text>
                            </Pressable>
                        </View>

                        <Formik
                            initialValues={INITIAL_VALUES}
                            validationSchema={VALIDATION_SCHEMA}
                            onSubmit={handleSubmit}
                            validateOnMount={true} // <--- FIX: Force validation on mount
                        >
                            {(formik) => (
                                <>
                                    {/* Body */}
                                    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">

                                        {/* Image Picker */}
                                        <View className="mb-4">
                                            <Text className="uppercase tracking-widest mb-1.5" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 10 }}>
                                                Prescription Image *
                                            </Text>
                                            {formik.values.image ? (
                                                <View className="relative self-start">
                                                    <Image
                                                        source={{ uri: formik.values.image.uri }}
                                                        style={{ width: 120, height: 120, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
                                                    />
                                                    <Pressable
                                                        onPress={() => {
                                                            formik.setFieldValue('image', null);
                                                            formik.setFieldTouched('image', true);
                                                        }}
                                                        className="absolute -top-2 -right-2 rounded-full"
                                                        style={{ backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border }}
                                                    >
                                                        <Ionicons name="close-circle" size={28} color={theme.danger} />
                                                    </Pressable>
                                                </View>
                                            ) : (
                                                <View className="flex-row gap-3">
                                                    <Pressable
                                                        onPress={async () => {
                                                            const result = await ImagePicker.launchImageLibraryAsync({
                                                                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                                                allowsMultipleSelection: false,
                                                                quality: 0.7,
                                                            });
                                                            if (!result.canceled && result.assets.length > 0) {
                                                                formik.setFieldValue('image', result.assets[0]);
                                                                formik.setFieldTouched('image', true);
                                                            }
                                                        }}
                                                        className="w-[100px] h-[100px] rounded-xl items-center justify-center border-2 border-dashed"
                                                        style={{ borderColor: theme.primary, backgroundColor: theme.primarySoft }}
                                                    >
                                                        <Ionicons name="images" size={28} color={theme.primary} />
                                                        <Text className="text-[10px] uppercase mt-1" style={{ color: theme.primary, fontFamily: theme.font.bold }}>Gallery</Text>
                                                    </Pressable>

                                                    {Platform.OS !== 'web' && (
                                                        <Pressable
                                                            onPress={async () => {
                                                                const perm = await ImagePicker.requestCameraPermissionsAsync();
                                                                if (!perm.granted) return Alert.alert("Permission denied", "Camera access is required.");
                                                                const result = await ImagePicker.launchCameraAsync({
                                                                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                                                    allowsMultipleSelection: false,
                                                                    quality: 0.7,
                                                                });
                                                                if (!result.canceled && result.assets.length > 0) {
                                                                    formik.setFieldValue('image', result.assets[0]);
                                                                    formik.setFieldTouched('image', true);
                                                                }
                                                            }}
                                                            className="w-[100px] h-[100px] rounded-xl items-center justify-center border-2 border-dashed"
                                                            style={{ borderColor: theme.primary, backgroundColor: theme.primarySoft }}
                                                        >
                                                            <Ionicons name="camera" size={28} color={theme.primary} />
                                                            <Text className="text-[10px] uppercase mt-1" style={{ color: theme.primary, fontFamily: theme.font.bold }}>Camera</Text>
                                                        </Pressable>
                                                    )}
                                                </View>
                                            )}
                                            {formik.touched.image && formik.errors.image && (
                                                <Text className="mt-1.5" style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 11 }}>
                                                    {formik.errors.image}
                                                </Text>
                                            )}
                                        </View>

                                        {/* Pharmacy Entity Selector */}
                                        <View className="mb-4" style={{ zIndex: 20 }}>
                                            <EntityAutocomplete
                                                name="entity"
                                                fieldMap={{ id: 'entity', title: 'entity_title' }}
                                                entities={nearbyEntities}
                                                entityTypes={['PharmaceuticalRetailer']}
                                                label="Pharmacy (optional)"
                                                helperText="Skip this and we'll digitize it for you; you then choose one pharmacy to send it to."
                                                placeholder="Search nearby pharmacies..."
                                                disabled={formik.isSubmitting}
                                                loading={loadingEntities}
                                            />
                                        </View>

                                        {/* Patient Name */}
                                        <View className="mb-4">
                                            <CustomTextField
                                                name="patientName"
                                                label="Patient Name *"
                                                placeholder="e.g. Jane Doe"
                                                editable={!formik.isSubmitting}
                                                style={{ minHeight: 44, paddingVertical: 12 }}
                                            />
                                        </View>

                                        {/* Date of Birth */}
                                        <View className="mb-4" style={{ zIndex: 10, position: 'relative' }}>
                                            <DateField
                                                name="dob"
                                                label="Date of Birth"
                                                required
                                                disabled={formik.isSubmitting}
                                                placeholder="Select a date"
                                            />
                                        </View>

                                        {/* Gender Dropdown */}
                                        <View className="mb-4">
                                            <SelectDropdown
                                                name="gender"
                                                label="Gender"
                                                options={mapOptions(GENDER_OPTIONS)}
                                                placeholder="Select gender"
                                                disabled={formik.isSubmitting}
                                            />
                                        </View>

                                        {/* Relationship Dropdown */}
                                        <View className="mb-4">
                                            <SelectDropdown
                                                name="relationship"
                                                label="Relationship to Patient"
                                                options={mapOptions(RELATIONSHIP_OPTIONS)}
                                                placeholder="Select relationship"
                                                disabled={formik.isSubmitting}
                                            />
                                        </View>

                                        {/* Nature Dropdown */}
                                        <View className="mb-4">
                                            <SelectDropdown
                                                name="nature"
                                                label="Prescription Nature"
                                                options={mapOptions(NATURE_OPTIONS)}
                                                placeholder="Select nature"
                                                disabled={formik.isSubmitting}
                                            />
                                        </View>
                                    </ScrollView>

                                    {/* Location: required to upload (prices delivery) */}
                                    <View
                                        className="flex-row items-center gap-2 mx-4 mt-3 p-3 rounded-xl"
                                        style={{ backgroundColor: coords ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.08)' }}
                                    >
                                        <Ionicons name={coords ? 'location' : 'location-outline'} size={16} color={coords ? '#059669' : theme.danger} />
                                        <Text className="flex-1" style={{ color: coords ? '#059669' : theme.danger, fontFamily: theme.font.medium, fontSize: 12 }}>
                                            {coords
                                                ? 'Your location is attached so the pharmacy can price delivery.'
                                                : locationProblem || 'Getting your location…'}
                                        </Text>
                                        {!coords && locationProblem ? (
                                            <Pressable onPress={() => void fetchNearbyEntities()} hitSlop={8} className="px-3 py-1.5 rounded-lg border" style={{ borderColor: theme.danger }}>
                                                <Text style={{ color: theme.danger, fontFamily: theme.font.bold, fontSize: 11 }}>RETRY</Text>
                                            </Pressable>
                                        ) : null}
                                    </View>

                                    {/* Footer */}
                                    <View className="flex-row justify-end gap-2 p-4 border-t" style={{ borderTopColor: theme.border }}>
                                        <Pressable onPress={onClose} disabled={formik.isSubmitting} className="px-4 py-2.5 rounded-xl border" style={{ borderColor: theme.border, opacity: formik.isSubmitting ? 0.4 : 1 }}>
                                            <Text className="uppercase tracking-wide" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 12 }}>Cancel</Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() => formik.handleSubmit()}
                                            // FIX: Removed !formik.dirty from the disabled check
                                            disabled={!formik.isValid || formik.isSubmitting || !coords}
                                            className="px-4 py-2.5 rounded-xl flex-row items-center gap-2"
                                            style={{
                                                backgroundColor: theme.primary,
                                                opacity: (!formik.isValid || formik.isSubmitting || !coords) ? 0.5 : 1
                                            }}
                                        >
                                            {formik.isSubmitting ? (
                                                <ActivityIndicator size="small" color={theme.textInverse} />
                                            ) : (
                                                <Ionicons name="sparkles" size={16} color={theme.textInverse} />
                                            )}
                                            <Text className="uppercase tracking-wide" style={{ color: theme.textInverse, fontFamily: theme.font.bold, fontSize: 12 }}>
                                                {formik.isSubmitting ? 'Extracting…' : 'Create & Extract'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}
                        </Formik>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <ApiErrorModal
                visible={isErrorModalVisible}
                message={apiErrorMessage}
                errors={apiErrors}
                onClose={() => setIsErrorModalVisible(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
});