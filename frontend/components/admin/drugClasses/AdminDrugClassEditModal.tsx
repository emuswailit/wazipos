// components/admin/drugClasses/AdminDrugClassEditModal.tsx

import drugsApi from '@/api/drugsApi';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import useApi from '@/hooks/useApi';
import { Formik } from 'formik';
import { useEffect, useMemo } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import * as Yup from 'yup';

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

const AdminDrugClassFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, 'Title must be at least 3 characters')
        .required('Drug class title is required'),
    category: Yup.string().required(
        'Category selection linkage is required'
    ),
    description: Yup.string().min(
        5,
        'Provide a clean definition summary description'
    ),
});

export default function AdminDrugClassEditModal({
    visible,
    onClose,
    isDarkMode,
    theme,
    isSubmittingRemote,
    onSubmitTrigger,
    initialData,
    remoteErrors,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();

    /* ---------------- Categories fetch ---------------- */
    const getCategoriesApi = useApi<any>(async (payload: any) =>
        drugsApi.categoriesAction(payload)
    );

    useEffect(() => {
        if (visible) {
            getCategoriesApi.request({ action: 'GetCategories' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const categoryOptions = useMemo(() => {
        if (
            !getCategoriesApi.data ||
            !Array.isArray(getCategoriesApi.data)
        ) {
            return [];
        }
        return getCategoriesApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
            };
        });
    }, [getCategoriesApi.data]);

    useEffect(() => {
        if (remoteErrors) {
            console.log(
                `❌ [Admin API Error Matrix] Drug Class Mutation Failed:`,
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
                                    theme.primary + '15',
                            }}
                            className="px-2.5 py-1 rounded-md"
                        >
                            <Text
                                style={{ color: theme.primary }}
                                className="text-[10px] font-black tracking-widest uppercase"
                            >
                                Class Ledger
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
                                ? 'Modify Drug Class'
                                : 'Create Drug Class'}
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
                                    initialData?.title || '',
                                description:
                                    initialData?.description || '',
                                category:
                                    initialData?.category || '',
                            }}
                            validationSchema={
                                AdminDrugClassFormSchema
                            }
                            onSubmit={onSubmitTrigger}
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
                                    {/* Title */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1"
                                        >
                                            Drug Class Title
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                'title'
                                            )}
                                            onBlur={handleBlur(
                                                'title'
                                            )}
                                            value={values.title}
                                            placeholder="e.g. Antibiotics"
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            style={{
                                                backgroundColor:
                                                    theme.background,
                                                borderColor:
                                                    touched.title &&
                                                        errors.title
                                                        ? '#ef4444'
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

                                    {/* Category autocomplete */}
                                    <CustomAutocompletePicker
                                        name="category"
                                        label="Linked Category"
                                        options={categoryOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        initialTitle={
                                            initialData?.category_title
                                        }
                                        loading={
                                            getCategoriesApi.loading
                                        }
                                        placeholder="Type to filter and select a category..."
                                        loadingPlaceholder="Loading categories list..."
                                    />

                                    {/* Description */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1"
                                        >
                                            Clinical Description
                                            Brief
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                'description'
                                            )}
                                            onBlur={handleBlur(
                                                'description'
                                            )}
                                            value={
                                                values.description
                                            }
                                            placeholder="Specify actions boundaries..."
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
                                                        ? '#ef4444'
                                                        : theme.border,
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.sm,
                                                textAlignVertical:
                                                    'top',
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

                                    {/* Actions */}
                                    <View className="flex-row items-center gap-x-3 mt-4 w-full">
                                        <TouchableOpacity
                                            onPress={onClose}
                                            disabled={
                                                isSubmittingRemote
                                            }
                                            className="flex-1 h-12 rounded-xl items-center justify-center border active:opacity-70"
                                            style={{
                                                borderColor:
                                                    theme.border,
                                            }}
                                        >
                                            <Text
                                                className="font-bold uppercase tracking-wider"
                                                style={{
                                                    color: theme.textDark,
                                                    fontFamily:
                                                        theme.font.bold,
                                                    fontSize:
                                                        theme.fontSize.sm,
                                                }}
                                            >
                                                Cancel
                                            </Text>
                                        </TouchableOpacity>
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
                                            className="flex-1 h-12 rounded-xl items-center justify-center active:opacity-90"
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
                                                        ? 'Update Details'
                                                        : 'Commit Entry'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </Formik>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}