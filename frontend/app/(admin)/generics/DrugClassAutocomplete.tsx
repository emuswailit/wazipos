// 📍 Location: app/(admin)/generics/DrugClassAutocomplete.tsx
import drugClassesApi from "@/api/drugs/drugClassesApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface Props {
    theme: any; isDarkMode: boolean; selectedValue: string; hasError: boolean; initialTitle?: string;
    onSelect: (id: string, title: string) => void;
}

export default function DrugClassAutocomplete({ theme, isDarkMode, selectedValue, onSelect, hasError, initialTitle }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const getClassesApi = useApi<any>(async (p: any) => await drugClassesApi.getDrugClasses(p));

    useEffect(() => {
        getClassesApi.request({ "action": "GetDrugClasses" });
        if (initialTitle) setSearch(initialTitle);
        else setSearch("");
    }, [initialTitle]);

    const options = useMemo(() => {
        if (getClassesApi.data && Array.isArray(getClassesApi.data)) {
            return getClassesApi.data.map((item: any) => ({ id: item.pk || item.id, title: item.fields?.title || item.title || "UNSPECIFIED" }));
        }
        return [];
    }, [getClassesApi.data]);

    const filtered = useMemo(() => options.filter(i => i.title.toLowerCase().includes(search.toLowerCase())), [options, search]);

    return (
        <View className="items-start w-full relative z-50">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Linked Drug Class</Text>
            <TextInput onFocus={() => setOpen(true)} onChangeText={(t) => { setSearch(txt => t); setOpen(true); }} value={search} placeholder={getClassesApi.loading ? "Loading drug classes..." : "Select drug class..."} placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
            {open && (
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg max-h-[150px] overflow-hidden z-50">
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {getClassesApi.loading ? (<View className="p-4"><ActivityIndicator size="small" color={theme.primary} /></View>) : filtered.length === 0 ? (<View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs text-center">No results found.</Text></View>) : (
                            filtered.map((item) => (
                                <Pressable key={item.id} onPress={() => { onSelect(item.id, item.title); setSearch(item.title); setOpen(false); }} className="px-4 py-3 border-b border-slate-700/5"><Text style={{ color: selectedValue === item.id ? theme.primary : theme.text }} className="text-xs font-bold">{item.title}</Text></Pressable>
                            ))
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
