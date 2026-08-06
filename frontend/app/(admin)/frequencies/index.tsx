import frequenciesApi from "@/api/drugs/frequenciesApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";

import FrequencyDetailsModal from "./FrequencyDetailsModal";
import FrequencyFormModal from "./FrequencyFormModal";
import FrequencyListSection from "./FrequencyListSection";

interface FrequencyItem {
    id: string;
    title: string;
    abbreviation: string;
    latin: string;
    numerical: number;
    description: string;
    created: string;
    updated: string;
}

const formatHumanDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
        const cleanStr = dateString.replace(" ", "T");
        const dateObj = new Date(cleanStr);
        if (isNaN(dateObj.getTime())) return dateString;
        return dateObj.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return dateString; }
};

export default function DrugFrequenciesScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const { tab } = useLocalSearchParams<{ tab?: string }>();
    const isLargeScreen = width >= 768;

    const [selectedFrequency, setSelectedFrequency] = useState<FrequencyItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FrequencyItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getFrequenciesApi = useApi<any>(async (payload: any) => await frequenciesApi.getFrequencies(payload));
    const addFrequencyApi = useApi<any>(async (payload: any) => await frequenciesApi.addFrequency(payload));
    const updateFrequencyApi = useApi<any>(async (payload: any) => await frequenciesApi.updateFrequency(payload));

    const fetchFrequencies = () => {
        getFrequenciesApi.request({ "action": "GetFrequencies" });
    };

    useEffect(() => { fetchFrequencies(); }, [tab]);

    const frequencies: FrequencyItem[] = useMemo(() => {
        if (getFrequenciesApi.data && Array.isArray(getFrequenciesApi.data)) {
            return getFrequenciesApi.data.map((item: any) => ({
                id: item.pk || item.id || Math.random().toString(),
                title: item.fields?.title || item.title || "UNSPECIFIED",
                abbreviation: item.fields?.abbreviation || item.abbreviation || "N/A",
                latin: item.fields?.latin || item.latin || "N/A",
                numerical: item.fields?.numerical ?? item.numerical ?? 0,
                description: item.fields?.description || item.description || "",
                created: item.fields?.created || item.created || "",
                updated: item.fields?.updated || item.updated || ""
            }));
        }
        return [];
    }, [getFrequenciesApi.data]);

    const filteredFrequencies = useMemo(() => {
        return frequencies.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.abbreviation.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [frequencies, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            if (editingItem) {
                await updateFrequencyApi.request({
                    "action": "UpdateFrequency",
                    "frequency_details": {
                        "id": editingItem.id,
                        "title": values.title.toUpperCase().trim(),
                        "description": values.description.trim(),
                        "abbreviation": values.abbreviation.toUpperCase().trim(),
                        "latin": values.latin.trim(),
                        "numerical": String(values.numerical)
                    }
                });
            } else {
                await addFrequencyApi.request({
                    "action": "CreateFrequency",
                    "frequency_details": {
                        "title": values.title.toUpperCase().trim(),
                        "description": values.description.trim(),
                        "abbreviation": values.abbreviation.toUpperCase().trim(),
                        "latin": values.latin.trim(),
                        "numerical": String(values.numerical)
                    }
                });
            }
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchFrequencies();
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpenEditFlow = (item: FrequencyItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const textTitleColor = isDarkMode ? "#ffffff" : theme.primary;
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    if (getFrequenciesApi.loading && frequencies.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading frequencies ledger...</Text>
            </View>
        );
    }

    return (
        <View className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ title: "Intake Frequencies", headerShown: true, headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.primary, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false }} />

            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">

                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: textTitleColor }} className="text-2xl font-black tracking-tight">Intake Frequencies</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Manage treatment systematic administration intervals and SIG codes.</Text>
                    </View>
                    <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        <TextInput
                            className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none"
                            style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }}
                            placeholder="Filter..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <TouchableOpacity
                            onPress={handleOpenCreateFlow}
                            style={{ backgroundColor: theme.primary }}
                            className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90"
                        >
                            <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Record</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {filteredFrequencies.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#1e293b" : "#e2e8f0" }} className="flex-1 rounded-2xl border border-dashed items-center justify-center p-8">
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No frequency definitions logged in this cluster layout.</Text>
                    </View>
                ) : (
                    // 🍏 CORRECT: Pass the missing function down as a prop to stop the crash
                    <FrequencyListSection
                        frequencies={filteredFrequencies}
                        isLargeScreen={isLargeScreen}
                        isDarkMode={isDarkMode}
                        theme={theme}
                        cardBorderClass={cardBorderColor}
                        formatDateHandler={formatHumanDate}
                        onOpenDetailsTrigger={(item) => setSelectedFrequency(item)}
                        onOpenEditTrigger={handleOpenEditFlow} // 🌟 ADD THIS LINE HERE
                    />
                )}

                <FrequencyFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addFrequencyApi.loading || updateFrequencyApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                />
                <FrequencyDetailsModal
                    routeItem={selectedFrequency}
                    onClose={() => setSelectedFrequency(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow} // 🌟 Binds dynamic edit trigger action parameter cleanly
                />


            </View>
        </View>
    );
}
