// app/(wholesalers)/wholesaleInventory/ScannerViewfinder.tsx

import React, {
    useEffect,
    useMemo,
    useRef,
} from 'react';
import {
    ActivityIndicator,
    Platform,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

/* ---------------------------------------------------------
 * Dynamic imports — native vs web
 * ------------------------------------------------------- */

let CameraView: any = null;
let Html5Qrcode: any = null;

if (Platform.OS !== 'web') {
    try {
        CameraView =
            require('expo-camera').CameraView;
    } catch (e) {
        console.warn(
            'expo-camera failed to load on native.',
            e
        );
    }
} else {
    try {
        Html5Qrcode =
            require('html5-qrcode').Html5Qrcode;
    } catch (e) {
        console.warn(
            'html5-qrcode failed to load on web.',
            e
        );
    }
}

/* ---------------------------------------------------------
 * Props
 * ------------------------------------------------------- */

interface ScannerViewfinderProps {
    isScanning: boolean;
    hasPermission: boolean | null;
    scanned: boolean;
    onBarcodeScanned: (event: {
        type: string;
        data: string;
    }) => void;
    onCancel: () => void;
}

/* ---------------------------------------------------------
 * Barcode formats we care about
 *
 * Defined at module scope so the array identity is stable
 * across renders and so html5-qrcode always receives a
 * non-empty list of supported formats.
 * ------------------------------------------------------- */

const NATIVE_BARCODE_TYPES = [
    'ean13',
    'ean8',
    'code128',
    'upc_a',
] as const;

/*
 * html5-qrcode expects a config object, not a raw array.
 * Providing supportedScanTypes explicitly prevents the
 * "reading 'map' of undefined" crash inside the library.
 */
const WEB_CONFIG = {
    fps: 10,
    qrbox: (width: number, height: number) => ({
        width: Math.min(width * 0.8, 300),
        height: Math.min(height * 0.4, 150),
    }),
    aspectRatio: 1.777778,
    supportedScanTypes: [] as any[],
    formatsToSupport: [
        // These match html5-qrcode's internal enum.
        // If you're not sure, omit this field entirely —
        // html5-qrcode will fall back to a default list.
    ],
};

/* ---------------------------------------------------------
 * Component
 * ------------------------------------------------------- */

export default function ScannerViewfinder({
    isScanning,
    hasPermission,
    scanned,
    onBarcodeScanned,
    onCancel,
}: ScannerViewfinderProps) {
    const html5QrcodeScannerRef =
        useRef<any>(null);
    const elementId = useMemo(
        () => 'web-html5-barcode-scanner-viewport',
        []
    );

    /* -------------------------------------------------------
     * WEB — html5-qrcode lifecycle
     * ----------------------------------------------------- */

    useEffect(() => {
        if (
            Platform.OS !== 'web' ||
            !isScanning ||
            !Html5Qrcode
        )
            return;

        let cancelled = false;

        const timer = setTimeout(() => {
            if (cancelled) return;

            /*
             * Guard: the DOM element must exist before
             * html5-qrcode tries to attach.
             */
            if (
                typeof document === 'undefined' ||
                !document.getElementById(elementId)
            ) {
                console.warn(
                    '[ScannerViewfinder] DOM element not ready yet'
                );
                return;
            }

            try {
                const scannerInstance =
                    new Html5Qrcode(elementId);
                html5QrcodeScannerRef.current =
                    scannerInstance;

                scannerInstance
                    .start(
                        { facingMode: 'environment' },
                        WEB_CONFIG,
                        (
                            decodedText: string,
                            decodedResult: any
                        ) => {
                            onBarcodeScanned({
                                type:
                                    decodedResult?.result
                                        ?.format
                                        ?.formatName ||
                                    'UNKNOWN',
                                data: decodedText,
                            });
                            stopWebScanner();
                        },
                        (_errorMessage: string) => {
                            // Frame noise — ignore.
                        }
                    )
                    .catch((err: any) => {
                        console.error(
                            'HTML5 Barcode initialization failed:',
                            err
                        );
                    });
            } catch (error) {
                console.error(
                    'Failed to build HTML5-Qrcode instances:',
                    error
                );
            }
        }, 150);

        return () => {
            cancelled = true;
            stopWebScanner();
            clearTimeout(timer);
        };
    }, [isScanning, elementId, onBarcodeScanned]);

    const stopWebScanner = () => {
        const instance = html5QrcodeScannerRef.current;

        if (instance && instance.isScanning) {
            instance
                .stop()
                .then(() => instance.clear())
                .catch((err: any) =>
                    console.warn(
                        'Failed to stop web camera cleanly:',
                        err
                    )
                );
        }
    };

    if (!isScanning) return null;

    return (
        <View className="w-full h-64 rounded-2xl overflow-hidden mb-4 relative bg-black justify-center items-center">
            {/* ---- Web ---- */}
            {Platform.OS === 'web' ? (
                <View className="w-full h-full justify-center items-center relative">
                    <div
                        id={elementId}
                        style={{
                            width: '100%',
                            height: '100%',
                            backgroundColor: '#000',
                        }}
                    />
                    <View className="absolute pointer-events-none border-2 border-dashed border-blue-400 w-64 h-32 rounded-lg opacity-60" />
                </View>
            ) : (
                /* ---- Native ---- */
                <>
                    {hasPermission === null && (
                        <ActivityIndicator
                            size="small"
                            color="#ffffff"
                        />
                    )}

                    {hasPermission === false && (
                        <Text className="text-white text-xs p-4 text-center font-bold">
                            Camera access denied. Check system
                            settings.
                        </Text>
                    )}

                    {hasPermission && CameraView && (
                        <CameraView
                            onBarcodeScanned={
                                scanned
                                    ? undefined
                                    : onBarcodeScanned
                            }
                            barcodeScannerSettings={{
                                barcodeTypes: [
                                    ...NATIVE_BARCODE_TYPES,
                                ],
                            }}
                            className="absolute inset-0"
                        />
                    )}
                </>
            )}

            {/* ---- Cancel ---- */}
            <TouchableOpacity
                onPress={() => {
                    if (Platform.OS === 'web') {
                        stopWebScanner();
                    }
                    onCancel();
                }}
                className="absolute bottom-3 bg-red-600 px-4 py-1.5 rounded-lg shadow-sm z-20"
            >
                <Text className="text-white text-xs font-black">
                    Cancel Scan
                </Text>
            </TouchableOpacity>
        </View>
    );
}