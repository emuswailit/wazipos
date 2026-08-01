import { useAuth } from "@/context/AuthContext";
import { parse } from "date-fns";
import { useRouter } from "expo-router";
import { Formik } from "formik";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";

// Absolute Module Imports
import AccountFields from "./AccountFields";
import IdentityFields from "./IdentityFields";
import RegionFields from "./RegionFields";
import RegistrationHeader from "./RegistrationHeader";

// Enforce strict business-ready registration validation parameters via Yup
const RegisterSchema = Yup.object().shape({
    country: Yup.string().required("Country selection is required"),
    county: Yup.string().when("country", {
        is: "KE",
        then: (schema) => schema.required("County selection is required for Kenyan users"),
        otherwise: (schema) => schema.notRequired(),
    }),
    firstName: Yup.string().required("First name is required"),
    middleName: Yup.string().notRequired(),
    lastName: Yup.string().required("Last name is required"),
    gender: Yup.string().required("Gender selection is required"),
    dob: Yup.string()
        .required("Date of birth is required")
        .matches(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
        .test("ageCheck", "You must be at least 18 years old", (value) => {
            if (!value) return false;
            try {
                const parsedDate = parse(value, "yyyy-MM-dd", new Date());
                const ageDifMs = Date.now() - parsedDate.getTime();
                const ageDate = new Date(ageDifMs);
                return Math.abs(ageDate.getUTCFullYear() - 1970) >= 18;
            } catch {
                return false;
            }
        }),
    email: Yup.string().email("Please enter a valid email address").required("Account email is required"),
    phone: Yup.string()
        .matches(/^[1-9][0-9]{7,12}$/, "Phone number must not start with zero")
        .required("Phone number is required"),
    password: Yup.string().min(8, "Password must be at least 8 characters long").required("Password is required"),
    confirmPassword: Yup.string().oneOf([Yup.ref("password")], "Passwords must match exactly").required("Please confirm your password"),

    // Enforces compulsory terms checkbox validation rule
    agreeToTerms: Yup.boolean()
        .oneOf([true], "You must accept the terms and conditions")
        .required(),
});

export default function RegisterScreen() {
    const { login, theme } = useAuth();
    const router = useRouter();

    return (
        <View
            style={{ backgroundColor: Platform.OS === "web" ? "#f8fafc" : theme.background }}
            className="flex-1 items-center justify-center w-full px-4 py-6"
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="w-full flex-1 flex items-center justify-center"
            >
                {/* 
          Master Responsive Card Container:
          - max-w-md on mobile sizes
          - md:max-w-3xl scales wider on desktop screens to support two columns side-by-side
        */}
                <View
                    style={{ backgroundColor: theme.background }}
                    className="w-full max-w-md md:max-w-3xl p-6 md:p-10 rounded-2xl web:shadow-xl web:border web:border-slate-100 max-h-[92vh]"
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="always"
                        contentContainerStyle={{ flexGrow: 1 }}
                    >
                        <Formik
                            initialValues={{
                                country: "",
                                county: "",
                                countryCode: "",
                                firstName: "",
                                middleName: "",
                                lastName: "",
                                gender: "",
                                dob: "",
                                email: "",
                                phone: "",
                                password: "",
                                confirmPassword: "",
                                agreeToTerms: true // Pre-checked by default metric standards
                            }}
                            validationSchema={RegisterSchema}
                            onSubmit={async (values, { setSubmitting }) => {
                                try {
                                    const simulatedExpiry = Math.floor(Date.now() / 1000) + 7200;
                                    const fakeTokenPayload = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." +
                                        btoa(JSON.stringify({ id: "usr_789", email: values.email, exp: simulatedExpiry })) + "." +
                                        "signature_mask";
                                    await login(fakeTokenPayload);
                                } catch (e) {
                                    console.error("Registration onboarding transaction execution failure:", e);
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {(formikProps) => (
                                /* 
                                  Master Grid Assembly Track:
                                  - grid-cols-1: standard vertical stacking profile on mobile viewports
                                  - md:grid-cols-2: shifts cleanly into two parallel side-by-side columns on large desktops
                                */
                                <View className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

                                    {/* Branding Header Area spans completely across both layout tracks on desktop */}
                                    <View className="md:col-span-2">
                                        <RegistrationHeader />
                                    </View>

                                    {/* 
                    Mounted Sub-Component Modular Fields 
                    (Ordered Identity -> Region -> Contact Account according to preference)
                  */}

                                    <IdentityFields formik={formikProps} />
                                    <RegionFields formik={formikProps} />
                                    <AccountFields formik={formikProps} />

                                    {/* Terms and Conditions Interactive Compliance Toggle Row */}
                                    <View className="mt-2 md:col-span-2 flex-row items-center px-1">
                                        <TouchableOpacity
                                            onPress={() => formikProps.setFieldValue("agreeToTerms", !formikProps.values.agreeToTerms)}
                                            style={{ borderColor: formikProps.values.agreeToTerms ? theme.primary : theme.border }}
                                            className="w-5 h-5 border rounded flex items-center justify-center mr-3 transition-colors"
                                        >
                                            {formikProps.values.agreeToTerms && (
                                                <View style={{ backgroundColor: theme.primary }} className="w-3 h-3 rounded-[2px]" />
                                            )}
                                        </TouchableOpacity>

                                        <Text className="text-slate-500 text-xs font-medium leading-relaxed flex-1">
                                            I have read, understood, and accepted the comprehensive{" "}
                                            <Text style={{ color: theme.primary }} className="font-bold">wazipos Terms of Service</Text>
                                            {" "}and security privacy policies.
                                        </Text>
                                    </View>

                                    {/* Submission and Core Navigation Form Actions */}
                                    <View className="mt-2 md:col-span-2 gap-y-2">
                                        <TouchableOpacity
                                            onPress={() => formikProps.handleSubmit()}
                                            // Natively locks the interface button out if terms check box evaluates to false
                                            disabled={formikProps.isSubmitting || !formikProps.values.agreeToTerms}
                                            style={{
                                                backgroundColor: formikProps.values.agreeToTerms ? theme.primary : "#94a3b8",
                                                opacity: formikProps.values.agreeToTerms ? 1 : 0.6
                                            }}
                                            className="w-full items-center justify-center rounded-xl py-4 shadow-md min-h-[56px] transition-all"
                                        >
                                            {formikProps.isSubmitting ? (
                                                <ActivityIndicator color={theme.textLight} />
                                            ) : (
                                                <Text style={{ color: theme.textLight }} className="font-bold text-base">
                                                    Register Hub Account
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity onPress={() => router.push("/(auth)/login")} className="items-center py-3">
                                            <Text className="text-sm text-slate-500 font-medium">
                                                Already Registered? <Text style={{ color: theme.primary }} className="font-bold">Sign In</Text>
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                </View>
                            )}
                        </Formik>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
