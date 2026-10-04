// components/common/ImagePickerField.tsx
//
// Universal image picker UI + Formik integration.
//
// Three exports, one file:
//
//   <ImagePickerField />       controlled component (no Formik)
//   <FormikImagePicker />      drop-in for any Formik form
//   useFormikImagePicker()     hook — for callers who want custom UI
//
// All three work on web and native from this single file. No
// Platform.OS, no DOM types, no native imports — those all live in
// ./imagePicker.

import { useAuth } from "@/context/AuthContext";
import { useField } from "formik";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import {
    type ImageFieldValue,
    isPendingUpload,
    pickImage,
    previewUri,
    releasePreview,
} from "./imagePicker";

/* =========================================================
 * Shared button atom
 * ======================================================= */

function SmallButton({
    label,
    onPress,
    disabled,
    loading,
    danger,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    danger?: boolean;
}) {
    const { theme } = useAuth();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={{
                paddingHorizontal: 12,
                height: 34,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                alignItems: "center",
                justifyContent: "center",
                opacity: disabled ? 0.55 : 1,
                minWidth: 80,
            }}
        >
            <Text
                style={{
                    color: danger ? "#ef4444" : theme.text,
                    fontSize: 12,
                    fontWeight: "600",
                }}
            >
                {loading ? "…" : label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
 * Controlled component
 * ======================================================= */

export interface ImagePickerFieldProps {
    value: ImageFieldValue;
    onChange: (next: ImageFieldValue) => void;
    onError?: (message: string) => void;
    label?: string;
    helpText?: string;
    aspect?: [number, number];
    quality?: number;
    disabled?: boolean;
    addLabel?: string;
    removeLabel?: string;
    replaceLabel?: string;
    accessibilityLabel?: string;
}

export function ImagePickerField({
    value,
    onChange,
    onError,
    label,
    helpText,
    aspect = [16, 9],
    quality = 0.85,
    disabled,
    addLabel = "Add image",
    removeLabel = "Remove",
    replaceLabel = "Replace",
    accessibilityLabel,
}: ImagePickerFieldProps) {
    const { theme, isDarkMode } = useAuth();
    const [picking, setPicking] = useState(false);
    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subBg = isDarkMode ? "#0f172a" : "#f8fafc";

    const previousRef = useRef<ImageFieldValue>(null);
    useEffect(() => {
        const prev = previousRef.current;
        if (prev !== value) {
            releasePreview(prev);
            previousRef.current = value;
        }
    }, [value]);
    useEffect(() => {
        return () => releasePreview(previousRef.current);
    }, []);

    const handlePick = useCallback(async () => {
        if (disabled || picking) return;
        setPicking(true);
        try {
            const picked = await pickImage({ aspect, quality });
            if (!picked) return;
            onChange(picked);
        } catch (e: any) {
            onError?.(e?.message ?? "Couldn't pick image");
        } finally {
            setPicking(false);
        }
    }, [disabled, picking, aspect, quality, onChange, onError]);

    const handleClear = useCallback(() => {
        if (disabled) return;
        onChange(null);
    }, [disabled, onChange]);

    const uri = previewUri(value);
    const hasImage = !!uri;
    const aspectRatio = aspect[0] / aspect[1];

    return (
        <View
            style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.panel,
                overflow: "hidden",
            }}
        >
            {(label || helpText) && (
                <View
                    style={{
                        padding: 12,
                        gap: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                    }}
                >
                    {label ? (
                        <Text
                            style={{
                                color: theme.text,
                                fontSize: 15,
                                fontWeight: "600",
                            }}
                        >
                            {label}
                        </Text>
                    ) : null}
                    {helpText ? (
                        <Text style={{ color: theme.textDark, fontSize: 12 }}>
                            {helpText}
                        </Text>
                    ) : null}
                </View>
            )}

            {hasImage ? (
                <View style={{ padding: 12, gap: 10 }}>
                    <View
                        style={{
                            width: "100%",
                            aspectRatio,
                            borderRadius: 10,
                            overflow: "hidden",
                            backgroundColor: subBg,
                        }}
                    >
                        <Image
                            source={{ uri: uri! }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                        />
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <SmallButton
                            label={replaceLabel}
                            onPress={handlePick}
                            disabled={disabled || picking}
                            loading={picking}
                        />
                        <SmallButton
                            label={removeLabel}
                            onPress={handleClear}
                            disabled={disabled || picking}
                            danger
                        />
                    </View>
                </View>
            ) : (
                <Pressable
                    onPress={handlePick}
                    disabled={disabled || picking}
                    accessibilityLabel={accessibilityLabel}
                    style={{
                        padding: 24,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        opacity: disabled || picking ? 0.55 : 1,
                    }}
                >
                    <View
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            borderWidth: 2,
                            borderColor: theme.primary,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text
                            style={{
                                color: theme.primary,
                                fontSize: 22,
                                lineHeight: 26,
                                fontWeight: "300",
                            }}
                        >
                            {picking ? "…" : "+"}
                        </Text>
                    </View>
                    <Text
                        style={{
                            color: theme.primary,
                            fontSize: 13,
                            fontWeight: "600",
                        }}
                    >
                        {picking ? "Opening picker…" : addLabel}
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 11 }}>
                        {aspect[0]}:{aspect[1]} recommended · JPG or PNG
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

/* =========================================================
 * Formik component
 * ======================================================= */

export interface FormikImagePickerProps
    extends Omit<ImagePickerFieldProps, "value" | "onChange" | "onError"> {
    name: string;
    showFormikError?: boolean;
}

export function FormikImagePicker({
    name,
    showFormikError = true,
    ...rest
}: FormikImagePickerProps) {
    const [field, meta, helpers] = useField<ImageFieldValue>(name);

    const handleChange = useCallback(
        (next: ImageFieldValue) => {
            helpers.setValue(next);
            helpers.setTouched(true, false);
        },
        [helpers]
    );

    return (
        <View>
            <ImagePickerField
                {...rest}
                value={field.value ?? null}
                onChange={handleChange}
            />
            {showFormikError && meta.touched && meta.error ? (
                <Text
                    style={{
                        color: "#ef4444",
                        fontSize: 11,
                        marginTop: 6,
                        marginLeft: 4,
                    }}
                >
                    {String(meta.error)}
                </Text>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Hook — for callers who want their own UI
 * ======================================================= */

export interface FormikImagePickerApi {
    value: ImageFieldValue;
    previewUri: string | null;
    pick: (opts?: {
        aspect?: [number, number];
        quality?: number;
    }) => Promise<void>;
    clear: () => void;
    picking: boolean;
    isPendingUpload: boolean;
    hasImage: boolean;
    error?: string;
}

export function useFormikImagePicker(name: string): FormikImagePickerApi {
    const [field, meta, helpers] = useField<ImageFieldValue>(name);
    const [picking, setPicking] = useState(false);

    const value = field.value ?? null;

    const pick = useCallback(
        async (opts?: { aspect?: [number, number]; quality?: number }) => {
            if (picking) return;
            setPicking(true);
            try {
                const picked = await pickImage(opts ?? {});
                if (!picked) return;
                releasePreview(value);
                helpers.setValue(picked);
                helpers.setTouched(true, false);
            } finally {
                setPicking(false);
            }
        },
        [picking, value, helpers]
    );

    const clear = useCallback(() => {
        releasePreview(value);
        helpers.setValue(null);
        helpers.setTouched(true, false);
    }, [value, helpers]);

    const uri = previewUri(value);

    return {
        value,
        previewUri: uri,
        pick,
        clear,
        picking,
        isPendingUpload: isPendingUpload(value),
        hasImage: !!uri,
        error: meta.touched && meta.error ? String(meta.error) : undefined,
    };
}