import { Modal, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

interface DrugRouteItem {
    id: string;
    title: string;
    description: string;
    owner: string;
    entity: string;
    created: string;
    updated: string;
}

interface RouteDetailsModalProps {
    routeItem: DrugRouteItem | null;
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
    onOpenEditTrigger: (item: DrugRouteItem) => void;
}

export default function RouteDetailsModal({ routeItem, onClose, theme, formatDateHandler, onOpenEditTrigger }: RouteDetailsModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    const handleEditAction = () => {
        if (routeItem) {
            onClose();
            onOpenEditTrigger(routeItem);
        }
    };

    return (
        <Modal
            visible={!!routeItem}
            transparent={false}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="h-16 w-full border-b px-6 flex-row justify-between items-center z-50 shadow-sm">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">Protocol Profile</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black tracking-tight">Route Specifications</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.7} onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20 web:hover:bg-red-500/20 transition-all">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Close View</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-3xl mx-auto flex-col gap-y-6">

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-4">
                            <View className="w-full">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Route Protocol Title</Text>
                                <Text style={{ color: theme.primary }} className="text-xl font-black tracking-wide text-left">{routeItem?.title || "UNSPECIFIED PROTOCOL"}</Text>
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

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Complete Clinical Description</Text>
                            <Text style={{ color: theme.text }} className="text-sm font-medium leading-relaxed text-left w-full">{routeItem?.description || "No clinical log summaries recorded for this deployment profile node."}</Text>
                        </View>

                        <View className="flex-row items-center gap-x-4 mt-4 w-full">
                            <TouchableOpacity onPress={handleEditAction} style={{ borderColor: theme.border }} className="flex-1 h-12 rounded-xl border items-center justify-center bg-slate-50 dark:bg-slate-800 active:opacity-70">
                                <Text style={{ color: theme.text }} className="font-black text-xs uppercase tracking-wider">Edit Parameters</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-md active:opacity-90">
                                <Text className="text-white font-black text-xs uppercase tracking-wider">Return To Ledger</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
