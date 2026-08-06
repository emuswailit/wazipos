import bodySystemsApi from "@/api/drugs/bodySystemsApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface BodySystemAutocompleteProps {
    theme: any;
    isDarkMode: boolean;
    selectedValue: string;
    onSelect: (id: string, title: string) => void;
    hasError: boolean;
    initialTitle?: string;
}

export default function BodySystemAutocomplete({ theme, isDarkMode, selectedValue, onSelect, hasError, initialTitle }: BodySystemAutocompleteProps) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [systemSearch, setSystemSearch] = useState("");

    const getSystemsApi = useApi<any>(async (payload: any) => await bodySystemsApi.getBodySystems(payload));

    useEffect(() => {
        getSystemsApi.request({ "action": "GetBodySystems" });
        if (initialTitle) {
            setSystemSearch(initialTitle);
        } else {
            setSystemSearch("");
        }
    }, [initialTitle]);

    const systemsOptions = useMemo(() => {
        if (getSystemsApi.data && Array.isArray(getSystemsApi.data)) {
            return getSystemsApi.data.map((item: any) => ({
                id: item.pk || item.id,
                title: item.fields?.title || item.title || "UNSPECIFIED"
            }));
        }
        return [];
    }, [getSystemsApi.data]);

    const filteredSystems = useMemo(() => {
        return systemsOptions.filter(item =>
            item.title.toLowerCase().includes(systemSearch.toLowerCase())
        );
    }, [systemsOptions, systemSearch]);

    return (
        <View className="items-start w-full relative z-50">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Linked Body System</Text>
            <TextInput
                onFocus={() => setDropdownOpen(true)}
                onChangeText={(txt) => {
                    setSystemSearch(txt);
                    setDropdownOpen(true);
                }}
                value={systemSearch}
                placeholder={getSystemsApi.loading ? "Loading systems list..." : "Type to filter and select a body system..."}
                placeholderTextColor="#64748b"
                style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.border, color: theme.text }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none"
            />

            {dropdownOpen && (
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg max-h-[180px] overflow-hidden z-50">
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {getSystemsApi.loading ? (
                            <View className="p-4 items-center"><ActivityIndicator size="small" color={theme.primary} /></View>
                        ) : filteredSystems.length === 0 ? (
                            <View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs font-medium text-center">No system labels match selection query criteria.</Text></View>
                        ) : (
                            <View className="flex-col">
                                {filteredSystems.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => {
                                            onSelect(item.id, item.title);
                                            setSystemSearch(item.title);
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
