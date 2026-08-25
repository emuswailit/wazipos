import { Camera, CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProductCatalogItem } from '../../../app/(wholesalers)/newWholesaleOrder/types';

let AudioModule: any = null;
try {
    if (Platform.OS !== 'web') {
        AudioModule = require('expo-av').Audio;
    }
} catch (e) {
    console.warn('Native audio modules unmapped in current sandbox engine layer.');
}

interface UnifiedBarcodeScannerProps {
    theme: any;
    isOpen: boolean;
    productsCatalog: ProductCatalogItem[];
    onScanSuccess: (scannedBarcode: string) => void;
    onCloseScanner: () => void;
}

export default function UnifiedBarcodeScanner({ theme, isOpen, productsCatalog, onScanSuccess, onCloseScanner }: UnifiedBarcodeScannerProps) {
    const [hasMobilePermission, setHasMobilePermission] = useState<boolean | null>(null);
    const [manualCodeEntry, setManualCodeEntry] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<any>(null);
    const [isFlashOn, setIsFlashOn] = useState(false);
    const laserAnimY = useRef(new Animated.Value(0)).current;
    const webVideoRef = useRef<any>(null);
    const webStreamRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen) {
            const runLaserAnimation = () => {
                laserAnimY.setValue(0);
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(laserAnimY, { toValue: 240, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
                        Animated.timing(laserAnimY, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' })
                    ])
                ).start();
            };
            runLaserAnimation();
            if (Platform.OS !== 'web') {
                (async () => {
                    const { status } = await Camera.requestCameraPermissionsAsync();
                    setHasMobilePermission(status === 'granted');
                })();
            } else {
                setTimeout(async () => {
                    try {
                        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                            webStreamRef.current = stream;
                            if (webVideoRef.current) {
                                webVideoRef.current.srcObject = stream;
                                webVideoRef.current.play();
                            }
                        } else {
                            showToastNotification('Web camera interface capture devices are missing or blocked.');
                        }
                    } catch (err) {
                        console.error('Web Camera access error logs:', err);
                    }
                }, 100);
            }
        } else {
            cleanUpCameraTracks();
        }
        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, [isOpen]);

    const showToastNotification = (msg: string) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToastMessage(msg);
        toastTimeoutRef.current = setTimeout(() => { setToastMessage(null); }, 3000);
    };

    const playSuccessBeepSound = async () => {
        try {
            if (Platform.OS === 'web' || !AudioModule) {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.10);
                return;
            }
            const soundInstance = new AudioModule.Sound();
            await soundInstance.loadAsync(require('./assets/beep.mp3'), { shouldPlay: true });
            soundInstance.setOnPlaybackStatusUpdate((status: any) => {
                if (status.isLoaded && status.didJustFinish) {
                    soundInstance.unloadAsync();
                }
            });
        } catch (soundErr) {
            console.warn('Audio layer soft fallback catch layer executed:', soundErr);
        }
    };

    const validateAndProcessBarcode = (targetBarcode: string) => {
        const refinedCode = targetBarcode.trim();
        if (!refinedCode) return false;
        const itemCatalogMatch = productsCatalog.find(p => p.bar_code === refinedCode);
        if (!itemCatalogMatch) {
            showToastNotification(`SKU Mismatch: "${refinedCode}" does not exist in the inventory catalog.`);
            return false;
        }
        setToastMessage(null);
        playSuccessBeepSound();
        onScanSuccess(refinedCode);
        return true;
    };

    const handleBarcodeSubmit = () => {
        const successfullyRegistered = validateAndProcessBarcode(manualCodeEntry);
        if (successfullyRegistered) {
            setManualCodeEntry('');
        }
    };

    const handleMobileBarcodeScanned = ({ data }: { data: string }) => {
        if (data) {
            validateAndProcessBarcode(data);
        }
    };

    const cleanUpCameraTracks = () => {
        if (Platform.OS === 'web' && webStreamRef.current) {
            webStreamRef.current.getTracks().forEach((track: any) => track.stop());
            webStreamRef.current = null;
        }
        setManualCodeEntry('');
        setToastMessage(null);
    };

    if (!isOpen) return null;

    return (
        <View style={styles.absoluteTransparencyHUD} className="mb-6 p-5 rounded-2xl justify-center items-center w-full border-2 shadow-xl">
            <View className="w-full items-center mb-4 p-2 rounded-xl" style={{ backgroundColor: 'rgba(9, 9, 11, 0.85)' }}>
                <Text className="text-sm font-mono font-black tracking-wider uppercase animate-pulse" style={{ color: theme.primary }}>📷 PERSISTENT VIEWFINDER ACTIVE</Text>
                <Text className="text-xxs font-mono text-center mt-1 max-w-sm text-zinc-300">The window stays open continuously. Point device at tags and process multiple items cleanly.</Text>
            </View>
            <View style={styles.absoluteTransparencyHUD} className="w-full max-w-[440px] relative items-center justify-center rounded-2xl border-2 h-64 shadow-xl overflow-hidden">
                {Platform.OS === 'web' ? (
                    <video ref={webVideoRef} style={{ width: '100%', height: '100%', backgroundColor: 'transparent', objectFit: 'cover' }} muted playsInline />
                ) : (
                    hasMobilePermission && (
                        <CameraView facing="back" enableTorch={isFlashOn} onBarcodeScanned={handleMobileBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }} style={StyleSheet.absoluteFillObject} />
                    )
                )}
                <Animated.View
                    style={{
                        position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: theme.primary,
                        transform: [{ translateY: laserAnimY }], shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
                    }}
                />
                <View className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2" style={{ borderColor: theme.primary }} />
                <View className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2" style={{ borderColor: theme.primary }} />
                <View className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2" style={{ borderColor: theme.primary }} />
                <View className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2" style={{ borderColor: theme.primary }} />
                {Platform.OS !== 'web' && (
                    <TouchableOpacity onPress={() => setIsFlashOn(prev => !prev)} className={`absolute bottom-4 px-3 py-1.5 rounded-full border border-white flex-row items-center ${isFlashOn ? 'bg-amber-500' : 'bg-black/60'}`}>
                        <Text className="text-white text-xxs font-mono font-bold">{isFlashOn ? '⚡ FLASH ON' : '💡 FLASH OFF'}</Text>
                    </TouchableOpacity>
                )}
            </View>
            {toastMessage && (
                <View className="mt-4 p-3 border-2 rounded-xl w-full max-w-[440px] shadow-lg bg-red-950/90 border-red-800">
                    <Text className="text-red-200 text-xs font-mono font-bold text-center">⚠️ {toastMessage}</Text>
                </View>
            )}
            <View className="flex-row items-center mt-4 w-full max-w-[440px] rounded-xl overflow-hidden border h-12 px-1 bg-zinc-900 border-zinc-800">
                <TextInput className="flex-1 h-full px-3 text-sm font-semibold text-white bg-transparent" placeholder="Scan barcode tag or type digits..." placeholderTextColor="#a1a1aa" value={manualCodeEntry} onChangeText={(txt) => { setManualCodeEntry(txt); if (toastMessage) setToastMessage(null); }} onSubmitEditing={handleBarcodeSubmit} keyboardType="numeric" />
                <TouchableOpacity className="h-10 px-4 rounded-lg justify-center items-center" style={{ backgroundColor: theme.primary }} onPress={handleBarcodeSubmit}>
                    <Text className="text-white font-bold text-xs uppercase tracking-wide">Register</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity className="mt-4 px-6 py-3 rounded-xl border w-full max-w-[440px] items-center justify-center shadow-sm bg-zinc-900 border-zinc-800" onPress={onCloseScanner} activeOpacity={0.7}>
                <Text className="font-extrabold text-xs uppercase tracking-widest text-red-400">Complete Scanning ✓</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    absoluteTransparencyHUD: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        overflow: 'hidden'
    }
});
