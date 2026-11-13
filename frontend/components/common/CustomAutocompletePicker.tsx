// components/common/CustomAutocompletePicker.tsx

import { useField } from "formik";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

/* =========================================================
 * Types
 * ======================================================= */

interface AutocompleteOption {
    id: string;
    title: string;
}

interface Props {
    name: string;
    label: string;
    options: AutocompleteOption[];
    theme: any;
    isDarkMode: boolean;
    initialTitle?: string;
    loading?: boolean;
    placeholder?: string;
    loadingPlaceholder?: string;
    emptyText?: string;
    noMatchText?: string;
    dropdownMaxHeight?: number;
    onAfterSelect?: (id: string, title: string) => void;
}

/* =========================================================
 * Universal input metrics (Matched to CustomTextField)
 * ======================================================= */
const FONT_SIZE = 12;
const LINE_HEIGHT = 16;
const HORIZONTAL_PADDING = 10;
const MIN_INPUT_HEIGHT = 38;

/* =========================================================
 * Component
 * ======================================================= */

export default function CustomAutocompletePicker({
    name,
    label,
    options,
    theme,
    isDarkMode,
    initialTitle,
    loading = false,
    placeholder = "Type to filter and select...",
    loadingPlaceholder = "Loading options...",
    emptyText = "No options available.",
    noMatchText = "No matches.",
    dropdownMaxHeight = 200,
    onAfterSelect,
}: Props) {
    const [field, meta, helpers] = useField<string>(name);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [search, setSearch] = useState("");

    const value = field.value || "";
    const hasError = !!(meta.touched && meta.error);
    const errorText =
        typeof meta.error === "string" ? meta.error : undefined;

    /* ── Sync initialTitle → search (loop-safe) ───────────── */
    useEffect(() => {
        const next = initialTitle || "";
        setSearch((prev) => (prev === next ? prev : next));
    }, [initialTitle]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) =>
            o.title.toLowerCase().includes(q)
        );
    }, [options, search]);

    const handlePick = (id: string, title: string) => {
        helpers.setValue(id);
        helpers.setTouched(true);
        setSearch(title);
        setDropdownOpen(false);
        onAfterSelect?.(id, title);
    };

    const handleBlur = () => {
        setFocused(false);
        setTimeout(() => {
            setDropdownOpen(false);
        }, 200);
    };

    const baseDelimiter = isDarkMode
        ? "rgba(148,163,184,0.18)"
        : "rgba(15,23,42,0.10)";
    const focusDelimiter = isDarkMode
        ? "rgba(148,163,184,0.28)"
        : "rgba(15,23,42,0.20)";

    const inputBorderColor = hasError
        ? "#ef4444"
        : focused || dropdownOpen
            ? focusDelimiter
            : baseDelimiter;

    return (
        <View
            className="items-start w-full"
            style={{
                position: "relative",
                zIndex: dropdownOpen ? 9999 : 1,
                ...(dropdownOpen
                    ? ({ isolation: "isolate" } as any)
                    : null),
            }}
        >
            {label ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font?.bold,
                        fontSize: 10,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        paddingHorizontal: 2,
                        marginBottom: 4,
                    }}
                >
                    {label}
                </Text>
            ) : null}

            <View style={{ width: "100%", position: "relative" }}>
                <TextInput
                    onFocus={() => {
                        setFocused(true);
                        setDropdownOpen(true);
                    }}
                    onBlur={handleBlur}
                    onChangeText={(txt) => {
                        setSearch(txt);
                        setDropdownOpen(true);
                    }}
                    value={search}
                    placeholder={
                        loading ? loadingPlaceholder : placeholder
                    }
                    placeholderTextColor={
                        isDarkMode ? "#64748b" : "#94a3b8"
                    }
                    // ✅ Single line to match CustomTextField exactly
                    multiline={false}
                    style={{
                        backgroundColor: isDarkMode
                            ? "#0f172a"
                            : theme.surface ?? theme.background,
                        borderColor: inputBorderColor,
                        borderWidth: 1,
                        borderRadius: 8,
                        color: theme.text,
                        minHeight: MIN_INPUT_HEIGHT,
                        paddingHorizontal: HORIZONTAL_PADDING,
                        paddingVertical: 0, // Let height dictate
                        textAlign: "left",
                        textAlignVertical: "center",
                        fontSize: FONT_SIZE,
                        lineHeight: LINE_HEIGHT,
                        ...(Platform.OS === "web"
                            ? ({
                                outlineStyle: "none",
                            } as any)
                            : {}),
                    }}
                />

                {dropdownOpen && (
                    <View
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            marginTop: 4,
                            backgroundColor: theme.panel,
                            borderColor: baseDelimiter,
                            borderWidth: 1,
                            borderRadius: 8,
                            maxHeight: dropdownMaxHeight,
                            overflow: "hidden",
                            zIndex: 9999,
                            elevation: 20,
                            // @ts-ignore — web-only
                            boxShadow: isDarkMode
                                ? "0 8px 24px rgba(0,0,0,0.35)"
                                : "0 8px 24px rgba(15,23,42,0.08)",
                        }}
                    >
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{
                                paddingVertical: 2,
                            }}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={true}
                            showsVerticalScrollIndicator={true}
                        >
                            {loading ? (
                                <View className="p-4 items-center">
                                    <ActivityIndicator
                                        size="small"
                                        color={theme.primary}
                                    />
                                </View>
                            ) : filtered.length === 0 ? (
                                <View className="p-4">
                                    <Text
                                        style={{
                                            color: theme.textDark,
                                        }}
                                        className="text-xs font-medium text-center"
                                    >
                                        {options.length === 0
                                            ? emptyText
                                            : noMatchText}
                                    </Text>
                                </View>
                            ) : (
                                <View className="flex-col">
                                    {filtered.map((item, idx) => {
                                        const isSelected =
                                            value === item.id;
                                        const isLast =
                                            idx ===
                                            filtered.length - 1;
                                        return (
                                            <Pressable
                                                key={item.id}
                                                onPress={() =>
                                                    handlePick(
                                                        item.id,
                                                        item.title
                                                    )
                                                }
                                                style={({ pressed }) => ({
                                                    backgroundColor:
                                                        pressed
                                                            ? isDarkMode
                                                                ? "rgba(148,163,184,0.08)"
                                                                : "rgba(15,23,42,0.04)"
                                                            : "transparent",
                                                    borderBottomColor:
                                                        isLast
                                                            ? "transparent"
                                                            : baseDelimiter,
                                                    borderBottomWidth:
                                                        isLast ? 0 : 1,
                                                })}
                                                className="px-3 py-2.5"
                                            >
                                                <Text
                                                    style={{
                                                        color:
                                                            isSelected
                                                                ? theme.primary
                                                                : theme.text,
                                                        fontFamily:
                                                            isSelected
                                                                ? theme.font
                                                                    .bold
                                                                : theme.font
                                                                    .medium,
                                                        fontSize: 12, // Matched to input font
                                                    }}
                                                    numberOfLines={1}
                                                >
                                                    {item.title}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>

            {hasError && errorText && (
                <Text
                    style={{
                        color: "#ef4444",
                        fontSize: 10, // Matched to CustomTextField error text
                        paddingHorizontal: 2,
                        marginTop: 4,
                    }}
                >
                    {errorText}
                </Text>
            )}
        </View>
    );
}