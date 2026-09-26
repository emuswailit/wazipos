// components/common/CustomAutocompletePicker.tsx
//
// Generic inline autocomplete picker for any list of { id, title }
// options.
//
// Formik-native: consumes `useField(name)` so callers only need
// to pass a `name` matching their Formik field.
//
// The open picker is elevated above all siblings via a dynamic
// zIndex. Dropdown closes on input blur (with a delay so item
// clicks register first).

import { useField } from "formik";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

/* =========================================================
 * Types
 * ======================================================= */

export interface AutocompleteOption {
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
    dropdownMaxHeight = 180,
    onAfterSelect,
}: Props) {
    const [field, meta, helpers] = useField<string>(name);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState("");

    const value = field.value || "";
    const hasError = !!(meta.touched && meta.error);
    const errorText =
        typeof meta.error === "string" ? meta.error : undefined;

    useEffect(() => {
        setSearch(initialTitle || "");
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
        // Delay so a click on a dropdown item registers before
        // the blur-driven close fires.
        setTimeout(() => {
            setDropdownOpen(false);
        }, 200);
    };

    return (
        <View
            className="items-start w-full"
            style={{
                position: "relative",
                zIndex: dropdownOpen ? 9999 : 0,
            }}
        >
            {/* Field label */}
            <Text
                style={{ color: theme.textDark }}
                className="text-[10px] uppercase font-black tracking-wider mb-1"
            >
                {label}
            </Text>

            {/* Search input */}
            <TextInput
                onFocus={() => setDropdownOpen(true)}
                onBlur={handleBlur}
                onChangeText={(txt) => {
                    setSearch(txt);
                    setDropdownOpen(true);
                }}
                value={search}
                placeholder={
                    loading ? loadingPlaceholder : placeholder
                }
                placeholderTextColor="#64748b"
                style={{
                    backgroundColor: theme.background,
                    borderColor: hasError
                        ? "#ef4444"
                        : theme.border,
                    color: theme.text,
                }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none"
            />

            {/* Error text */}
            {hasError && errorText && (
                <Text className="text-red-500 text-[11px] font-semibold mt-1">
                    {errorText}
                </Text>
            )}

            {/* Dropdown */}
            {dropdownOpen && (
                <View
                    style={{
                        position: "absolute",
                        top: 68,
                        left: 0,
                        right: 0,
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        maxHeight: dropdownMaxHeight,
                        overflow: "hidden",
                        zIndex: 9999,
                        // @ts-ignore — web-only shadow
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled={true}
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
                                {filtered.map((item) => {
                                    const isSelected =
                                        value === item.id;
                                    return (
                                        <Pressable
                                            key={item.id}
                                            onPress={() =>
                                                handlePick(
                                                    item.id,
                                                    item.title
                                                )
                                            }
                                            style={({
                                                pressed,
                                            }) => ({
                                                backgroundColor:
                                                    pressed
                                                        ? isDarkMode
                                                            ? "#1e293b"
                                                            : "#f1f5f9"
                                                        : "transparent",
                                                borderBottomColor:
                                                    theme.border,
                                            })}
                                            className="px-4 py-3 border-b"
                                        >
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? theme.primary
                                                        : theme.text,
                                                }}
                                                className={`text-xs ${isSelected
                                                        ? "font-black"
                                                        : "font-medium"
                                                    }`}
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
    );
}