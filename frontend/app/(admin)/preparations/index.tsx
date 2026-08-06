import preparationsApi from "@/api/drugs/preparationsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import PreparationDetailsModal from "./PreparationDetailsModal";
import PreparationFormModal from "./PreparationFormModal";
import PreparationsListSection from "./PreparationsListSection";
export interface PreparationItem {
    id: string;
    title: string;
    long_title: string;
    description: string;
    formulation_id: string;
    formulation_title: string;
    generics_string: string;
    generics: string[];
    gen_array: any[];
    created: string;
    updated: string;
}
export default function PreparationsScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;
    const [selectedPrep, setSelectedPrep] = useState<PreparationItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<PreparationItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const getPreparationsApi = useApi<any>(async (payload: any) => await preparationsApi.getPreparations(payload));
    const addPreparationApi = useApi<any>(async (payload: any) => await preparationsApi.addPreparation(payload));
    const updatePreparationApi = useApi<any>(async (payload: any) => await preparationsApi.updatePreparation(payload));
    const fetchPreparations = () => { getPreparationsApi.request({ "action": "GetPreparations" }); };
    useEffect(() => { fetchPreparations(); }, []);
    const preparations: PreparationItem[] = useMemo(() => {
        if (getPreparationsApi.data && Array.isArray(getPreparationsApi.data)) {
            return getPreparationsApi.data.map((item: any) => ({
                id: item.id || item.key || Math.random().toString(),
                title: item.title || "UNSPECIFIED",
                long_title: item.long_title || "",
                description: item.description || "",
                formulation_id: item.formulation || item.formulation_id || "",
                formulation_title: item.formulation_title || "N/A",
                generics_string: item.generics_string || "N/A",
                generics: Array.isArray(item.generics) ? item.generics : [],
                gen_array: Array.isArray(item.gen_array) ? item.gen_array : [],
                created: item.created || "",
                updated: item.updated || ""
            }));
        }
        return [];
    }, [getPreparationsApi.data]);
    const filteredPreparations = useMemo(() => {
        return preparations.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.long_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.generics_string.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.formulation_title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [preparations, searchQuery]);
    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            if (editingItem) {
                await updatePreparationApi.request({
                    action: "UpdatePreparation",
                    preparation_details: {
                        id: editingItem.id,
                        title: values.title.toUpperCase().trim(),
                        description: values.description.trim(),
                        formulation_id: values.formulation_id,
                        generics: values.generics
                    }
                });
            } else {
                await addPreparationApi.request({
                    title: values.title.toUpperCase().trim(),
                    description: values.description.trim(),
                    formulation_id: values.formulation_id,
                    generics: values.generics
                });
            }
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchPreparations();
        } catch (err) { console.error(err); }
    };
    const handleOpenEditFlow = (item: PreparationItem) => { setEditingItem(item); setIsFormModalOpen(true); };
    const handleOpenCreateFlow = () => { setEditingItem(null); setIsFormModalOpen(true); };
    const formatHumanDate = (dateString: string) => {
        if (!dateString) return "N/A";
        try {
            const cleanStr = dateString.replace(" ", "T");
            const dateObj = new Date(cleanStr);
            if (isNaN(dateObj.getTime())) return dateString;
            return dateObj.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
        } catch { return dateString; }
    };
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";
    if (getPreparationsApi.loading && preparations.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading product preparations ledger...</Text>
            </View>
        );
    }
    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ title: "Medical Preparations", headerShown: true, headerTintColor: theme.primary, headerShadowVisible: false, headerStatusBarHeight: 0, headerTitleStyle: { fontWeight: '900', fontSize: 14 }, headerTitleContainerStyle: { margin: 0, padding: 0 }, headerStyle: { backgroundColor: theme.surface, height: Platform.OS === 'ios' ? 44 : 40 } }} />
            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">
                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium">Manage  pharmaceutical preparations.</Text>
                    </View>
                    <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        <TextInput className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none" style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }} placeholder="Search descriptions..." placeholderTextColor="#94A3B8" value={searchQuery} onChangeText={setSearchQuery} />
                        <TouchableOpacity onPress={handleOpenCreateFlow} style={{ backgroundColor: theme.primary }} className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90">
                            <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Preparation</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                {filteredPreparations.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No chemical formulations match target tracking queries parameters.</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <PreparationsListSection preparations={filteredPreparations} isLargeScreen={isLargeScreen} theme={theme} cardBorderClass={cardBorderColor} formatDateHandler={formatHumanDate} onOpenDetailsTrigger={(item) => setSelectedPrep(item)} onOpenEditTrigger={handleOpenEditFlow} />
                    </View>
                )}
                <PreparationFormModal visible={isFormModalOpen} onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }} isDarkMode={isDarkMode} theme={theme} isSubmittingRemote={addPreparationApi.loading || updatePreparationApi.loading} onSubmitTrigger={handleFormSubmit} initialData={editingItem} remoteErrors={addPreparationApi.data?.errors || updatePreparationApi.data?.errors} />
                <PreparationDetailsModal routeItem={selectedPrep} onClose={() => setSelectedPrep(null)} theme={theme} formatDateHandler={formatHumanDate} onOpenEditTrigger={handleOpenEditFlow} />
            </View>
        </View>
    );
}
