import { Formik } from "formik";
import { useEffect } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";
import ProductFormFields from "./ProductFormFields";

interface ProductFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

const ProductFormSchema = Yup.object().shape({
    title: Yup.string().min(2, "Brand title must be at least 2 characters").required("Commercial brand name is required"),
    preparation: Yup.string().ensure(),
    units_per_pack: Yup.number().positive("Value must be greater than zero").integer().required("Units per package count is required"),
    pack_tag: Yup.string().required("Packaging metric reference label is required"),
    manufacturer: Yup.string().required("Manufacturer ID linkage is required"),
    category: Yup.string().required("Base catalog category classification code is required"),
    is_vatable: Yup.string().required("VAT configuration parameter selection is required"),
    allowed_entities: Yup.array().of(Yup.string()).min(1, "Select at least one allowed entry node"),
    description: Yup.string().ensure()
});

export default function ProductFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData, remoteErrors }: ProductFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    useEffect(() => {
        if (remoteErrors) { console.log(`❌ [API Error Matrix] Catalog Refused Mutation:`, JSON.stringify(remoteErrors)); }
    }, [remoteErrors]);

    return (
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
                style={{ flex: 1, backgroundColor: theme.background }}
            >
                <View style={{ height: screenHeight }} className="flex-1 flex-col w-full">
                    <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm">
                        <View className="flex-row items-center gap-x-3">
                            <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                                <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">Catalog Entry</Text>
                            </View>
                            <Text style={{ color: theme.text }} className="text-base font-black">
                                {initialData ? "Modify Brand Attributes" : "Register Brand Product"}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                            <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                        </TouchableOpacity>
                    </View>

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
                                    title: initialData?.title || "",
                                    description: initialData?.description || "",
                                    preparation: initialData?.preparation || "",
                                    units_per_pack: initialData?.units_per_pack ? String(initialData.units_per_pack) : "0",
                                    pack_tag: initialData?.pack_tag || "100'S",
                                    manufacturer: initialData?.manufacturer || "bd8e5208-b037-4f56-8b4a-d0d09d1387ba",
                                    category: initialData?.category || "4cadab9a-a116-44b4-b25a-3aea006119f9",
                                    is_vatable: initialData?.is_vatable ? String(initialData.is_vatable) : "false",
                                    allowed_entities: initialData?.allowed_entities || [],
                                    bar_code: initialData?.bar_code || "",
                                    images: initialData?.images || []
                                }}
                                validationSchema={ProductFormSchema}
                                onSubmit={onSubmitTrigger}
                            >
                                {(formikProps) => (
                                    <ProductFormFields
                                        {...formikProps}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        isSubmittingRemote={isSubmittingRemote}
                                        initialData={initialData}
                                        onCancel={onClose}
                                    />
                                )}
                            </Formik>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
