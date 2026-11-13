// app/(auth)/register/index.tsx
//
// Unified registration form.
//
// Shell: shared Screen component (SafeAreaView + optional ScrollView).
// Text inputs: shared CustomTextField.
// Date of birth: shared DateField.
//
// Country list is sourced from EntitiesSyncContext.
// Phone prefix is an inline dropdown that floats above siblings.
// Country defaults to Kenya (+254).
//
// The "Powered by Jambopay" credit is rendered inside the scroll
// content, so it appears at the end of every device regardless of
// screen height. `footerOffset` on Screen gives it enough bottom
// breathing room to clear the home indicator.

import { CustomTextField } from "@/components/common/CustomTextField";
import { DateField } from "@/components/common/DateField";
import { Screen } from "@/components/common/Screen";
import { useAuth } from "@/context/AuthContext";
import { useEntitiesSync } from "@/context/EntitiesSyncContext";
import { useRouter } from "expo-router";
import {
    FormikProps,
    FormikProvider,
    useFormik,
} from "formik";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import * as Yup from "yup";

/* =========================================================
 * Constants
 * ======================================================= */

const COUNTIES = [
    { id: "NBI", title: "Nairobi" },
    { id: "MSA", title: "Mombasa" },
    { id: "KIS", title: "Kisumu" },
    { id: "NKU", title: "Nakuru" },
    { id: "KMB", title: "Kiambu" },
    { id: "UGI", title: "Uasin Gishu" },
    { id: "MCK", title: "Machakos" },
];

const GENDERS = ["Male", "Female", "Other"];

const MIN_AGE_YEARS = 18;

const DEFAULT_COUNTRY_ID = "KE";
const DEFAULT_COUNTRY_TITLE = "KENYA";
const DEFAULT_COUNTY_ID = "NBI";
const DEFAULT_COUNTY_TITLE = "Nairobi";
const DEFAULT_DIAL_CODE = "+254";

/* =========================================================
 * Types
 * ======================================================= */

interface CountryOption {
    id: string;
    title: string;
    country_code: string;
}

type PickerTarget = null | "gender";

/* =========================================================
 * Country normalization
 * ======================================================= */

function normalizeCountry(c: any): CountryOption | null {
    const iso2 = String(c?.iso_code_two ?? "")
        .trim()
        .toUpperCase();
    const rawId = String(c?.id ?? "").trim();
    const title = String(c?.title ?? "").trim();
    const dialRaw = String(c?.country_code ?? "").trim();

    if (!title) return null;

    if (!/^[0-9]+(-[0-9]+)?$/.test(dialRaw)) return null;

    const id = /^[A-Z]{2}$/.test(iso2) ? iso2 : rawId;
    if (!id) return null;

    return {
        id,
        title,
        country_code: `+${dialRaw}`,
    };
}

/* =========================================================
 * Validation
 * ======================================================= */

const RegisterSchema = Yup.object().shape({
    country: Yup.string().required("Country selection is required"),
    county: Yup.string().when("country", {
        is: "KE",
        then: (schema) =>
            schema.required("County selection is required for Kenyan users"),
        otherwise: (schema) => schema.notRequired(),
    }),
    firstName: Yup.string().required("First name is required"),
    middleName: Yup.string().notRequired(),
    lastName: Yup.string().required("Last name is required"),
    gender: Yup.string().required("Gender selection is required"),
    dob: Yup.string()
        .required("Date of birth is required")
        .matches(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
        .test("valid-date", "Please enter a valid date", (value) => {
            if (!value) return false;
            const [y, m, d] = value.split("-").map(Number);
            const dt = new Date(y, m - 1, d);
            return (
                dt.getFullYear() === y &&
                dt.getMonth() === m - 1 &&
                dt.getDate() === d
            );
        })
        .test("ageCheck", "You must be at least 18 years old", (value) => {
            if (!value) return false;
            const [y, m, d] = value.split("-").map(Number);
            const dob = new Date(y, m - 1, d);
            const today = new Date();
            const age =
                today.getFullYear() -
                dob.getFullYear() -
                (today <
                    new Date(
                        today.getFullYear(),
                        dob.getMonth(),
                        dob.getDate()
                    )
                    ? 1
                    : 0);
            return age >= MIN_AGE_YEARS;
        }),
    email: Yup.string()
        .email("Please enter a valid email address")
        .required("Account email is required"),
    phone: Yup.string()
        .matches(
            /^[1-9][0-9]{7,12}$/,
            "Phone number must not start with zero"
        )
        .required("Phone number is required"),
    password: Yup.string()
        .min(8, "Password must be at least 8 characters long")
        .required("Password is required"),
    confirmPassword: Yup.string()
        .oneOf([Yup.ref("password")], "Passwords must match exactly")
        .required("Please confirm your password"),
    agreeToTerms: Yup.boolean()
        .oneOf([true], "You must accept the terms and conditions")
        .required(),
});

/* =========================================================
 * Screen
 * ======================================================= */

export default function RegisterScreen() {
    const { login, theme } = useAuth();
    const router = useRouter();

    const {
        countriesRaw,
        isLocationsSyncing,
        triggerLocationsFetch,
    } = useEntitiesSync();

    const countryList = useMemo<CountryOption[]>(() => {
        return (countriesRaw ?? [])
            .map(normalizeCountry)
            .filter((c): c is CountryOption => c !== null)
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [countriesRaw]);

    useEffect(() => {
        if (countryList.length === 0 && !isLocationsSyncing) {
            void triggerLocationsFetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countryList.length, isLocationsSyncing]);

    const [countrySearch, setCountrySearch] = useState(
        DEFAULT_COUNTRY_TITLE
    );
    const [isCountryFocused, setIsCountryFocused] = useState(false);
    const [countySearch, setCountySearch] = useState(
        DEFAULT_COUNTY_TITLE
    );
    const [isCountyFocused, setIsCountyFocused] = useState(false);

    const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

    const [codeDropdownOpen, setCodeDropdownOpen] = useState(false);
    const [codeQuery, setCodeQuery] = useState("");

    const formik = useFormik({
        initialValues: {
            country: DEFAULT_COUNTRY_ID,
            county: DEFAULT_COUNTY_ID,
            countryCode: DEFAULT_DIAL_CODE,
            firstName: "",
            middleName: "",
            lastName: "",
            gender: "",
            dob: "",
            email: "",
            phone: "",
            password: "",
            confirmPassword: "",
            agreeToTerms: true,
        },
        validationSchema: RegisterSchema,
        onSubmit: async (values, { setSubmitting }) => {
            try {
                // TODO: replace with the real Register API call.
                // On success:
                //   await markHasAccount();
                //   router.replace('/(auth)/login');
                const simulatedExpiry =
                    Math.floor(Date.now() / 1000) + 7200;
                const fakeTokenPayload =
                    btoa(
                        JSON.stringify({
                            alg: "HS256",
                            typ: "JWT",
                        })
                    ) +
                    "." +
                    btoa(
                        JSON.stringify({
                            id: "usr_789",
                            email: values.email,
                            exp: simulatedExpiry,
                        })
                    ) +
                    "." +
                    "signature_mask";
                await login(fakeTokenPayload);
            } catch (e) {
                console.error("Registration transaction failed:", e);
            } finally {
                setSubmitting(false);
            }
        },
    });

    return (
        <FormikProvider value={formik}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                {/* footerOffset={96} leaves room below the Jambopay
                    credit for the iOS home indicator and any
                    gesture bar on Android. */}
                <Screen scroll padded footerOffset={96}>
                    <View
                        style={{
                            width: "100%",
                            maxWidth: 768,
                            alignSelf: "center",
                        }}
                    >
                        <RegisterForm
                            formik={formik}
                            theme={theme}
                            countryList={countryList}
                            isLocationsSyncing={isLocationsSyncing}
                            countrySearch={countrySearch}
                            setCountrySearch={setCountrySearch}
                            isCountryFocused={isCountryFocused}
                            setIsCountryFocused={setIsCountryFocused}
                            countySearch={countySearch}
                            setCountySearch={setCountySearch}
                            isCountyFocused={isCountyFocused}
                            setIsCountyFocused={setIsCountyFocused}
                            codeDropdownOpen={codeDropdownOpen}
                            setCodeDropdownOpen={setCodeDropdownOpen}
                            codeQuery={codeQuery}
                            setCodeQuery={setCodeQuery}
                            openGenderPicker={() =>
                                setPickerTarget("gender")
                            }
                            router={router}
                        />
                    </View>
                </Screen>
            </KeyboardAvoidingView>

            <GenderSheet
                target={pickerTarget}
                onClose={() => setPickerTarget(null)}
                formik={formik}
            />
        </FormikProvider>
    );
}

/* =========================================================
 * Form body
 * ======================================================= */

function RegisterForm({
    formik,
    theme,
    countryList,
    isLocationsSyncing,
    countrySearch,
    setCountrySearch,
    isCountryFocused,
    setIsCountryFocused,
    countySearch,
    setCountySearch,
    isCountyFocused,
    setIsCountyFocused,
    codeDropdownOpen,
    setCodeDropdownOpen,
    codeQuery,
    setCodeQuery,
    openGenderPicker,
    router,
}: {
    formik: FormikProps<any>;
    theme: any;
    countryList: CountryOption[];
    isLocationsSyncing: boolean;
    countrySearch: string;
    setCountrySearch: (v: string) => void;
    isCountryFocused: boolean;
    setIsCountryFocused: (v: boolean) => void;
    countySearch: string;
    setCountySearch: (v: string) => void;
    isCountyFocused: boolean;
    setIsCountyFocused: (v: boolean) => void;
    codeDropdownOpen: boolean;
    setCodeDropdownOpen: (v: boolean) => void;
    codeQuery: string;
    setCodeQuery: (v: string) => void;
    openGenderPicker: () => void;
    router: any;
}) {
    const filteredCountries = useMemo(
        () =>
            countryList.filter((c) =>
                c.title
                    .toLowerCase()
                    .includes(countrySearch.toLowerCase())
            ),
        [countryList, countrySearch]
    );

    const filteredCodes = useMemo(() => {
        const q = codeQuery.trim().toLowerCase();
        if (!q) return countryList.slice(0, 20);
        return countryList
            .filter(
                (c) =>
                    c.title.toLowerCase().includes(q) ||
                    c.country_code.includes(q) ||
                    c.id.toLowerCase().includes(q)
            )
            .slice(0, 20);
    }, [countryList, codeQuery]);

    const filteredCounties = COUNTIES.filter((c) =>
        c.title.toLowerCase().includes(countySearch.toLowerCase())
    );

    const isKenyaSelected = formik.values.country === "KE";

    const selectedCountry = countryList.find(
        (c) => c.id === formik.values.country
    );
    const displayedDial =
        selectedCountry?.country_code ??
        (formik.values.countryCode || DEFAULT_DIAL_CODE);

    const countriesEmpty =
        countryList.length === 0 && !isLocationsSyncing;
    const countriesLoading =
        countryList.length === 0 && isLocationsSyncing;

    const chooseCode = (c: CountryOption) => {
        formik.setFieldValue("country", c.id);
        formik.setFieldValue("countryCode", c.country_code);
        if (c.id !== "KE") formik.setFieldValue("county", "");
        setCodeDropdownOpen(false);
        setCodeQuery("");
    };

    const errorOf = (name: string) =>
        formik.touched[name] && formik.errors[name]
            ? String(formik.errors[name])
            : undefined;

    return (
        <View className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* ============ Header ============ */}
            <View className="md:col-span-2 mb-4 items-center">
                <Text
                    style={{ color: theme.primary }}
                    className="text-3xl font-black tracking-tight text-center"
                >
                    Create Account
                </Text>
                <Text className="text-slate-500 mt-2 text-sm font-medium leading-relaxed text-center">
                    Join the wazipos network. Settle B2B payments, check
                    inventory, and shop ubiquitously.
                </Text>
            </View>

            {/* ============ First Name ============ */}
            <CustomTextField
                name="firstName"
                label="First Name"
                placeholder="John"
                autoCapitalize="words"
                error={errorOf("firstName")}
            />

            {/* ============ Middle Name ============ */}
            <CustomTextField
                name="middleName"
                label="Middle Name"
                placeholder="Doe (Optional)"
                autoCapitalize="words"
                error={errorOf("middleName")}
            />

            {/* ============ Last Name ============ */}
            <CustomTextField
                name="lastName"
                label="Last Name"
                placeholder="Smith"
                autoCapitalize="words"
                error={errorOf("lastName")}
            />

            {/* ============ Gender ============ */}
            <View className="w-full" style={{ gap: 6 }}>
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontWeight: "500",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    Gender
                </Text>
                <TouchableOpacity
                    onPress={openGenderPicker}
                    style={{
                        backgroundColor: theme.surface,
                        borderColor:
                            formik.touched.gender && formik.errors.gender
                                ? "#ef4444"
                                : theme.border,
                        borderRadius: 12,
                        borderWidth: 1,
                        minHeight: 48,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                    }}
                >
                    <Text
                        style={{
                            flex: 1,
                            color: formik.values.gender
                                ? theme.text
                                : "#94a3b8",
                            fontSize: 15,
                        }}
                    >
                        {formik.values.gender || "Select Gender"}
                    </Text>
                    <Text className="text-slate-400 text-[10px]">▾</Text>
                </TouchableOpacity>
                {errorOf("gender") ? (
                    <Text style={{ color: "#ef4444", fontSize: 12 }}>
                        {errorOf("gender")}
                    </Text>
                ) : null}
            </View>

            {/* ============ Date of Birth ============ */}
            <View className="w-full">
                <DateField
                    name="dob"
                    label="Date of Birth"
                    placeholder="Select date of birth"
                    required
                />
            </View>

            {/* ============ Country ============ */}
            <View className="w-full relative" style={{ gap: 6 }}>
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontWeight: "500",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    Country
                </Text>
                <TextInput
                    style={{
                        backgroundColor: countriesLoading
                            ? "#f1f5f9"
                            : theme.surface,
                        borderColor:
                            formik.touched.country && formik.errors.country
                                ? "#ef4444"
                                : theme.border,
                        color: theme.text,
                        fontSize: 15,
                        borderRadius: 12,
                        borderWidth: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        minHeight: 48,
                    }}
                    placeholder={
                        countriesLoading
                            ? "Loading countries…"
                            : countriesEmpty
                                ? "No countries available"
                                : "Type country name..."
                    }
                    placeholderTextColor="#94a3b8"
                    value={countrySearch}
                    editable={!countriesLoading && !countriesEmpty}
                    onFocus={() => {
                        setIsCountryFocused(true);
                        setCountrySearch("");
                    }}
                    onChangeText={(text) => {
                        setCountrySearch(text);
                        setIsCountryFocused(true);
                    }}
                    onBlur={() =>
                        setTimeout(() => setIsCountryFocused(false), 200)
                    }
                />

                {isCountryFocused &&
                    !countriesLoading &&
                    filteredCountries.length > 0 && (
                        <View
                            style={{
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                            }}
                            className="absolute top-[70px] left-0 right-0 border rounded-xl shadow-xl z-50 max-h-[180px] overflow-hidden"
                        >
                            <ScrollView
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                            >
                                {filteredCountries.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        className="py-3 px-4 border-b border-slate-50"
                                        onPress={() => {
                                            formik.setFieldValue(
                                                "country",
                                                item.id
                                            );
                                            formik.setFieldValue(
                                                "countryCode",
                                                item.country_code
                                            );
                                            setCountrySearch(item.title);
                                            setIsCountryFocused(false);
                                            if (item.id === "KE") {
                                                formik.setFieldValue(
                                                    "county",
                                                    DEFAULT_COUNTY_ID
                                                );
                                                setCountySearch(
                                                    DEFAULT_COUNTY_TITLE
                                                );
                                            } else {
                                                formik.setFieldValue(
                                                    "county",
                                                    ""
                                                );
                                                setCountySearch("");
                                            }
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontSize: 14,
                                                fontWeight: "500",
                                            }}
                                        >
                                            {item.title}
                                            {item.country_code
                                                ? ` (${item.country_code})`
                                                : ""}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                {errorOf("country") ? (
                    <Text style={{ color: "#ef4444", fontSize: 12 }}>
                        {errorOf("country")}
                    </Text>
                ) : null}
            </View>

            {/* ============ County ============ */}
            <View className="w-full relative" style={{ gap: 6 }}>
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontWeight: "500",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    County
                </Text>
                <TextInput
                    style={{
                        backgroundColor: isKenyaSelected
                            ? theme.surface
                            : "#f1f5f9",
                        borderColor:
                            formik.touched.county && formik.errors.county
                                ? "#ef4444"
                                : theme.border,
                        opacity: isKenyaSelected ? 1 : 0.6,
                        color: theme.text,
                        fontSize: 15,
                        borderRadius: 12,
                        borderWidth: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        minHeight: 48,
                    }}
                    placeholder={
                        isKenyaSelected
                            ? "Type county name..."
                            : "Unavailable for selected country"
                    }
                    placeholderTextColor="#94a3b8"
                    value={countySearch}
                    editable={isKenyaSelected}
                    onFocus={() => {
                        if (!isKenyaSelected) return;
                        setIsCountyFocused(true);
                        setCountySearch("");
                    }}
                    onChangeText={(text) => {
                        if (!isKenyaSelected) return;
                        setCountySearch(text);
                        setIsCountyFocused(true);
                    }}
                    onBlur={() =>
                        setTimeout(() => setIsCountyFocused(false), 200)
                    }
                />
                {isKenyaSelected &&
                    isCountyFocused &&
                    filteredCounties.length > 0 && (
                        <View
                            style={{
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                            }}
                            className="absolute top-[70px] left-0 right-0 border rounded-xl shadow-xl z-50 max-h-[180px] overflow-hidden"
                        >
                            <ScrollView
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                            >
                                {filteredCounties.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        className="py-3 px-4 border-b border-slate-50"
                                        onPress={() => {
                                            formik.setFieldValue(
                                                "county",
                                                item.id
                                            );
                                            setCountySearch(item.title);
                                            setIsCountyFocused(false);
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: theme.text,
                                                fontSize: 14,
                                                fontWeight: "500",
                                            }}
                                        >
                                            {item.title}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                {errorOf("county") ? (
                    <Text style={{ color: "#ef4444", fontSize: 12 }}>
                        {errorOf("county")}
                    </Text>
                ) : null}
            </View>

            {/* ============ Email ============ */}
            <CustomTextField
                name="email"
                label="Email Address"
                placeholder="name@wazipos.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={errorOf("email")}
            />

            {/* ============ Phone Number ============ */}
            <View
                className="w-full"
                style={{ zIndex: 1000, elevation: 10, gap: 6 }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontWeight: "500",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    Phone Number
                </Text>

                <View
                    className="flex-row gap-x-2"
                    style={{ alignItems: "flex-start" }}
                >
                    {/* -------- Inline code dropdown -------- */}
                    <View
                        className="relative"
                        style={{
                            width: 96,
                            zIndex: 1001,
                            elevation: 11,
                        }}
                    >
                        <TouchableOpacity
                            onPress={() => {
                                setCodeDropdownOpen(!codeDropdownOpen);
                                setCodeQuery("");
                            }}
                            style={{
                                backgroundColor: theme.surface,
                                borderColor: codeDropdownOpen
                                    ? theme.primary
                                    : theme.border,
                                borderRadius: 12,
                                borderWidth: 1,
                                minHeight: 48,
                                paddingHorizontal: 12,
                                alignItems: "center",
                                justifyContent: "center",
                                flexDirection: "row",
                            }}
                        >
                            <Text
                                style={{
                                    color: "#475569",
                                    fontWeight: "700",
                                    fontSize: 15,
                                }}
                                numberOfLines={1}
                            >
                                {displayedDial}
                            </Text>
                            <Text
                                style={{
                                    color: "#94a3b8",
                                    fontSize: 10,
                                    marginLeft: 4,
                                }}
                            >
                                ▾
                            </Text>
                        </TouchableOpacity>

                        {codeDropdownOpen && (
                            <View
                                style={{
                                    backgroundColor: theme.background,
                                    borderColor: theme.border,
                                    shadowColor: "#000",
                                    shadowOffset: {
                                        width: 0,
                                        height: 6,
                                    },
                                    shadowOpacity: 0.08,
                                    shadowRadius: 12,
                                    elevation: 12,
                                    top: 54,
                                }}
                                className="absolute left-0 w-64 border rounded-xl overflow-hidden z-[1002]"
                            >
                                <TextInput
                                    value={codeQuery}
                                    onChangeText={setCodeQuery}
                                    placeholder="Search…"
                                    placeholderTextColor="#94a3b8"
                                    autoFocus
                                    style={{
                                        borderBottomColor: theme.border,
                                        color: theme.textDark,
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                        fontSize: 12,
                                        borderBottomWidth: 1,
                                    }}
                                />

                                <ScrollView
                                    nestedScrollEnabled
                                    keyboardShouldPersistTaps="handled"
                                    style={{ maxHeight: 220 }}
                                >
                                    {filteredCodes.length === 0 ? (
                                        <Text
                                            style={{
                                                color: theme.textDark,
                                                fontSize: 12,
                                                textAlign: "center",
                                                paddingVertical: 16,
                                            }}
                                        >
                                            No matches
                                        </Text>
                                    ) : (
                                        filteredCodes.map((item) => {
                                            const active =
                                                item.id ===
                                                formik.values.country;
                                            return (
                                                <TouchableOpacity
                                                    key={item.id}
                                                    onPress={() =>
                                                        chooseCode(item)
                                                    }
                                                    style={{
                                                        backgroundColor:
                                                            active
                                                                ? theme.primary +
                                                                "15"
                                                                : "transparent",
                                                        borderBottomColor:
                                                            theme.border,
                                                        borderBottomWidth: 1,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 10,
                                                    }}
                                                    className="flex-row items-center"
                                                >
                                                    <Text
                                                        style={{
                                                            fontWeight: "700",
                                                            fontSize: 12,
                                                            width: 48,
                                                            color: active
                                                                ? theme.primary
                                                                : "#475569",
                                                        }}
                                                    >
                                                        {
                                                            item.country_code
                                                        }
                                                    </Text>
                                                    <Text
                                                        style={{
                                                            fontSize: 12,
                                                            flex: 1,
                                                            color: active
                                                                ? theme.primary
                                                                : "#0f172a",
                                                            fontWeight: active
                                                                ? "700"
                                                                : "500",
                                                        }}
                                                        numberOfLines={1}
                                                    >
                                                        {item.title}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })
                                    )}
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    <View style={{ flex: 1 }}>
                        <CustomTextField
                            value={formik.values.phone}
                            onChangeText={(text) =>
                                formik.setFieldValue(
                                    "phone",
                                    text.replace(/^0+/, "")
                                )
                            }
                            onBlur={() =>
                                formik.setFieldTouched("phone", true)
                            }
                            placeholder="700 000000"
                            keyboardType="phone-pad"
                            error={errorOf("phone")}
                        />
                    </View>
                </View>
            </View>

            {/* ============ Password ============ */}
            <CustomTextField
                name="password"
                label="Password"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                error={errorOf("password")}
            />

            {/* ============ Confirm Password ============ */}
            <CustomTextField
                name="confirmPassword"
                label="Confirm Password"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                error={errorOf("confirmPassword")}
            />

            {/* ============ Terms ============ */}
            <View className="mt-2 md:col-span-2 flex-row items-center px-1">
                <TouchableOpacity
                    onPress={() =>
                        formik.setFieldValue(
                            "agreeToTerms",
                            !formik.values.agreeToTerms
                        )
                    }
                    style={{
                        borderColor: formik.values.agreeToTerms
                            ? theme.primary
                            : theme.border,
                    }}
                    className="w-5 h-5 border rounded flex items-center justify-center mr-3"
                >
                    {formik.values.agreeToTerms && (
                        <View
                            style={{ backgroundColor: theme.primary }}
                            className="w-3 h-3 rounded-[2px]"
                        />
                    )}
                </TouchableOpacity>
                <Text className="text-slate-500 text-xs font-medium leading-relaxed flex-1">
                    I have read, understood, and accepted the comprehensive{" "}
                    <Text
                        style={{ color: theme.primary }}
                        className="font-bold"
                    >
                        wazipos Terms of Service
                    </Text>{" "}
                    and security privacy policies.
                </Text>
            </View>

            {/* ============ Submit + login link ============ */}
            <View className="mt-2 md:col-span-2 gap-y-2">
                <TouchableOpacity
                    onPress={() => formik.handleSubmit()}
                    disabled={
                        formik.isSubmitting || !formik.values.agreeToTerms
                    }
                    style={{
                        backgroundColor: formik.values.agreeToTerms
                            ? theme.primary
                            : "#94a3b8",
                        opacity: formik.values.agreeToTerms ? 1 : 0.6,
                    }}
                    className="w-full items-center justify-center rounded-xl py-4 shadow-md min-h-[56px]"
                >
                    {formik.isSubmitting ? (
                        <ActivityIndicator color={theme.textLight} />
                    ) : (
                        <Text
                            style={{ color: theme.textLight }}
                            className="font-bold text-base"
                        >
                            Register Hub Account
                        </Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => router.push("/(auth)/login")}
                    className="items-center py-3"
                >
                    <Text className="text-sm text-slate-500 font-medium">
                        Already Registered?{" "}
                        <Text
                            style={{ color: theme.primary }}
                            className="font-bold"
                        >
                            Sign In
                        </Text>
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ============ Powered by ============ */}
            {/* Rendered inside the scroll content so it appears on
                every device at the end of the form. footerOffset on
                Screen provides the bottom margin that keeps it clear
                of the home indicator on small screens. */}
            <View
                className="md:col-span-2 mt-8 pt-6 items-center"
                style={{ borderTopWidth: 1, borderTopColor: theme.border }}
            >
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 13,
                        letterSpacing: 0.3,
                    }}
                >
                    Powered by{" "}
                    <Text
                        style={{
                            color: theme.primary,
                            fontWeight: "700",
                        }}
                    >
                        Jambopay
                    </Text>
                </Text>
            </View>
        </View>
    );
}

/* =========================================================
 * Gender sheet
 * ======================================================= */

function GenderSheet({
    target,
    onClose,
    formik,
}: {
    target: PickerTarget;
    onClose: () => void;
    formik: FormikProps<any>;
}) {
    const { theme } = useAuth();
    const visible = target === "gender";

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50 items-center">
                <View
                    style={{ backgroundColor: theme.background }}
                    className="w-full max-w-md p-6 rounded-t-3xl max-h-[40vh]"
                >
                    <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-100">
                        <Text
                            style={{ color: theme.textDark }}
                            className="font-bold text-base"
                        >
                            Select Gender
                        </Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text
                                style={{ color: theme.primary }}
                                className="font-bold"
                            >
                                Close
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={GENDERS}
                        keyExtractor={(item) => item}
                        renderItem={({ item }) => {
                            const active = formik.values.gender === item;
                            return (
                                <TouchableOpacity
                                    onPress={() => {
                                        formik.setFieldValue(
                                            "gender",
                                            item
                                        );
                                        onClose();
                                    }}
                                    style={{
                                        backgroundColor: active
                                            ? theme.primary + "15"
                                            : "transparent",
                                    }}
                                    className="py-4 px-2 border-b border-slate-50"
                                >
                                    <Text
                                        className="text-sm"
                                        style={{
                                            color: active
                                                ? theme.primary
                                                : "#0f172a",
                                            fontWeight: active
                                                ? "700"
                                                : "500",
                                        }}
                                    >
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
}