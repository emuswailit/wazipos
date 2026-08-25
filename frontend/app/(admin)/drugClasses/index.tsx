import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import drugClassesApi from "@/api/drugs/drugClassesApi";
import ClassificationDetailsModal from "./ClassificationDetailsModal";
import ClassificationFormModal from "./ClassificationFormModal";
import ClassificationListSection from "./ClassificationListSection";

export interface ClassificationItem {
    id: string;
    title: string;
    category: string;
    target_class: string;
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

export default function DrugClassificationsScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedClass, setSelectedClass] = useState<ClassificationItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ClassificationItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getDrugClassesApi = useApi<any>(async (payload: any) => await drugClassesApi.getDrugClasses(payload));
    const addDrugClassApi = useApi<any>(async (payload: any) => await drugClassesApi.addDrugClass(payload));
    const updateDrugClassApi = useApi<any>(async (payload: any) => await drugClassesApi.updateDrugClass(payload));

    const fetchDrugClasses = () => {
        getDrugClassesApi.request({ "action": "GetDrugClasses" });
    };

    useEffect(() => {
        fetchDrugClasses();
    }, []);

    useEffect(() => {
        if (addDrugClassApi) {
            console.log(`❌ [API Error Matrix] Class Creation Validation Failed:`, JSON.stringify(addDrugClassApi));
        }

        console.log("addDrugClassApi.data", addDrugClassApi.data)

    }, [addDrugClassApi.data]);


    const classifications: ClassificationItem[] = useMemo(() => {
        if (getDrugClassesApi.data && Array.isArray(getDrugClassesApi.data)) {
            return getDrugClassesApi.data.map((item: any) => ({
                id: item.pk || item.id || Math.random().toString(),
                title: item.fields?.title || item.title || "UNSPECIFIED",
                category: item.fields?.category || item.category || "N/A",
                target_class: item.fields?.target_class || item.target_class || "N/A",
                description: item.fields?.description || item.description || "",
                created: item.fields?.created || item.created || "",
                updated: item.fields?.updated || item.updated || ""
            }));
        }
        return [];
    }, [getDrugClassesApi.data]);

    const filteredClassifications = useMemo(() => {
        return classifications.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [classifications, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        console.log("VALZ", values)
        try {
            if (editingItem) {
                await updateDrugClassApi.request({
                    action: "UpdateDrugClass",
                    drug_class_details: {
                        id: editingItem.id,
                        title: values.title.toUpperCase().trim(),
                        description: values.description
                    }
                });
            } else {
                await addDrugClassApi.request({
                    ...values
                });
            }

            // resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchDrugClasses();
        } catch (err) {
            console.error("Form workflow operation error:", err);
        }
    };

    const handleOpenEditFlow = (item: ClassificationItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const textTitleColor = isDarkMode ? "#ffffff" : theme.primary;
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    if (getDrugClassesApi.loading && classifications.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading drug classes ledger...</Text>
            </View>
        );
    }



    return (
        <SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

            <Stack.Screen
                options={{
                    title: "Drug Classes Manager",
                    headerShown: true,
                    headerStyle: { backgroundColor: theme.surface },
                    headerTintColor: theme.primary,
                    headerTitleStyle: { fontWeight: '800', fontSize: Platform.OS === 'ios' ? 17 : 19 },
                    headerShadowVisible: false,
                }}
            />

            <View className="flex-1 p-6 relative">
                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: textTitleColor }} className="text-2xl font-black tracking-tight">Drug Classes</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Organize and map custom data fields under specified pharmacological system trees cleanly.</Text>
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

                {filteredClassifications.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No drug classes match your active layout query rules filters.</Text>
                    </View>
                ) : (
                    <ClassificationListSection
                        classifications={filteredClassifications}
                        isLargeScreen={isLargeScreen}
                        isDarkMode={isDarkMode}
                        theme={theme}
                        cardBorderClass={cardBorderColor}
                        onOpenDetailsTrigger={(item) => setSelectedClass(item)}
                        onOpenEditTrigger={handleOpenEditFlow}
                    />
                )}

                <ClassificationFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addDrugClassApi.loading || updateDrugClassApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                />

                <ClassificationDetailsModal
                    routeItem={selectedClass}
                    onClose={() => setSelectedClass(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow} // 🌟 Connects detail action button to form editor
                />
            </View>
        </SafeAreaView>
    );
}
