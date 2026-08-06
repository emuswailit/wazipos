import { Formik } from "formik";
import { useEffect } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";

interface FormulationFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

const FormulationFormSchema = Yup.object().shape({
    title: Yup.string().min(2, "Title must be at least 2 characters").required("Formulation medium title is required"),
    description: Yup.string().min(5, "Provide a descriptive structural physical layout profile summary").required("Description parameters summary is required"),
});

export default function FormulationFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData, remoteErrors }: FormulationFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    useEffect(() => {
        if (remoteErrors) {
            console.log(`❌ [API Error Matrix] Formulation Mutation Rejected:`, JSON.stringify(remoteErrors));
        }
    }, [remoteErrors]);

    return (
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.border }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">System Ledger</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black">
                            {initialData ? "Modify Formulation Type" : "Create Formulation Variant"}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto">
                        <Formik
                            enableReinitialize={true}
                            initialValues={{
                                title: initialData?.title || "",
                                description: initialData?.description || ""
                            }}
                            validationSchema={FormulationFormSchema}
                            onSubmit={(values, formikHelpers) => {
                                console.log(`📦 [Payload Monitor] action: "${initialData ? 'UpdateFormulation' : 'CreateFormulation'}" | data:`, JSON.stringify(values));
                                onSubmitTrigger(values, formikHelpers);
                            }}
                        >
                            {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
                                <View style={{ backgroundColor: theme.panel, borderColor: theme.border }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">
                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Formulation Title / Name</Text>
                                        <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. CAPSULES, TABLETS, INJECTION" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                                        {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
                                    </View>
                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1"> Description</Text>
                                        <TextInput onChangeText={handleChange("description")} onBlur={handleBlur("description")} value={values.description} placeholder="Specify release metrics, capsule composition profiles, and specific guidelines..." placeholderTextColor="#64748b" multiline numberOfLines={4} style={{ backgroundColor: theme.background, borderColor: touched.description && errors.description ? "#ef4444" : theme.border, color: theme.text, textAlignVertical: 'top' }} className="w-full rounded-xl px-4 py-3 min-h-[100px] border text-sm font-medium outline-none" />
                                        {touched.description && errors.description && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.description}</Text>}
                                    </View>
                                    <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="w-full h-12 rounded-xl items-center justify-center shadow-md active:opacity-90 mt-4">
                                        {isSubmittingRemote ? <ActivityIndicator color="#ffffff" size="small" /> : <Text className="text-white font-bold text-sm uppercase tracking-wider">{initialData ? "Update Matrix Parameters" : "Commit Formulation Type"}</Text>}
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
