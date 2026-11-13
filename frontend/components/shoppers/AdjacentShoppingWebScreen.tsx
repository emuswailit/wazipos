// components/AdjacentShoppingWebScreen.tsx
import retailersApi from "@/api/retailersApi";
import ApiResponseModal, { extractEnvelope } from "@/components/common/ApiResponseModal";
import LocationFilterBar from "@/components/common/LocationFilterBar";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useCategories } from "@/hooks/useCategories";
import {
    RetailShop,
    RetailSortKey,
    useRetailersByLocation,
} from "@/hooks/useRetailersByLocation";
import { useRouter } from "expo-router";
import {
    ArrowUpDown,
    Building2,
    RefreshCw,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

import CategoryChecklist from "./CategoryChecklist";
import RetailerListPanel from "./RetailerListPanel";

type EntityLocationResponse = {
    id: string | number;
    entity_title?: string | null;
    entity_type?: string | null;
    is_pharmacy?: boolean | null;
    categories_array?: { title: string }[] | null;
    farness?: number | string | null;
    rating?: number | string | null;
    phone?: string | null;
    point?: { coordinates?: [number, number] | null } | null;
    constituency?: string | number | null;
    constituency_title?: string | null;
    town?: string | null;
    county_title?: string | null;
};

type RetailShopWithLocation = RetailShop & {
    distanceKm: number;
    town?: string;
    subCountyTitle?: string;
    countyTitle?: string;
    sub_county_id?: string | null;
};

type RetailersByCountyPayload = {
    county: string;
    categories: string[];
};

type RetailersByCountyResponse =
    | EntityLocationResponse[]
    | { results?: EntityLocationResponse[] };

const isWeb = Platform.OS === "web";
const NARROW_BREAKPOINT = 900;
const CATEGORIES_RAIL_WIDTH = 320;

const SORTS: { key: RetailSortKey; label: string }[] = [
    { key: "rating", label: "Top rated" },
    { key: "name", label: "A→Z" },
];

const showGenericAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
        window.alert(`${title}\n\n${message}`);
    } else {
        Alert.alert(title, message);
    }
};

function normalizeRetailer(x: EntityLocationResponse): RetailShopWithLocation {
    const [lng, lat] = x.point?.coordinates ?? [0, 0];
    const titles: string[] = Array.isArray(x.categories_array)
        ? x.categories_array.map((c) => c.title).filter(Boolean)
        : [];

    return {
        id: String(x.id),
        name: x.entity_title ?? "Unknown Retailer",
        entityType: x.entity_type ?? "Retailer",
        isPharmacy: Boolean(x.is_pharmacy),
        categories: titles,
        primaryCategory: titles[0] ?? "General",
        distanceKm: Number(x.farness) || 0,
        rating: Number(x.rating) || 0,
        image: undefined,
        phone: x.phone ?? undefined,
        latitude: lat,
        longitude: lng,
        sub_county_id: x.constituency != null ? String(x.constituency) : null,
        subCountyTitle: x.constituency_title ?? "",
        town: x.town ?? "",
        countyTitle: x.county_title ?? "",
    };
}

export default function AdjacentShoppingWebScreen() {
    const { width: windowWidth } = useWindowDimensions();
    const { theme, isDarkMode } = useAuth();
    const router = useRouter();

    const [county, setCounty] = useState("");
    const [subCounty, setSubCounty] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 🌟 Error Modal State
    const [apiError, setApiError] = useState<{
        isOpen: boolean;
        title: string;
        envelope: any | null;
        fallbackMessage: string | null;
    }>({ isOpen: false, title: "", envelope: null, fallbackMessage: null });

    const {
        filteredShops,
        searchQuery,
        setSearchQuery,
        selectedCategories,
        toggleCategory,
        clearCategories,
        isCategorySelected,
        sort,
        setSort,
        status,
        error,
        isLoading: isBaseLoading,
    } = useRetailersByLocation(county || null, subCounty || null);

    const { categories: allCategories } = useCategories();

    const categoryTitles = useMemo(
        () => allCategories.map((c) => c.title),
        [allCategories],
    );

    // 🌟 Restored: Map selected category titles to IDs for the API
    const selectedCategoryIds = useMemo(() => {
        return allCategories
            .filter((c) => selectedCategories.includes(c.title))
            .map((c) => c.id);
    }, [allCategories, selectedCategories]);

    const [apiShops, setApiShops] = useState<RetailShopWithLocation[]>([]);
    const [apiLoading, setApiLoading] = useState(false);

    const fetchApi = useApi<RetailersByCountyResponse>(
        async (payload: RetailersByCountyPayload) =>
            await retailersApi.getRetailersByCountyAndCategoriesAction(payload),
    );

    const fetchApiRef = React.useRef(fetchApi);
    fetchApiRef.current = fetchApi;

    useEffect(() => {
        let cancelled = false;

        const fetchByCategories = async () => {
            if (!county) {
                setApiShops([]);
                return;
            }

            setApiLoading(true);
            try {
                const res = await fetchApiRef.current.request({
                    county,
                    categories: selectedCategoryIds,
                } satisfies RetailersByCountyPayload);

                if (!cancelled) {
                    // 🌟 Check for API Error (e.g. No active subscription)
                    if (res?.ok === false) {
                        const env = extractEnvelope(res);
                        setApiError({
                            isOpen: true,
                            title: "Subscription Required",
                            envelope: env,
                            fallbackMessage: null,
                        });
                        throw new Error(res.problem || "API request failed");
                    }

                    const data = res.data;
                    const results: EntityLocationResponse[] = Array.isArray(data)
                        ? data
                        : data?.results ?? [];

                    setApiShops(results.map(normalizeRetailer));
                }
            } catch (err: unknown) {

                if (!cancelled) {
                    const fallback: RetailShopWithLocation[] =
                        selectedCategoryIds.length === 0
                            ? (filteredShops as RetailShopWithLocation[])
                            : (filteredShops as RetailShopWithLocation[]).filter((s) =>
                                s.categories.some((c) =>
                                    selectedCategories.includes(c),
                                ),
                            );
                    setApiShops(fallback);
                }
            } finally {
                if (!cancelled) setApiLoading(false);
            }
        };

        fetchByCategories();
        return () => {
            cancelled = true;
        };
    }, [county, selectedCategoryIds, filteredShops, selectedCategories]);

    const finalDisplayShops = useMemo<RetailShopWithLocation[]>(() => {
        const isApiActive = !!county;
        let list: RetailShopWithLocation[] = isApiActive
            ? [...apiShops]
            : ([...filteredShops] as RetailShopWithLocation[]);

        if (isApiActive) {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                list = list.filter(
                    (s) =>
                        s.name.toLowerCase().includes(q) ||
                        s.categories.some((c) => c.toLowerCase().includes(q)),
                );
            }

            if (subCounty) {
                list = list.filter(
                    (s) =>
                        s.sub_county_id === subCounty ||
                        s.subCountyTitle === subCounty,
                );
            }

            list.sort((a, b) => {
                if (sort === "rating") return b.rating - a.rating;
                if (sort === "name") return a.name.localeCompare(b.name);
                return a.distanceKm - b.distanceKm;
            });
        }

        return list;
    }, [county, apiShops, filteredShops, searchQuery, subCounty, sort]);

    const displayShops = finalDisplayShops;
    const isLoading = county ? apiLoading : isBaseLoading;

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => setIsMounted(true), []);

    const width = isMounted ? windowWidth : 1280;
    const isNarrow = width < NARROW_BREAKPOINT;

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (county) n++;
        if (subCounty) n++;
        n += selectedCategories.length;
        return n;
    }, [county, subCounty, selectedCategories]);

    const handleCountyChange = (id: string) => {
        setSubCounty("");
        setCounty(id);
    };

    const handleSubCountyChange = (id: string) => {
        setSubCounty(id);
    };

    const handleCategoryToggle = (category: string) => {
        if (!county) {
            showGenericAlert(
                "Select a County",
                "Please select a county before filtering by category.",
            );
            return;
        }
        toggleCategory(category);
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
        }, 800);
    };

    const openShopFront = useCallback(
        (shop: RetailShop) => {
            const s = shop as RetailShopWithLocation;
            const location = [s.town, s.subCountyTitle, s.countyTitle]
                .filter(Boolean)
                .join(", ");

            router.push({
                pathname: "/shopFront/[id]",
                params: {
                    id: shop.id,
                    name: shop.name,
                    type: shop.entityType,
                    location,
                    lat: s.latitude ? s.latitude.toString() : "0",
                    lng: s.longitude ? s.longitude.toString() : "0",
                },
            });
        },
        [router],
    );

    useEffect(() => {
        if (!isWeb || !filtersOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFiltersOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [filtersOpen]);

    const SortPills: React.FC = () => (
        <View className="flex-row items-center gap-1">
            <ArrowUpDown size={12} color={theme.textDark} />
            {SORTS.map((s) => {
                const active = sort === s.key;
                return (
                    <TouchableOpacity
                        key={s.key}
                        onPress={() => setSort(s.key)}
                        activeOpacity={0.8}
                        className="px-2.5 py-1.5 rounded-md cursor-pointer"
                        style={{ backgroundColor: active ? (isDarkMode ? "#1e293b" : "#f1f5f9") : "transparent" }}
                    >
                        <Text className="text-xs" style={{ fontFamily: active ? theme.font.bold : theme.font.regular, color: active ? theme.primary : theme.textDark }}>
                            {s.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    const SearchBox = (
        <View className="flex-1 min-w-0 flex-row items-center rounded-lg border px-2.5 h-[38px]" style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0", backgroundColor: isDarkMode ? "#0f172a" : "#f1f5f9" }}>
            <Search size={14} color={theme.textDark} />
            <TextInput
                placeholder="Search retailers…"
                placeholderTextColor={theme.textDark}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 h-full ml-2 text-[13px] outline-none"
                style={{ fontFamily: theme.font.regular, color: theme.text }}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8} className="cursor-pointer">
                    <X size={13} color={theme.textDark} />
                </TouchableOpacity>
            )}
        </View>
    );

    // 🌟 Restored: The Top Bar with the County Picker
    const topBar = isNarrow ? (
        <View className="border-b" style={{ borderBottomColor: isDarkMode ? "#334155" : "#e2e8f0", backgroundColor: theme.panel }}>
            <View className="flex-row items-center px-3 pt-2.5 pb-2 gap-2">
                {SearchBox}
                <TouchableOpacity
                    onPress={() => setFiltersOpen(true)}
                    activeOpacity={0.85}
                    className="flex-row items-center px-3 h-[38px] rounded-[10px] border cursor-pointer"
                    style={{ borderColor: activeFilterCount > 0 ? theme.primary : (isDarkMode ? "#334155" : "#e2e8f0"), backgroundColor: activeFilterCount > 0 ? `${theme.primary}15` : "transparent" }}
                >
                    <SlidersHorizontal size={14} color={activeFilterCount > 0 ? theme.primary : theme.textDark} />
                    <Text className="ml-1.5 text-xs font-bold" style={{ fontFamily: theme.font.bold, color: activeFilterCount > 0 ? theme.primary : theme.textDark }}>
                        Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
                    </Text>
                </TouchableOpacity>
            </View>
            <View className="px-3 pb-2.5">
                <LocationFilterBar
                    county={county}
                    subCounty={subCounty}
                    onChangeCounty={handleCountyChange}
                    onChangeSubCounty={handleSubCountyChange}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    countyLabel="County"
                    subCountyLabel="Sub-county"
                    gap={8}
                    horizontal
                />
            </View>
        </View>
    ) : (
        <View className="flex-row items-center px-3.5 py-2.5 border-b gap-3 z-[100]" style={{ borderBottomColor: isDarkMode ? "#334155" : "#e2e8f0", backgroundColor: theme.panel }}>
            <View className="flex-1 max-w-[460px] min-w-[320px] z-[100]">
                <LocationFilterBar
                    county={county}
                    subCounty={subCounty}
                    onChangeCounty={handleCountyChange}
                    onChangeSubCounty={handleSubCountyChange}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    countyLabel="County"
                    subCountyLabel="Sub-county"
                    gap={8}
                    horizontal
                />
            </View>
            {SearchBox}
            <SortPills />
            <TouchableOpacity
                onPress={handleRefresh}
                disabled={isRefreshing}
                className="flex-row items-center px-3 h-[38px] rounded-lg cursor-pointer"
                style={{ backgroundColor: theme.primary }}
            >
                {isRefreshing ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <RefreshCw size={14} color="#fff" />
                        <Text className="ml-1.5 text-xs font-bold text-white" style={{ fontFamily: theme.font.bold }}>Refresh</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    );

    const filtersSheet = isNarrow ? (
        <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
            <Pressable onPress={() => setFiltersOpen(false)} className="flex-1 bg-black/45 justify-end">
                <Pressable onPress={(e) => e.stopPropagation?.()} className="rounded-t-[20px] max-h-[85%]" style={{ backgroundColor: theme.panel }}>
                    <View className="items-center pt-2.5 pb-1">
                        <View className="w-10 h-1 rounded-full" style={{ backgroundColor: isDarkMode ? "#334155" : "#e2e8f0" }} />
                    </View>
                    <View className="flex-row items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: isDarkMode ? "#334155" : "#e2e8f0" }}>
                        <Text className="text-lg font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>Filters</Text>
                        <TouchableOpacity onPress={() => setFiltersOpen(false)} className="w-[30px] h-[30px] rounded-full items-center justify-center cursor-pointer" style={{ backgroundColor: isDarkMode ? "#0f172a" : "#f1f5f9" }}>
                            <X size={14} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                        <View>
                            <Text className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>Categories</Text>
                            <View className="min-h-[200px]">
                                <CategoryChecklist
                                    categories={categoryTitles}
                                    isSelected={isCategorySelected}
                                    onToggle={handleCategoryToggle}
                                    onClear={clearCategories}
                                    selectedCount={selectedCategories.length}
                                />
                            </View>
                        </View>
                        <View>
                            <Text className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>Sort by</Text>
                            <View className="flex-row flex-wrap gap-1.5">
                                {SORTS.map((s) => {
                                    const active = sort === s.key;
                                    return (
                                        <TouchableOpacity key={s.key} onPress={() => setSort(s.key)} className="px-3.5 py-2 rounded-full border cursor-pointer" style={{ borderColor: active ? theme.primary : (isDarkMode ? "#334155" : "#e2e8f0"), backgroundColor: active ? theme.primary : "transparent" }}>
                                            <Text className="text-xs" style={{ fontFamily: active ? theme.font.bold : theme.font.medium, color: active ? "#fff" : theme.textDark }}>{s.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                        <View>
                            <Text className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ fontFamily: theme.font.bold, color: theme.textDark }}>Location</Text>
                            <LocationFilterBar county={county} subCounty={subCounty} onChangeCounty={handleCountyChange} onChangeSubCounty={handleSubCountyChange} theme={theme} isDarkMode={isDarkMode} countyLabel="County" subCountyLabel="Sub-county" gap={12} />
                        </View>
                        <TouchableOpacity onPress={handleRefresh} disabled={isRefreshing} className="flex-row items-center justify-center py-3 rounded-lg mt-2 cursor-pointer" style={{ backgroundColor: theme.primary }}>
                            {isRefreshing ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <RefreshCw size={14} color="#fff" />
                                    <Text className="ml-2 text-[13px] font-bold text-white" style={{ fontFamily: theme.font.bold }}>Refresh Data</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    ) : null;

    if (status === "error" && displayShops.length === 0) {
        return (
            <>
                <View className="flex-1" style={{ backgroundColor: theme.background }}>
                    {topBar}
                    <View className="flex-1 items-center justify-center p-6">
                        <Building2 size={32} color={theme.textDark} />
                        <Text className="mt-3 text-center text-base font-bold" style={{ fontFamily: theme.font.bold, color: theme.text }}>Couldn't load retailers</Text>
                        <Text className="mt-1.5 max-w-[380px] text-center text-sm" style={{ fontFamily: theme.font.regular, color: theme.textDark }}>{error ?? "Something went wrong."}</Text>
                    </View>
                </View>
                {filtersSheet}
                <ApiResponseModal
                    isOpen={apiError.isOpen}
                    variant="error"
                    title={apiError.title}
                    envelope={apiError.envelope}
                    fallbackMessage={apiError.fallbackMessage}
                    onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                    closeLabel="Dismiss"
                />
            </>
        );
    }

    const categoriesColumn = (
        <View className="shrink-0 border-r" style={{ width: CATEGORIES_RAIL_WIDTH, borderRightColor: isDarkMode ? "#334155" : "#e2e8f0", backgroundColor: theme.panel }}>
            <CategoryChecklist
                categories={categoryTitles}
                isSelected={isCategorySelected}
                onToggle={handleCategoryToggle}
                onClear={clearCategories}
                selectedCount={selectedCategories.length}
            />
        </View>
    );

    const retailersColumn = (
        <View className="flex-1 h-full" style={{ backgroundColor: theme.panel }}>
            <RetailerListPanel shops={displayShops} selectedId={null} onSelect={openShopFront} loading={isLoading} idle={status === "idle"} />
        </View>
    );

    if (isNarrow) {
        return (
            <>
                <View className="flex-1" style={{ backgroundColor: theme.background }}>
                    {topBar}
                    <View className="flex-1 p-4">
                        <View className="flex-1 rounded-xl overflow-hidden border" style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0", backgroundColor: theme.panel }}>
                            {retailersColumn}
                        </View>
                    </View>
                </View>
                {filtersSheet}
                <ApiResponseModal
                    isOpen={apiError.isOpen}
                    variant="error"
                    title={apiError.title}
                    envelope={apiError.envelope}
                    fallbackMessage={apiError.fallbackMessage}
                    onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                    closeLabel="Dismiss"
                />
            </>
        );
    }

    return (
        <>
            <View className="flex-1" style={{ backgroundColor: theme.background }}>
                {topBar}
                <View className="flex-1 flex-row">
                    {categoriesColumn}
                    {retailersColumn}
                </View>
            </View>
            {filtersSheet}
            <ApiResponseModal
                isOpen={apiError.isOpen}
                variant="error"
                title={apiError.title}
                envelope={apiError.envelope}
                fallbackMessage={apiError.fallbackMessage}
                onClose={() => setApiError((prev) => ({ ...prev, isOpen: false }))}
                closeLabel="Dismiss"
            />
        </>
    );
}