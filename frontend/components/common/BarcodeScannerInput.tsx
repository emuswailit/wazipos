// components/common/BarcodeScannerInput.tsx

import { useAuth } from '@/context/AuthContext';
import { useFocusClear } from '@/hooks/useFocusClear';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFormikContext } from 'formik';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';


/* ---- html5-qrcode only on web ---- */
const Html5Qrcode =
    Platform.OS === 'web'
        ? require('html5-qrcode').Html5Qrcode
        : null;

/* =========================================================
 * Types
 * ======================================================= */
export interface BarcodeScannerInputProps {
    name?: string;
    onAfterChange?: (code: string) => void;

    value?: string;
    onChangeText?: (v: string) => void;
    error?: string;

    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    barcodeTypes?: string[];
    testID?: string;
}

const DEFAULT_BARCODE_TYPES = [
    'qr',
    'ean13',
    'ean8',
    'code128',
    'code39',
    'upc_a',
    'upc_e',
    'pdf417',
    'aztec',
    'datamatrix',
    'codabar',
    'itf14',
];

/* =========================================================
 * Component
 * ======================================================= */
export function BarcodeScannerInput({
    name,
    onAfterChange,

    value: controlledValue,
    onChangeText: controlledOnChange,
    error: controlledError,

    label,
    placeholder = 'Scan or enter barcode…',
    required,
    disabled,
    barcodeTypes = DEFAULT_BARCODE_TYPES,
    testID,
}: BarcodeScannerInputProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    /* -------- Effective value / error -------- */
    const value: string = isFormik
        ? (formik.values?.[name!] as string) ?? ''
        : controlledValue ?? '';

    const error: string | undefined = isFormik
        ? formik.touched?.[name!] && formik.errors?.[name!]
            ? String(formik.errors[name!])
            : undefined
        : controlledError;

    /* -------- Local state -------- */
    const [scannerVisible, setScannerVisible] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [manualCode, setManualCode] = useState('');

    /* -------- Refs -------- */
    const inputRef = useRef<TextInput>(null);
    const html5QrCodeRef = useRef<any>(null);
    const webHostRef = useRef<View>(null);

    /* -------- Theme -------- */
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f1f5f9';
    const danger = '#ef4444';

    /* ---------------------------------------------------------
     * Value writer (Formik or controlled)
     * ------------------------------------------------------- */
    const setValue = (next: string) => {
        if (isFormik) {
            formik.setFieldValue(name!, next);
            formik.setFieldTouched(name!, true, false);
            onAfterChange?.(next);
        } else {
            controlledOnChange?.(next);
            onAfterChange?.(next);
        }
    };

    /* ---------------------------------------------------------
     * Focus-clear behaviour
     * — clear on focus, restore on blur if untouched
     * ------------------------------------------------------- */
    const {
        displayValue,
        onFocus: hFocus,
        onChange: hChange,
        onBlur: hBlur,
    } = useFocusClear({
        value,
        setValue,
    });

    /* ---------------------------------------------------------
     * Web scanner lifecycle
     * ------------------------------------------------------- */
    useEffect(() => {
        if (Platform.OS !== 'web' || !scannerVisible || !Html5Qrcode)
            return;

        const hostNode: any = webHostRef.current as any;
        const domEl: HTMLElement | null =
            hostNode?.getScrollableNode?.() ??
            hostNode?.getNode?.() ??
            null;

        if (!domEl) {
            console.warn(
                '[BarcodeScannerInput] Web host DOM node not available'
            );
            return;
        }

        const html5QrCode = new Html5Qrcode(domEl);
        html5QrCodeRef.current = html5QrCode;

        html5QrCode
            .start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText: string) => {
                    setValue(decodedText);
                    closeScanner();
                },
                () => { }
            )
            .catch((err: any) =>
                console.error('Web scanner failed:', err)
            );

        return () => {
            if (html5QrCodeRef.current?.isScanning) {
                html5QrCodeRef.current
                    .stop()
                    .catch(console.error);
            }
            html5QrCodeRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scannerVisible]);

    /* ---------------------------------------------------------
     * Native scanner handler
     * ------------------------------------------------------- */
    const handleBarcodeScanned = ({
        data,
    }: {
        data: string;
    }) => {
        setValue(data);
        closeScanner();
    };

    /* ---------------------------------------------------------
     * Open / close
     * ------------------------------------------------------- */
    const openScanner = async () => {
        if (disabled) return;
        setManualCode('');

        if (Platform.OS === 'web') {
            setScannerVisible(true);
            return;
        }

        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) return;
        }
        setScannerVisible(true);
    };

    const closeScanner = () => {
        setScannerVisible(false);
        setManualCode('');
    };

    /* ---------------------------------------------------------
     * Manual entry submit
     * ------------------------------------------------------- */
    const submitManual = () => {
        const code = manualCode.trim();
        if (!code) return;
        setValue(code);
        closeScanner();
    };

    /* =========================================================
     * Render
     * ======================================================= */
    return (
        <View className="mb-3">
            {/* -------- Label -------- */}
            {label ? (
                <View className="flex-row items-center mb-1">
                    <Text
                        className="uppercase tracking-wide text-[10px]"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {label}
                    </Text>
                    {required ? (
                        <Text
                            className="text-[10px] ml-1"
                            style={{
                                color: danger,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            *
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {/* -------- Input + scanner button -------- */}
            <View
                className="flex-row items-center rounded-xl border"
                style={{
                    borderColor: error ? danger : borderColor,
                    backgroundColor: inputBg,
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                <TextInput
                    ref={inputRef}
                    testID={testID}
                    value={displayValue}
                    onChangeText={hChange}
                    onFocus={hFocus}
                    onBlur={hBlur}
                    placeholder={placeholder}
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    editable={!disabled}
                    className="flex-1 py-2.5 pl-3 pr-2"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        minHeight: 42,
                        ...(Platform.OS === 'web'
                            ? ({ outlineStyle: 'none' } as any)
                            : null),
                    }}
                />

                <Pressable
                    onPress={openScanner}
                    disabled={disabled}
                    hitSlop={6}
                    className="mr-1.5 rounded-lg items-center justify-center"
                    style={{
                        backgroundColor: `${theme.primary}15`,
                        borderWidth: 1,
                        borderColor: `${theme.primary}40`,
                        minHeight: 34,
                        minWidth: 34,
                    }}
                >
                    <Text
                        style={{
                            color: theme.primary,
                            fontSize: 15,
                            lineHeight: 17,
                        }}
                    >
                        ▣
                    </Text>
                </Pressable>
            </View>

            {/* -------- Error -------- */}
            {error ? (
                <Text
                    className="mt-1 text-[11px]"
                    style={{
                        color: danger,
                        fontFamily: theme.font.medium,
                    }}
                >
                    {error}
                </Text>
            ) : null}

            {/* -------- Scanner modal -------- */}
            <Modal
                visible={scannerVisible}
                transparent
                animationType="fade"
                onRequestClose={closeScanner}
            >
                <View className="flex-1 bg-black/80 items-center justify-center p-4">
                    <View
                        className="w-full max-w-[500px] rounded-2xl overflow-hidden"
                        style={{ backgroundColor: theme.panel }}
                    >
                        {/* Header */}
                        <View
                            className="flex-row justify-between items-center p-4 border-b"
                            style={{ borderBottomColor: borderColor }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                Scan Barcode
                            </Text>
                            <Pressable
                                onPress={closeScanner}
                                hitSlop={10}
                            >
                                <Text
                                    style={{
                                        color: theme.textDark,
                                        fontSize: 18,
                                    }}
                                >
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* Camera / preview */}
                        <View className="p-4">
                            {Platform.OS === 'web' ? (
                                <View
                                    ref={webHostRef as any}
                                    nativeID="web-barcode-scanner"
                                    className="w-full rounded-xl overflow-hidden"
                                    style={{ minHeight: 260 }}
                                />
                            ) : permission?.granted ? (
                                <View
                                    className="rounded-xl overflow-hidden"
                                    style={{ height: 300 }}
                                >
                                    <CameraView
                                        onBarcodeScanned={
                                            handleBarcodeScanned
                                        }
                                        barcodeScannerSettings={{
                                            barcodeTypes,
                                        }}
                                        style={{ flex: 1 }}
                                    />
                                </View>
                            ) : (
                                <View className="items-center justify-center py-10">
                                    <ActivityIndicator
                                        size="large"
                                        color={theme.primary}
                                    />
                                    <Text
                                        className="mt-4"
                                        style={{
                                            color: theme.textDark,
                                        }}
                                    >
                                        Requesting camera permission…
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Manual entry */}
                        <View
                            className="px-4 pb-3"
                            style={{
                                borderTopWidth: 1,
                                borderTopColor: borderColor,
                                paddingTop: 12,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide text-[10px] mb-1.5"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Or enter manually
                            </Text>
                            <View className="flex-row gap-2">
                                <TextInput
                                    value={manualCode}
                                    onChangeText={setManualCode}
                                    placeholder="Type barcode…"
                                    placeholderTextColor="#94a3b8"
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    onSubmitEditing={
                                        submitManual
                                    }
                                    returnKeyType="done"
                                    className="flex-1 rounded-xl border px-3 py-2.5"
                                    style={{
                                        borderColor,
                                        backgroundColor: isDarkMode
                                            ? '#0f172a'
                                            : '#f1f5f9',
                                        color: theme.text,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.sm,
                                        minHeight: 42,
                                        ...(Platform.OS === 'web'
                                            ? ({
                                                outlineStyle:
                                                    'none',
                                            } as any)
                                            : null),
                                    }}
                                />
                                <Pressable
                                    onPress={submitManual}
                                    disabled={!manualCode.trim()}
                                    className="px-4 py-2.5 rounded-xl items-center justify-center"
                                    style={{
                                        backgroundColor:
                                            theme.primary,
                                        opacity: manualCode.trim()
                                            ? 1
                                            : 0.5,
                                        minHeight: 42,
                                    }}
                                >
                                    <Text
                                        className="uppercase tracking-wide text-white"
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                        }}
                                    >
                                        Use
                                    </Text>
                                </Pressable>
                            </View>
                        </View>

                        {/* Done Scanning */}
                        <View
                            className="p-4 border-t"
                            style={{ borderTopColor: borderColor }}
                        >
                            <Pressable
                                onPress={closeScanner}
                                className="py-3 rounded-xl border items-center justify-center"
                                style={{
                                    borderColor,
                                    minHeight: 44,
                                }}
                            >
                                <Text
                                    className="uppercase tracking-wide"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    Done Scanning
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}