import { Modal, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

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

interface FrequencyDetailsModalProps {
    routeItem: FrequencyItem | null;
    onClose: () => void;
    theme: {
        background: string;
        panel: string;
        primary: string;
        text: string;
        textDark: string;
        border: string;
    };
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: FrequencyItem) => void;
}

export default function FrequencyDetailsModal({ routeItem, onClose, theme, formatDateHandler, onOpenEditTrigger }: FrequencyDetailsModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    const handleEditAction = () => {
        if (routeItem) {
            onClose();
            onOpenEditTrigger(routeItem);
        }
    };

    return (
        <Modal visible={!!routeItem} transparent={false} animationType="fade" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm z-50">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">Frequency Profile</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black tracking-tight">Frequency Specifications</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20 web:hover:bg-red-500/20 transition-all">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Close View</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto flex-col gap-y-6">

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-4">
                            <View className="w-full">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Frequency Interval Title</Text>
                                <Text style={{ color: theme.primary }} className="text-xl font-black text-left">{routeItem?.title}</Text>
                            </View>

                            <View style={{ borderTopColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#1e293b" }} className="w-full flex-row justify-between items-center pt-3 border-t flex-wrap gap-2">
                                <View className="items-start">
                                    <Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Initialized On</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-semibold mt-0.5">{routeItem ? formatDateHandler(routeItem.created) : "N/A"}</Text>
                                </View>
                                <View className="items-end web:items-start">
                                    <Text style={{ color: theme.textDark }} className="text-[9px] font-bold uppercase tracking-wider">Last Sync</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-semibold mt-0.5">{routeItem ? formatDateHandler(routeItem.updated) : "N/A"}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm w-full flex-row justify-between gap-4 flex-wrap">
                            <View className="items-start min-w-[100px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Prescription SIG Code</Text>
                                <Text style={{ color: theme.text }} className="text-sm font-black bg-slate-500/10 px-3 py-1 rounded-lg mt-1">{routeItem?.abbreviation}</Text>
                            </View>
                            <View className="items-start min-w-[140px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Latin Medical Term</Text>
                                <Text style={{ color: theme.text }} className="text-sm font-extrabold italic mt-2">{routeItem?.latin}</Text>
                            </View>
                            <View className="items-end web:items-start min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Daily Frequency Value</Text>
                                <Text style={{ color: theme.text }} className="text-sm font-black mt-2">{routeItem?.numerical}x per day</Text>
                            </View>
                        </View>

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Clinical Indication Summary</Text>
                            <Text style={{ color: theme.text }} className="text-sm font-medium leading-relaxed text-left w-full">
                                {routeItem?.description || "No supplemental clinical guidelines submitted for this interval node parameter."}
                            </Text>
                        </View>

                        <View className="flex-row items-center gap-x-4 mt-4 w-full">
                            <TouchableOpacity onPress={handleEditAction} style={{ borderColor: theme.border }} className="flex-1 h-12 rounded-xl border items-center justify-center bg-slate-50 dark:bg-slate-800 active:opacity-70">
                                <Text style={{ color: theme.text }} className="font-black text-xs uppercase tracking-wider">Edit Parameters</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-sm active:opacity-90">
                                <Text className="text-white font-black text-xs uppercase tracking-wider">Go Back</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
