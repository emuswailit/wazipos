import genericsApi from "@/api/drugs/genericsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StatusBar, Text, useWindowDimensions, View } from "react-native";

import GenericDetailsModal from "./GenericDetailsModal";
import GenericFormModal from "./GenericFormModal";
import GenericsHeaderSection from "./GenericsHeaderSection";
import GenericsListSection from "./GenericsListSection";

export interface GenericItem {
    id: string;
    title: string;
    description: string;
    drug_class: string;
    drug_class_title: string;
    drug_sub_class: string;
    drug_sub_class_title: string;
    created: string;
    updated: string;
}

export default function GenericsScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedGeneric, setSelectedGeneric] = useState<GenericItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<GenericItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getGenericsApi = useApi<any>(async (payload: any) => await genericsApi.getGenerics(payload));
    const addGenericApi = useApi<any>(async (payload: any) => await genericsApi.addGeneric(payload));
    const updateGenericApi = useApi<any>(async (payload: any) => await genericsApi.updateGeneric(payload));

    const fetchGenerics = () => {
        getGenericsApi.request({ "action": "GetGenerics" });
    };

    useEffect(() => {
        fetchGenerics();
    }, []);

    const generics: GenericItem[] = useMemo(() => {
        if (getGenericsApi.data && Array.isArray(getGenericsApi.data)) {
            return getGenericsApi.data.map((item: any) => ({
                id: item.id || Math.random().toString(),
                title: item.title || "UNSPECIFIED",
                description: item.description || "",
                drug_class: item.drug_class || item.drug_class_id || "",
                drug_class_title: item.drug_class_title || "N/A",
                drug_sub_class: item.drug_sub_class || item.drug_sub_class_id || "",
                drug_sub_class_title: item.drug_sub_class_title || "N/A",
                created: item.created || "",
                updated: item.updated || ""
            }));
        }
        return [];
    }, [getGenericsApi.data]);

    const filteredGenerics = useMemo(() => {
        return generics.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.drug_class_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.drug_sub_class_title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [generics, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            if (editingItem) {
                await updateGenericApi.request({
                    action: "UpdateGeneric",
                    generic_details: {
                        id: editingItem.id,
                        title: values.title.toUpperCase().trim(),
                        description: values.description.trim(),
                        drug_class: values.drug_class,
                        drug_sub_class: values.drug_sub_class
                    }
                });
            } else {
                const response = await addGenericApi.request({
                    action: "CreateGeneric",
                    generic_details: {
                        title: values.title.toUpperCase().trim(),
                        description: values.description.trim(),
                        drug_class: values.drug_class,
                        drug_sub_class: values.drug_sub_class
                    }
                });
                console.log(`📡 [Inbound API Resolution] Create Generic Status: ${response?.status ?? 'N/A'} | Body:`, JSON.stringify(response?.data));
            }
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchGenerics();
        } catch (err) {
            console.error("Form workflow operation error:", err);
        }
    };

    const handleOpenEditFlow = (item: GenericItem) => {
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

    if (getGenericsApi.loading && generics.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading molecular generics ledger...</Text>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

            <Stack.Screen
                options={{
                    title: "Generic Medications",
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

                {/* 🌟 REPLACED: Render our isolated header section layout slice */}
                <GenericsHeaderSection
                    theme={theme}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onAddTrigger={handleOpenCreateFlow}
                />

                {filteredGenerics.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No molecular formulas logged match active tracking query limits.</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <GenericsListSection
                            generics={filteredGenerics}
                            isLargeScreen={isLargeScreen}
                            theme={theme}
                            cardBorderClass={cardBorderColor}
                            formatDateHandler={formatHumanDate}
                            onOpenDetailsTrigger={(item) => setSelectedGeneric(item)}
                            onOpenEditTrigger={handleOpenEditFlow}
                        />
                    </View>
                )}

                <GenericFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addGenericApi.loading || updateGenericApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                    remoteErrors={addGenericApi.data?.errors || updateGenericApi.data?.errors}
                />

                <GenericDetailsModal
                    routeItem={selectedGeneric}
                    onClose={() => setSelectedGeneric(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow}
                />
            </View>
        </View>
    );
}
