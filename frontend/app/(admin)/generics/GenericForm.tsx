// 📍 Location: app/(admin)/generics/GenericForm.tsx
import { Formik } from "formik";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";
import DrugClassAutocomplete from "./DrugClassAutocomplete";
import DrugSubClassAutocomplete from "./DrugSubClassAutocomplete";

interface GenericFormProps {
    theme: any; isDarkMode: boolean; isSubmittingRemote: boolean; initialData?: any; onCancel: () => void;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
}

const GenericFormSchema = Yup.object().shape({
    title: Yup.string().min(3, "Compound title must be at least 3 characters").required("Generic compound title is required"),
    description: Yup.string().min(3, "Provide chemical specification descriptors").required("Generic description profile summary is required"),
    drug_class: Yup.string().required("Drug class configuration mapping reference is required"),
    drug_sub_class: Yup.string().required("Drug subclass configuration mapping reference is required"),
});

export default function GenericForm({ theme, isDarkMode, isSubmittingRemote, onSubmitTrigger, initialData, onCancel }: GenericFormProps) {
    return (
        <Formik
            enableReinitialize={true}
            initialValues={{
                title: initialData?.title || "",
                description: initialData?.description || "",
                drug_class: initialData?.drug_class || "",
                drug_sub_class: initialData?.drug_sub_class || ""
            }}
            validationSchema={GenericFormSchema}
            onSubmit={(values, helpers) => {
                console.log(`📦 [Payload Monitor] action: "${initialData ? 'UpdateGeneric' : 'CreateGeneric'}" | data:`, JSON.stringify(values));
                onSubmitTrigger(values, helpers);
            }}
        >
            {({ handleChange, handleBlur, handleSubmit, setFieldValue, values, errors, touched }) => (
                <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">
                    <View className="items-start w-full">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Generic Compound Title</Text>
                        <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. AMOXICILIN" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                        {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
                    </View>

                    <DrugClassAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.drug_class} initialTitle={initialData?.drug_class_title} hasError={!!(touched.drug_class && errors.drug_class)} onSelect={(id) => setFieldValue("drug_class", id)} />
                    {touched.drug_class && errors.drug_class && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.drug_class}</Text>}

                    <DrugSubClassAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.drug_sub_class} initialTitle={initialData?.drug_sub_class_title} hasError={!!(touched.drug_sub_class && errors.drug_sub_class)} onSelect={(id) => setFieldValue("drug_sub_class", id)} />
                    {touched.drug_sub_class && errors.drug_sub_class && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.drug_sub_class}</Text>}

                    <View className="items-start w-full">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Clinical Compound Indication Profile Summary</Text>
                        <TextInput onChangeText={handleChange("description")} onBlur={handleBlur("description")} value={values.description} placeholder="Specify pharmacology boundaries..." placeholderTextColor="#64748b" multiline numberOfLines={4} style={{ backgroundColor: theme.background, borderColor: touched.description && errors.description ? "#ef4444" : theme.border, color: theme.text, textAlignVertical: 'top' }} className="w-full rounded-xl px-4 py-3 min-h-[100px] border text-sm font-medium outline-none" />
                        {touched.description && errors.description && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.description}</Text>}
                    </View>

                    <View className="flex-row items-center gap-x-3 mt-4 w-full">
                        <TouchableOpacity onPress={onCancel} disabled={isSubmittingRemote} className="flex-1 h-12 rounded-xl items-center justify-center border border-slate-200 dark:border-slate-800 active:bg-slate-50"><Text className="text-slate-500 font-bold text-sm uppercase tracking-wider">Cancel</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-md active:opacity-90">
                            {isSubmittingRemote ? <ActivityIndicator color="#ffffff" size="small" /> : <Text className="text-white font-bold text-sm uppercase tracking-wider">{initialData ? "Update Matrix" : "Commit Formula"}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </Formik>
    );
}
