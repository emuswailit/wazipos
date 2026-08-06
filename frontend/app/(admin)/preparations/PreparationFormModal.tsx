import { Formik } from "formik";
import { useEffect } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";
import FormulationAutocomplete from "./FormulationAutocomplete";
import GenericsMultiAutocomplete from "./GenericsMultiAutocomplete";

interface PreparationFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

const PreparationFormSchema = Yup.object().shape({
    title: Yup.string().min(2, "Title must be at least 2 characters").required("Preparation dosage label title is required"),
    description: Yup.string().ensure(),
    formulation_id: Yup.string().required("Target package formulation form choice is required"),
    generics: Yup.array().min(1, "At least one generic compound ingredient must be attached").required("Linked compounds are required")
});

export default function PreparationFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData, remoteErrors }: PreparationFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    useEffect(() => {
        if (remoteErrors) {
            console.log(`❌ [API Error Matrix] Prep Command Terminated:`, JSON.stringify(remoteErrors));
        }
    }, [remoteErrors]);

    return (
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">System Entry</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black">
                            {initialData ? "Modify Preparation Strength" : "Create Product Preparation"}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                    </TouchableOpacity>
                </View>

                {/* 🌟 CRITICAL: Set keyboardShouldPersistTaps to "handled" to allow tapping dropdown options properly */}
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto">
                        <Formik
                            enableReinitialize={true}
                            initialValues={{
                                title: initialData?.title || "",
                                description: initialData?.description || "",
                                formulation_id: initialData?.formulation_id || initialData?.formulation || "",
                                generics: initialData?.generics || []
                            }}
                            validationSchema={PreparationFormSchema}
                            onSubmit={(values, formikHelpers) => {
                                console.log(`📦 [Payload Monitor] action: "${initialData ? 'UpdatePreparation' : 'CreatePreparation'}" | data:`, JSON.stringify(values));
                                onSubmitTrigger(values, formikHelpers);
                            }}
                        >
                            {({ handleChange, handleBlur, handleSubmit, setFieldValue, values, errors, touched }) => (
                                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">

                                    <View style={{ zIndex: 110 }} className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Preparation Label Name & Strength</Text>
                                        <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. AMOXYCILLIN 500MG" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                                        {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
                                    </View>

                                    {/* 🌟 STAGGERED INSET PADDING 1: FLOATS HIGHEST OVER SIBLINGS */}
                                    <FormulationAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.formulation_id} initialTitle={initialData?.formulation_title} hasError={!!(touched.formulation_id && errors.formulation_id)} onSelect={(id) => setFieldValue("formulation_id", id)} zIndexValue={100} />
                                    {touched.formulation_id && errors.formulation_id && <Text style={{ zIndex: 95 }} className="text-red-500 text-[11px] font-semibold mt-1">{errors.formulation_id}</Text>}

                                    {/* 🌟 STAGGERED INSET PADDING 2: FLOATS BELOW FORMULATION BUT ABOVE NOTES */}
                                    <GenericsMultiAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValues={values.generics} currentItemsArray={initialData?.gen_array} hasError={!!(touched.generics && errors.generics)} onToggleSelect={(tags) => setFieldValue("generics", tags)} zIndexValue={90} />
                                    {touched.generics && errors.generics && <Text style={{ zIndex: 85 }} className="text-red-500 text-[11px] font-semibold mt-1">{errors.generics}</Text>}

                                    <View style={{ zIndex: 10 }} className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Clinical Note Constraints Summary (Optional)</Text>
                                        <TextInput onChangeText={handleChange("description")} onBlur={handleBlur("description")} value={values.description} placeholder="Provide specific batch notes guidelines..." placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                                    </View>

                                    <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary, zIndex: 1 }} className="w-full h-12 rounded-xl items-center justify-center shadow-md active:opacity-90 mt-4">
                                        {isSubmittingRemote ? (
                                            <ActivityIndicator color="#ffffff" size="small" />
                                        ) : (
                                            <Text className="text-white font-bold text-sm uppercase tracking-wider">
                                                {initialData ? "Update Preparation" : "Create Preparation"}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </Formik>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
