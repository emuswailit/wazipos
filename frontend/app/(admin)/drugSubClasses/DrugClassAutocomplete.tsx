import drugClassesApi from "@/api/drugs/drugClassesApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface DrugClassAutocompleteProps {
    theme: any;
    isDarkMode: boolean;
    selectedValue: string;
    onSelect: (id: string, title: string) => void;
    hasError: boolean;
    initialTitle?: string;
}

export default function DrugClassAutocomplete({ theme, isDarkMode, selectedValue, onSelect, hasError, initialTitle }: DrugClassAutocompleteProps) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [classSearch, setClassSearch] = useState("");

    const getClassesApi = useApi<any>(async (payload: any) => await drugClassesApi.getDrugClasses(payload));

    useEffect(() => {
        getClassesApi.request({ "action": "GetDrugClasses" });
        if (initialTitle) {
            setClassSearch(initialTitle);
        } else {
            setClassSearch("");
        }
    }, [initialTitle]);

    const classOptions = useMemo(() => {
        if (getClassesApi.data && Array.isArray(getClassesApi.data)) {
            return getClassesApi.data.map((item: any) => ({
                id: item.pk || item.id,
                title: item.fields?.title || item.title || "UNSPECIFIED"
            }));
        }
        return [];
    }, [getClassesApi.data]);

    const filteredClasses = useMemo(() => {
        return classOptions.filter(item =>
            item.title.toLowerCase().includes(classSearch.toLowerCase())
        );
    }, [classOptions, classSearch]);

    return (
        <View className="items-start w-full relative z-50">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Linked Drug Class</Text>
            <TextInput
                onFocus={() => setDropdownOpen(true)}
                onChangeText={(txt) => {
                    setClassSearch(txt);
                    setDropdownOpen(true);
                }}
                value={classSearch}
                placeholder={getClassesApi.loading ? "Loading drug classes list..." : "Type to filter and select a drug class..."}
                placeholderTextColor="#64748b"
                style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.border, color: theme.text }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none"
            />

            {dropdownOpen && (
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg max-h-[180px] overflow-hidden z-50">
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {getClassesApi.loading ? (
                            <View className="p-4 items-center"><ActivityIndicator size="small" color={theme.primary} /></View>
                        ) : filteredClasses.length === 0 ? (
                            <View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs font-medium text-center">No drug class matches the query.</Text></View>
                        ) : (
                            <View className="flex-col">
                                {filteredClasses.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => {
                                            onSelect(item.id, item.title);
                                            setClassSearch(item.title);
                                            setDropdownOpen(false);
                                        }}
                                        style={({ pressed }) => ({ backgroundColor: pressed ? (isDarkMode ? "#1e293b" : "#f1f5f9") : "transparent" })}
                                        className="px-4 py-3 border-b border-slate-700/5"
                                    >
                                        <Text style={{ color: selectedValue === item.id ? theme.primary : theme.text }} className={`text-xs ${selectedValue === item.id ? 'font-black' : 'font-medium'}`}>
                                            {item.title}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
