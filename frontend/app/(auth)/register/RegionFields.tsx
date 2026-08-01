import { useAuth } from "@/context/AuthContext";
import { FormikProps } from "formik";
import { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function RegionFields({ formik }: { formik: FormikProps<any> }) {
    const { theme } = useAuth();
    const [countrySearch, setCountrySearch] = useState("");
    const [isCountryFocused, setIsCountryFocused] = useState(false);
    const [countySearch, setCountySearch] = useState("");
    const [isCountyFocused, setIsCountyFocused] = useState(false);

    const countries = [
        { id: "KE", title: "KENYA", country_code: "+254" },
        { id: "UG", title: "UGANDA", country_code: "+256" },
        { id: "TZ", title: "TANZANIA", country_code: "+255" },
        { id: "RW", title: "RWANDA", country_code: "+250" }
    ];

    const counties = [
        { id: "NBI", title: "Nairobi" },
        { id: "MSA", title: "Mombasa" },
        { id: "KIS", title: "Kisumu" },
        { id: "NKU", title: "Nakuru" },
        { id: "KMB", title: "Kiambu" },
        { id: "UGI", title: "Uasin Gishu" },
        { id: "MCK", title: "Machakos" }
    ];

    const filteredCountries = countries.filter(c => c.title.toLowerCase().includes(countrySearch.toLowerCase()));
    const filteredCounties = counties.filter(c => c.title.toLowerCase().includes(countySearch.toLowerCase()));
    const isKenyaSelected = formik.values.country === "KE";

    return (
        <View className="contents">
            {/* Country Input */}
            <View className="w-full relative">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">Country</Text>
                <TextInput
                    style={{ backgroundColor: theme.surface, borderColor: formik.touched.country && formik.errors.country ? "#ef4444" : theme.border }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder="Type country name..."
                    placeholderTextColor="#94a3b8"
                    value={countrySearch}
                    onFocus={() => { setIsCountryFocused(true); setCountrySearch(""); }}
                    onChangeText={(text) => { setCountrySearch(text); setIsCountryFocused(true); }}
                    onBlur={() => setTimeout(() => setIsCountryFocused(false), 200)}
                />
                {isCountryFocused && filteredCountries.length > 0 && (
                    <View style={{ backgroundColor: theme.background, borderColor: theme.border }} className="absolute top-[62px] md:top-[52px] left-0 right-0 border rounded-xl shadow-xl z-50 max-h-[180px] overflow-hidden">
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {filteredCountries.map((item) => (
                                <TouchableOpacity key={item.id} className="py-3 px-4 border-b border-slate-50" onPress={() => {
                                    formik.setFieldValue("country", item.id);
                                    formik.setFieldValue("countryCode", item.country_code);
                                    setCountrySearch(item.title);
                                    setIsCountryFocused(false);
                                    if (item.id === "KE") { formik.setFieldValue("county", "NBI"); setCountySearch("Nairobi"); }
                                    else { formik.setFieldValue("county", ""); setCountySearch(""); }
                                }}>
                                    <Text className="text-slate-800 text-sm font-medium">{item.title} ({item.country_code})</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
                {formik.touched.country && formik.errors.country && <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formik.errors.country as string}</Text>}
            </View>

            {/* County Input */}
            <View className="w-full relative">
                <Text style={{ color: theme.textDark }} className="font-semibold mb-1 text-[11px] uppercase tracking-wider">County</Text>
                <TextInput
                    style={{ backgroundColor: isKenyaSelected ? theme.surface : "#f1f5f9", borderColor: formik.touched.county && formik.errors.county ? "#ef4444" : theme.border, opacity: isKenyaSelected ? 1 : 0.6 }}
                    className="w-full text-slate-900 rounded-xl px-4 h-[50px] md:h-[40px] py-3.5 md:py-2 border outline-none text-sm md:text-xs"
                    placeholder={isKenyaSelected ? "Type county name..." : "Unavailable for selected country"}
                    placeholderTextColor="#94a3b8"
                    value={countySearch}
                    editable={isKenyaSelected}
                    onFocus={() => { if (!isKenyaSelected) return; setIsCountyFocused(true); setCountySearch(""); }}
                    onChangeText={(text) => { if (!isKenyaSelected) return; setCountySearch(text); setIsCountyFocused(true); }}
                    onBlur={() => setTimeout(() => setIsCountyFocused(false), 200)}
                />
                {isKenyaSelected && isCountyFocused && filteredCounties.length > 0 && (
                    <View style={{ backgroundColor: theme.background, borderColor: theme.border }} className="absolute top-[62px] md:top-[52px] left-0 right-0 border rounded-xl shadow-xl z-50 max-h-[180px] overflow-hidden">
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {filteredCounties.map((item) => (
                                <TouchableOpacity key={item.id} className="py-3 px-4 border-b border-slate-50" onPress={() => { formik.setFieldValue("county", item.id); setCountySearch(item.title); setIsCountyFocused(false); }}>
                                    <Text className="text-slate-800 text-sm font-medium">{item.title}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
                {formik.touched.county && formik.errors.county && <Text className="text-red-500 text-xs font-semibold mt-1 ml-1">{formik.errors.county as string}</Text>}
            </View>
        </View>
    );
}
