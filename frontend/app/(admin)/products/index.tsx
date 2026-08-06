import productsApi from "@/api/drugs/productsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar, Text, useWindowDimensions, View } from "react-native";
import ProductDetailsModal from "./ProductDetailsModal";
import ProductFormModal from "./ProductFormModal";
import ProductsHeaderSection from "./ProductsHeaderSection";
import ProductsListSection from "./ProductsListSection";

export interface ProductItem {
    id: string;
    title: string;
    long_title: string;
    product_name: string;
    preparation: string;
    preparation_title: string;
    long_preparation_title: string;
    formulation_title: string;
    manufacturer_title: string;
    country_of_origin: string;
    category_title: string;
    units_per_pack: number;
    pack_tag: string;
    bar_code: string;
    manufacturer: string;
    category: string;
    images: string[];
    active: boolean;
    created: string;
    updated: string;
}

export default function ProductsScreen() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ProductItem | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const getProductsApi = useApi<any>(async (payload: any) => await productsApi.getProducts(payload));
    const addProductApi = useApi<any>(async (payload: any) => await productsApi.addProduct(payload));
    const updateProductApi = useApi<any>(async (payload: any, id: string) => await productsApi.updateProduct(payload, id));

    const fetchProducts = () => { getProductsApi.request({ "action": "GetAllProducts" }); };

    useEffect(() => { fetchProducts(); }, []);

    const products: ProductItem[] = useMemo(() => {
        if (getProductsApi.data && Array.isArray(getProductsApi.data)) {
            return getProductsApi.data.map((item: any) => {
                let parsedImages: string[] = [];
                if (Array.isArray(item.images)) {
                    parsedImages = item.images.map((imgObj: any) => imgObj?.image || imgObj?.thumbnail || "").filter(Boolean);
                }
                return {
                    id: item.id || item.key || Math.random().toString(),
                    title: item.title || "UNSPECIFIED",
                    long_title: item.long_title || "",
                    product_name: item.product_name || "",
                    preparation: item.preparation || "",
                    preparation_title: item.preparation_title || "N/A",
                    long_preparation_title: item.long_preparation_title || "N/A",
                    formulation_title: item.formulation_title || "N/A",
                    manufacturer_title: item.manufacturer_title || "N/A",
                    country_of_origin: item.country_of_origin || "N/A",
                    category_title: item.category_title || "N/A",
                    units_per_pack: Number(item.units_per_pack) || 0,
                    pack_tag: item.pack_tag || "",
                    bar_code: item.bar_code || "",
                    manufacturer: item.manufacturer || "",
                    category: item.category || "",
                    images: parsedImages,
                    active: !!item.active,
                    created: item.created || "",
                    updated: item.updated || ""
                };
            });
        }
        return [];
    }, [getProductsApi.data]);

    const filteredProducts = useMemo(() => {
        return products.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.preparation_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.manufacturer_title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [products, searchQuery]);

    const handleFormSubmit = async (values: any, { resetForm }: any) => {
        try {
            const apiPayload = {
                title: values.title.toUpperCase().trim(),
                description: values.description.trim(),
                units_per_pack: Number(values.units_per_pack),
                pack_tag: values.pack_tag.trim(),
                is_vatable: values.is_vatable,
                bar_code: values.bar_code.trim(),
                preparation: values.preparation || "",
                manufacturer: values.manufacturer,
                category: values.category,
                images: values.images || []
            };

            if (editingItem) {
                console.log("Submit triggered: UpdateProduct with ID:", editingItem.id);
                const res = await updateProductApi.request(apiPayload, editingItem.id);
                console.log("UpdateProduct network response baseline matrix received:", JSON.stringify(res));
            } else {
                console.log("Submit triggered: CreateProduct");
                const res = await addProductApi.request(apiPayload);
                console.log("CreateProduct network response baseline matrix received:", JSON.stringify(res));
            }

            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchProducts();
        } catch (err) {
            console.error("Form workflow operation error stack tracing trace:", err);
        }
    };

    const handleOpenEditFlow = (item: ProductItem) => { setEditingItem(item); setIsFormModalOpen(true); };
    const handleOpenCreateFlow = () => { setEditingItem(null); setIsFormModalOpen(true); };

    const formatHumanDate = (dateString: string) => {
        if (!dateString) return "N/A";
        try {
            const cleanStr = dateString.replace(" ", "T");
            const dateObj = new Date(cleanStr);
            if (isNaN(dateObj.getTime())) return dateString;
            return dateObj.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
        } catch { return dateString; }
    };

    const cardBorderColor = isDarkMode ? "border-slate-800" : "border-slate-200";

    if (getProductsApi.loading && products.length === 0) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-3">Loading products catalog...</Text>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{ backgroundColor: theme.background }} className="flex-1 p-6 relative">
                {selectedProduct ? (
                    <ProductDetailsModal routeItem={selectedProduct} onClose={() => setSelectedProduct(null)} theme={theme} formatDateHandler={formatHumanDate} onOpenEditTrigger={handleOpenEditFlow} />
                ) : (
                    <View className="flex-1">
                        <ProductsHeaderSection theme={theme} isDarkMode={isDarkMode} searchQuery={searchQuery} onSearchChange={setSearchQuery} totalCount={filteredProducts.length} onAddTrigger={handleOpenCreateFlow} />
                        {filteredProducts.length === 0 ? (
                            <View style={{ backgroundColor: theme.panel }} className={`flex-1 rounded-2xl border border-dashed ${cardBorderColor} items-center justify-center p-8`}>
                                <Text style={{ color: theme.textDark }} className="text-sm font-bold text-center">No commercial products registered match query parameters.</Text>
                            </View>
                        ) : (
                            <View className="flex-1">
                                <ProductsListSection products={filteredProducts} isLargeScreen={width >= 768} theme={theme} cardBorderClass={cardBorderColor} formatDateHandler={formatHumanDate} onOpenDetailsTrigger={(item) => setSelectedProduct(item)} onOpenEditTrigger={handleOpenEditFlow} />
                            </View>
                        )}
                    </View>
                )}
                <ProductFormModal visible={isFormModalOpen} onClose={() => { setIsFormModalOpen(false); setEditingItem(null); }} isDarkMode={isDarkMode} theme={theme} isSubmittingRemote={addProductApi.loading || updateProductApi.loading} onSubmitTrigger={handleFormSubmit} initialData={editingItem} remoteErrors={addProductApi.data?.errors || updateProductApi.data?.errors} />
            </View>
        </View>
    );
}
