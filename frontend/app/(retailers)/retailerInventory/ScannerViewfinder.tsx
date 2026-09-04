import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';

// Dynamic library imports to prevent cross-platform compilation/bundling errors
let CameraView: any = null;
let Html5Qrcode: any = null;

if (Platform.OS !== 'web') {
    try {
        CameraView = require('expo-camera').CameraView;
    } catch (e) {
        console.warn("expo-camera failed to load on native.", e);
    }
} else {
    try {
        Html5Qrcode = require('html5-qrcode').Html5Qrcode;
    } catch (e) {
        console.warn("html5-qrcode failed to load on web layout rows.", e);
    }
}

interface ScannerViewfinderProps {
    isScanning: boolean;
    hasPermission: boolean | null;
    scanned: boolean;
    onBarcodeScanned: (event: { type: string; data: string }) => void;
    onCancel: () => void;
}

export default function ScannerViewfinder({
    isScanning,
    hasPermission,
    scanned,
    onBarcodeScanned,
    onCancel
}: ScannerViewfinderProps) {
    const html5QrcodeScannerRef = useRef<any>(null);
    const elementId = "web-html5-barcode-scanner-viewport";

    // --- 🌐 WEB EXCLUSIVE: HTML5-QRCODE LIFECYCLE MANAGEMENT ---
    useEffect(() => {
        if (Platform.OS !== 'web' || !isScanning || !Html5Qrcode) return;

        // Small delay ensuring React completely commits the target div to the DOM
        const timer = setTimeout(() => {
            try {
                const scannerInstance = new Html5Qrcode(elementId);
                html5QrcodeScannerRef.current = scannerInstance;

                scannerInstance.start(
                    { facingMode: "environment" }, // Prioritise mobile back cameras
                    {
                        fps: 10,
                        qrbox: (width: number, height: number) => ({
                            width: Math.min(width * 0.8, 300),
                            height: Math.min(height * 0.4, 150)
                        }),
                        aspectRatio: 1.777778
                    },
                    (decodedText: string, decodedResult: any) => {
                        // Success handler callback mapping
                        onBarcodeScanned({ type: decodedResult?.result?.format?.formatName || 'UNKNOWN', data: decodedText });
                        stopWebScanner();
                    },
                    (errorMessage: string) => {
                        // Silent error handler monitoring camera feed movement noise frames
                    }
                ).catch((err: any) => {
                    console.error("HTML5 Barcode initialization failed:", err);
                });
            } catch (error) {
                console.error("Failed to build HTML5-Qrcode instances:", error);
            }
        }, 150);

        return () => {
            stopWebScanner();
            clearTimeout(timer);
        };
    }, [isScanning]);

    const stopWebScanner = () => {
        if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
            html5QrcodeScannerRef.current.stop()
                .then(() => {
                    html5QrcodeScannerRef.current.clear();
                })
                .catch((err: any) => console.warn("Failed to stop web camera cleanly:", err));
        }
    };

    if (!isScanning) return null;

    return (
        <View className="w-full h-64 rounded-2xl overflow-hidden mb-4 relative bg-black justify-center items-center">

            {/* ─── Web Implementation (HTML5 DOM Target Element Injection) ─── */}
            {Platform.OS === 'web' ? (
                <View className="w-full h-full justify-center items-center relative">
                    {/* html5-qrcode targets and mounts directly onto raw standard HTML elements */}
                    <div
                        id={elementId}
                        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                    />
                    <View className="absolute pointer-events-none border-2 border-dashed border-blue-400 w-64 h-32 rounded-lg opacity-60" />
                </View>
            ) : (
                /* ─── Native App Implementation (Expo Viewfinder Component) ─── */
                <>
                    {hasPermission === null && <ActivityIndicator size="small" color="#ffffff" />}
                    {hasPermission === false && (
                        <Text className="text-white text-xs p-4 text-center font-bold">
                            Camera entry access denied. Check system configurations.
                        </Text>
                    )}
                    {hasPermission && CameraView && (
                        <CameraView
                            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
                            barcodeScannerSettings={{
                                barcodeTypes: ["ean13", "ean8", "code128", "upc_a"],
                            }}
                            className="absolute inset-0"
                        />
                    )}
                </>
            )}

            {/* Dismiss Trigger Anchor */}
            <TouchableOpacity
                onPress={() => {
                    if (Platform.OS === 'web') stopWebScanner();
                    onCancel();
                }}
                className="absolute bottom-3 bg-red-600 px-4 py-1.5 rounded-lg shadow-sm z-20"
            >
                <Text className="text-white text-xs font-black">Cancel Scan</Text>
            </TouchableOpacity>
        </View>
    );
}
