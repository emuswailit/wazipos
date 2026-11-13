// components/admin/products/AdminProductsList.tsx

import { useAuth } from "@/context/AuthContext";
import { useProductsSync } from "@/context/ProductsSyncContext";
import useApi from "@/hooks/useApi";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    StatusBar,
    Text,
    useWindowDimensions,
    View,
} from "react-native";

import drugsApi from "@/api/drugs/productsApi";
import { ProductDetails } from "@/api/productsApi";
import { useAlert } from "@/components/common/AlertProvider";
import ApiErrorModal, {
    FlatFieldError,
    OriginFrame,
} from "@/components/common/ApiErrorModal";
import ApiResponseModal, {
    ApiResponseEnvelope,
    extractEnvelope,
} from "@/components/common/ApiResponseModal";
import AdminProductDetailsModal from "./AdminProductDetailsModal"; // 🌟 Ensure this is imported
import AdminProductEditModal from "./AdminProductEditModal";
import AdminProductsMobileView from "./AdminProductsMobileView";
import AdminProductsWebView from "./AdminProductsWebView";
import {
    PAGE_SIZE_OPTIONS,
    type AdminProductsSharedProps,
    type PageSize,
    type ProductItem,
} from "./types";

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

    const {
        productsList,
        isProductsSyncing,
        isProductsRefreshing,
        forceProductsRefresh,
    } = useProductsSync();

    const alert = useAlert();

    const [responseModalOpen, setResponseModalOpen] = useState(false);
    const [responseEnvelope, setResponseEnvelope] = useState<ApiResponseEnvelope | null>(null);
    const [responseTitle, setResponseTitle] = useState<string>();
    const [responseSubtitle, setResponseSubtitle] = useState<string>();
    const [responseRetry, setResponseRetry] = useState<(() => void) | undefined>(undefined);

    const [errorModalOpen, setErrorModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorFields, setErrorFields] = useState<FlatFieldError[]>([]);
    const [errorOrigin, setErrorOrigin] = useState<OriginFrame[]>([]);

    // 🌟 State to handle the details modal
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ProductItem | null>(null);

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE_OPTIONS[0]);

    const addProductApi = useApi<any>(async (payload: any) =>
        drugsApi.productsAction(payload)
    );
    const updateProductApi = useApi<any>(async (payload: any) =>
        drugsApi.productsAction(payload)
    );

    const products: ProductItem[] = useMemo(() => {
        if (!Array.isArray(productsList) || productsList.length === 0) {
            return [];
        }

        return productsList.map((item: any, index: number) => {
            const stableId = item.remote_id || item.id || `prod-${index}`;

            return {
                id: String(stableId),
                title: item.title || "UNSPECIFIED",
                description: item.description || "",
                long_title: item.long_title || "",
                product_name: item.product_name || "",
                preparation: item.preparation || "",
                preparation_title: item.preparation_title || "—",
                long_preparation_title: item.long_preparation_title || "—",
                formulation_title: item.formulation_title || "—",
                manufacturer: item.manufacturer || "",
                manufacturer_title: item.manufacturer_title || "—",
                country_of_origin: item.country_of_origin || "—",
                category: item.category || "",
                category_title: item.category_title || "—",
                units_per_pack: Number(item.units_per_pack) || 0,
                pack_tag: item.pack_tag || "",
                bar_code: item.bar_code || "",
                is_vatable: item.is_vatable ? String(item.is_vatable) : "false",
                allowed_entities: Array.isArray(item.allowed_entities) ? item.allowed_entities : [],
                allowed_entities_titles: Array.isArray(item.allowed_entities_titles) ? item.allowed_entities_titles : [],
                active: !!item.active,
                images: parseImages(item.images),
                created: item.created || "",
                updated: item.updated || "",
            };
        });
    }, [productsList]);

    const filteredProducts = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return products;
        return products.filter(
            (item) =>
                item.title.toLowerCase().includes(q) ||
                item.product_name.toLowerCase().includes(q) ||
                item.bar_code.toLowerCase().includes(q) ||
                item.preparation_title.toLowerCase().includes(q) ||
                item.manufacturer_title.toLowerCase().includes(q) ||
                item.category_title.toLowerCase().includes(q)
        );
    }, [products, query]);

    const totalItems = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

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

    const refreshFromContext = () => {
        void forceProductsRefresh();
    };

    const routeResponse = (
        raw: any,
        opts: {
            title: string;
            subtitle?: string;
            successTitle: string;
            onRetry?: () => void;
        }
    ): boolean => {
        const env = extractEnvelope(raw);
        const ok = env.response_code === "0";

        if (ok) {
            alert(
                opts.successTitle,
                env.response_message ?? "Operation completed.",
                undefined,
                "success"
            );
            return true;
        }

        setResponseEnvelope(env);
        setResponseTitle(opts.title);
        setResponseSubtitle(opts.subtitle);
        setResponseRetry(() => opts.onRetry);
        setResponseModalOpen(true);
        return false;
    };

    const routeException = (err: any) => {
        setErrorMessage(
            err?.message ?? "Unexpected error. Check the console."
        );
        setErrorFields(
            Array.isArray(err?.fieldErrors) ? err.fieldErrors : []
        );
        setErrorOrigin(
            Array.isArray(err?.origin) ? err.origin : []
        );
        setErrorModalOpen(true);
    };

    const handleFormSubmit = async (
        values: any,
        { resetForm }: any
    ) => {
        try {
            const details: ProductDetails = {
                title: String(values.title ?? "").trim(),
                description: String(values.description ?? "").trim(),
                preparation: String(values.preparation ?? "").trim(),
                units_per_pack: Number(values.units_per_pack) || 0,
                pack_tag: String(values.pack_tag ?? "").trim(),
                manufacturer: String(values.manufacturer ?? "").trim(),
                category: String(values.category ?? "").trim(),
                is_vatable: String(values.is_vatable ?? "false"),
                allowed_entities: Array.isArray(values.allowed_entities)
                    ? values.allowed_entities.filter(Boolean)
                    : [],
                bar_code: String(values.bar_code ?? "").trim(),
                images: Array.isArray(values.images) ? values.images : [],
            };

            const response: any = editingItem
                ? await updateProductApi.request({
                    action: "UpdateProduct",
                    id: editingItem.id,
                    product_details: details,
                })
                : await addProductApi.request({
                    action: "CreateProduct",
                    product_details: details,
                });

            const ok = routeResponse(response, {
                title: editingItem
                    ? "Could not update product"
                    : "Could not create product",
                subtitle: editingItem?.id,
                successTitle: editingItem
                    ? "Product updated"
                    : "Product created",
                onRetry: () =>
                    handleFormSubmit(values, { resetForm }),
            });

            if (!ok) return;

            resetForm();
            setIsFormModalOpen(false);
            setEditingItem(null);
            refreshFromContext();
        } catch (err) {
            routeException(err);
        }
    };

    const handleOpenEditFlow = (item: ProductItem) => {
        setSelectedItem(null); // Close details modal if open
        setEditingItem(item);
        setIsFormModalOpen(true);
    };

    const handleOpenCreateFlow = () => {
        setEditingItem(null);
        setIsFormModalOpen(true);
    };

    const handleOpenDetails = (item: ProductItem) => {
        setSelectedItem(item); // 🌟 Opens the details modal
    };

    const goPrev = () => setPage((p) => Math.max(1, p - 1));
    const goNext = () =>
        setPage((p) => Math.min(totalPages, p + 1));
    const changePageSize = (size: PageSize) => {
        setPageSize(size);
        setPage(1);
    };

    if (isProductsSyncing && products.length === 0) {
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
            : "No data";

    const sharedProps: AdminProductsSharedProps = {
        query,
        setQuery,
        onRefresh: refreshFromContext,
        refreshing: isProductsRefreshing || isProductsSyncing,
        sourceLabel,
        sourceTone,
        lastSyncedTime: "",
        items: paginated,
        allItems: filteredProducts,
        onOpenCreate: handleOpenCreateFlow,
        onPressItem: handleOpenDetails, // 🌟 Passes the click handler
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

            {isLargeScreen ? (
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
                    addProductApi.loading || updateProductApi.loading
                }
                onSubmitTrigger={handleFormSubmit}
                initialData={editingItem}
                remoteErrors={
                    addProductApi.data?.errors ||
                    updateProductApi.data?.errors
                }
            />

            {/* 🌟 Render Details Modal Over the Table */}
            {selectedItem && (
                <AdminProductDetailsModal
                    routeItem={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    theme={theme}
                    formatDateHandler={formatHumanDate}
                    onOpenEditTrigger={handleOpenEditFlow}
                />
            )}

            <ApiResponseModal
                isOpen={responseModalOpen}
                variant="error"
                title={responseTitle ?? "Request failed"}
                subtitle={responseSubtitle}
                envelope={responseEnvelope}
                fallbackMessage={null}
                onClose={() => {
                    setResponseModalOpen(false);
                    setResponseRetry(undefined);
                }}
                onRetry={responseRetry}
                retryLabel="Try again"
                closeLabel="Close"
            />

            <ApiErrorModal
                visible={errorModalOpen}
                message={errorMessage}
                errors={errorFields}
                origin={errorOrigin}
                onClose={() => {
                    setErrorModalOpen(false);
                    setErrorMessage(null);
                    setErrorFields([]);
                    setErrorOrigin([]);
                }}
            />
        </View>
    );
}