// components/admin/routes/AdminRouteEditModal.tsx
//
// Admin create/edit form modal for administration routes.
//
// One modal handles both modes — `initialData` presence decides
// the header title and submit label.

import { Formik } from 'formik';
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
}

const AdminRouteFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, 'Route title must be at least 3 characters')
        .max(50, 'Route title cannot exceed 50 characters')
        .required('Administration route title is required'),
    description: Yup.string()
        .min(
            10,
            'Clinical description must be at least 10 characters'
        )
        .required('Clinical description summary is required'),
});

export default function AdminRouteEditModal({
    visible,
    onClose,
    isDarkMode,
    theme,
    isSubmittingRemote,
    onSubmitTrigger,
    initialData,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="fade"
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
                    className="h-16 w-full border-b px-6 flex-row justify-between items-center z-50"
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
                                System Ledger
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.base,
                            }}
                            className="tracking-tight"
                        >
                            {initialData
                                ? 'Modify Administration Route'
                                : 'Create New Route'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.7}
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
                            }}
                            validationSchema={AdminRouteFormSchema}
                            onSubmit={onSubmitTrigger}
                        >
                            {({
                                handleChange,
                                handleBlur,
                                handleSubmit,
                                values,
                                errors,
                                touched,
                                isSubmitting,
                            }) => (
                                <View
                                    style={{
                                        backgroundColor:
                                            theme.panel,
                                        borderColor: theme.border,
                                    }}
                                    className="p-6 rounded-2xl border flex-col w-full gap-y-4"
                                >
                                    {/* Form header */}
                                    <View
                                        className="border-b pb-2 mb-2 w-full"
                                        style={{
                                            borderBottomColor:
                                                theme.border,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.bold,
                                                fontSize:
                                                    theme.fontSize.base,
                                            }}
                                            className="text-left"
                                        >
                                            Route Parameter Entry Form
                                        </Text>
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.xs,
                                                marginTop: 2,
                                            }}
                                            className="text-left"
                                        >
                                            Input parameters must
                                            align with localized
                                            cluster deployment
                                            fields.
                                        </Text>
                                    </View>

                                    {/* Title */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1.5"
                                        >
                                            Route Name
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                'title'
                                            )}
                                            onBlur={handleBlur(
                                                'title'
                                            )}
                                            value={values.title}
                                            placeholder="e.g. INTRAMUSCULAR, ORAL, INTRAVENOUS"
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            autoCapitalize="characters"
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
                                            className="w-full rounded-xl px-4 h-[44px] border outline-none"
                                        />
                                        {touched.title &&
                                            errors.title && (
                                                <Text className="text-red-500 text-[11px] font-semibold mt-1 pl-1">
                                                    {errors.title}
                                                </Text>
                                            )}
                                    </View>

                                    {/* Description */}
                                    <View className="items-start w-full">
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontFamily:
                                                    theme.font.bold,
                                            }}
                                            className="text-[10px] uppercase tracking-wider mb-1.5"
                                        >
                                            Clinical Route Description
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
                                            placeholder="Provide detailed description regarding intake procedures, absorption profiles, and specific guidelines..."
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            multiline
                                            numberOfLines={5}
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
                                                height: 120,
                                                paddingTop: 12,
                                                textAlignVertical:
                                                    'top',
                                            }}
                                            className="w-full rounded-xl px-4 border text-left leading-relaxed outline-none"
                                        />
                                        {touched.description &&
                                            errors.description && (
                                                <Text className="text-red-500 text-[11px] font-semibold mt-1 pl-1">
                                                    {
                                                        errors.description
                                                    }
                                                </Text>
                                            )}
                                    </View>

                                    {/* Submit */}
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() =>
                                            handleSubmit()
                                        }
                                        disabled={
                                            isSubmitting ||
                                            isSubmittingRemote
                                        }
                                        style={{
                                            backgroundColor:
                                                theme.primary,
                                        }}
                                        className="w-full h-12 rounded-xl items-center justify-center mt-4 active:opacity-90"
                                    >
                                        {isSubmitting ||
                                            isSubmittingRemote ? (
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
                                                    ? 'Update Route Parameters'
                                                    : 'Commit Route Entry'}
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