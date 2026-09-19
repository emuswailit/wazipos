// app/(wholesalers)/wholesaleInventory/InventoryFormModal.tsx
import { Formik } from "formik";
import { useEffect } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";
import InventoryFormFields from "./InventoryFormFields";

interface InventoryFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

const InventoryFormSchema = Yup.object().shape({
    product: Yup.string().required("Catalog product item linkage is required"),
    title: Yup.string().required("Product title parameter mapping validation is required"),
    received_from: Yup.string().ensure(),
    received_from_title: Yup.string().ensure(),
    batch: Yup.string().ensure(),
    current_unit_quantity: Yup.number().positive("Value must be greater than zero").integer().required("Available piece units count is required"),
    manufacture_date: Yup.string().required("Manufacture date calendar selection is required"),
    expiry_date: Yup.string().required("Expiry calendar date selection is required"),
    unit_buying_price: Yup.number().min(0, "Price value cannot fall below zero metric marks").required("Wholesale input baseline metric cost is required"),
    unit_selling_price: Yup.number().min(Yup.ref('unit_buying_price'), "MSRP price must cover baseline wholesale buying costs").required("Target market listing MSRP price parameter is required"),
    unit_of_receipt: Yup.string().required("Unit of receipt description is required")
});

export default function InventoryFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData, remoteErrors }: InventoryFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    useEffect(() => {
        if (remoteErrors) { console.log(`❌ [API Error Matrix] Ledger Refused Mutation:`, JSON.stringify(remoteErrors)); }
    }, [remoteErrors]);

    const todayString = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    if (!visible) return null;

    return (
        <View style={{ height: screenHeight }} className="absolute inset-0 z-50 flex-col w-full bg-black/40">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
                style={{ flex: 1 }}
                className="w-full"
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={{ backgroundColor: theme.panel }} className="flex-1 flex-col w-full">
                        <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm z-50">
                            <View className="flex-row items-center gap-x-3">
                                <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                                    <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">Ledger Entry</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                                <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            automaticallyAdjustContentInsets={true}
                            showsVerticalScrollIndicator={true}
                            contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 120 : 60 }}
                            className="flex-1 w-full px-6 py-6"
                        >
                            <View className="w-full max-w-2xl mx-auto">
                                <Formik
                                    enableReinitialize={true}
                                    initialValues={{
                                        product: initialData?.product || "",
                                        title: initialData?.title || "",
                                        received_from: initialData?.received_from || "",
                                        received_from_title: initialData?.received_from_details?.title || "",
                                        batch: initialData?.batch || "",
                                        current_unit_quantity: initialData?.current_unit_quantity ? String(initialData.current_unit_quantity) : "",
                                        manufacture_date: initialData?.manufacture_date || todayString,
                                        expiry_date: initialData?.expiry_date || todayString,
                                        unit_buying_price: initialData?.unit_buying_price ? String(initialData.unit_buying_price) : "",
                                        unit_selling_price: initialData?.unit_selling_price ? String(initialData.unit_selling_price) : "",
                                        manufacturer_title: initialData?.manufacturer_title || "SASSY COSMETICS AND BEAUTY PRODUCTS (K) LTD",
                                        origin_country: initialData?.origin_country || "KENYA",
                                        unit_of_receipt: initialData?.unit_of_receipt || "",
                                        in_placement: initialData?.in_placement ? String(initialData.in_placement) : "true"
                                    }}
                                    validationSchema={InventoryFormSchema}
                                    onSubmit={onSubmitTrigger}
                                >
                                    {(formikProps) => (
                                        <InventoryFormFields
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
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </View>
    );
}
