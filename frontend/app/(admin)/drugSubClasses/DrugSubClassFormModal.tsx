import { Modal, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import DrugSubClassForm from "./DrugSubClassForm";

interface DrugSubClassFormModalProps {
    visible: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    theme: any;
    isSubmittingRemote: boolean;
    onSubmitTrigger: (values: any, formikHelpers: any) => Promise<void>;
    initialData?: any;
    remoteErrors?: any;
}

export default function DrugSubClassFormModal({ visible, onClose, isDarkMode, theme, isSubmittingRemote, onSubmitTrigger, initialData }: DrugSubClassFormModalProps) {
    const { height: screenHeight } = useWindowDimensions();

    return (
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
            <View style={{ backgroundColor: theme.background, height: screenHeight }} className="flex-1 flex-col w-full">

                <View style={{ backgroundColor: theme.panel, borderBottomColor: theme.background === "#f8fafc" ? "#e2e8f0" : "#1e293b" }} className="h-16 w-full border-b px-6 flex-row justify-between items-center shadow-sm">
                    <View className="flex-row items-center gap-x-3">
                        <View style={{ backgroundColor: theme.primary + "15" }} className="px-2.5 py-1 rounded-md">
                            <Text style={{ color: theme.primary }} className="text-[10px] font-black tracking-widest uppercase">System Ledger</Text>
                        </View>
                        <Text style={{ color: theme.text }} className="text-base font-black">
                            {initialData ? "Modify Drug Subclass" : "Create Drug Subclass"}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-red-500/10 active:bg-red-500/20">
                        <Text className="text-red-500 font-bold text-xs px-2">✕ Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }} className="flex-1 w-full px-6 py-6">
                    <View className="w-full max-w-2xl mx-auto">
                        <DrugSubClassForm
                            theme={theme}
                            isDarkMode={isDarkMode}
                            isSubmittingRemote={isSubmittingRemote}
                            onSubmitTrigger={onSubmitTrigger}
                            initialData={initialData}
                            onCancel={onClose}
                        />
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
