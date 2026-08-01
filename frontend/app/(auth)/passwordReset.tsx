import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";

const ResetSchema = Yup.object().shape({
    email: Yup.string()
        .email("Please enter a valid email address")
        .required("Email address is required"),
});

// CRITICAL: Ensure this is declared exactly as "export default function"
export default function PasswordResetScreen() {
    const { theme } = useAuth();
    const router = useRouter(); // Use the imperative routing engine hook

    return (
        <View
            style={{ backgroundColor: Platform.OS === "web" ? "#f8fafc" : theme.background }}
            className="flex-1 items-center justify-center w-full px-4"
        >
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="w-full flex items-center justify-center">
                <View style={{ backgroundColor: theme.background }} className="w-full md:w-1/2 max-w-md p-6 md:p-10 rounded-2xl web:shadow-xl web:border web:border-slate-100">

                    <View className="mb-8">
                        <Text style={{ color: theme.primary }} className="text-3xl font-black tracking-tight">
                            Reset Password
                        </Text>
                        <Text className="text-slate-500 mt-2 text-sm font-medium leading-relaxed">
                            Enter your registered email address below, and we will transmit a secure access restoration token.
                        </Text>
                    </View>

                    <Formik
                        initialValues={{ email: "" }}
                        validationSchema={ResetSchema}
                        onSubmit={async (values, { setSubmitting, setStatus }) => {
                            try {
                                await new Promise((resolve) => setTimeout(resolve, 1500));
                                setStatus({ success: "Verification link transmitted successfully!" });
                            } catch (error) {
                                setStatus({ error: "Failed to dispatch recovery request." });
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >
                        {({ handleChange, handleBlur, handleSubmit, values, errors, touched, isSubmitting, status }) => (
                            <View className="gap-y-4">
                                <View>
                                    <Text style={{ color: theme.textDark }} className="font-semibold mb-2 text-xs uppercase tracking-wider">
                                        Account Email
                                    </Text>
                                    <TextInput
                                        style={{ backgroundColor: theme.surface, borderColor: touched.email && errors.email ? "#ef4444" : theme.border }}
                                        className="w-full text-slate-900 rounded-xl px-4 py-3.5 border outline-none"
                                        placeholder="name@wazipos.com"
                                        placeholderTextColor="#94a3b8"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        onChangeText={handleChange("email")}
                                        onBlur={handleBlur("email")}
                                        value={values.email}
                                    />
                                    {touched.email && errors.email && (
                                        <Text className="text-red-500 text-xs font-semibold mt-1.5 ml-1">{errors.email}</Text>
                                    )}
                                </View>

                                {status?.success && (
                                    <Text className="text-emerald-600 text-sm font-bold text-center mt-2">{status.success}</Text>
                                )}

                                <TouchableOpacity
                                    onPress={() => handleSubmit()}
                                    disabled={isSubmitting}
                                    style={{ backgroundColor: theme.primary }}
                                    className="mt-4 w-full items-center justify-center rounded-xl py-4 shadow-md min-h-[56px]"
                                >
                                    {isSubmitting ? <ActivityIndicator color={theme.textLight} /> : (
                                        <Text style={{ color: theme.textLight }} className="font-bold text-base">Send Reset Link</Text>
                                    )}
                                </TouchableOpacity>

                                {/* Securely navigate back using router instance */}
                                <TouchableOpacity onPress={() => router.push("/(auth)/login")} className="mt-4 items-center">
                                    <Text style={{ color: theme.primary }} className="text-sm font-bold">Back to Sign In</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Formik>

                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
