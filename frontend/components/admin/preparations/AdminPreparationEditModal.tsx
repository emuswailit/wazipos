// components/admin/preparations/AdminPreparationEditModal.tsx
//
// Admin create/edit form modal for preparations.

import drugsApi from '@/api/drugsApi';
import CustomAutocompletePicker from '@/components/common/CustomAutocompletePicker';
import CustomMultiselectAutocompletePicker from '@/components/common/CustomMultiselectAutocompletePicker';
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

const AdminPreparationFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(2, 'Title must be at least 2 characters')
        .required(
            'Preparation dosage label title is required'
        ),
    description: Yup.string().ensure(),
    formulation_id: Yup.string().required(
        'Target package formulation form choice is required'
    ),
    generics: Yup.array()
        .min(
            1,
            'At least one generic compound ingredient must be attached'
        )
        .required('Linked compounds are required'),
});

export default function AdminPreparationEditModal({
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

    const getFormulationsApi = useApi<any>(async (payload: any) =>
        drugsApi.formulationsAction(payload)
    );
    const getGenericsApi = useApi<any>(async (payload: any) =>
        drugsApi.genericsAction(payload)
    );

    useEffect(() => {
        if (visible) {
            getFormulationsApi.request({
                action: 'GetFormulations',
            });
            getGenericsApi.request({ action: 'GetGenerics' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const formulationOptions = useMemo(() => {
        if (
            !getFormulationsApi.data ||
            !Array.isArray(getFormulationsApi.data)
        ) {
            return [];
        }
        return getFormulationsApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
            };
        });
    }, [getFormulationsApi.data]);

    const genericOptions = useMemo(() => {
        if (
            !getGenericsApi.data ||
            !Array.isArray(getGenericsApi.data)
        ) {
            return [];
        }
        return getGenericsApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
            };
        });
    }, [getGenericsApi.data]);

    useEffect(() => {
        if (remoteErrors) {
            console.log(
                `❌ [Admin API Error Matrix] Prep Command Terminated:`,
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
                                System Entry
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
                                ? 'Modify Preparation Strength'
                                : 'Create Product Preparation'}
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
                                formulation_id:
                                    initialData?.formulation_id ||
                                    initialData?.formulation ||
                                    '',
                                generics: Array.isArray(
                                    initialData?.generics
                                )
                                    ? initialData.generics
                                    : [],
                            }}
                            validationSchema={
                                AdminPreparationFormSchema
                            }
                            onSubmit={(values, formikHelpers) => {
                                console.log(
                                    `📦 [Admin Payload Monitor] action: "${initialData
                                        ? 'UpdatePreparation'
                                        : 'CreatePreparation'
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
                                            Preparation Label Name &
                                            Strength
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                'title'
                                            )}
                                            onBlur={handleBlur(
                                                'title'
                                            )}
                                            value={values.title}
                                            placeholder="e.g. AMOXYCILLIN 500MG"
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

                                    {/* Formulation */}
                                    <CustomAutocompletePicker
                                        name="formulation_id"
                                        label="Linked Dosage Formulation Form"
                                        options={formulationOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        initialTitle={
                                            initialData?.formulation_title
                                        }
                                        loading={
                                            getFormulationsApi.loading
                                        }
                                        placeholder="Pick formulation medium..."
                                        loadingPlaceholder="Loading metrics..."
                                        noMatchText="No structural mediums mapped."
                                        emptyText="No formulations available."
                                    />

                                    {/* Generics */}
                                    <CustomMultiselectAutocompletePicker
                                        name="generics"
                                        label="Link Generic Compounds"
                                        options={genericOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        loading={getGenericsApi.loading}
                                        placeholder="Type to filter and select..."
                                        loadingPlaceholder="Loading active compounds..."
                                        noMatchText="No active ingredients match your query."
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
                                            Clinical Note Constraints
                                            Summary (Optional)
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
                                            placeholder="Provide specific batch notes guidelines..."
                                            placeholderTextColor={
                                                theme.textDark
                                            }
                                            style={{
                                                backgroundColor:
                                                    theme.background,
                                                borderColor:
                                                    theme.border,
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize:
                                                    theme.fontSize.sm,
                                            }}
                                            className="w-full rounded-xl px-4 h-[42px] border outline-none"
                                        />
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
                                                    ? 'Update Preparation'
                                                    : 'Create Preparation'}
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