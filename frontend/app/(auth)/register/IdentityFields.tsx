import { useAuth } from "@/context/AuthContext";
import { eachDayOfInterval, endOfMonth, format, isAfter, startOfMonth, subYears } from "date-fns";
import { FormikProps } from "formik";
import { useState } from "react";
import { FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function IdentityFields({ formik }: { formik: FormikProps<any> }) {
    const { theme } = useAuth();
    const [genderModalVisible, setGenderModalVisible] = useState(false);
    const [dateModalVisible, setDateModalVisible] = useState(false);

    const maxSelectableDate = subYears(new Date(), 18);
    const [currentMonth, setCurrentMonth] = useState(maxSelectableDate);
    const genders = ["Male", "Female", "Other"];

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth)
    });

    const changeMonth = (direction: number) => {
        const newMonth = new Date(currentMonth.setMonth(currentMonth.getMonth() + direction));
        setCurrentMonth(new Date(newMonth));
    };

    return (
        <View className="contents">
            {/* First Name */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">First Name</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.firstName && formik.errors.firstName ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="John"
                    placeholderTextColor="#94a3b8"
                    onChangeText={formik.handleChange("firstName")}
                    onBlur={formik.handleBlur("firstName")}
                    value={formik.values.firstName}
                />
                {formik.touched.firstName && formik.errors.firstName && (
                    <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formik.errors.firstName as string}</Text>
                )}
            </View>

            {/* Middle Name */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Middle Name</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="Doe (Optional)"
                    placeholderTextColor="#94a3b8"
                    onChangeText={formik.handleChange("middleName")}
                    onBlur={formik.handleBlur("middleName")}
                    value={formik.values.middleName}
                />
            </View>

            {/* Last Name */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Last Name</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.lastName && formik.errors.lastName ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="Smith"
                    placeholderTextColor="#94a3b8"
                    onChangeText={formik.handleChange("lastName")}
                    onBlur={formik.handleBlur("lastName")}
                    value={formik.values.lastName}
                />
                {formik.touched.lastName && formik.errors.lastName && (
                    <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formik.errors.lastName as string}</Text>
                )}
            </View>

            {/* Gender Selection */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Gender</Text>
                <TouchableOpacity
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.gender && formik.errors.gender ? "#ef4444" : theme.border }}
                    className="border rounded-xl h-[50px] md:h-[40px] px-4 justify-center"
                    onPress={() => setGenderModalVisible(true)}
                >
                    <Text className={formik.values.gender ? "text-slate-900 text-sm md:text-xs" : "text-slate-400 text-sm md:text-xs"}>
                        {formik.values.gender || "Select Gender"}
                    </Text>
                </TouchableOpacity>
                {formik.touched.gender && formik.errors.gender && (
                    <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formik.errors.gender as string}</Text>
                )}

                <Modal visible={genderModalVisible} animationType="slide" transparent={true}>
                    <View className="flex-1 justify-end bg-black/50 items-center">
                        <View style={{ backgroundColor: theme.background }} className="w-full max-w-md p-6 rounded-t-3xl max-h-[40vh]">
                            <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-100">
                                <Text style={{ color: theme.textDark }} className="font-bold text-base">Select Gender</Text>
                                <TouchableOpacity onPress={() => setGenderModalVisible(false)}>
                                    <Text style={{ color: theme.primary }} className="font-bold">Close</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={genders}
                                keyExtractor={(item) => item}
                                renderItem={({ item }) => (
                                    <TouchableOpacity className="py-4 border-b border-slate-50" onPress={() => { formik.setFieldValue("gender", item); setGenderModalVisible(false); }}>
                                        <Text className="text-slate-800 text-sm font-medium">{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>
                </Modal>
            </View>

            {/* Date of Birth */}
            <View className="w-full">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Date of Birth</Text>
                <TouchableOpacity
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.dob && formik.errors.dob ? "#ef4444" : theme.border }}
                    className="border rounded-xl h-[50px] md:h-[40px] px-4 justify-center"
                    onPress={() => setDateModalVisible(true)}
                >
                    <Text className={formik.values.dob ? "text-slate-900 text-sm md:text-xs" : "text-slate-400 text-sm md:text-xs"}>
                        {formik.values.dob || "Select Date of Birth"}
                    </Text>
                </TouchableOpacity>
                {formik.touched.dob && formik.errors.dob && (
                    <Text className="text-red-500 text-[10px] font-semibold mt-1 ml-1">{formik.errors.dob as string}</Text>
                )}

                <Modal visible={dateModalVisible} animationType="slide" transparent={true}>
                    <View className="flex-1 justify-end bg-black/50 items-center">
                        <View style={{ backgroundColor: theme.background }} className="w-full max-w-md p-6 rounded-t-3xl">
                            <View className="flex-row justify-between items-center mb-6 pb-2 border-b border-slate-100">
                                <TouchableOpacity onPress={() => changeMonth(-1)}><Text style={{ color: theme.primary }} className="font-bold text-lg">‹</Text></TouchableOpacity>
                                <Text style={{ color: theme.textDark }} className="font-bold text-base">{format(currentMonth, "MMMM yyyy")}</Text>
                                <TouchableOpacity onPress={() => changeMonth(1)}><Text style={{ color: theme.primary }} className="font-bold text-lg">›</Text></TouchableOpacity>
                            </View>
                            <View className="flex-row flex-wrap gap-2 justify-start mb-6">
                                {daysInMonth.map((day) => {
                                    const isUnderage = isAfter(day, maxSelectableDate);
                                    return (
                                        <TouchableOpacity
                                            key={day.toISOString()}
                                            disabled={isUnderage}
                                            style={{ width: Platform.OS === "web" ? "12%" : 42, height: 40, backgroundColor: isUnderage ? "#f1f5f9" : "#e0f2fe" }}
                                            className="rounded-lg justify-center items-center"
                                            onPress={() => { formik.setFieldValue("dob", format(day, "yyyy-MM-dd")); setDateModalVisible(false); }}
                                        >
                                            <Text style={{ color: isUnderage ? "#cbd5e1" : theme.primary }} className="text-xs font-bold">{format(day, "d")}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <TouchableOpacity style={{ borderColor: theme.primary }} className="w-full border rounded-xl py-3 items-center" onPress={() => setDateModalVisible(false)}>
                                <Text style={{ color: theme.primary }} className="font-bold">Close Calendar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}
