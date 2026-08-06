import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ClassificationItem } from "./index";

interface ClassificationListSectionProps {
    classifications: ClassificationItem[];
    isLargeScreen: boolean;
    isDarkMode: boolean;
    theme: any;
    cardBorderClass: string;
    onOpenDetailsTrigger: (item: ClassificationItem) => void;
    onOpenEditTrigger: (item: ClassificationItem) => void; // 🌟 Added edit mapping callback definition
}

export default function ClassificationListSection({
    classifications,
    isLargeScreen,
    isDarkMode,
    theme,
    cardBorderClass,
    onOpenDetailsTrigger,
    onOpenEditTrigger,
}: ClassificationListSectionProps) {

    if (isLargeScreen) {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerClassName="w-full">
                <View style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? "#1e293b" : "#e2e8f0" }} className="flex-col rounded-2xl border shadow-sm min-w-[900px] overflow-hidden w-full">
                    <View style={{ backgroundColor: isDarkMode ? "#0f172a" : "#f1f5f9" }} className="flex-row items-center px-6 py-4 border-b border-slate-700/30">
                        <Text style={{ color: theme.textDark }} className="w-[200px] font-black text-xs uppercase tracking-wider">Classification Name</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Clinical Brief</Text>
                        <Text style={{ color: theme.textDark }} className="w-[160px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {classifications.map((item) => (
                            <View key={item.id} style={{ borderColor: isDarkMode ? "#1e293b" : "#f1f5f9" }} className="flex-row items-center px-6 py-4 border-b web:hover:bg-slate-500/5">
                                <Text style={{ color: theme.primary }} className="w-[200px] font-black text-sm tracking-wide">{item.title}</Text>
                                <Text style={{ color: theme.textDark }} className="flex-1 text-xs font-medium px-2 truncate" numberOfLines={1}>{item.description}</Text>

                                {/* 🌟 Split Interactive Action Set Buttons */}
                                <View className="w-[160px] flex-row gap-x-2 justify-end items-center">
                                    <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all">
                                        <Text style={{ color: theme.text }} className="text-xs font-semibold">Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} className="py-1 px-2.5 border rounded-lg web:hover:bg-blue-500/10 transition-all">
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
            {classifications.map((item) => (
                <View key={item.id} style={{ backgroundColor: theme.panel }} className={`p-5 rounded-2xl border ${cardBorderClass} shadow-sm flex-col`}>
                    <Text style={{ color: theme.primary }} className="font-black text-base tracking-wide mb-1" numberOfLines={1}>{item.title}</Text>
                    <Text style={{ color: theme.textDark }} className="text-xs font-medium mb-4 line-clamp-2 leading-relaxed" numberOfLines={2}>{item.description}</Text>

                    {/* 🌟 Split Action Row Blocks Footer Layout */}
                    <View className="flex-row items-center gap-x-3 w-full">
                        <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-70">
                            <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Edit Class</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: isDarkMode ? "#334155" : "#cbd5e1" }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-80">
                            <Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Details</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
