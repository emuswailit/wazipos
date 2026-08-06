import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BarcodeScannerWeb from "./BarcodeScannerWeb";

interface BarcodeScannerTriggerProps {
    theme: any;
    onScanSuccess: (scannedText: string) => void;
}

export default function BarcodeScannerTrigger({ theme, onScanSuccess }: BarcodeScannerTriggerProps) {
    const [modalVisible, setModalOpen] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();

    const handleOpenScanner = async () => {
        if (Platform.OS !== "web") {
            const status = await requestPermission();
            if (!status.granted) return;
        }
        setModalOpen(true);
    };

    const handleNativeScan = ({ data }: { data: string }) => {
        onScanSuccess(data);
        setModalOpen(false);
    };

    if (Platform.OS === "web") {
        return (
            // 🌟 FIXED: Added block md:hidden to completely hide this workflow layout block on desktops
            <View className="w-full mt-1 mb-2 block md:hidden">
                <TouchableOpacity onPress={handleOpenScanner} style={{ backgroundColor: theme.primary }} className="w-full h-11 rounded-xl items-center justify-center flex-row shadow-sm active:opacity-90">
                    <Text className="text-white font-black text-xs uppercase tracking-wider">📷 Tap to Scan Barcode SKU</Text>
                </TouchableOpacity>
                <BarcodeScannerWeb visible={modalVisible} onClose={() => setModalOpen(false)} onScanSuccess={onScanSuccess} theme={theme} />
            </View>
        );
    }

    return (
        // 🌟 FIXED: Added block md:hidden for native layout parity checks
        <View className="w-full mt-1 mb-2 block md:hidden">
            <TouchableOpacity onPress={handleOpenScanner} style={{ backgroundColor: theme.primary }} className="w-full h-11 rounded-xl items-center justify-center flex-row shadow-sm active:opacity-90">
                <Text className="text-white font-black text-xs uppercase tracking-wider">📷 Tap to Scan Barcode SKU</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent={false} animationType="slide" onRequestClose={() => setModalOpen(false)}>
                <View style={{ backgroundColor: "#000000" }} className="flex-1 flex-col relative justify-end pb-12">
                    <View className="absolute top-12 left-6 right-6 z-50 flex-row justify-between items-center">
                        <Text className="text-white font-black text-sm uppercase tracking-wider">Align Barcode Laser Line</Text>
                        <TouchableOpacity onPress={() => setModalOpen(false)} className="bg-white/10 px-4 py-2 rounded-xl active:bg-white/20">
                            <Text className="text-white font-bold text-xs">✕ Close</Text>
                        </TouchableOpacity>
                    </View>

                    <CameraView
                        style={StyleSheet.absoluteFillObject}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "code128", "code39"] }}
                        onBarcodeScanned={handleNativeScan}
                    />

                    <View className="absolute top-1/2 left-1/2 -mt-[50px] -ml-[140px] w-[280px] h-[100px] border-2 border-dashed border-emerald-500 rounded-xl justify-center items-center pointer-events-none">
                        <View style={{ backgroundColor: theme.primary }} className="w-[260px] h-[2px] opacity-80" />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
