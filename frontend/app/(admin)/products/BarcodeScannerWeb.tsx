import { View } from "react-native";

interface WebScannerProps {
    visible: boolean;
    onClose: () => void;
    onScanSuccess: (text: string) => void;
    theme: any;
}

// 🍏 Native Fallback: Empty mock placeholder to ensure compiling pass matches cleanly on native
export default function BarcodeScannerWeb({ visible }: WebScannerProps) {
    return <View />;
}
