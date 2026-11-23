// components/common/scanner/BarcodeScanner.tsx
//
// The one barcode / QR scanner for the whole app (phones, tablets, web).
//
//   <BarcodeScanner
//     visible={open} onClose={() => setOpen(false)}
//     mode="continuous"                      // or "single": closes after the first accepted code
//     onScan={(code) => addLine(code)}       // return false / a message / {ok:false,message} to reject
//   />
//
// • Native: expo-camera CameraView (torch, all 1D + 2D formats).
// • Web: html5-qrcode (uses the browser BarcodeDetector when available).
// • Always: type or paste a code, or use a USB / Bluetooth scanner — those type the
//   code and press Enter, so the manual field (focused on web) catches them.
// • Beep + green flash on success, red flash + reason on reject, a 1.5 s de-bounce of
//   the same code, and a running list of what was scanned in continuous mode.

import { useAuth } from '@/context/AuthContext';
import { useAudioPlayer } from 'expo-audio';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Camera, Check, Keyboard as KeyboardIcon, ScanLine, X, XCircle, Zap, ZapOff } from 'lucide-react-native';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BEEP = require('../../../assets/sounds/beep.wav');
const isWeb = Platform.OS === 'web';
const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;
const noOutline = isWeb ? ({ outlineStyle: 'none' } as any) : null;

export type ScanOutcome = boolean | string | void | null | undefined | { ok: boolean; label?: string; message?: string };

export interface BarcodeScannerProps {
    visible: boolean;
    onClose: () => void;
    /**
     * Called for every new code. Accept by returning nothing / true / {ok:true,label};
     * reject by returning false, a message string, or {ok:false,message}.
     */
    onScan: (code: string, type?: string) => ScanOutcome | Promise<ScanOutcome>;
    /** continuous (default): stay open for many items. single: close after one accepted code. */
    mode?: 'continuous' | 'single';
    title?: string;
    subtitle?: string;
    barcodeTypes?: BarcodeType[];
    /** Keyboard for the manual field (barcodes are usually digits). */
    manualKeyboard?: 'default' | 'numeric';
}

const ALL_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr', 'datamatrix', 'pdf417', 'aztec'];
const DEBOUNCE_MS = 1500;

type Flash = { kind: 'ok' | 'bad'; text: string; at: number } | null;
interface Recent {
    code: string;
    label?: string;
    count: number;
}

export function BarcodeScanner({
    visible,
    onClose,
    onScan,
    mode = 'continuous',
    title,
    subtitle,
    barcodeTypes = ALL_TYPES,
    manualKeyboard = 'default',
}: BarcodeScannerProps) {
    const { theme } = useAuth();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const wide = width >= 768;

    const [torch, setTorch] = useState(false);
    const [manual, setManual] = useState('');
    const [flash, setFlash] = useState<Flash>(null);
    const [recent, setRecent] = useState<Recent[]>([]);
    const busy = useRef(false);
    const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
    const flashAnim = useRef(new Animated.Value(0)).current;
    const laser = useRef(new Animated.Value(0)).current;
    const beep = useAudioPlayer(BEEP);

    // Reset per opening.
    useEffect(() => {
        if (visible) {
            setRecent([]);
            setFlash(null);
            setManual('');
            last.current = { code: '', at: 0 };
        } else {
            setTorch(false);
        }
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        laser.setValue(0);
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(laser, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: !isWeb }),
                Animated.timing(laser, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: !isWeb }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [visible, laser]);

    // The status chip and corner colour return to idle a moment after each scan.
    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash((f) => (f && f.at === flash.at ? null : f)), flash.kind === 'bad' ? 2600 : 1600);
        return () => clearTimeout(t);
    }, [flash]);

    const pulse = useCallback(() => {
        flashAnim.setValue(1);
        Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: !isWeb }).start();
    }, [flashAnim]);

    const handle = useCallback(
        async (raw: string, type?: string, fromCamera = true) => {
            const code = String(raw ?? '').trim();
            if (!code || busy.current) return;
            const now = Date.now();
            if (fromCamera && code === last.current.code && now - last.current.at < DEBOUNCE_MS) return;
            last.current = { code, at: now };
            busy.current = true;
            try {
                const out = await onScan(code, type);
                const rejected = out === false || typeof out === 'string' || (typeof out === 'object' && out !== null && out.ok === false);
                if (rejected) {
                    const msg = typeof out === 'string' ? out : typeof out === 'object' && out?.message ? out.message : `"${code}" wasn't recognised`;
                    setFlash({ kind: 'bad', text: msg, at: now });
                } else {
                    const label = typeof out === 'object' && out?.label ? out.label : undefined;
                    try {
                        await beep.seekTo(0);
                        beep.play();
                    } catch {
                        /* sound is a nicety */
                    }
                    setFlash({ kind: 'ok', text: label ? `${label} added` : `${code} added`, at: now });
                    setRecent((r) => {
                        const i = r.findIndex((x) => x.code === code);
                        if (i === -1) return [{ code, label, count: 1 }, ...r].slice(0, 30);
                        const hit = { ...r[i], count: r[i].count + 1, label: label ?? r[i].label };
                        return [hit, ...r.filter((_, k) => k !== i)];
                    });
                    if (mode === 'single') setTimeout(onClose, 250);
                }
                pulse();
            } finally {
                busy.current = false;
            }
        },
        [onScan, beep, mode, onClose, pulse]
    );

    const submitManual = () => {
        const c = manual;
        setManual('');
        handle(c, 'manual', false);
    };

    const frameW = Math.min(wide ? 380 : width - 64, 380);
    const frameH = Math.round(frameW * 0.62);
    const total = recent.reduce((n, r) => n + r.count, 0);
    const flashColor = flash?.kind === 'bad' ? theme.danger : theme.success;

    return (
        <Modal visible={visible} onRequestClose={onClose} animationType={isWeb ? 'fade' : 'slide'} presentationStyle={wide ? 'overFullScreen' : 'fullScreen'} transparent={wide} statusBarTranslucent>
            <View style={{ flex: 1, backgroundColor: wide ? 'rgba(2,6,23,0.7)' : '#000', alignItems: 'center', justifyContent: 'center' }}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{
                        width: wide ? 460 : '100%',
                        height: wide ? Math.min(760, height - 48) : '100%',
                        borderRadius: wide ? 28 : 0,
                        overflow: 'hidden',
                        backgroundColor: '#05070d',
                    }}
                >
                    {/* ---------------- camera + overlay ---------------- */}
                    <View style={{ flex: 1 }}>
                        <CameraFeed visible={visible} torch={torch} barcodeTypes={barcodeTypes} onCode={(c, t) => handle(c, t, true)} theme={theme} />

                        {/* Dim everything except the scan window */}
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                            <View style={{ flexDirection: 'row', height: frameH }}>
                                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                                <View style={{ width: frameW, height: frameH }}>
                                    <Corners color={flash ? flashColor : '#fff'} />
                                    <Animated.View
                                        style={{
                                            position: 'absolute', left: 14, right: 14, height: 2, borderRadius: 1,
                                            backgroundColor: theme.accent ?? theme.primary,
                                            shadowColor: theme.accent ?? theme.primary, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                                            transform: [{ translateY: laser.interpolate({ inputRange: [0, 1], outputRange: [12, frameH - 14] }) }],
                                        }}
                                    />
                                    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, backgroundColor: flashColor, opacity: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }) }} />
                                </View>
                                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                            </View>
                            <View style={{ flex: 1.15, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                        </View>

                        {/* Top bar */}
                        <View style={{ position: 'absolute', top: (wide ? 0 : insets.top) + 12, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <RoundButton onPress={onClose} label="Close scanner">
                                <X size={20} color="#fff" strokeWidth={2.4} />
                            </RoundButton>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={1}>
                                    {title ?? (mode === 'single' ? 'Scan a barcode' : 'Scan products')}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.65)', fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                    {subtitle ?? (mode === 'single' ? 'Hold the code inside the frame' : 'Keep scanning — each code adds an item')}
                                </Text>
                            </View>
                            {!isWeb ? (
                                <RoundButton onPress={() => setTorch((t) => !t)} label={torch ? 'Turn torch off' : 'Turn torch on'} active={torch} activeColor={theme.warning}>
                                    {torch ? <Zap size={19} color="#0b1733" strokeWidth={2.4} /> : <ZapOff size={19} color="#fff" strokeWidth={2.2} />}
                                </RoundButton>
                            ) : (
                                <View style={{ width: 42 }} />
                            )}
                        </View>

                        {/* Status chip under the frame */}
                        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: frameH / 2 + 18, alignItems: 'center', paddingHorizontal: 24 }}>
                            <View
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 360,
                                    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
                                    backgroundColor: flash ? (flash.kind === 'ok' ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)') : 'rgba(255,255,255,0.14)',
                                }}
                            >
                                {flash ? (flash.kind === 'ok' ? <Check size={15} color="#fff" strokeWidth={3} /> : <XCircle size={15} color="#fff" strokeWidth={2.4} />) : <ScanLine size={15} color="#fff" strokeWidth={2.2} />}
                                <Text style={{ color: '#fff', fontFamily: theme.font.semibold, fontSize: 13 }} numberOfLines={2}>
                                    {flash ? flash.text : 'Point the camera at a barcode'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ---------------- bottom panel ---------------- */}
                    <View style={{ backgroundColor: theme.panel, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -26, paddingTop: 16, paddingHorizontal: 16, paddingBottom: (wide ? 0 : insets.bottom) + 16, gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: theme.surfaceAlt, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
                                <KeyboardIcon size={17} color={theme.textMuted} />
                                <TextInput
                                    value={manual}
                                    onChangeText={setManual}
                                    onSubmitEditing={submitManual}
                                    placeholder="Type a code or use a handheld scanner"
                                    placeholderTextColor={theme.textMuted}
                                    keyboardType={manualKeyboard === 'numeric' ? 'number-pad' : 'default'}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    blurOnSubmit={false}
                                    // Web: handheld USB / Bluetooth scanners type into the focused field and press Enter.
                                    autoFocus={isWeb}
                                    style={{ flex: 1, height: '100%', color: theme.text, fontFamily: theme.font.medium, fontSize: 16, ...noOutline }}
                                />
                            </View>
                            <Pressable onPress={submitManual} disabled={!manual.trim()} accessibilityRole="button" accessibilityLabel="Add code" style={{ height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, opacity: manual.trim() ? 1 : 0.45, ...pointer }}>
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>Add</Text>
                            </Pressable>
                        </View>

                        {mode === 'continuous' && recent.length ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {recent.map((r) => (
                                    <View key={r.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: theme.primarySoft }}>
                                        <Text style={{ color: theme.primary, fontFamily: theme.font.semibold, fontSize: 12.5, maxWidth: 160 }} numberOfLines={1}>{r.label ?? r.code}</Text>
                                        {r.count > 1 ? (
                                            <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 11 }}>×{r.count}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ))}
                            </ScrollView>
                        ) : null}

                        {mode === 'continuous' ? (
                            <Pressable
                                onPress={onClose}
                                accessibilityRole="button"
                                style={{
                                    height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                                    backgroundColor: theme.navy ?? '#0b1733', ...pointer,
                                }}
                            >
                                <Check size={18} color="#fff" strokeWidth={2.6} />
                                <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 15 }}>
                                    {total ? `Done · ${total} scanned` : 'Done'}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

/* ------------------------------------------------------------ camera */

function CameraFeed({ visible, torch, barcodeTypes, onCode, theme }: { visible: boolean; torch: boolean; barcodeTypes: BarcodeType[]; onCode: (code: string, type?: string) => void; theme: any }) {
    if (isWeb) return <WebCamera visible={visible} onCode={onCode} theme={theme} />;
    return <NativeCamera torch={torch} barcodeTypes={barcodeTypes} onCode={onCode} theme={theme} />;
}

function NativeCamera({ torch, barcodeTypes, onCode, theme }: { torch: boolean; barcodeTypes: BarcodeType[]; onCode: (code: string, type?: string) => void; theme: any }) {
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    }, [permission, requestPermission]);

    if (!permission) {
        return (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="#fff" />
            </View>
        );
    }
    if (!permission.granted) {
        return (
            <CameraBlocked
                theme={theme}
                title="Camera access needed"
                message={permission.canAskAgain ? 'Allow the camera to scan barcodes. You can still type codes below.' : 'Camera access is off for WaziPOS. Turn it on in Settings, or type codes below.'}
                actionLabel={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
                onAction={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            />
        );
    }
    return (
        <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes }}
            onBarcodeScanned={({ data, type }) => onCode(data, type)}
        />
    );
}

function WebCamera({ visible, onCode, theme }: { visible: boolean; onCode: (code: string, type?: string) => void; theme: any }) {
    const rawId = useId();
    const elId = `wz-scan-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(true);
    const onCodeRef = useRef(onCode);
    onCodeRef.current = onCode;

    useEffect(() => {
        if (!visible) return;
        let scanner: any = null;
        let cancelled = false;
        setError(null);
        setStarting(true);
        const t = setTimeout(async () => {
            try {
                const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = require('html5-qrcode');
                if (cancelled || !document.getElementById(elId)) return;
                scanner = new Html5Qrcode(elId, {
                    verbose: false,
                    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX, F.PDF_417, F.AZTEC],
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                });
                await scanner.start(
                    { facingMode: 'environment' },
                    { fps: 12, disableFlip: false },
                    (text: string, result: any) => onCodeRef.current(text, result?.result?.format?.formatName),
                    () => undefined
                );
                if (cancelled) {
                    scanner.stop().catch(() => undefined);
                    return;
                }
                // Fill the panel with the video.
                const v = document.querySelector(`#${elId} video`) as HTMLVideoElement | null;
                if (v) Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover' });
                setStarting(false);
            } catch (e: any) {
                setStarting(false);
                const msg = String(e?.message ?? e ?? '');
                setError(/permission|notallowed/i.test(msg) ? 'Camera access was blocked. Allow it in the browser address bar, or type codes below.' : 'No camera found. Type a code below or use a handheld scanner.');
            }
        }, 80);
        return () => {
            cancelled = true;
            clearTimeout(t);
            if (scanner) {
                Promise.resolve(scanner.isScanning ? scanner.stop() : undefined)
                    .catch(() => undefined)
                    .finally(() => {
                        try {
                            scanner.clear();
                        } catch {
                            /* already cleared */
                        }
                    });
            }
        };
    }, [visible, elId]);

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* html5-qrcode renders its <video> into this element. */}
            {React.createElement('div', { id: elId, style: { width: '100%', height: '100%', overflow: 'hidden', background: '#05070d' } })}
            {starting && !error ? (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                    <ActivityIndicator color="#fff" />
                </View>
            ) : null}
            {error ? <CameraBlocked theme={theme} title="Camera unavailable" message={error} /> : null}
        </View>
    );
}

function CameraBlocked({ theme, title, message, actionLabel, onAction }: { theme: any; title: string; message: string; actionLabel?: string; onAction?: () => void }) {
    return (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#05070d', zIndex: 5 }]}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Camera size={28} color="#fff" strokeWidth={2} />
            </View>
            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 16, textAlign: 'center' }}>{title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 300 }}>{message}</Text>
            {actionLabel && onAction ? (
                <Pressable onPress={onAction} accessibilityRole="button" style={{ marginTop: 18, height: 46, paddingHorizontal: 22, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                    <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 14 }}>{actionLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/* ------------------------------------------------------------ bits */

function Corners({ color }: { color: string }) {
    const L = 30;
    const W = 4;
    const R = 18;
    const base = { position: 'absolute' as const, width: L, height: L, borderColor: color };
    return (
        <>
            <View style={{ ...base, top: 0, left: 0, borderTopWidth: W, borderLeftWidth: W, borderTopLeftRadius: R }} />
            <View style={{ ...base, top: 0, right: 0, borderTopWidth: W, borderRightWidth: W, borderTopRightRadius: R }} />
            <View style={{ ...base, bottom: 0, left: 0, borderBottomWidth: W, borderLeftWidth: W, borderBottomLeftRadius: R }} />
            <View style={{ ...base, bottom: 0, right: 0, borderBottomWidth: W, borderRightWidth: W, borderBottomRightRadius: R }} />
        </>
    );
}

function RoundButton({ children, onPress, label, active, activeColor }: { children: React.ReactNode; onPress: () => void; label: string; active?: boolean; activeColor?: string }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={8}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? activeColor : 'rgba(255,255,255,0.16)', ...pointer }}
        >
            {children}
        </Pressable>
    );
}

export default BarcodeScanner;
