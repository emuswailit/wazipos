import { Formik } from "formik";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Yup from "yup";

interface RouteFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: {
        background: string;
        panel: string;
        primary: string;
        text: string;
        textDark: string;
    };
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: { title: string; description: string }, formikHelpers: any) => Promise<void>;
    initialData?: { title: string; description: string } | null;
}

const RouteFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, "Route title must be at least 3 characters")
        .max(50, "Route title cannot exceed 50 characters")
        .required("Administration route title is required"),
    description: Yup.string()
        .min(10, "Clinical description must be at least 10 characters")
        .required("Clinical description summary is required"),
});

export default function RouteFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData }: RouteFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View
                style={{ backgroundColor: theme.background, height: screenHeight }}
                className="flex-1 flex-col w-full"
            >
                <View
                    style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }}
                    className="h-16 w-full border-b px-6 flex-row justify-between items-center z-50 shadow-sm"
                >
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">System Ledger</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black tracking-tight">
                            {initialData ? "Modify Administration Route" : "Create New Route"}
                        </Text>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onClose}
                        className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20 web:hover:bg-red-500/20 transition-all"
                    >
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    className="flex-1 w-full px-6 py-6"
                >
                    <View className="w-full max-w-2xl mx-auto">
                        <Formik
                            enableReinitialize={true}
                            initialValues={{
                                title: initialData?.title || "",
                                description: initialData?.description || ""
                            }}
                            validationSchema={RouteFormSchema}
                            onSubmit={onSubmitTrigger}
                        >
                            {({ handleChange, handleBlur, handleSubmit, values, errors, touched, isSubmitting }) => (
                                <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">

                                    <View className="border-b border-slate-700/10 pb-2 mb-2 w-full">
                                        <Text style={{ color: theme.text }} className="text-base font-black text-left">Route Parameter Entry Form</Text>
                                        <Text style={{ color: theme.textDark }} className="text-xs font-medium text-left mt-0.5">Input parameters must align with localized cluster deployment fields.</Text>
                                    </View>

                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1.5">Route Name</Text>
                                        <TextInput
                                            onChangeText={handleChange("title")}
                                            onBlur={handleBlur("title")}
                                            value={values.title}
                                            placeholder="e.g. INTRAMUSCULAR, ORAL, INTRAVENOUS"
                                            placeholderTextColor="#64748b"
                                            autoCapitalize="characters"
                                            style={{
                                                backgroundColor: theme.background,
                                                borderColor: touched.title && errors.title ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"),
                                                color: theme.text
                                            }}
                                            className="w-full rounded-xl px-4 h-[44px] border text-sm font-medium outline-none"
                                        />
                                        {touched.title && errors.title && (
                                            <Text className="text-red-500 text-[11px] font-semibold mt-1 pl-1">{errors.title}</Text>
                                        )}
                                    </View>

                                    <View className="items-start w-full">
                                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1.5">Clinical Route Description</Text>
                                        <TextInput
                                            onChangeText={handleChange("description")}
                                            onBlur={handleBlur("description")}
                                            value={values.description}
                                            placeholder="Provide detailed description regarding intake procedures, absorption profiles, and specific guidelines..."
                                            placeholderTextColor="#64748b"
                                            multiline
                                            numberOfLines={5}
                                            style={{
                                                backgroundColor: theme.background,
                                                borderColor: touched.description && errors.description ? "#ef4444" : (isDarkMode ? "#334155" : "#e2e8f0"),
                                                color: theme.text,
                                                height: 120,
                                                paddingTop: 12,
                                                textAlignVertical: 'top'
                                            }}
                                            className="w-full rounded-xl px-4 border text-sm text-left leading-relaxed font-medium outline-none"
                                        />
                                        {touched.description && errors.description && (
                                            <Text className="text-red-500 text-[11px] font-semibold mt-1 pl-1">{errors.description}</Text>
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => handleSubmit()}
                                        disabled={isSubmitting || isSubmittingRemote}
                                        style={{ backgroundColor: theme.primary }}
                                        className="w-full h-12 rounded-xl items-center justify-center shadow-md active:opacity-90 mt-4"
                                    >
                                        {isSubmitting || isSubmittingRemote ? (
                                            <ActivityIndicator color="#ffffff" size="small" />
                                        ) : (
                                            <Text className="text-white font-bold text-sm uppercase tracking-wider">
                                                {initialData ? "Update Route Parameters" : "Commit Route Entry"}
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
