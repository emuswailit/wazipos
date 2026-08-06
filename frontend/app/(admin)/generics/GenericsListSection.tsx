import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { GenericItem } from "./index";

interface GenericsListSectionProps {
    generics: GenericItem[];
    isLargeScreen: boolean;
    theme: any;
    cardBorderClass: string;
    formatDateHandler: (dateString: string) => string;
    onOpenDetailsTrigger: (item: GenericItem) => void;
    onOpenEditTrigger: (item: GenericItem) => void;
}

export default function GenericsListSection({
    generics,
    isLargeScreen,
    theme,
    cardBorderClass,
    formatDateHandler,
    onOpenDetailsTrigger,
    onOpenEditTrigger,
}: GenericsListSectionProps) {

    if (isLargeScreen) {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerClassName="w-full">
                <View style={{ backgroundColor: theme.panel }} className="flex-col rounded-2xl min-w-[950px] overflow-hidden w-full">
                    <View style={{ backgroundColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#0f172a" }} className="flex-row items-center px-6 py-4">
                        <Text style={{ color: theme.textDark }} className="w-[180px] font-black text-xs uppercase tracking-wider">Compound Name</Text>
                        <Text style={{ color: theme.textDark }} className="w-[150px] font-black text-xs uppercase tracking-wider px-2">Drug Class</Text>
                        <Text style={{ color: theme.textDark }} className="w-[150px] font-black text-xs uppercase tracking-wider px-2">Subclass</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Pharmacology Description</Text>
                        <Text style={{ color: theme.textDark }} className="w-[120px] font-black text-xs uppercase tracking-wider text-center">Created On</Text>
                        <Text style={{ color: theme.textDark }} className="w-[140px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {generics.map((item) => (
                            <View key={item.id} className="flex-row items-center px-6 py-4 web:hover:bg-slate-500/5">
                                <Text style={{ color: theme.primary }} className="w-[180px] font-black text-sm tracking-wide">{item.title}</Text>
                                <View className="w-[150px] px-2">
                                    <Text style={{ color: theme.text }} className="bg-slate-500/10 px-2 py-0.5 rounded text-xs font-bold truncate max-w-full">{item.drug_class_title}</Text>
                                </View>
                                <View className="w-[150px] px-2">
                                    <Text style={{ color: theme.text }} className="bg-blue-500/10 px-2 py-0.5 rounded text-xs font-bold truncate max-w-full">{item.drug_sub_class_title}</Text>
                                </View>
                                <Text style={{ color: theme.text }} className="flex-1 text-xs font-medium px-2 truncate" numberOfLines={1}>{item.description}</Text>
                                <Text style={{ color: theme.textDark }} className="w-[120px] text-xs font-semibold text-center">{formatDateHandler(item.created)}</Text>
                                <View className="w-[140px] flex-row gap-x-2 justify-end items-center">
                                    <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all"><Text style={{ color: theme.text }} className="text-xs font-semibold">Edit</Text></TouchableOpacity>
                                    <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg transition-all"><Text style={{ color: theme.primary }} className="text-xs font-bold">Details</Text></TouchableOpacity>
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
            {generics.map((item) => (
                <View key={item.id} style={{ backgroundColor: theme.panel }} className={`p-5 rounded-2xl border ${cardBorderClass} shadow-sm flex-col`}>
                    <View className="flex-row justify-between items-start mb-2 flex-wrap gap-2">
                        <Text style={{ color: theme.primary }} className="font-black text-base tracking-wide flex-1 min-w-[120px]" numberOfLines={1}>{item.title}</Text>
                        <View className="flex-row gap-1">
                            <Text style={{ color: theme.primary, backgroundColor: theme.primary + "12" }} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded max-w-[80px] truncate">{item.drug_class_title}</Text>
                            <Text style={{ color: theme.text, backgroundColor: "rgba(59,130,246,0.12)" }} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded max-w-[80px] truncate">{item.drug_sub_class_title}</Text>
                        </View>
                    </View>
                    <Text style={{ color: theme.textDark }} className="text-xs font-medium mb-4 line-clamp-2 leading-relaxed" numberOfLines={2}>{item.description}</Text>
                    <View className="flex-row items-center gap-x-3 w-full">
                        <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-70"><Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Edit</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-80"><Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Inspect</Text></TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
