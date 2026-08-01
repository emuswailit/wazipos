import { useAuth } from "@/context/AuthContext";
import { FormikProps } from "formik";
import { Text, TextInput, View } from "react-native";

export default function AccountFields({ formik }: { formik: FormikProps<any> }) {
    const { theme } = useAuth();

    return (
        <View className="contents">
            {/* Email Address */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Email Address</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.email && formik.errors.email ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="name@wazipos.com"
                    placeholderTextColor="#94a3b8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onChangeText={formik.handleChange("email")}
                    onBlur={formik.handleBlur("email")}
                    value={formik.values.email}
                />
                {formik.touched.email && formik.errors.email && <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formik.errors.email as string}</Text>}
            </View>

            {/* Phone Number */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Phone Number</Text>
                <View className="flex-row items-center gap-x-2">
                    <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="w-20 border rounded-xl h-[50px] md:h-[40px] justify-center items-center">
                        <TextInput style={{ color: "#475569" }} className="text-center font-bold text-sm md:text-xs w-full outline-none" value={formik.values.countryCode || "—"} editable={false} placeholder="Code" />
                    </View>
                    <View className="flex-1">
                        <TextInput
                            style={{ backgroundColor: theme.surface, borderColor: formik.touched.phone && formik.errors.phone ? "#ef4444" : theme.border }}
                            className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] border outline-none text-sm md:text-xs"
                            placeholder="700 000000"
                            placeholderTextColor="#94a3b8"
                            keyboardType="phone-pad"
                            onChangeText={(text) => { formik.setFieldValue("phone", text.replace(/^0+/, '')); }}
                            onBlur={formik.handleBlur("phone")}
                            value={formik.values.phone}
                        />
                    </View>
                </View>
                {formik.touched.phone && formik.errors.phone && <Text className="text-red-500 text-xs font-semibold mt-1.5 ml-1">{formik.errors.phone as string}</Text>}
            </View>

            {/* Password */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Password</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.password && formik.errors.password ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    onChangeText={formik.handleChange("password")}
                    onBlur={formik.handleBlur("password")}
                    value={formik.values.password}
                />
                {formik.touched.password && formik.errors.password && <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formik.errors.password as string}</Text>}
            </View>

            {/* Confirm Password */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Confirm Password</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.confirmPassword && formik.errors.confirmPassword ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    onChangeText={formik.handleChange("confirmPassword")}
                    onBlur={formik.handleBlur("confirmPassword")}
                    value={formik.values.confirmPassword}
                />
                {formik.touched.confirmPassword && formik.errors.confirmPassword && <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formik.errors.confirmPassword as string}</Text>}
            </View>
        </View>
    );
}
