// app/(wholesalers)/wholesaleInventory/index.tsx

import wholesalersApi from "@/api/wholesalersApi";
import { useAuth } from "@/context/AuthContext";
import useApi from "@/hooks/useApi";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import InventoryDetailsModal from "./InventoryDetailsModal";
import InventoryFilters from "./InventoryFilters";
import InventoryFormModal from "./InventoryFormModal";
import InventoryTableComponent from "./InventoryTableComponent";
import { InventoryItem } from "./inventory";

export default function InventoryDashboard() {
    const { theme, isDarkMode } = useAuth();

    const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
    const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);

    const [selectedInspectItem, setSelectedInspectItem] = useState<InventoryItem | null>(null);
    const [editingItemData, setEditingItemData] = useState<InventoryItem | null>(null);
    const [isFormVisible, setIsFormVisible] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [stockFilter, setStockFilter] = useState("all");
    const [sortCriterion, setSortCriterion] = useState("name");

    const getInventoryApi = useApi(wholesalersApi.wholesaleStaffAction);
    const createItemApi = useApi(wholesalersApi.wholesaleStaffAction);

    const fetchWholesaleData = async () => {
        const response = await getInventoryApi.request({ action: "GetWholesalerReceipts" });
        if (response && response.ok) {
            const payloadData = response.data?.results || response.data || [];
            setLocalInventory(Array.isArray(payloadData) ? payloadData : []);
        } else {
            setLocalInventory([]);
        }
    };

    useEffect(() => { fetchWholesaleData(); }, []);

    useEffect(() => {
        if (getInventoryApi.data) {
            const payloadData = getInventoryApi.data.results || getInventoryApi.data || [];
            setLocalInventory(Array.isArray(payloadData) ? payloadData : []);
        }
    }, [getInventoryApi.data]);

    useEffect(() => {
        let processed = [...localInventory];
        if (searchQuery.trim() !== "") {
            const q = searchQuery.toLowerCase();
            processed = processed.filter(item =>
                item.title?.toLowerCase().includes(q) ||
                item.batch?.toLowerCase().includes(q)
            );
        }
        if (stockFilter === "low-stock") processed = processed.filter(item => item.current_unit_quantity <= 20);
        if (sortCriterion === "name") processed.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        setFilteredInventory(processed);
    }, [localInventory, searchQuery, stockFilter, sortCriterion]);

    const handleItemCreationSubmit = async (values: any, formikHelpers: any) => {
        const isEditing = editingItemData !== null;
        let payload = {};

        if (isEditing) {
            // 🌟 FIXED: Constructs the exact specific Update nested schema requested by your backend parameters
            payload = {
                action: "UpdateWholesalerReceipt",
                wholesaler_receipt_details: {
                    wholesaler_receipt: editingItemData.id,
                    unit_selling_price: String(values.unit_selling_price || "0.00"),
                    unit_buying_price: String(values.unit_buying_price || "0.00"),
                    unit_of_receipt: values.unit_of_receipt || "Piece",
                    received_unit_quantity: String(values.current_unit_quantity || "0")
                }
            };
        } else {
            // Maintains your standard full Creation payload configuration matrix
            payload = {
                action: "CreateWholesalerReceipt",
                wholesaler_receipt_details: {
                    product: values.product,
                    unit_quantity: String(values.current_unit_quantity || "0"),
                    unit_buying_price: String(values.unit_buying_price || "0.00"),
                    unit_selling_price: String(values.unit_selling_price || "0.00"),
                    manufacture_date: values.manufacture_date,
                    received_unit_quantity: String(values.current_unit_quantity || "0"),
                    unit_of_receipt: values.unit_of_receipt || "Piece",
                    expiry_date: values.expiry_date,
                    received_from: values.received_from || "",
                    batch: values.batch || "",
                    wholesaler_order_item: "",
                    quantity_discounts: [],
                    wholesaler_price_discount: ""
                }
            };
        }

        const response = await createItemApi.request(payload);
        console.log(`📥 [Inventory Engine] ${payload.action} Server Response Payloads:`, JSON.stringify(response, null, 2));

        if (response && response.ok) {
            fetchWholesaleData();
            setIsFormVisible(false);
            setEditingItemData(null);
        } else {
            if (formikHelpers && formikHelpers.setErrors) {
                formikHelpers.setErrors(response?.data || { title: "Server refused request operations mutation parameters." });
            }
        }
    };

    const openFormForCreation = () => {
        setEditingItemData(null);
        setIsFormVisible(true);
    };

    const openFormForModification = (item: InventoryItem) => {
        setEditingItemData(item);
        setIsFormVisible(true);
    };

    return (
        <View style={{ backgroundColor: theme.background }} className="flex-1 relative w-full h-full">
            <View style={{ backgroundColor: theme.panel, borderBottomColor: isDarkMode ? "#1e293b" : "#e2e8f0" }} className="px-6 h-20 border-b flex-row justify-between items-center shadow-xs">
                <View className="flex-row items-center space-x-2">
                    <Text className="text-xl">📊</Text>
                    <View className="ml-3">
                        <Text style={{ color: theme.text }} className="text-xl font-black tracking-tight">Wholesale Ledger</Text>
                        <Text style={{ color: theme.textDark }} className="text-xs font-medium">Manage stock metrics and shelf-life logs</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={openFormForCreation} style={{ backgroundColor: theme.primary }} className="flex-row items-center px-4 py-2.5 rounded-xl shadow-md">
                    <Text className="text-white font-black text-sm">➕ Add New Product</Text>
                </TouchableOpacity>
            </View>

            <InventoryFilters onSearchChange={setSearchQuery} onStockFilterChange={setStockFilter} onSortChange={setSortCriterion} />

            <View className="flex-1 w-full h-full">
                {getInventoryApi.loading && filteredInventory.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-8 mt-20"><ActivityIndicator size="large" color={theme.primary} /></View>
                ) : (
                    <InventoryTableComponent
                        data={filteredInventory}
                        onRowPress={(item) => setSelectedInspectItem(item)}
                        onEditPress={openFormForModification}
                        refreshControl={<RefreshControl refreshing={getInventoryApi.loading} onRefresh={fetchWholesaleData} colors={[theme.primary]} />}
                    />
                )}
            </View>

            <InventoryFormModal
                visible={isFormVisible}
                onClose={() => { setIsFormVisible(false); setEditingItemData(null); }}
                isDarkMode={isDarkMode}
                theme={theme}
                isSubmittingRemote={createItemApi.loading}
                initialData={editingItemData}
                onSubmitTrigger={handleItemCreationSubmit}
                remoteErrors={createItemApi.error ? createItemApi.data : null}
            />

            <InventoryDetailsModal isVisible={selectedInspectItem !== null} item={selectedInspectItem} onClose={() => setSelectedInspectItem(null)} />
        </View>
    );
}
