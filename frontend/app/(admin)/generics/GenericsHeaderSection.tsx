import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface GenericsHeaderSectionProps {
    theme: any;
    searchQuery: string;
    onSearchChange: (text: string) => void;
    onAddTrigger: () => void;
}

export default function GenericsHeaderSection({
    theme,
    searchQuery,
    onSearchChange,
    onAddTrigger,
}: GenericsHeaderSectionProps) {
    return (
        <View className="flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-y-4 border-b pb-4 border-slate-700/10 w-full">
            <View className="flex-1 pr-4">
                <Text style={{ color: theme.textDark }} className="text-xs font-medium">
                    Configure active pharmaceutical ingredients (APIs), molecular labels, and formulation references.
                </Text>
            </View>

            <View className="flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                <TextInput
                    className="px-4 h-[42px] rounded-xl border text-sm font-medium w-full md:w-[240px] outline-none"
                    style={{ backgroundColor: theme.panel, borderColor: theme.border, color: theme.text }}
                    placeholder="Filter active compounds..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={onSearchChange}
                />
                <TouchableOpacity
                    onPress={onAddTrigger}
                    style={{ backgroundColor: theme.primary }}
                    className="h-[42px] w-full md:w-auto px-5 rounded-xl justify-center items-center shadow-sm whitespace-nowrap active:opacity-90"
                >
                    <Text className="text-white font-black text-xs uppercase tracking-wider">+ Add Generic</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
