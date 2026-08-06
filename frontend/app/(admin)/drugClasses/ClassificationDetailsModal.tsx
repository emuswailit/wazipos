import { Modal, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { ClassificationItem } from "./index";

interface ClassificationDetailsModalProps {
    routeItem: ClassificationItem | null;
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
}

export default function ClassificationDetailsModal({ routeItem, onClose, theme, formatDateHandler }: ClassificationDetailsModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    return (
        <Modal visible={!!routeItem} transparent={false} animationType="fade" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm z-50">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">Class Ledger</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black tracking-tight">Classification Profile Spec</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20 transition-all">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Close View</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto flex-col gap-y-6">

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Classification Identity Name</Text>
                            <Text style={{ color: theme.primary }} className="text-xl font-black text-left">{routeItem?.title}</Text>
                        </View>

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm w-full flex-row justify-between gap-4 flex-wrap">
                            <View className="items-start min-w-[140px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Mechanism System Category</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-extrabold uppercase mt-2 tracking-wide">{routeItem?.category}</Text>
                            </View>
                            <View className="items-start min-w-[120px]">
                                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Target Cluster Base</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-black bg-slate-500/10 px-3 py-1 rounded-lg mt-1 uppercase tracking-wider">{routeItem?.target_class}</Text>
                            </View>
                        </View>

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-2">Pharmacological Mechanism & Guidelines</Text>
                            <Text style={{ color: theme.text }} className="text-sm font-medium leading-relaxed text-left w-full">
                                {routeItem?.description || "No customized pharmacology text strings logged for this reference item node."}
                            </Text>
                        </View>

                        <View style={{ backgroundColor: theme.panel, borderColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="p-6 rounded-2xl border shadow-sm items-start w-full flex-col gap-y-3">
                            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider border-b border-slate-700/10 pb-2 w-full text-left">Record Attributes</Text>

                            <View className="w-full items-start">
                                <Text style={{ color: theme.textDark }} className="text-xs font-bold mt-1">Classification Primary Key (UUID)</Text>
                                <Text style={{ color: theme.text }} className="text-xs font-mono select-all bg-slate-500/10 px-2.5 py-1 rounded w-full text-left mt-1">{routeItem?.id}</Text>
                            </View>

                            <View style={{ borderTopColor: theme.background === "#f8fafc" ? "#f1f5f9" : "#1e293b" }} className="w-full flex-row justify-between items-center pt-4 border-t mt-3 flex-wrap gap-2">
                                <View className="items-start">
                                    <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black">Logged Date</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-semibold mt-0.5">{routeItem ? formatDateHandler(routeItem.created) : "N/A"}</Text>
                                </View>
                                <View className="items-end">
                                    <Text style={{ color: theme.textDark }} className="text-[9px] uppercase font-black">Server Sync Timestamp</Text>
                                    <Text style={{ color: theme.text }} className="text-xs font-semibold mt-0.5">{routeItem ? formatDateHandler(routeItem.updated) : "N/A"}</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="w-full py-3.5 rounded-xl items-center justify-center shadow-sm active:opacity-90 transition-all mt-4">
                            <Text className="text-white font-black text-sm uppercase tracking-wider">Go Back</Text>
                        </TouchableOpacity>

                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
