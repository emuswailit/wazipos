import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface ProductsHeaderSectionProps {
    theme: any;
    isDarkMode: boolean;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    totalCount: number;
    onAddTrigger: () => void;
}

export default function ProductsHeaderSection({
    theme,
    isDarkMode,
    searchQuery,
    onSearchChange,
    totalCount,
    onAddTrigger
}: ProductsHeaderSectionProps) {
    return (
        <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
            <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-x-2">
                    <Text style={{ color: isDarkMode ? "#ffffff" : theme.primary }} className="text-2xl font-black tracking-tight">Products Catalog</Text>
                    <View style={{ backgroundColor: theme.primary + "15" }} className="px-2 py-0.5 rounded-lg border border-slate-700/5">
                        <Text style={{ color: theme.primary }} className="text-xs font-black">
                            {totalCount} {totalCount === 1 ? "Item" : "Items"}
                        </Text>
                    </View>
                </View>
                <Text style={{ color: theme.textDark }} className="text-xs font-medium mt-0.5">Manage commercial medical brand listings, strengths packaging ratios, and formulation units.</Text>
            </View>
            <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                <TextInput
                    className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none"
                    style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }}
                    placeholder="Search brand catalog..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={onSearchChange}
                />
                <TouchableOpacity
                    onPress={onAddTrigger}
                    style={{ backgroundColor: theme.primary }}
                    className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90"
                >
                    <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Product</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
