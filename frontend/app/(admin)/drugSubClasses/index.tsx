import drugSubClassesApi from "@/api/drugs/drugSubClassesApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";

import DrugSubClassFormModal from "./DrugSubClassFormModal";
import SubClassDetailsModal from "./SubClassDetailsModal";
import SubClassListSection from "./SubClassListSection";

export interface DrugSubClassItem {
    id: string;
    title: string;
    description: string;
    drug_class: string;
    drug_class_title: string;
    created: string;
    updated: string;
}

export default function DrugSubClassesScreen() {
    const router = useRouter();
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedSubClass, setSelectedSubClass] = useState<DrugSubClassItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<DrugSubClassItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getDrugSubClassesApi = useApi<any>(async (payload: any) => await drugSubClassesApi.getDrugSubClasses(payload));
    const addDrugSubClassApi = useApi<any>(async (payload: any) => await drugSubClassesApi.addDrugSubClass(payload));
    const updateDrugSubClassApi = useApi<any>(async (payload: any) => await drugSubClassesApi.updateDrugSubClass(payload));

    const fetchSubClasses = () => {
        getDrugSubClassesApi.request({ "action": "GetDrugSubClasses" });
    };

    useEffect(() => {
        fetchSubClasses();
    }, []);

    const subclasses: DrugSubClassItem[] = useMemo(() => {
        if (getDrugSubClassesApi.data && Array.isArray(getDrugSubClassesApi.data)) {
            return getDrugSubClassesApi.data.map((item: any) => ({
                id: item.id || Math.random().toString(),
                title: item.title || "UNSPECIFIED",
                description: item.description || "",
                drug_class: item.drug_class || "",
                drug_class_title: item.drug_class_title || "N/A",
                created: item.created || "",
                updated: item.updated || ""
            }));
        }
        return [];
    }, [getDrugSubClassesApi.data]);

    const filteredSubClasses = useMemo(() => {
        return subclasses.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [subclasses, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            if (editingItem) {
                await updateDrugSubClassApi.request({
                    action: "UpdateDrugSubClass",
                    drug_sub_class_details: {
                        id: editingItem.id,
                        title: values.title.toUpperCase().trim(),
                        description: values.description.trim(),
                        drug_class: values.drug_class
                    }
                });
            } else {
                const response = await addDrugSubClassApi.request({
                    title: values.title.toUpperCase().trim(),
                    description: values.description.trim(),
                    drug_class: values.drug_class
                });
                console.log(`📡 [Inbound API Resolution] Create Request Status: ${response?.status ?? 'N/A'} | Body:`, JSON.stringify(response?.data));
            }
            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchSubClasses();
        } catch (err) {
            console.error("❌ Fatal client thread execution defect thrown catch:", err);
        }
    };

    const handleOpenEditFlow = (item: DrugSubClassItem) => {
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

    const textTitleColor = isDarkMode ? "#ffffff" : theme.primary;
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    if (getDrugSubClassesApi.loading && subclasses.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading drug subclasses ledger...</Text>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

            {/* 🌟 REVERTED: Enforces native screen title tracking and automatic notch safety mapping layouts */}
            <Stack.Screen
                options={{
                    title: "Drug Subclasses",
                    headerShown: true,
                    headerTintColor: theme.primary,
                    headerShadowVisible: false,
                    headerStatusBarHeight: 0,
                    headerTitleStyle: {
                        fontWeight: '900',
                        fontSize: 18,
                    },
                    headerTitleContainerStyle: {
                        margin: 0,
                        padding: 0,
                    },
                    headerStyle: {
                        backgroundColor: theme.surface,
                        height: Platform.OS === 'android' ? 44 : 40,
                    },
                }}
            />


            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">

                {/* Control Row Panel Block: Contains only search inputs and add record actions */}
                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium">
                            Manage systematic subclassifications and specific pharmacological drug clusters.
                        </Text>
                    </View>

                    <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        <TextInput
                            className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none"
                            style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }}
                            placeholder="Search subclasses..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <TouchableOpacity onPress={handleOpenCreateFlow} style={{ backgroundColor: theme.primary }} className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90">
                            <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Subclass</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {filteredSubClasses.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className="flex-1 rounded-2xl border border-dashed border-slate-700/10 items-center justify-center p-8">
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No drug subclasses match your active filtering queries.</Text>
                    </View>
                ) : (
                    <View className="flex-1">
                        <SubClassListSection
                            subclasses={filteredSubClasses}
                            isLargeScreen={isLargeScreen}
                            theme={theme}
                            cardBorderClass={cardBorderColor}
                            formatDateHandler={formatHumanDate}
                            onOpenDetailsTrigger={(item) => setSelectedSubClass(item)}
                            onOpenEditTrigger={handleOpenEditFlow}
                        />
                    </View>
                )}

                <DrugSubClassFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addDrugSubClassApi.loading || updateDrugSubClassApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                    remoteErrors={addDrugSubClassApi.data?.errors || updateDrugSubClassApi.data?.errors}
                />

                <SubClassDetailsModal
                    routeItem={selectedSubClass}
                    onClose={() => setSelectedSubClass(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow}
                />
            </View>
        </View>
    );



}
