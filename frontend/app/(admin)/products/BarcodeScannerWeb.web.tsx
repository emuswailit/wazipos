import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface WebScannerProps {
    visible: boolean;
    onClose: () => void;
    onScanSuccess: (text: string) => void;
    theme: any;
}

export default function BarcodeScannerWeb({ visible, onClose, onScanSuccess, theme }: WebScannerProps) {
    const [scanner, setScanner] = useState<Html5Qrcode | null>(null);

    useEffect(() => {
        if (!visible) return;

        const scannerInstance = new Html5Qrcode("web-scanner-element");
        setScanner(scannerInstance);

        scannerInstance.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (decodedText) => {
                onScanSuccess(decodedText);
                scannerInstance.stop().then(() => onClose());
            },
            () => { }
        ).catch(err => console.error("Web camera initialization error:", err));

        return () => {
            if (scannerInstance && scannerInstance.isScanning) {
                scannerInstance.stop().catch(() => { });
            }
        };
    }, [visible]);

    return (
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
            <View style={{ backgroundColor: "#000000" }} className="flex-1 flex-col relative justify-end pb-12">
                <View className="absolute top-12 left-6 right-6 z-50 flex-row justify-between items-center">
                    <Text className="text-white font-black text-sm uppercase tracking-wider">Align Barcode Laser Line</Text>
                    <TouchableOpacity onPress={onClose} className="bg-white/10 px-4 py-2 rounded-xl active:bg-white/20">
                        <Text className="text-white font-bold text-xs">✕ Close</Text>
                    </TouchableOpacity>
                </View>
                <View className="flex-1 w-full justify-center items-center">
                    <div id="web-scanner-element" style={{ width: "100%", height: "100%", maxHeight: "500px" }} />
                </View>
                <View className="absolute top-1/2 left-1/2 -mt-[50px] -ml-[140px] w-[280px] h-[100px] border-2 border-dashed border-emerald-500 rounded-xl justify-center items-center pointer-events-none">
                    <View style={{ backgroundColor: theme.primary }} className="w-[260px] h-[2px] opacity-80" />
                </View>
            </View>
        </Modal>
    );
}
