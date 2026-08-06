import genericsApi from "@/api/drugs/genericsApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

interface GenericsMultiAutocompleteProps {
    theme: any;
    isDarkMode: boolean;
    selectedValues: string[];
    hasError: boolean;
    onToggleSelect: (ids: string[]) => void;
    currentItemsArray?: any[];
    zIndexValue: number;
}

export default function GenericsMultiAutocomplete({
    theme,
    isDarkMode,
    selectedValues,
    onToggleSelect,
    hasError,
    currentItemsArray,
    zIndexValue,
}: GenericsMultiAutocompleteProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const getGenericsApi = useApi<any>(async (payload: any) => await genericsApi.getGenerics(payload));

    useEffect(() => {
        getGenericsApi.request({ "action": "GetGenerics" });
    }, []);

    const options = useMemo(() => {
        if (getGenericsApi.data && Array.isArray(getGenericsApi.data)) {
            return getGenericsApi.data.map((item: any) => ({
                id: item.id,
                title: item.title || "UNSPECIFIED"
            }));
        }
        return [];
    }, [getGenericsApi.data]);

    const activeDisplayTags = useMemo(() => {
        if (currentItemsArray && currentItemsArray.length > 0) {
            return currentItemsArray;
        }
        return options.filter(option => selectedValues.includes(option.id));
    }, [selectedValues, options, currentItemsArray]);

    const filtered = useMemo(() => {
        return options.filter(item =>
            item.title.toLowerCase().includes(search.toLowerCase())
        );
    }, [options, search]);

    const handleRemoveItem = (id: string) => {
        onToggleSelect(selectedValues.filter(value => value !== id));
    };

    const handleAddItem = (id: string) => {
        if (!selectedValues.includes(id)) {
            onToggleSelect([...selectedValues, id]);
            setSearch("");
        }
    };

    return (
        <View style={{ zIndex: zIndexValue }} className="items-start w-full relative">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Link Generic Compounds</Text>

            {/* 🌟 UPDATED: Employs brand theme.primary style tokens directly over frame deck paths */}
            <View
                style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.primary }}
                className="w-full flex-row flex-wrap items-center border rounded-xl p-2 min-h-[42px] gap-2"
            >
                {activeDisplayTags.map((item) => (
                    <View
                        key={item.id}
                        style={{ backgroundColor: isDarkMode ? "#1e293b" : "#f1f5f9", borderColor: theme.border }}
                        className="flex-row items-center px-2 py-1 rounded-lg border shadow-xs"
                    >
                        <Text style={{ color: theme.text }} className="text-[11px] font-black uppercase tracking-wide mr-1.5">
                            {item.title}
                        </Text>
                        <TouchableOpacity
                            onPress={() => handleRemoveItem(item.id)}
                            activeOpacity={0.6}
                            className="w-3.5 h-3.5 rounded-full bg-red-500/10 active:bg-red-500/20 justify-center items-center"
                        >
                            <Text className="text-red-500 text-[9px] font-black leading-none">✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}

                <TextInput
                    onFocus={() => setOpen(true)}
                    onChangeText={setSearch}
                    value={search}
                    placeholder={activeDisplayTags.length === 0 ? (getGenericsApi.loading ? "Loading active compounds..." : "Type to filter and select...") : ""}
                    placeholderTextColor="#64748b"
                    style={{ color: theme.text }}
                    className="flex-1 min-w-[120px] h-6 text-sm font-medium outline-none"
                />
            </View>

            {open && (
                <View
                    style={{ backgroundColor: isDarkMode ? "#0f172a" : "#ffffff", borderColor: theme.primary, zIndex: 9999 }}
                    className="absolute top-full mt-1 left-0 right-0 border rounded-xl shadow-lg max-h-[160px] overflow-hidden bg-white dark:bg-slate-900"
                >
                    <View className="p-2 border-b border-slate-700/5 flex-row justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                        <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider pl-2">Available Ingredients</Text>
                        <Pressable onPress={() => setOpen(false)}>
                            <Text style={{ color: theme.primary }} className="text-xs font-black px-2">Done ✕</Text>
                        </Pressable>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {getGenericsApi.loading ? (
                            <View className="p-4"><ActivityIndicator size="small" color={theme.primary} /></View>
                        ) : filtered.length === 0 ? (
                            <View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs text-center">No active ingredients match your query.</Text></View>
                        ) : (
                            filtered.map((item) => {
                                const isChecked = selectedValues.includes(item.id);
                                return (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => isChecked ? handleRemoveItem(item.id) : handleAddItem(item.id)}
                                        style={({ pressed }) => ({ backgroundColor: pressed ? (isDarkMode ? "#1e293b" : "#f1f5f9") : "transparent" })}
                                        className={`px-4 py-3 border-b border-slate-700/5 flex-row justify-between items-center ${isChecked ? "bg-slate-500/5" : ""}`}
                                    >
                                        <Text style={{ color: isChecked ? theme.primary : theme.text }} className={`text-xs ${isChecked ? "font-black" : "font-medium"}`}>{item.title}</Text>
                                        {isChecked && <Text style={{ color: theme.primary }} className="text-xs font-black">✓ Selected</Text>}
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
