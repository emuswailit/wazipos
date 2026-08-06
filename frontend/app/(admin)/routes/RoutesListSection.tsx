import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface DrugRouteItem {
    id: string;
    title: string;
    description: string;
    owner: string;
    entity: string;
    created: string;
    updated: string;
}

interface RoutesListSectionProps {
    routes: DrugRouteItem[];
    isLargeScreen: boolean;
    theme: any;
    cardBorderClass: string;
    formatDateHandler: (dateString: string) => string;
    onOpenDetailsTrigger: (item: DrugRouteItem) => void;
    onOpenEditTrigger: (item: DrugRouteItem) => void;
}

export default function RoutesListSection({
    routes,
    isLargeScreen,
    theme,
    cardBorderClass,
    formatDateHandler,
    onOpenDetailsTrigger,
    onOpenEditTrigger,
}: RoutesListSectionProps) {

    if (isLargeScreen) {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerClassName="w-full">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="flex-col rounded-2xl border shadow-sm min-w-[850px] overflow-hidden w-full">
                    <View style={{ backgroundColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#0f172a" }} className="flex-row items-center px-6 py-4 border-b border-slate-700/30">
                        <Text style={{ color: theme.textDark }} className="w-[180px] font-black text-xs uppercase tracking-wider">Route</Text>
                        <Text style={{ color: theme.textDark }} className="flex-1 font-black text-xs uppercase tracking-wider px-2">Description Summary</Text>
                        <Text style={{ color: theme.textDark }} className="w-[140px] font-black text-xs uppercase tracking-wider text-center">Created Date</Text>
                        <Text style={{ color: theme.textDark }} className="w-[160px] font-black text-xs uppercase tracking-wider text-right">Actions</Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {routes.map((item) => (
                            <View key={item.id} style={{ borderColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#1e293b" }} className="flex-row items-center px-6 py-4 border-b web:hover:bg-slate-500/5">
                                <Text style={{ color: theme.primary }} className="w-[180px] font-black text-sm tracking-wide">{item.title}</Text>
                                <Text style={{ color: theme.text }} className="flex-1 text-xs font-medium px-2 truncate" numberOfLines={1}>{item.description}</Text>
                                <Text style={{ color: theme.textDark }} className="w-[140px] text-xs font-semibold text-center">{formatDateHandler(item.created)}</Text>
                                <View className="w-[160px] flex-row gap-x-2 justify-end items-center">
                                    <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="py-1 px-2.5 border rounded-lg active:bg-slate-100 dark:active:bg-slate-800 transition-all"><Text style={{ color: theme.text }} className="text-xs font-semibold">Edit</Text></TouchableOpacity>
                                    <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#334155" }} className="py-1 px-2.5 border rounded-lg transition-all"><Text style={{ color: theme.primary }} className="text-xs font-bold">Details</Text></TouchableOpacity>
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
            {routes.map((item) => (
                <View key={item.id} style={{ backgroundColor: theme.panel }} className={`p-5 rounded-2xl border ${cardBorderClass} shadow-sm flex-col`}>
                    <Text style={{ color: theme.primary }} className="font-black text-base tracking-wide mb-1" numberOfLines={1}>{item.title}</Text>
                    <Text style={{ color: theme.textDark }} className="text-xs font-medium mb-4 line-clamp-2 leading-relaxed" numberOfLines={2}>{item.description}</Text>
                    <View className="flex-row items-center gap-x-3 w-full">
                        <TouchableOpacity onPress={() => onOpenEditTrigger(item)} style={{ borderColor: theme.border }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-70"><Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Edit</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => onOpenDetailsTrigger(item)} style={{ backgroundColor: theme.background, borderColor: theme.background === "#f8fafc" ? "#cbd5e1" : "#334155" }} className="flex-1 py-2.5 rounded-xl border items-center justify-center active:opacity-80"><Text style={{ color: theme.text }} className="text-xs font-black uppercase tracking-wider">Inspect</Text></TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
