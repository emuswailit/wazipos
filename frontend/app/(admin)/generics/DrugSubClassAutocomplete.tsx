// 📍 Location: app/(admin)/generics/DrugSubClassAutocomplete.tsx
import drugSubClassesApi from "@/api/drugs/drugSubClassesApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface Props {
    theme: any; isDarkMode: boolean; selectedValue: string; hasError: boolean; initialTitle?: string;
    onSelect: (id: string, title: string) => void;
}

export default function DrugSubClassAutocomplete({ theme, isDarkMode, selectedValue, onSelect, hasError, initialTitle }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const getSubClassesApi = useApi<any>(async (p: any) => await drugSubClassesApi.getDrugSubClasses(p));

    useEffect(() => {
        getSubClassesApi.request({ "action": "GetDrugSubClasses" });
        if (initialTitle) setSearch(initialTitle);
        else setSearch("");
    }, [initialTitle]);

    const options = useMemo(() => {
        if (getSubClassesApi.data && Array.isArray(getSubClassesApi.data)) {
            return getSubClassesApi.data.map((item: any) => ({ id: item.pk || item.id, title: item.fields?.title || item.title || "UNSPECIFIED" }));
        }
        return [];
    }, [getSubClassesApi.data]);

    const filtered = useMemo(() => options.filter(i => i.title.toLowerCase().includes(search.toLowerCase())), [options, search]);

    return (
        <View className="items-start w-full relative z-40">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Linked Drug Subclass</Text>
            <TextInput onFocus={() => setOpen(true)} onChangeText={(t) => { setSearch(txt => t); setOpen(true); }} value={search} placeholder={getSubClassesApi.loading ? "Loading drug subclasses..." : "Select drug subclass..."} placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.border, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
            {open && (
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg max-h-[150px] overflow-hidden z-40">
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                        {getSubClassesApi.loading ? (<View className="p-4"><ActivityIndicator size="small" color={theme.primary} /></View>) : filtered.length === 0 ? (<View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs text-center">No results found.</Text></View>) : (
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
