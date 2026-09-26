// components/common/CustomMultiselectAutocompletePicker.tsx
//
// Generic multi-select autocomplete picker for any list of
// { id, title } options.
//
// Formik-native: consumes `useField(name)`. Formik value is
// always a `string[]` of selected option ids.
//
// Tag-input layout: pills render inside the input container
// alongside the inline search field. Already-selected options
// are removed from the dropdown.
//
// Options fire on `onPressIn` (touch-down) so selection lands
// before the input blurs and unmounts the dropdown — single
// click to select.

import { useField } from "formik";
import { useMemo, useRef, useState } from "react";
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

export interface MultiselectOption {
    id: string;
    title: string;
    meta?: Record<string, any>;
}

interface Props {
    name: string;
    label: string;
    options: MultiselectOption[];
    theme: any;
    isDarkMode: boolean;
    loading?: boolean;
    placeholder?: string;
    loadingPlaceholder?: string;
    emptyText?: string;
    noMatchText?: string;
    allPickedText?: string;
    dropdownMaxHeight?: number;
    onAfterSelect?: (
        id: string,
        title: string,
        option: MultiselectOption
    ) => void;
    onAfterRemove?: (
        id: string,
        title: string,
        option: MultiselectOption
    ) => void;
}

/* =========================================================
 * Component
 * ======================================================= */

export default function CustomMultiselectAutocompletePicker({
    name,
    label,
    options,
    theme,
    isDarkMode,
    loading = false,
    placeholder = "Search to add...",
    loadingPlaceholder = "Loading options...",
    emptyText = "No options available.",
    noMatchText = "No matches.",
    allPickedText = "All options selected.",
    dropdownMaxHeight = 180,
    onAfterSelect,
    onAfterRemove,
}: Props) {
    const [field, meta, helpers] = useField<string[]>(name);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<TextInput>(null);
    const blurTimeout = useRef<any>(null);
    const lastAddedId = useRef<string | null>(null);

    const selectedIds: string[] = Array.isArray(field.value)
        ? field.value
        : [];

    const hasError = !!(meta.touched && meta.error);
    const errorText =
        typeof meta.error === "string" ? meta.error : undefined;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const pool = options.filter(
            (o) => !selectedIds.includes(o.id)
        );
        if (!q) return pool;
        return pool.filter((o) =>
            o.title.toLowerCase().includes(q)
        );
    }, [options, search, selectedIds]);

    const selectedChips = useMemo(() => {
        return selectedIds
            .map((id) => options.find((o) => o.id === id))
            .filter(Boolean) as MultiselectOption[];
    }, [selectedIds, options]);

    /* Debounced double-fire guard for onPressIn + onPress */
    const addOnce = (opt: MultiselectOption) => {
        if (lastAddedId.current === opt.id) return;
        lastAddedId.current = opt.id;
        setTimeout(() => {
            if (lastAddedId.current === opt.id) {
                lastAddedId.current = null;
            }
        }, 250);
        handleAdd(opt);
    };

    const handleAdd = (opt: MultiselectOption) => {
        helpers.setValue([...selectedIds, opt.id]);
        helpers.setTouched(true);
        setSearch("");
        if (blurTimeout.current) {
            clearTimeout(blurTimeout.current);
            blurTimeout.current = null;
        }
        inputRef.current?.focus();
        onAfterSelect?.(opt.id, opt.title, opt);
    };

    const handleRemove = (opt: MultiselectOption) => {
        helpers.setValue(
            selectedIds.filter((x) => x !== opt.id)
        );
        helpers.setTouched(true);
        onAfterRemove?.(opt.id, opt.title, opt);
    };

    const handleBlur = () => {
        setIsFocused(false);
        blurTimeout.current = setTimeout(() => {
            setDropdownOpen(false);
        }, 250);
    };

    const handleFocus = () => {
        setIsFocused(true);
        if (blurTimeout.current) {
            clearTimeout(blurTimeout.current);
            blurTimeout.current = null;
        }
        setDropdownOpen(true);
    };

    const focusInput = () => {
        inputRef.current?.focus();
    };

    return (
        <View
            className="items-start w-full"
            style={{
                position: "relative",
                zIndex: dropdownOpen ? 9999 : 0,
            }}
        >
            <Text
                style={{ color: theme.textDark }}
                className="text-[10px] uppercase font-black tracking-wider mb-1"
            >
                {label}
            </Text>

            {/* Tag-input container */}
            <Pressable
                onPress={focusInput}
                style={{
                    backgroundColor: theme.background,
                    borderColor: hasError
                        ? "#ef4444"
                        : isFocused
                            ? theme.primary
                            : theme.border,
                    borderWidth: 1,
                    borderRadius: 12,
                    minHeight: 42,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                }}
            >
                {selectedChips.map((chip) => (
                    <View
                        key={chip.id}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingLeft: 8,
                            paddingRight: 4,
                            paddingVertical: 3,
                            borderRadius: 999,
                            backgroundColor: `${theme.primary}15`,
                            borderWidth: 1,
                            borderColor: `${theme.primary}40`,
                            maxWidth: "100%",
                        }}
                    >
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                            }}
                            numberOfLines={1}
                        >
                            {chip.title}
                        </Text>
                        <Pressable
                            onPressIn={() => handleRemove(chip)}
                            hitSlop={10}
                            style={{
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: `${theme.primary}30`,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    lineHeight: 12,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>
                ))}

                <TextInput
                    ref={inputRef}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChangeText={(txt) => {
                        setSearch(txt);
                        setDropdownOpen(true);
                    }}
                    value={search}
                    placeholder={
                        selectedChips.length > 0
                            ? ""
                            : loading
                                ? loadingPlaceholder
                                : placeholder
                    }
                    placeholderTextColor="#64748b"
                    style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        flexBasis: 80,
                        minWidth: 80,
                        height: 28,
                        paddingHorizontal: 2,
                        paddingVertical: 0,
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: 14,
                        borderWidth: 0,
                        backgroundColor: "transparent",
                        // @ts-ignore web-only
                        outlineStyle: "none",
                    }}
                />
            </Pressable>

            {hasError && errorText && (
                <Text className="text-red-500 text-[11px] font-semibold mt-1">
                    {errorText}
                </Text>
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
                        borderColor: theme.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        maxHeight: dropdownMaxHeight,
                        overflow: "hidden",
                        zIndex: 9999,
                        // @ts-ignore web-only
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                >
                    <ScrollView
                        keyboardShouldPersistTaps="always"
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
                                        : selectedIds.length ===
                                            options.length
                                            ? allPickedText
                                            : noMatchText}
                                </Text>
                            </View>
                        ) : (
                            <View className="flex-col">
                                {filtered.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        onPressIn={() =>
                                            addOnce(item)
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
                                                color: theme.text,
                                                fontFamily:
                                                    theme.font.medium,
                                                fontSize: 12,
                                            }}
                                        >
                                            {item.title}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}