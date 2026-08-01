import { useAuth } from '@/context/AuthContext';
import useApi from '@/hooks/useApi';
import { Formik } from 'formik';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import * as Yup from 'yup';
import { DataPayload } from './RoutesDataGrid';

interface CreateRouteFormProps {
    onSuccess: (newRoute: DataPayload) => void;
    onCancel: () => void;
}

const CreateRouteSchema = Yup.object().shape({
    title: Yup.string()
        .min(3, "Title must be at least 3 characters")
        .required("Asset route title configuration is required"),
    description: Yup.string()
        .min(10, "Please provide a more comprehensive description sequence")
        .required("Description configuration is required"),
    entity: Yup.string()
        .matches(/^[0-9a-fA-F-]+$/, "Must match a valid system UUID standard format")
        .required("Entity tracking anchor hardware token required"),
});

export default function CreateRouteForm({ onSuccess, onCancel }: CreateRouteFormProps) {
    const { theme } = useAuth();
    const [apiErrors, setApiErrors] = useState<string[]>([]);

    const routeCreateApi = useApi<any>(async (payload: { title: string; description: string; entity: string }) => {
        return new Promise((resolve) => setTimeout(() => resolve({
            success: true,
            response_code: 0,
            data: {
                id: `route-${Math.random().toString(36).slice(2, 11)}`,
                title: payload.title.toUpperCase(),
                description: payload.description,
                owner: "authenticated-session-user",
                images: [],
                entity: payload.entity,
                created: "2026-08-01 10:04:00",
                updated: "2026-08-01 10:04:00"
            }
        }), 1000));
    });

    useEffect(() => {
        if (routeCreateApi.data) {
            const response_code = routeCreateApi.data?.response_code ?? (routeCreateApi.data?.success ? 0 : 1);

            if (response_code === 1) {
                setApiErrors([routeCreateApi.data?.response_message || "Execution verification rejected by server processing pipeline."]);
            }

            if (response_code === 0 && routeCreateApi.data?.data) {
                onSuccess(routeCreateApi.data.data);
            }
        } else if (routeCreateApi.error) {
            setApiErrors([routeCreateApi.errorMessage || "Network error. Remote server endpoint unreachable."]);
        }
    }, [routeCreateApi.data, routeCreateApi.error]);

    return (
        <Formik
            initialValues={{ title: "", description: "", entity: "" }}
            validationSchema={CreateRouteSchema}
            onSubmit={async (values, { setSubmitting }) => {
                try {
                    setApiErrors([]);
                    await routeCreateApi.request({
                        title: values.title.trim(),
                        description: values.description.trim(),
                        entity: values.entity.trim(),
                    });
                } catch (err) {
                    console.error("Form Mutation Execution Defect:", err);
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            {({ handleChange, handleBlur, handleSubmit, values, errors: formikErrors, touched, isSubmitting }) => (
                <ScrollView contentContainerClassName="gap-y-4 pr-1">

                    {/* Field A: Route Asset Title */}
                    <View>
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Route Asset Title
                        </Text>
                        <TextInput
                            style={{
                                backgroundColor: theme.surface,
                                borderColor: touched.title && formikErrors.title ? "#ef4444" : theme.border
                            }}
                            className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs font-medium"
                            placeholder="e.g. INFECTIOUS BIOMARKERS"
                            placeholderTextColor="#94a3b8"
                            onChangeText={handleChange("title")}
                            onBlur={handleBlur("title")}
                            value={values.title}
                        />
                        {touched.title && formikErrors.title && (
                            <Text className="text-red-400 text-[10px] font-semibold mt-1 ml-1">{formikErrors.title}</Text>
                        )}
                    </View>

                    {/* Field B: Description Specification Matrix */}
                    <View className="mt-1">
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Description Brief Spec
                        </Text>
                        <TextInput
                            style={{
                                backgroundColor: theme.surface,
                                borderColor: touched.description && formikErrors.description ? "#ef4444" : theme.border,
                                textAlignVertical: 'top'
                            }}
                            className="w-full text-slate-900 rounded-xl px-4 min-h-[80px] md:min-h-[60px] py-3.5 md:py-2 border outline-none text-sm md:text-xs font-medium"
                            placeholder="Provide deep therapeutic data routing metrics..."
                            placeholderTextColor="#94a3b8"
                            multiline
                            numberOfLines={3}
                            onChangeText={handleChange("description")}
                            onBlur={handleBlur("description")}
                            value={values.description}
                        />
                        {touched.description && formikErrors.description && (
                            <Text className="text-red-400 text-[10px] font-semibold mt-1 ml-1">{formikErrors.description}</Text>
                        )}
                    </View>

                    {/* Field C: Hardware Entity UUID Token */}
                    <View className="mt-1">
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Hardware Entity UUID Token
                        </Text>

                        {touched.entity && formikErrors.entity && (
                            <Text className="text-red-400 text-[10px] font-semibold mt-1 ml-1">{formikErrors.entity}</Text>
                        )}
                    </View>

                    {/* Backend Server Exception Alert Box */}
                    {apiErrors.length > 0 && (
                        <View className="p-3 bg-red-50 border border-red-200 rounded-xl mt-2">
                            {apiErrors.map((err, idx) => (
                                <Text key={idx} className="text-red-600 text-xs font-semibold text-center">{err}</Text>
                            ))}
                        </View>
                    )}

                    {/* Action Row Buttons */}
                    <View className="flex-row items-center gap-x-3 mt-4 w-full">
                        <TouchableOpacity
                            onPress={onCancel}
                            disabled={isSubmitting || routeCreateApi.loading}
                            className="flex-1 items-center justify-center rounded-xl h-[52px] md:h-[44px] border border-slate-200 active:bg-slate-50"
                        >
                            <Text className="font-bold text-slate-500 text-sm md:text-xs">Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => handleSubmit()}
                            disabled={isSubmitting || routeCreateApi.loading}
                            style={{ backgroundColor: theme.primary }}
                            className="flex-1 items-center justify-center rounded-xl h-[52px] md:h-[44px] shadow-md active:opacity-90"
                        >
                            {isSubmitting || routeCreateApi.loading ? (
                                <ActivityIndicator color="#ffffff" size="small" />
                            ) : (
                                <Text style={{ color: "#ffffff" }} className="font-bold text-sm md:text-xs">
                                    Save Asset Route
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}
        </Formik>
    );
}
