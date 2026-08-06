import { Formik } from "formik";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";
import BodySystemAutocomplete from "./BodySystemAutocomplete";

interface ClassificationFormProps {
    theme: any;
    isDarkMode: boolean;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    onCancel: () => void;
}

const ClassificationFormSchema = Yup.object().shape({
    title: Yup.string().min(3, "Title must be at least 3 characters").required("Drug class title is required"),
    description: Yup.string().min(5, "Provide a clean definition summary description").required("Drug class description is required"),
    body_system: Yup.string().required("Body system linkage selection is required"),
});

export default function ClassificationForm({ theme, isDarkMode, isSubmittingRemote, onSubmitTrigger, initialData, onCancel }: ClassificationFormProps) {
    return (
        <Formik
            enableReinitialize={true}
            initialValues={{
                title: initialData?.title || "",
                description: initialData?.description || "",
                body_system: initialData?.body_system || ""
            }}
            validationSchema={ClassificationFormSchema}
            onSubmit={(values, formikHelpers) => {
                // 🌟 BRIEF LOGGER: Instantly logs out the exact structure matching your backend target payload spec
                console.log(`📦 [Payload Monitor] action: "${initialData ? 'UpdateDrugClass' : 'CreateDrugClass'}" | data:`, JSON.stringify(values));

                // Routes data execution cleanly onwards to parent handlers
                onSubmitTrigger(values, formikHelpers);
            }}
        >
            {({ handleChange, handleBlur, handleSubmit, setFieldValue, values, errors, touched }) => (
                <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">

                    <View className="border-b border-slate-700/10 pb-2 mb-2 w-full">
                        <Text style={{ color: theme.text }} className="text-base font-black text-left">Drug Class Parameters Form</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium text-left mt-0.5">Parameters map cleanly to secure clinical database clusters registries.</Text>
                    </View>

                    <View className="items-start w-full">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Drug Class Title</Text>
                        <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. Antibiotics" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                        {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
                    </View>

                    <BodySystemAutocomplete
                        theme={theme}
                        isDarkMode={isDarkMode}
                        selectedValue={values.body_system}
                        initialTitle={initialData?.body_system_title}
                        hasError={!!(touched.body_system && errors.body_system)}
                        onSelect={(id) => setFieldValue("body_system", id)}
                    />
                    {touched.body_system && errors.body_system && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.body_system}</Text>}

                    <View className="items-start w-full">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Clinical Description Brief</Text>
                        <TextInput onChangeText={handleChange("description")} onBlur={handleBlur("description")} value={values.description} placeholder="Specify actions boundaries..." placeholderTextColor="#64748b" multiline numberOfLines={4} style={{ backgroundColor: theme.background, borderColor: touched.description && errors.description ? "#ef4444" : theme.border, color: theme.text, textAlignVertical: 'top' }} className="w-full rounded-xl px-4 py-3 min-h-[100px] border text-sm font-medium outline-none" />
                        {touched.description && errors.description && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.description}</Text>}
                    </View>

                    <View className="flex-row items-center gap-x-3 mt-4 w-full">
                        <TouchableOpacity onPress={onCancel} disabled={isSubmittingRemote} className="flex-1 h-12 rounded-xl items-center justify-center border border-slate-200 dark:border-slate-800 active:bg-slate-50">
                            <Text className="text-slate-500 font-bold text-sm uppercase tracking-wider">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-md active:opacity-90">
                            {isSubmittingRemote ? (
                                <ActivityIndicator color="#ffffff" size="small" />
                            ) : (
                                <Text className="text-white font-bold text-sm uppercase tracking-wider">
                                    {initialData ? "Update Details" : "Commit Entry"}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                </View>
            )}
        </Formik>
    );
}
