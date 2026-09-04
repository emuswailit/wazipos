import React, { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import LogisticsFields from './LogisticsFields';
import PricingFields from './PricingFields';
import ScannerViewfinder from './ScannerViewfinder';

let Camera: any = null;
if (Platform.OS !== 'web') {
    try {
        Camera = require('expo-camera').Camera;
    } catch (e) { }
}

interface FormFieldsProps {
    formik: any;
    marginMetrics: any;
    isDarkMode: boolean;
    theme: any;
}

export default function FormFields({ formik, marginMetrics, isDarkMode, theme }: FormFieldsProps) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [isScanning, setIsScanning] = useState(false);

    const startScanningPipeline = async () => {
        setIsScanning(true);
        setScanned(false);

        // Skip native permission request on web since HTML5-QRCode handles prompting via the browser natively
        if (Platform.OS === 'web') return;

        if (Camera) {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
        }
    };

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        setScanned(true);
        setIsScanning(false);
        formik.setFieldValue('bar_code', data);
    };

    return (
        <View className="gap-4">
            <ScannerViewfinder
                isScanning={isScanning}
                hasPermission={hasPermission}
                scanned={scanned}
                onBarcodeScanned={handleBarcodeScanned}
                onCancel={() => setIsScanning(false)}
            />

            <View className="gap-1">
                <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Product UID Nodes *</Text>
                <TextInput
                    className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                    style={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                        borderColor: formik.errors.product && formik.touched.product ? '#ef4444' : (isDarkMode ? '#475569' : '#cbd5e1'),
                        color: theme.text
                    }}
                    placeholder="Enter Product ID node reference..."
                    placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                    value={formik.values.product}
                    onChangeText={formik.handleChange('product')}
                />
            </View>

            <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Quantity *</Text>
                    <TextInput
                        keyboardType="numeric"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{
                            backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                            borderColor: formik.errors.unit_quantity && formik.touched.unit_quantity ? '#ef4444' : (isDarkMode ? '#475569' : '#cbd5e1'),
                            color: theme.text
                        }}
                        placeholder="0"
                        value={formik.values.unit_quantity}
                        onChangeText={formik.handleChange('unit_quantity')}
                    />
                </View>

                <View className="flex-1 gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textDark }}>Buying Unit Price</Text>
                    <TextInput
                        keyboardType="numeric"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: isDarkMode ? '#475569' : '#cbd5e1', color: theme.text }}
                        placeholder="0.00"
                        value={formik.values.pack_buying_price}
                        onChangeText={formik.handleChange('pack_buying_price')}
                    />
                </View>
            </View>

            <PricingFields formik={formik} marginMetrics={marginMetrics} isDarkMode={isDarkMode} theme={theme} />
            <LogisticsFields formik={formik} onScanTrigger={startScanningPipeline} isDarkMode={isDarkMode} theme={theme} />
        </View>
    );
}
