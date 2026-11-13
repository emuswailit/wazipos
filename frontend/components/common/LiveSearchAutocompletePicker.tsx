// components/common/LiveSearchAutocompletePicker.tsx

import { useField } from "formik";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

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
    onSearch: (query: string) => void;
    initialTitle?: string;
    loading?: boolean;
    placeholder?: string;
    loadingPlaceholder?: string;
    emptyText?: string;
    noMatchText?: string;
    dropdownMaxHeight?: number;
    onAfterSelect?: (id: string, title: string) => void;
    debounceMs?: number;
}

const FONT_SIZE = 12;
const LINE_HEIGHT = 16;
const HORIZONTAL_PADDING = 10;
const MIN_INPUT_HEIGHT = 38;

export default function LiveSearchAutocompletePicker({
    name,
    label,
    options,
    theme,
    isDarkMode,
    onSearch,
    initialTitle,
    loading = false,
    placeholder = "Type to search...",
    loadingPlaceholder = "Searching...",
    emptyText = "Start typing to search.",
    noMatchText = "No results found.",
    dropdownMaxHeight = 200,
    onAfterSelect,
    debounceMs = 400,
}: Props) {
    const [field, meta, helpers] = useField<string>(name);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [search, setSearch] = useState("");

    const value = field.value || "";
    const hasError = !!(meta.touched && meta.error);
    const errorText = typeof meta.error === "string" ? meta.error : undefined;

    useEffect(() => {
        const next = initialTitle || "";
        setSearch((prev) => (prev === next ? prev : next));
    }, [initialTitle]);

    const isFirstRun = useRef(true);
    const isSelectingRef = useRef(false);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        if (isSelectingRef.current) {
            isSelectingRef.current = false;
            return;
        }

        const handler = setTimeout(() => {
            onSearch(search);
        }, debounceMs);
        return () => clearTimeout(handler);
    }, [search, onSearch, debounceMs]);

    const handlePick = (id: string, title: string) => {
        isSelectingRef.current = true;
        helpers.setValue(id);
        helpers.setTouched(true);
        setSearch(title);
        setDropdownOpen(false);
        onAfterSelect?.(id, title);
    };

    const handleBlur = () => {
        setFocused(false);
        setTimeout(() => setDropdownOpen(false), 250);
    };

    const baseDelimiter = isDarkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.10)";
    const focusDelimiter = isDarkMode ? "rgba(148,163,184,0.28)" : "rgba(15,23,42,0.20)";
    const inputBorderColor = hasError ? "#ef4444" : focused || dropdownOpen ? focusDelimiter : baseDelimiter;

    return (
        <View
            className="items-start w-full"
            style={{
                position: "relative",
                zIndex: dropdownOpen ? 9999 : 1,
                ...(dropdownOpen ? ({ isolation: "isolate" } as any) : null),
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
                    placeholder={placeholder}
                    placeholderTextColor={isDarkMode ? "#64748b" : "#94a3b8"}
                    multiline={false}
                    style={{
                        backgroundColor: isDarkMode ? "#0f172a" : theme.surface ?? theme.background,
                        borderColor: inputBorderColor,
                        borderWidth: 1,
                        borderRadius: 8,
                        color: theme.text,
                        minHeight: MIN_INPUT_HEIGHT,
                        paddingHorizontal: HORIZONTAL_PADDING,
                        paddingRight: loading && dropdownOpen ? 34 : HORIZONTAL_PADDING,
                        paddingVertical: 0,
                        textAlign: "left",
                        textAlignVertical: "center",
                        fontSize: FONT_SIZE,
                        lineHeight: LINE_HEIGHT,
                        ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
                    }}
                />

                {loading && dropdownOpen && (
                    <View
                        style={{
                            position: "absolute",
                            right: 10,
                            top: 0,
                            bottom: 0,
                            justifyContent: "center",
                        }}
                    >
                        <ActivityIndicator size="small" color={theme.primary} />
                    </View>
                )}

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
                            // @ts-ignore
                            boxShadow: isDarkMode ? "0 8px 24px rgba(0,0,0,0.35)" : "0 8px 24px rgba(15,23,42,0.08)",
                        }}
                    >
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingVertical: 2 }}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={true}
                            showsVerticalScrollIndicator={true}
                        >
                            {options.length === 0 && loading ? (
                                <View className="p-4 items-center">
                                    <ActivityIndicator size="small" color={theme.primary} />
                                </View>
                            ) : options.length === 0 ? (
                                <View className="p-4">
                                    <Text style={{ color: theme.textDark }} className="text-xs font-medium text-center">
                                        {search.trim() ? noMatchText : emptyText}
                                    </Text>
                                </View>
                            ) : (
                                <View className="flex-col">
                                    {options.map((item, idx) => {
                                        const isSelected = value === item.id;
                                        const isLast = idx === options.length - 1;
                                        return (
                                            <Pressable
                                                key={item.id}
                                                onPress={() => handlePick(item.id, item.title)}
                                                style={({ pressed }) => ({
                                                    backgroundColor: pressed
                                                        ? isDarkMode
                                                            ? "rgba(148,163,184,0.08)"
                                                            : "rgba(15,23,42,0.04)"
                                                        : "transparent",
                                                    borderBottomColor: isLast ? "transparent" : baseDelimiter,
                                                    borderBottomWidth: isLast ? 0 : 1,
                                                })}
                                                className="px-3 py-2.5"
                                            >
                                                <Text
                                                    style={{
                                                        color: isSelected ? theme.primary : theme.text,
                                                        fontFamily: isSelected ? theme.font.bold : theme.font.medium,
                                                        fontSize: 12,
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
                <Text style={{ color: "#ef4444", fontSize: 10, paddingHorizontal: 2, marginTop: 4 }}>
                    {errorText}
                </Text>
            )}
        </View>
    );
}