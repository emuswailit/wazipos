// components/admin/generics/AdminGenericEditModal.tsx
//
// Admin create/edit form modal for generics.
//
// Both parent links (drug_classes, drug_sub_classes) are M2M.
// Each uses the shared CustomMultiselectAutocompletePicker which
// stores a string[] of selected ids in Formik.
//
// Invariant: every selected subclass's parent class must also be
// selected. When a subclass is picked, its parent class id is
// auto-added to drug_classes via the option's meta.parentId.

import drugsApi from '@/api/drugsApi';
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

const AdminGenericFormSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, 'Compound title must be at least 3 characters')
        .required('Generic compound title is required'),
    description: Yup.string().min(
        3,
        'Provide chemical specification descriptors'
    ),
});

export default function AdminGenericEditModal({
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

    /* ---------------- Drug classes fetch ---------------- */
    const getDrugClassesApi = useApi<any>(async (payload: any) =>
        drugsApi.drugClassesAction(payload)
    );

    /* ---------------- Drug sub classes fetch ---------------- */
    const getDrugSubClassesApi = useApi<any>(async (payload: any) =>
        drugsApi.drugSubClassesAction(payload)
    );

    useEffect(() => {
        if (visible) {
            getDrugClassesApi.request({
                action: 'GetDrugClasses',
            });
            getDrugSubClassesApi.request({
                action: 'GetDrugSubClasses',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const drugClassOptions = useMemo(() => {
        if (
            !getDrugClassesApi.data ||
            !Array.isArray(getDrugClassesApi.data)
        ) {
            return [];
        }
        return getDrugClassesApi.data.map((item: any) => {
            const f = item.fields ?? item;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
            };
        });
    }, [getDrugClassesApi.data]);

    const drugSubClassOptions = useMemo(() => {
        if (
            !getDrugSubClassesApi.data ||
            !Array.isArray(getDrugSubClassesApi.data)
        ) {
            return [];
        }
        return getDrugSubClassesApi.data.map((item: any) => {
            const f = item.fields ?? item;
            const parentId =
                f?.drug_class || f?.drug_class_id || null;
            return {
                id: item.pk || item.id,
                title: f?.title || 'UNSPECIFIED',
                meta: { parentId },
            };
        });
    }, [getDrugSubClassesApi.data]);

    useEffect(() => {
        if (remoteErrors) {
            console.log(
                `❌ [Admin API Error Matrix] Generic Operation Refused:`,
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
                {/* ───── Header ───── */}
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
                                Formula Spec
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
                                ? 'Modify Compound Generic'
                                : 'Register Compound Generic'}
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

                {/* ───── Form ───── */}
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
                                drug_classes: Array.isArray(
                                    initialData?.drug_classes
                                )
                                    ? initialData.drug_classes
                                    : [],
                                drug_sub_classes: Array.isArray(
                                    initialData?.drug_sub_classes
                                )
                                    ? initialData.drug_sub_classes
                                    : [],
                            }}
                            validationSchema={
                                AdminGenericFormSchema
                            }
                            onSubmit={(values, formikHelpers) => {
                                console.log(
                                    `📦 [Admin Payload Monitor] action: "${initialData
                                        ? 'UpdateGeneric'
                                        : 'CreateGeneric'
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
                                setFieldValue,
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
                                            Generic Compound Title
                                        </Text>
                                        <TextInput
                                            onChangeText={handleChange(
                                                'title'
                                            )}
                                            onBlur={handleBlur(
                                                'title'
                                            )}
                                            value={values.title}
                                            placeholder="e.g. AMOXICILIN"
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

                                    {/* Drug classes — multiselect */}
                                    <CustomMultiselectAutocompletePicker
                                        name="drug_classes"
                                        label="Drug Classes"
                                        options={drugClassOptions}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        loading={
                                            getDrugClassesApi.loading
                                        }
                                        placeholder="Search to add drug classes..."
                                        loadingPlaceholder="Loading drug classes list..."
                                    />

                                    {/* Drug sub classes — multiselect, auto-adds parent class */}
                                    <CustomMultiselectAutocompletePicker
                                        name="drug_sub_classes"
                                        label="Drug Sub Classes"
                                        options={
                                            drugSubClassOptions
                                        }
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        loading={
                                            getDrugSubClassesApi.loading
                                        }
                                        placeholder="Search to add drug sub classes..."
                                        loadingPlaceholder="Loading drug sub classes list..."
                                        onAfterSelect={(
                                            id,
                                            title,
                                            opt
                                        ) => {
                                            const parentId =
                                                opt.meta?.parentId;
                                            if (!parentId) return;

                                            const current =
                                                Array.isArray(
                                                    values.drug_classes
                                                )
                                                    ? values.drug_classes
                                                    : [];
                                            if (
                                                !current.includes(
                                                    parentId
                                                )
                                            ) {
                                                setFieldValue(
                                                    'drug_classes',
                                                    [
                                                        ...current,
                                                        parentId,
                                                    ]
                                                );
                                            }
                                        }}
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
                                            Clinical Compound Indication
                                            Profile Summary
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
                                            placeholder="Specify pharmacology boundaries..."
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
                                                        ? 'Update Matrix'
                                                        : 'Commit Formula'}
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