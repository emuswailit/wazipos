import routesApi from "@/api/drugs/routesApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import RouteDetailsModal from "./RouteDetailsModal";
import RouteFormModal from "./RouteFormModal";
import RoutesListSection from "./RoutesListSection";

interface DrugRouteItem {
    id: string;
    title: string;
    description: string;
    owner: string;
    entity: string;
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

export default function DrugAdministrationRoutesScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const { tab } = useLocalSearchParams<{ tab?: string }>();
    const isLargeScreen = width >= 768;

    const [selectedRoute, setSelectedRoute] = useState<DrugRouteItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<DrugRouteItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getDrugRoutesApi = useApi<any>(async (payload: any) => await routesApi.getRoutes(payload));
    const addDrugRouteApi = useApi<any>(async (payload: any) => await routesApi.addRoute(payload));
    const updateDrugRouteApi = useApi<any>(async (payload: any) => await routesApi.updateRoute(payload));

    const fetchRoutes = () => {
        getDrugRoutesApi.request({ "action": "GetRoutes" });
    };

    useEffect(() => { fetchRoutes(); }, [tab]);

    const drugRoutes: DrugRouteItem[] = useMemo(() => {
        if (getDrugRoutesApi.data && Array.isArray(getDrugRoutesApi.data)) {
            return getDrugRoutesApi.data.map((item: any) => ({
                id: item.pk || item.id || Math.random().toString(),
                title: item.fields?.title || item.title || "UNSPECIFIED",
                description: item.fields?.description || item.description || "",
                owner: item.fields?.owner || item.owner || "N/A",
                entity: item.fields?.entity || item.entity || "",
                created: item.fields?.created || item.created || "",
                updated: item.fields?.updated || item.updated || ""
            }));
        }
        return [];
    }, [getDrugRoutesApi.data]);

    const filteredRoutes = useMemo(() => {
        return drugRoutes.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [drugRoutes, searchQuery]);

    const handleFormSubmit = async (values: { title: string; description: string }) => {
        try {
            if (editingItem) {
                await updateDrugRouteApi.request({
                    "action": "UpdateRoute",
                    "route_details": {
                        "id": editingItem.id,
                        "title": values.title.toUpperCase().trim(),
                        "description": values.description.trim()
                    }
                });
            } else {
                await addDrugRouteApi.request({
                    "action": "CreateRoute",
                    "route_details": {
                        "title": values.title.toUpperCase().trim(),
                        "description": values.description.trim()
                    }
                });
            }
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchRoutes();
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpenEditFlow = (item: DrugRouteItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const textTitleColor = isDarkMode ? "#ffffff" : theme.primary;
    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    if (getDrugRoutesApi.loading && drugRoutes.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading routes from remote ledger...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ title: "Administration Routes", headerShown: true, headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.primary, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false }} />

            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">

                <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
                    <View className="flex-1 pr-4">
                        <Text style={{ color: textTitleColor }} className="text-2xl font-black tracking-tight">Drug Administration Routes</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Manage and track method classifications for localized systematic therapeutic ingestion.</Text>
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
                            <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Route</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {filteredRoutes.length === 0 ? (
                    <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#1e293b" : "#e2e8f0" }} className="flex-1 rounded-2xl border border-dashed items-center justify-center p-8">
                        <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No administration routes found in this network cluster.</Text>
                    </View>
                ) : (
                    <RoutesListSection
                        routes={filteredRoutes}
                        isLargeScreen={isLargeScreen}
                        theme={theme}
                        cardBorderClass={cardBorderColor}
                        formatDateHandler={formatHumanDate}
                        onOpenDetailsTrigger={(item) => setSelectedRoute(item)}
                        onOpenEditTrigger={handleOpenEditFlow}
                    />
                )}

                <RouteFormModal
                    visible={isFormModalOpen}
                    onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }}
                    isDarkMode={isDarkMode}
                    theme={theme}
                    isSubmittingRemote={addDrugRouteApi.loading || updateDrugRouteApi.loading}
                    onSubmitTrigger={handleFormSubmit}
                    initialData={editingItem}
                />

                <RouteDetailsModal
                    routeItem={selectedRoute}
                    onClose={() => setSelectedRoute(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow} // 🌟 ADDED: Connects detail action button to form editor
                />


            </View>
        </SafeAreaView>
    );
}
