import { useAuth } from '@/context/AuthContext';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
let CameraView: any, useCameraPermissions: any;
if (Platform.OS !== 'web') {
    try {
        const ExpoCamera = require('expo-camera');
        CameraView = ExpoCamera.CameraView;
        useCameraPermissions = ExpoCamera.useCameraPermissions;
    } catch (e) { console.error(e); }
}
interface UniversalScannerModalProps { visible: boolean; onClose: () => void; onBarcodeScanned: (barcode: string) => void; }
export const UniversalScannerModal: React.FC<UniversalScannerModalProps> = ({ visible, onClose, onBarcodeScanned }) => {
    const { theme } = useAuth();
    const html5QrCodeRef = useRef<any>(null);
    const lastScannedRef = useRef<string>('');
    const lastScanTimeRef = useRef<number>(0);
    const laserAnim = useRef(new Animated.Value(0)).current;
    const [permission, requestPermission] = useCameraPermissions ? useCameraPermissions() : [null, null];
    useEffect(() => {
        if (visible) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(laserAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
                    Animated.timing(laserAnim, { toValue: 0, duration: 2000, easing: Easing.linear, useNativeDriver: true })
                ])
            ).start();
        }
    }, [visible, laserAnim]);
    useEffect(() => {
        if (Platform.OS === 'web' && visible) {
            const loadHtml5QrCode = async () => {
                try {
                    const { Html5Qrcode } = require('html5-qrcode');
                    setTimeout(() => {
                        const scanner = new Html5Qrcode("web-scanner-reader");
                        html5QrCodeRef.current = scanner;
                        scanner.start({ facingMode: "environment" }, { fps: 15, qrbox: { width: 220, height: 220 } }, (decodedText) => {
                            const now = Date.now();
                            if (decodedText !== lastScannedRef.current || now - lastScanTimeRef.current > 1500) {
                                lastScannedRef.current = decodedText;
                                lastScanTimeRef.current = now;
                                onBarcodeScanned(decodedText);
                            }
                        }, () => { }).catch(err => console.error(err));
                    }, 100);
                } catch (e) { console.error(e); }
            };
            loadHtml5QrCode();
        }
        return () => {
            if (Platform.OS === 'web' && html5QrCodeRef.current) {
                html5QrCodeRef.current.stop().then(() => { html5QrCodeRef.current = null; }).catch(err => console.error(err));
            }
        };
    }, [visible]);
    useEffect(() => { if (visible && Platform.OS !== 'web' && requestPermission && permission && !permission.granted) { requestPermission(); } }, [visible, permission]);
    const translateY = laserAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 220] });
    if (!visible) return null;
    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/40 justify-end">
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={{ backgroundColor: theme.panel + 'E6' }} className="h-[65%] rounded-t-3xl border-t border-slate-200/40 dark:border-slate-800/40 shadow-2xl relative overflow-hidden p-5 pb-8 flex-col justify-between pt-6">
                            <View className="flex-row justify-between items-center z-50">
                                <View className="flex-col">
                                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} className="font-black">Continuous Barcode Scanner</Text>
                                    <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-0.5">Background lines update real-time</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={{ backgroundColor: theme.primary }} className="px-6 py-2.5 rounded-xl shadow-md active:scale-95"><Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm }} className="text-white">Done</Text></TouchableOpacity>
                            </View>
                            <View className="flex-1 justify-center items-center my-2 relative">
                                <View className="w-[240px] h-[240px] bg-slate-900 rounded-2xl overflow-hidden shadow-xl border-2 border-slate-700/80 relative">
                                    {Platform.OS === 'web' ? (
                                        <div id="web-scanner-reader" style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: 'transparent' }} />
                                    ) : (
                                        CameraView && permission?.granted ? (
                                            <CameraView style={StyleSheet.absoluteFillObject} facing="environment" onBarcodeScanned={({ data }) => {
                                                const now = Date.now();
                                                if (data !== lastScannedRef.current || now - lastScanTimeRef.current > 1500) {
                                                    lastScannedRef.current = data;
                                                    lastScanTimeRef.current = now;
                                                    onBarcodeScanned(data);
                                                }
                                            }} />
                                        ) : (
                                            <View className="flex-1 justify-center items-center p-4"><TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.primary }} className="px-4 py-2 rounded-xl"><Text className="text-white font-bold text-xs">Enable Lens</Text></TouchableOpacity></View>
                                        )
                                    )}
                                    <View className="absolute inset-4 border border-white/20 rounded-lg pointer-events-none" />
                                    <Animated.View style={[{ transform: [{ translateY }] }]} className="absolute left-2 right-2 h-0.5 bg-rose-500 shadow-[0_0_10px_#ef4444]" />
                                </View>
                            </View>
                            <View style={{ backgroundColor: theme.background }} className="p-3 rounded-xl items-center border border-slate-100 dark:border-slate-800/80">
                                <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.xs }} className="text-emerald-500 font-bold uppercase tracking-widest animate-pulse">● Lens Stream Active</Text>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
