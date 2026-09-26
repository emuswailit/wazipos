// components/admin/products/AdminProductsList.tsx
//
// Admin products list shell.

import drugsApi, {
    type ProductDetails,
} from "@/api/drugsApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    StatusBar,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import AdminProductDetailsModal from "./AdminProductDetailsModal";
import AdminProductEditModal from "./AdminProductEditModal";
import AdminProductsMobileView from "./AdminProductsMobileView";
import AdminProductsWebView from "./AdminProductsWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminProductsSharedProps,
    type PageSize,
    type ProductItem,
} from "./types";

export type { ProductItem } from "./types";

function showResultAlert(
    title: string,
    responseMessage: string,
    errorsText: string
) {
    const body = `response_message:\n${responseMessage}\n\nerrors:\n${errorsText}`;

    if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
            window.alert(`${title}\n\n${body}`);
        }
        return;
    }
    Alert.alert(title, body);
}

function formatHumanDate(dateString: string): string {
    if (!dateString) return "—";
    try {
        const cleanStr = dateString.replace(" ", "T");
        const dateObj = new Date(cleanStr);
        if (isNaN(dateObj.getTime())) return dateString;
        return dateObj.toLocaleDateString("en-KE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return dateString;
    }
}

function parseImages(raw: any): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((img: any) =>
            typeof img === "string"
                ? img
                : img?.image || img?.thumbnail || ""
        )
        .filter(Boolean);
}

export default function AdminProductsList() {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const isLargeScreen = width >= 768;

    const [selectedItem, setSelectedItem] =
        useState<ProductItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] =
        useState<ProductItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(
        PAGE_SIZE_OPTIONS[0]
    );

    const getProductsApi = useApi<any>(async (payload: any) =>
        drugsApi.productsAction(payload)
    );
    const addProductApi = useApi<any>(async (payload: any) =>
        drugsApi.productsAction(payload)
    );
    const updateProductApi = useApi<any>(async (payload: any) =>
        drugsApi.productsAction(payload)
    );

    const fetchProducts = () => {
        getProductsApi.request({ action: "GetAllProducts" });
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const products: ProductItem[] = useMemo(() => {
        if (
            getProductsApi.data &&
            Array.isArray(getProductsApi.data)
        ) {
            return getProductsApi.data.map((item: any) => {
                const f = item.fields ?? item;
                return {
                    id:
                        item.pk ||
                        item.id ||
                        item.key ||
                        Math.random().toString(),
                    title: f?.title || "UNSPECIFIED",
                    description: f?.description || "",
                    long_title: f?.long_title || "",
                    product_name: f?.product_name || "",
                    preparation: f?.preparation || "",
                    preparation_title:
                        f?.preparation_title || "—",
                    long_preparation_title:
                        f?.long_preparation_title || "—",
                    formulation_title:
                        f?.formulation_title || "—",
                    manufacturer: f?.manufacturer || "",
                    manufacturer_title:
                        f?.manufacturer_title || "—",
                    country_of_origin:
                        f?.country_of_origin || "—",
                    category: f?.category || "",
                    category_title:
                        f?.category_title || "—",
                    units_per_pack: Number(
                        f?.units_per_pack
                    ) || 0,
                    pack_tag: f?.pack_tag || "",
                    bar_code: f?.bar_code || "",
                    is_vatable: f?.is_vatable
                        ? String(f.is_vatable)
                        : "false",
                    allowed_entities: Array.isArray(
                        f?.allowed_entities
                    )
                        ? f.allowed_entities
                        : [],
                    allowed_entities_titles: Array.isArray(
                        f?.allowed_entities_titles
                    )
                        ? f.allowed_entities_titles
                        : [],
                    active: !!f?.active,
                    images: parseImages(f?.images),
                    created: f?.created || "",
                    updated: f?.updated || "",
                };
            });
        }
        return [];
    }, [getProductsApi.data]);

    const filteredProducts = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return products;
        return products.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.product_name.toLowerCase().includes(q) ||
                item.bar_code.toLowerCase().includes(q) ||
                item.preparation_title
                    .toLowerCase()
                    .includes(q) ||
                item.manufacturer_title
                    .toLowerCase()
                    .includes(q) ||
                item.category_title.toLowerCase().includes(q)
        );
    }, [products, query]);

    const totalItems = filteredProducts.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    useEffect(() => {
        setPage(1);
    }, [query, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (page - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, totalItems);

    const paginated = useMemo(
        () => filteredProducts.slice(pageStart, pageEnd),
        [filteredProducts, pageStart, pageEnd]
    );

    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            const details: ProductDetails = {
                title: String(values.title ?? "").trim(),
                description: String(
                    values.description ?? ""
                ).trim(),
                preparation: String(
                    values.preparation ?? ""
                ).trim(),
                units_per_pack:
                    Number(values.units_per_pack) || 0,
                pack_tag: String(values.pack_tag ?? "").trim(),
                manufacturer: String(
                    values.manufacturer ?? ""
                ).trim(),
                category: String(
                    values.category ?? ""
                ).trim(),
                is_vatable: String(
                    values.is_vatable ?? "false"
                ),
                allowed_entities: Array.isArray(
                    values.allowed_entities
                )
                    ? values.allowed_entities.filter(Boolean)
                    : [],
                bar_code: String(values.bar_code ?? "").trim(),
                images: Array.isArray(values.images)
                    ? values.images
                    : [],
            };

            let response: any;

            if (editingItem) {
                response = await updateProductApi.request({
                    action: "UpdateProduct",
                    id: editingItem.id,
                    product_details: details,
                });
            } else {
                response = await addProductApi.request({
                    action: "CreateProduct",
                    product_details: details,
                });
            }

            console.log("ProductsAction", response);

            console.log(
                `📡 [Admin Inbound API Resolution] ${editingItem ? "Update" : "Create"
                } Request Status: ${response?.status ?? "N/A"
                } | Body:`,
                JSON.stringify(response?.data)
            );

            const data = response?.data ?? {};

            const responseMessage: string =
                typeof data?.response_message === "string" &&
                    data.response_message.trim()
                    ? data.response_message
                    : "—";

            const errorsList: string[] =
                Array.isArray(data?.errors) &&
                    data.errors.length > 0
                    ? data.errors.filter(
                        (e: any) => typeof e === "string"
                    )
                    : [];

            const errorsText =
                errorsList.length > 0
                    ? errorsList.join("\n")
                    : "—";

            const ok =
                response?.ok === true ||
                String(data?.response_code ?? "") === "0";

            showResultAlert(
                ok ? "✅ Success" : "❌ Failed",
                responseMessage,
                errorsText
            );

            if (!ok) return;

            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            fetchProducts();
        } catch (err) {
            console.error(
                "Admin form workflow operation error:",
                err
            );

            const fallbackMsg =
                (err as any)?.message ??
                "Unexpected error. Check the console.";

            if (Platform.OS === "web") {
                if (typeof window !== "undefined") {
                    window.alert(
                        `❌ Exception\n\n${fallbackMsg}`
                    );
                }
            } else {
                Alert.alert("❌ Exception", fallbackMsg);
            }
        }
    };

    const handleOpenEditFlow = (item: ProductItem) => {
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: ProductItem) => {
        setSelectedItem(item);
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    if (getProductsApi.loading && products.length === 0) {
        return (
            <View
                style={{ backgroundColor: theme.background }}
                className="flex-1 items-center justify-center"
            >
                <ActivityIndicator
                    size="large"
                    color={theme.primary}
                />
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xs,
                        marginTop: 12,
                    }}
                >
                    Loading products catalog...
                </Text>
            </View>
        );
    }

    const sourceTone: "server" | "cache" | "none" =
        products.length > 0 ? "server" : "none";
    const sourceLabel =
        sourceTone === "server"
            ? "Server"
            : sourceTone === "cache"
                ? "Local cache"
                : "No data";

    const sharedProps: AdminProductsSharedProps = {
        query,
        setQuery,
        onRefresh: fetchProducts,
        refreshing: getProductsApi.loading,
        sourceLabel,
        sourceTone,
        lastSyncedTime: "",
        items: paginated,
        onOpenCreate: handleOpenCreateFlow,
        onPressItem: handleOpenDetails,
        onEditItem: handleOpenEditFlow,
        formatDateHandler: formatHumanDate,
        page,
        pageSize,
        totalItems,
        totalPages,
        pageStart,
        pageEnd,
        onPrev: goPrev,
        onNext: goNext,
        onPageSizeChange: changePageSize,
    };

    return (
        <View
            className="flex-1"
            style={{ backgroundColor: theme.background }}
        >
            <StatusBar
                barStyle={
                    isDarkMode ? "light-content" : "dark-content"
                }
                backgroundColor={theme.background}
            />

            <Stack.Screen options={{ headerShown: false }} />

            {selectedItem ? (
                <AdminProductDetailsModal
                    routeItem={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow}
                />
            ) : isLargeScreen ? (
                <AdminProductsWebView {...sharedProps} />
            ) : (
                <AdminProductsMobileView {...sharedProps} />
            )}

            <AdminProductEditModal
                visible={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setEditingItem(null);
                }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={
                    addProductApi.loading ||
                    updateProductApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addProductApi.data?.errors ||
                    updateProductApi.data?.errors
                }
            />
        </View>
    );
}