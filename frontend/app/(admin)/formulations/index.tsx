import formulationsApi from "@/api/drugs/formulationsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";

import FormulationDetailsModal from "./FormulationDetailsModal";
import FormulationFormModal from "./FormulationFormModal";
import FormulationsListSection from "./FormulationsListSection";

export interface FormulationItem {
    id: string;
    title: string;
    description: string;
    created: string;
    updated: string;
}

export default function FormulationsScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedFormulation, setSelectedFormulation] = useState<FormulationItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FormulationItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getFormulationsApi = useApi<any>(async (payload: any) => await formulationsApi.getFormulations(payload));
    const addFormulationApi = useApi<any>(async (payload: any) => await formulationsApi.addFormulation(payload));
    const updateFormulationApi = useApi<any>(async (payload: any) => await formulationsApi.updateFormulation(payload));

    const fetchFormulations = () => {
        getFormulationsApi.request({ "action": "GetFormulations" });
    };

    useEffect(() => {
        fetchFormulations();
    }, []);

    const formulations: FormulationItem[] = useMemo(() => {
        if (getFormulationsApi.data && Array.isArray(getFormulationsApi.data)) {
            return getFormulationsApi.data.map((item: any) => ({
                id: item.id || Math.random().toString(),
                title: item.title || "UNSPECIFIED",
                description: item.description || "",
                created: item.created || "",
                updated: item.updated || ""
            }));
        }
        return [];
    }, [getFormulationsApi.data]);

    const filteredFormulations = useMemo(() => {
        return formulations.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [formulations, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            if (editingItem) {
                await updateFormulationApi.request({
                    action: "UpdateFormulation",
                    formulation_details: {
                        id: editingItem.id,
                        title: values.title.toUpperCase().trim(),
                        description: values.description.trim()
                    }
                });
            } else {
                await addFormulationApi.request({
                    title: values.title.toUpperCase().trim(),
                    description: values.description.trim()
                });
            }
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchFormulations();
        } catch (err) {
            console.error("Form workflow operation error:", err);
        }
    };

    const handleOpenEditFlow = (item: FormulationItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

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

    if (getFormulationsApi.loading && formulations.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading drug formulations ledger...</Text>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

            <Stack.Screen
                options={{
                    title: "Formulations",
                    headerShown: true,
                    headerTintColor: theme.primary,
                    headerShadowVisible: false,
                    headerStatusBarHeight: 0,
                    headerTitleStyle: { fontWeight: '900', fontSize: 14 },
                    headerTitleContainerStyle: { margin: 0, padding: 0 },
                    headerStyle: { backgroundColor: theme.surface, height: Platform.OS === 'ios' ? 44 : 40 },
                }}
            />

            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">

                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium">
                            Manage pharmaceutical dosage forms, mediums classifications, and drug configurations.
                        </Text>
                    </View>

                    <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        <TextInput
                            className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none"
                            style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }}
                            placeholder="Search formulation forms..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <TouchableOpacity onPress={handleOpenCreateFlow} style={{ backgroundColor: theme.primary }} className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90">
                            <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Formulation</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {filteredFormulations.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No drug formulation variants logged match active query bounds.</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <FormulationsListSection
                            formulations={filteredFormulations}
                            isLargeScreen={isLargeScreen}
                            theme={theme}
                            cardBorderClass={cardBorderColor}
                            formatDateHandler={formatHumanDate}
                            onOpenDetailsTrigger={(item) => setSelectedFormulation(item)}
                            onOpenEditTrigger={handleOpenEditFlow}
                        />
                    </View>
                )}

                <FormulationFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addFormulationApi.loading || updateFormulationApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                    remoteErrors={addFormulationApi.data?.errors || updateFormulationApi.data?.errors}
                />

                <FormulationDetailsModal
                    routeItem={selectedFormulation}
                    onClose={() => setSelectedFormulation(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow}
                />
            </View>
        </View>
    );
}
