import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface FrequencyItem {
    id: string;
    title: string;
    abbreviation: string;
    latin: string;
    numerical: number;
    description: string;
    created: string;
    updated: string;
}

interface FrequencyListSectionProps {
    frequencies: FrequencyItem[];
    isLargeScreen: boolean;
    isDarkMode: boolean;
    theme: any;
    cardBorderClass: string;
    formatDateHandler: (date: string) => string;
    onOpenDetailsTrigger: (item: FrequencyItem) => void;
    onOpenEditTrigger: (item: FrequencyItem) => void;
}

export default function FrequencyListSection({
    frequencies,
    isLargeScreen,
    isDarkMode,
    theme,
    cardBorderClass,
    formatDateHandler,
    onOpenDetailsTrigger,
    onOpenEditTrigger,
}: FrequencyListSectionProps) {

    if (isLargeScreen) {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerClassName="w-full">
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#1e293b" : "#e2e8f0" }} className="flex-col rounded-2xl border shadow-sm min-w-[900px] overflow-hidden w-full">
                    <View style={{ backgroundColor: isDarkMode ? "#0f172a" : "#f1f5f9" }} className="flex-row items-center px-6 py-4 border-b border-slate-700/30">
                        <Text style={{ color: theme.textDark }} className="w-[180px] font-black text-xs uppercase tracking-wider">Interval Title</Text>
                        <Text style={{ color: theme.textDark }} className="w-[100px] font-black text-xs uppercase tracking-wider text-center">SIG Code</Text>
                        <Text style={{ color: theme.textDark }} className="w-[140px] font-black text-xs uppercase tracking-wider px-2">Latin Term</Text>
                        <Text style={{ color: theme.textDark }} className="w-[90px] font-black text-xs uppercase tracking-wider text-center">Daily Count</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Description</Text>
                        <Text style={{ color: theme.textDark }} className="w-[140px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {frequencies.map((item) => (
                            <View key={item.id} style={{ borderColor: isDarkMode ? "#1e293b" : "#f1f5f9" }} className="flex-row items-center px-6 py-4 border-b web:hover:bg-slate-500/5">
                                <Text style={{ color: theme.primary }} className="w-[180px] font-black text-sm tracking-wide">{item.title}</Text>
                                <View className="w-[100px] items-center">
                                    <Text style={{ color: theme.text }} className="bg-slate-500/10 px-2 py-0.5 rounded-md font-extrabold text-xs tracking-wider">{item.abbreviation}</Text>
                                </View>
                                <Text style={{ color: theme.text }} className="w-[140px] text-xs font-semibold px-2 truncate italic">{item.latin}</Text>
                                <Text style={{ color: theme.text }} className="w-[90px] text-xs font-black text-center">{item.numerical}</Text>
                                <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-medium px-2 truncate" numberOfLines={1}>{item.description}</Text>

                                <View className="w-[140px] flex-row gap-x-2 justify-end items-center">
                                    <TouchableOpacity
                                        onPress={() => onOpenEditTrigger(item)}
                                        style={{ borderColor: theme.border }}
                                        className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all"
                                    >
                                        <Text style={{ color: theme.text }} className="text-xs font-semibold">Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => onOpenDetailsTrigger(item)}
                                        style={{ backgroundColor: theme.background, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }}
                                        className="py-1 px-2.5 border rounded-lg web:hover:bg-blue-500/10 transition-all"
                                    >
                                        <Text style={{ color: theme.primary }} className="text-xs font-bold">Details</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
            {frequencies.map((item) => (
                <View key={item.id} style={{ backgroundColor: theme.panel }} className={`p-5 rounded-2xl border ${cardBorderClass} shadow-sm flex-col`}>
                    <View className="flex-row justify-between items-center mb-2">
                        <Text style={{ color: theme.primary }} className="font-black text-base tracking-wide flex-1 pr-2" numberOfLines={1}>{item.title}</Text>
                        <Text style={{ color: theme.primary, backgroundColor: theme.primary + "15" }} className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                            SIG: {item.abbreviation}
                        </Text>
                    </View>
                    <Text style={{ color: theme.text }} className="text-xs font-medium mb-3 italic">Latin: {item.latin} ({item.numerical}x daily)</Text>

                    <View className="flex-row items-center gap-x-3 w-full">
                        <TouchableOpacity
                            onPress={() => onOpenEditTrigger(item)}
                            style={{ borderColor: theme.border }}
                            className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-70"
                        >
                            <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onOpenDetailsTrigger(item)}
                            style={{ backgroundColor: theme.background, borderColor: isDarkMode ? "#334155" : "#cbd5e1" }}
                            className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-80"
                        >
                            <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Details</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
