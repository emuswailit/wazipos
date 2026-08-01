import authService from '@/api/authApi';
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";

const LoginSchema = Yup.object().shape({
    email: Yup.string().required("Email address or phone is required"),
    password: Yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
});

export default function LoginForm() {
    const { login, theme } = useAuth();
    const router = useRouter();

    const loginApi = useApi<any>(async (payload: { phone_or_email: string; password: string }) => {
        return await authService.login(payload.phone_or_email, payload.password);
    });

    const [errors, seterrors] = useState<string[]>([]);
    useEffect(() => {
        if (loginApi.data) {
            console.log("Web Auth Sync Event Triggered -> loginApi.data:", loginApi.data);

            // Ensure you support both standard response wrappers and raw fallback structures safely
            const access_token = loginApi.data?.tokens?.access || loginApi.data?.token;
            const response_code = loginApi.data?.response_code ?? (loginApi.data?.success ? 0 : 1);

            if (response_code === 1) {
                seterrors([loginApi.data?.response_message || "Invalid credentials provided."]);
            }

            if (response_code === 0 && access_token) {
                login(access_token);
                console.log("Web session success: Token successfully committed to browser localStorage.");
            }
        } else if (loginApi.error) {
            seterrors([loginApi.errorMessage || "Network error. Please try again later."]);
        }
    }, [loginApi.data]);


    return (
        <Formik
            initialValues={{ email: "", password: "" }}
            validationSchema={LoginSchema}
            onSubmit={async (values, { setSubmitting }) => {
                try {
                    await loginApi.request({
                        phone_or_email: values.email.trim(),
                        password: values.password
                    });
                } catch (error) {
                    console.error(error);
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            {({ handleChange, handleBlur, handleSubmit, values, errors: formikErrors, touched, isSubmitting }) => (
                <View className="gap-y-4">

                    {/* Account Email Field */}
                    <View>
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Account Email/Phone
                        </Text>
                        <TextInput
                            style={{ backgroundColor: theme.surface, borderColor: touched.email && formikErrors.email ? "#ef4444" : theme.border }}
                            className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                            placeholder="name@wazipos.com"
                            placeholderTextColor="#94a3b8"
                            autoCapitalize="none"
                            onChangeText={handleChange("email")}
                            onBlur={handleBlur("email")}
                            value={values.email}
                        />
                        {touched.email && formikErrors.email && (
                            <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formikErrors.email}</Text>
                        )}
                    </View>

                    {/* Security Password Field */}
                    <View className="mt-1">
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Security Password
                        </Text>
                        <TextInput
                            style={{ backgroundColor: theme.surface, borderColor: touched.password && formikErrors.password ? "#ef4444" : theme.border }}
                            className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                            placeholder="••••••••"
                            placeholderTextColor="#94a3b8"
                            secureTextEntry
                            autoCapitalize="none"
                            onChangeText={handleChange("password")}
                            onBlur={handleBlur("password")}
                            value={values.password}
                        />
                        {touched.password && formikErrors.password && (
                            <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formikErrors.password}</Text>
                        )}
                    </View>

                    {/* Backend Dynamic Error Message Alert Display */}
                    {errors.length > 0 && (
                        <View className="p-3 bg-red-50 border border-red-200 rounded-xl">
                            {errors.map((err, idx) => (
                                <Text key={idx} className="text-red-600 text-xs font-semibold text-center">{err}</Text>
                            ))}
                        </View>
                    )}

                    {/* Sign In Button Action */}
                    <TouchableOpacity
                        onPress={() => handleSubmit()}
                        disabled={isSubmitting || loginApi.loading}
                        style={{ backgroundColor: theme.primary }}
                        className="mt-4 w-full items-center justify-center rounded-xl h-[52px] md:h-[44px] shadow-md active:opacity-90"
                    >
                        {/* 🌟 FIXED: Tracking variables toggle both Formik states and API hook responses cleanly */}
                        {isSubmitting || loginApi.loading ? (
                            // 🌟 FIXED: Hardcoded explicitly to white ("#ffffff") to ensure loading visibility across OS targets
                            <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                            // 🌟 FIXED: Text color style pinned explicitly to pure white string representation
                            <Text style={{ color: "#ffffff" }} className="font-bold text-base md:text-sm">
                                Secure Sign In
                            </Text>
                        )}
                    </TouchableOpacity>

                    {/* Redirect Sub-Actions Links */}
                    <View className="mt-2 flex-row justify-end items-center px-1">
                        <TouchableOpacity onPress={() => router.push("/(auth)/passwordReset" as any)}>
                            <Text style={{ color: theme.primary }} className="text-xs font-bold tracking-tight">
                                Forgot Password?
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={() => router.push("/(auth)/register" as any)} className="mt-4 items-center py-1">
                        <Text className="text-xs text-slate-500 font-medium">
                            Not Registered? <Text style={{ color: theme.primary }} className="font-black">Create Account</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </Formik>
    );
}
