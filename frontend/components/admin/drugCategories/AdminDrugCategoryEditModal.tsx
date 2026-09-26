// app/(admin)/drug-categories/AdminDrugCategoryEditModal.tsx
//
// Admin create/edit form modal for drug categories.
//
// One modal handles both modes — `initialData` presence decides
// whether the submit button reads "Update" or "Commit".

import { Formik } from "formik";
import { useEffect } from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import * as Yup from "yup";

interface Props {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (
        values: any,
        formikHelpers: any
    ) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

const AdminDrugCategoryFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, "Title must be at least 3 characters")
        .required("Drug category title is required"),
    description: Yup.string()
        .min(
            5,
            "Provide a descriptive pharmacological layout statement"
        )
        .required("Description summary is required"),
});

export default function AdminDrugCategoryEditModal({
    visible,
    onClose,
    theme,
    isSubmittingRemote,
    onSubmitTrigger,
    initialData,
    remoteErrors,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();

    useEffect(() => {
        if (remoteErrors) {
            console.log(
                `❌ [Admin API Error Matrix] Drug Category Mutation Failed:`,
                JSON.stringify(remoteErrors)
            );
        }
    }, [remoteErrors]);

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View
                style={{
                    backgroundColor: theme.background,
                    height: screenHeight,
                }}
                className="flex-1 flex-col w-full"
            >
                {/* Header */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderBottomColor: theme.border,
                    }}
                    className="h-16 w-full border-b px-6 flex-row justify-between items-center"
                >
                    <View className="flex-row items-center gap-x-3">
                        <View
                            style={{
                                backgroundColor:
                                    theme.primary + "15",
                            }}
                            className="px-2.5 py-1 rounded-md"
                        >
                            <Text
                                style={{ color: theme.primary }}
                                className="text-[10px] font-black tracking-widest uppercase"
                            >
                                Category Ledger
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                        >
                            {initialData
                                ? "Modify Drug Category"
                                : "Create Drug Category"}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20"
                    >
                        <Text
                            className="text-red-500 font-bold text-xs px-2"
                            style={{ fontFamily: theme.font.bold }}
                        >
                            ✕ Cancel
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Form */}
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    className="flex-1 w-full px-6 py-6"
                >
                    <View className="w-full max-w-2xl mx-auto">
                        <Formik
                            enableReinitialize={true}
                            initialValues={{
                                title:
                                    initialData?.title || "",
                                description:
                                    initialData?.description || "",
                            }}
                            validationSchema={
                                AdminDrugCategoryFormSchema
                            }
                            onSubmit={(values, formikHelpers) => {
                                console.log(
                                    `📦 [Admin Payload Monitor] action: "${initialData
                                        ? "UpdateCategory"
                                        : "CreateCategory"
                                    }" | data:`,
                                    JSON.stringify(values)
                                );
                                onSubmitTrigger(
                                    values,
                                    formikHelpers
                                );
                            }}
                        >
                            {({
                                handleChange,
                                handleBlur,
                                handleSubmit,
                                values,
                                errors,
                                touched,
                            }) => (
                                <View
                                    style={{
                                        backgroundColor:
                                            theme.panel,
                                        borderColor: theme.border,
                                    }}
                                    className="p-6 rounded-2xl border flex-col w-full gap-y-4"
                                >
                                    {/* Title field */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1"
                                        >
                                            Category Title
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                "title"
                                            )}
                                            onBlur={handleBlur(
                                                "title"
                                            )}
                                            value={values.title}
                                            placeholder="e.g. ANTIBIOTICS"
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            style={{
                                                backgroundColor:
                                                    theme.background,
                                                borderColor:
                                                    touched.title &&
                                                        errors.title
                                                        ? "#ef4444"
                                                        : theme.border,
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.sm,
                                            }}
                                            className="w-full rounded-xl px-4 h-[42px] border outline-none"
                                        />
                                        {touched.title &&
                                            errors.title && (
                                                <Text className="text-red-500 text-[11px] font-semibold mt-1">
                                                    {errors.title}
                                                </Text>
                                            )}
                                    </View>

                                    {/* Description field */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1"
                                        >
                                            Pharmacological Description
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                "description"
                                            )}
                                            onBlur={handleBlur(
                                                "description"
                                            )}
                                            value={
                                                values.description
                                            }
                                            placeholder="Specify drug classification boundaries, mechanisms, and constraints..."
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            multiline
                                            numberOfLines={4}
                                            style={{
                                                backgroundColor:
                                                    theme.background,
                                                borderColor:
                                                    touched.description &&
                                                        errors.description
                                                        ? "#ef4444"
                                                        : theme.border,
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.sm,
                                                textAlignVertical:
                                                    "top",
                                            }}
                                            className="w-full rounded-xl px-4 py-3 min-h-[100px] border outline-none"
                                        />
                                        {touched.description &&
                                            errors.description && (
                                                <Text className="text-red-500 text-[11px] font-semibold mt-1">
                                                    {
                                                        errors.description
                                                    }
                                                </Text>
                                            )}
                                    </View>

                                    {/* Submit */}
                                    <TouchableOpacity
                                        onPress={() =>
                                            handleSubmit()
                                        }
                                        disabled={
                                            isSubmittingRemote
                                        }
                                        style={{
                                            backgroundColor:
                                                theme.primary,
                                        }}
                                        className="w-full h-12 rounded-xl items-center justify-center mt-4 active:opacity-90"
                                    >
                                        {isSubmittingRemote ? (
                                            <ActivityIndicator
                                                color="#ffffff"
                                                size="small"
                                            />
                                        ) : (
                                            <Text
                                                className="text-white uppercase tracking-wider"
                                                style={{
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                            >
                                                {initialData
                                                    ? "Update Category Metadata"
                                                    : "Commit Category Entry"}
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