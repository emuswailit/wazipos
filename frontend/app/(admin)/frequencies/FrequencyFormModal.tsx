import { Formik } from "formik";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";

interface FrequencyFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: {
        title: string;
        abbreviation: string;
        latin: string;
        numerical: number;
        description: string;
    } | null;
}

const FrequencyFormSchema = Yup.object().shape({
    title: Yup.string().min(3, "Title must be at least 3 characters").required("Interval title is required"),
    abbreviation: Yup.string().min(1, "SIG Code is required").required("Abbreviation SIG label is required"),
    latin: Yup.string().required("Latin pharmaceutical term is required"),
    numerical: Yup.number().typeError("Must be a valid integer").min(0, "Cannot be negative").required("Daily allocation multiplier numeric value is required"),
    description: Yup.string().min(5, "Provide a clean definition summary description").required("Interval description is required"),
});

export default function FrequencyFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData }: FrequencyFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    return (
        <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                {/* STRUCTURAL HEADER ROW NAVBAR */}
                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-xs">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">System Ledger</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black">Create Intake Frequency</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                    </TouchableOpacity>
                </View>

                {/* FORMIK FORM CORE EXECUTION CONTAINER */}
                <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto">
                        <Formik enableReinitialize={true} initialValues={{
                            title: initialData?.title || "",
                            abbreviation: initialData?.abbreviation || "",
                            latin: initialData?.latin || "",
                            numerical: initialData?.numerical !== undefined ? String(initialData.numerical) : "",
                            description: initialData?.description || ""
                        }} validationSchema={FrequencyFormSchema} onSubmit={onSubmitTrigger}>
                            {({ handleChange, handleBlur, handleSubmit, values, errors, touched, isSubmitting }) => (
                                <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-xs flex-col w-full space-y-4">

                                    <View className="border-b border-slate-700/10 pb-2 mb-2 w-full">
                                        <Text style={{ color: theme.text }} className="text-base font-black text-left">Frequency Parameter Entry Form</Text>
                                        <Text style={{ color: theme.textDark }} className="text-xs font-medium text-left mt-0.5">Input parameters must align with localized cluster fields.</Text>
                                    </View>

                                    {/* FIELD 1: INTERVAL TITLE */}
                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Frequency Title</Text>
                                        <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. TWICE DAILY, THREE TIMES DAILY" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"), color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium" />
                                        {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
                                    </View>

                                    {/* FIELD 2 & 3: SIG CODE ROW SPLIT */}
                                    <View className="flex-row gap-x-4 w-full">
                                        <View className="flex-1 items-start">
                                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">SIG Abbreviation</Text>
                                            <TextInput onChangeText={handleChange("abbreviation")} onBlur={handleBlur("abbreviation")} value={values.abbreviation} placeholder="e.g. BD, TDS, PRN" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.abbreviation && errors.abbreviation ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"), color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium" />
                                            {touched.abbreviation && errors.abbreviation && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.abbreviation}</Text>}
                                        </View>
                                        <View className="flex-1 items-start">
                                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Numerical (Times/Day)</Text>
                                            <TextInput onChangeText={handleChange("numerical")} onBlur={handleBlur("numerical")} value={values.numerical} placeholder="e.g. 1, 2, 3" placeholderTextColor="#64748b" keyboardType="numeric" style={{ backgroundColor: theme.background, borderColor: touched.numerical && errors.numerical ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"), color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium" />
                                            {touched.numerical && errors.numerical && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.numerical}</Text>}
                                        </View>
                                    </View>

                                    {/* FIELD 4: LATIN TRANSLATION */}
                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Latin Medical Terminology</Text>
                                        <TextInput onChangeText={handleChange("latin")} onBlur={handleBlur("latin")} value={values.latin} placeholder="e.g. bis in die, ter in die" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.latin && errors.latin ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"), color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium" />
                                        {touched.latin && errors.latin && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.latin}</Text>}
                                    </View>

                                    {/* FIELD 5: CLINICAL DESCRIPTION SUMMARY */}
                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Clinical Description</Text>
                                        <TextInput onChangeText={handleChange("description")} onBlur={handleBlur("description")} value={values.description} placeholder="Describe exact clinical distribution timing profiles..." placeholderTextColor="#64748b" multiline numberOfLines={3} style={{ backgroundColor: theme.background, borderColor: touched.description && errors.description ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"), color: theme.text, height: 80, paddingTop: 10 }} className="w-full rounded-xl px-4 border text-sm text-left font-medium" />
                                        {touched.description && errors.description && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.description}</Text>}
                                    </View>

                                    {/* SUBMISSION DISPATCH KEY TRIGGER */}
                                    <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmitting || isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="w-full h-12 rounded-xl items-center justify-center mt-6 shadow-sm flex-row gap-x-2 active:opacity-90 web:hover:opacity-90 transition-all">
                                        {(isSubmitting || isSubmittingRemote) && <ActivityIndicator size="small" color="#ffffff" />}
                                        <Text className="text-white font-black text-sm uppercase tracking-wider">
                                            {isSubmittingRemote ? "Saving..." : "Commit Frequency Definition"}
                                        </Text>
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
