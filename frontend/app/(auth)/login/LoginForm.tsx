import authService from '@/api/authApi';
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";

const LoginSchema = Yup.object().shape({
    email: Yup.string().required("Email address or phone is required"),
    password: Yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
});

export default function LoginForm() {
    const { login, theme } = useAuth();
    const router = useRouter();
    const [authErrors, setAuthErrors] = useState<string[]>([]);

    // Define the custom API wrapper hook
    const loginApi = useApi<any>(async (payload: { phone_or_email: string; password: string }) => {
        console.log("Credentials Outbound:", payload);
        return await authService.login(payload.phone_or_email, payload.password);
    });
    const googleLoginApi = useApi<any>(async (idToken: string) => authService.googleLogin(idToken));

    /** Shared by password and Google sign-in: both endpoints reply in the same shape. */
    const completeSignIn = async (response: any) => {
        if (!response) {
            setAuthErrors(["No response from authorization gateway."]);
            return;
        }

        const access_token = response.data?.tokens?.access;
        const response_code = response.data?.response_code;

        if (response_code === 1) {
            setAuthErrors([response.data?.response_message || "Invalid credentials provided."]);
            return;
        }

        if (response_code === 0 && access_token) {
            await login(access_token);
            router.replace("/(tabs)");
            return;
        }

        if (!response.ok) {
            setAuthErrors([response.data?.message || response.data?.response_message || "Network error. Please try again later."]);
        }
    };

    const handleGoogleIdToken = async (idToken: string) => {
        setAuthErrors([]);
        try {
            const response = await googleLoginApi.request(idToken);
            await completeSignIn(response);
        } catch (error: any) {
            console.error("Google sign-in exchange failed:", error);
            setAuthErrors([error?.response?.data?.message || "Network error. Please try again later."]);
        }
    };

    const anySignInBusy = loginApi.loading || googleLoginApi.loading;

    return (
        <Formik
            initialValues={{ email: "", password: "" }}
            validationSchema={LoginSchema}
            onSubmit={async (values, { setSubmitting }) => {
                setAuthErrors([]); // Clear previous submission errors instantly

                try {
                    // 🌟 STEP 1: Fire the network call synchronously and capture response payload directly
                    const response = await loginApi.request({
                        phone_or_email: values.email.trim(),
                        password: values.password
                    });

                    // 🌟 STEP 2–3: Validate the backend flag, commit the token and redirect
                    await completeSignIn(response);

                } catch (error: any) {
                    // 🌟 STEP 4: Capture 401 Unauthorized, 500 Server Crashes, and offline dropouts instantly
                    console.error("Inbound Interceptor Error Block Caught Exception:", error);

                    // Safely extract the exact response string or fallback safely
                    const errorMessage = error?.response?.data?.message || loginApi.errorMessage || "Network error. Please try again later.";
                    setAuthErrors([errorMessage]);
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
                            style={{ backgroundColor: theme.surface, color: theme.text, borderColor: touched.email && formikErrors.email ? "#ef4444" : theme.border }}
                            className="w-full rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-base md:text-sm"
                            placeholder="name@wazipos.com"
                            placeholderTextColor="#94a3b8"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            autoComplete="username"
                            textContentType="username"
                            returnKeyType="next"
                            onChangeText={handleChange("email")}
                            onBlur={handleBlur("email")}
                            value={values.email}
                        />
                        {touched.email && formikErrors.email && (
                            <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formikErrors.email}</Text>
                        )}
                    </View>

                    {/* Security Password Field */}
                    <View className="mt-1">
                        <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Security Password
                        </Text>
                        <TextInput
                            style={{ backgroundColor: theme.surface, color: theme.text, borderColor: touched.password && formikErrors.password ? "#ef4444" : theme.border }}
                            className="w-full rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-base md:text-sm"
                            placeholder="••••••••"
                            placeholderTextColor="#94a3b8"
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="password"
                            textContentType="password"
                            returnKeyType="go"
                            onSubmitEditing={() => handleSubmit()}
                            onChangeText={handleChange("password")}
                            onBlur={handleBlur("password")}
                            value={values.password}
                        />
                        {touched.password && formikErrors.password && (
                            <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formikErrors.password}</Text>
                        )}
                    </View>

                    {/* Backend Dynamic Error Message Alert Display */}
                    {authErrors.length > 0 && (
                        <View className="p-3 bg-red-50 border border-red-200 rounded-xl">
                            {authErrors.map((err, idx) => (
                                <Text key={idx} className="text-red-600 text-xs font-semibold text-center">{err}</Text>
                            ))}
                        </View>
                    )}

                    {/* Sign In Button Action */}
                    <TouchableOpacity
                        onPress={() => handleSubmit()}
                        disabled={isSubmitting || anySignInBusy}
                        style={{ backgroundColor: theme.primary }}
                        className="mt-4 w-full items-center justify-center rounded-xl h-[52px] md:h-[44px] shadow-md active:opacity-90"
                    >
                        {isSubmitting || loginApi.loading ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                            <Text style={{ color: "#ffffff" }} className="font-bold text-base md:text-sm">
                                Secure Sign In
                            </Text>
                        )}
                    </TouchableOpacity>

                    {/* Redirect Sub-Actions Links */}
                    <View className="mt-2 flex-row justify-end items-center">
                        <TouchableOpacity
                            onPress={() => router.push("/(auth)/passwordReset" as any)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            className="py-2 px-1"
                        >
                            <Text style={{ color: theme.primary }} className="text-sm md:text-xs font-bold tracking-tight">
                                Forgot Password?
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Social Sign-In */}
                    <View className="flex-row items-center gap-x-3 my-1">
                        <View style={{ backgroundColor: theme.border }} className="flex-1 h-px" />
                        <Text className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">or</Text>
                        <View style={{ backgroundColor: theme.border }} className="flex-1 h-px" />
                    </View>

                    <GoogleSignInButton
                        onIdToken={handleGoogleIdToken}
                        onError={(message) => setAuthErrors([message])}
                        loading={googleLoginApi.loading}
                        disabled={isSubmitting || loginApi.loading}
                    />

                    <TouchableOpacity
                        onPress={() => router.push("/(auth)/register" as any)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className="mt-2 items-center py-3"
                    >
                        <Text className="text-sm md:text-xs text-slate-500 font-medium">
                            Not Registered? <Text style={{ color: theme.primary }} className="font-black">Create Account</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </Formik>
    );
}
