import preparationsApi from "@/api/drugs/preparationsApi";
import useApi from "@/hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface PreparationAutocompleteProps {
    theme: any;
    isDarkMode: boolean;
    selectedValue: string;
    hasError: boolean;
    initialTitle?: string;
    onSelect: (id: string, title: string) => void;
    zIndexValue: number;
}

export default function PreparationAutocomplete({ theme, isDarkMode, selectedValue, onSelect, hasError, initialTitle, zIndexValue }: PreparationAutocompleteProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const getPrepsApi = useApi<any>(async (payload: any) => await preparationsApi.getPreparations(payload));

    useEffect(() => {
        getPrepsApi.request({ "action": "GetPreparations" });
        if (initialTitle) {
            setSearch(initialTitle);
        } else {
            setSearch("");
        }
    }, [initialTitle]);

    const options = useMemo(() => {
        if (getPrepsApi.data && Array.isArray(getPrepsApi.data)) {
            return getPrepsApi.data.map((item: any) => ({
                id: item.id || item.key,
                title: item.long_preparation_title || item.preparation_title || item.title || "UNSPECIFIED"
            }));
        }
        return [];
    }, [getPrepsApi.data]);

    const filtered = useMemo(() => {
        return options.filter(item =>
            item.title.toLowerCase().includes(search.toLowerCase())
        );
    }, [options, search]);

    const isThemePanelTransparent = !theme.panel || theme.panel === "transparent" || theme.panel === "rgba(0,0,0,0)";
    const fallbackSolidBackground = isThemePanelTransparent ? (isDarkMode ? "#0f172a" : "#ffffff") : theme.panel;
    const rowDelimiterColor = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

    return (
        <View style={{ zIndex: zIndexValue }} className="items-start w-full relative">
            {open && (
                <Pressable
                    className="absolute top-[-5000px] bottom-[-5000px] left-[-5000px] right-[-5000px]"
                    style={{ zIndex: 9998, backgroundColor: "transparent" }}
                    onPress={() => setOpen(false)}
                >
                    <View className="flex-1 w-full h-full" />
                </Pressable>
            )}

            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Linked Scientific Preparation Form</Text>
            <TextInput
                onFocus={() => setOpen(true)}
                onChangeText={(text) => { setSearch(text); setOpen(true); }}
                value={search}
                placeholder={getPrepsApi.loading ? "Loading matching formulas..." : "Type to filter and select preparation..."}
                placeholderTextColor="#64748b"
                style={{ backgroundColor: theme.background, borderColor: hasError ? "#ef4444" : theme.primary, color: theme.text }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none"
            />
            {open && (
                <View
                    style={{
                        backgroundColor: fallbackSolidBackground,
                        borderColor: theme.primary,
                        zIndex: 9999,
                        top: 46,
                        left: 0,
                        right: 0,
                        maxHeight: 150,
                        elevation: 12,
                        shadowColor: "#000000",
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.15,
                        shadowRadius: 8
                    }}
                    className="absolute border rounded-xl overflow-hidden"
                >
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true} style={{ backgroundColor: fallbackSolidBackground }}>
                        {getPrepsApi.loading ? (
                            <View className="p-4"><ActivityIndicator size="small" color={theme.primary} /></View>
                        ) : filtered.length === 0 ? (
                            <View className="p-4"><Text style={{ color: theme.textDark }} className="text-xs text-center">No structural strengths matched.</Text></View>
                        ) : (
                            filtered.map((item, index) => (
                                <Pressable
                                    key={item.id}
                                    onPress={() => {
                                        onSelect(item.id, item.title);
                                        setSearch(item.title);
                                        setOpen(false);
                                    }}
                                    style={({ pressed }) => ({
                                        backgroundColor: pressed ? (isDarkMode ? "#1e293b" : "#f1f5f9") : "transparent",
                                        borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                                        borderBottomColor: rowDelimiterColor
                                    })}
                                    className="px-4 py-3 flex-row items-center"
                                >
                                    <Text style={{ color: selectedValue === item.id ? theme.primary : theme.text }} className={`text-xs ${selectedValue === item.id ? 'font-black' : 'font-medium'}`}>
                                        {item.title}
                                    </Text>
                                </Pressable>
                            ))
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
