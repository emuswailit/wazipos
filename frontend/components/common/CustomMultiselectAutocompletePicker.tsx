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
//
// Visual style: delimiters (borders, dividers) are intentionally
// soft. The container and dropdown read as one surface without
// harsh edges.
//
// Scrolling: the dropdown owns its own scroll. Nested scroll is
// enabled so it works when the field lives inside a parent
// ScrollView (e.g. a modal form).

import { useField } from "formik";
import {
    useMemo,
    useRef,
    useState,
} from "react";
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

interface MultiselectOption {
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
    /**
     * Maximum height of the dropdown list, in pixels.
     * Defaults to ~half a typical small-screen viewport, so a
     * long list scrolls instead of dominating the form.
     */
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
 * Soft delimiter tokens
 * ======================================================= */
const DELIMITER_DARK = "rgba(148,163,184,0.15)";
const DELIMITER_LIGHT = "rgba(15,23,42,0.06)";
const FOCUS_DELIMITER_DARK = "rgba(148,163,184,0.28)";
const FOCUS_DELIMITER_LIGHT = "rgba(15,23,42,0.14)";

/* =========================================================
 * Default dropdown sizing
 *
 * Bumped from 180 → 320 so several rows are visible without
 * scrolling. On very small screens the actual rendered height
 * is clamped below (see dynamicMaxHeight).
 * ======================================================= */
const DEFAULT_DROPDOWN_MAX_HEIGHT = 320;
const MIN_DROPDOWN_HEIGHT = 160;
const APPROX_ROW_HEIGHT = 44;

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
    dropdownMaxHeight = DEFAULT_DROPDOWN_MAX_HEIGHT,
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

    /* ---------------------------------------------------------
     * Dropdown height
     *
     * Three constraints, take the smallest:
     *   1. Caller's dropdownMaxHeight (default 320).
     *   2. A height that fits `filtered.length` rows without
     *      scrolling — no point forcing a scroll for 3 items.
     *   3. Not smaller than MIN_DROPDOWN_HEIGHT for one or two
     *      rows, so the box doesn't look cramped.
     * ------------------------------------------------------- */
    const dynamicMaxHeight = useMemo(() => {
        const contentHeight =
            filtered.length * APPROX_ROW_HEIGHT + 8;
        const desired = Math.min(dropdownMaxHeight, contentHeight);
        return Math.max(MIN_DROPDOWN_HEIGHT, desired);
    }, [filtered.length, dropdownMaxHeight]);

    /* Delimiter colors */
    const baseDelimiter = isDarkMode
        ? DELIMITER_DARK
        : DELIMITER_LIGHT;
    const focusDelimiter = isDarkMode
        ? FOCUS_DELIMITER_DARK
        : FOCUS_DELIMITER_LIGHT;

    /* ---------------------------------------------------------
     * Selection / removal handlers
     * ------------------------------------------------------- */

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
            {label ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font?.bold,
                        fontSize: 10,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        paddingHorizontal: 4,
                        marginBottom: 4,
                    }}
                >
                    {label}
                </Text>
            ) : null}

            {/* ───────── Tag-input container ───────── */}
            <Pressable
                onPress={focusInput}
                style={{
                    backgroundColor: isDarkMode
                        ? "#0f172a"
                        : theme.surface ?? theme.background,
                    borderColor: hasError
                        ? "#ef4444"
                        : isFocused
                            ? focusDelimiter
                            : baseDelimiter,
                    borderWidth: 1,
                    borderRadius: 10,
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
                            borderColor: `${theme.primary}30`,
                            maxWidth: "100%",
                        }}
                    >
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                letterSpacing: 0.3,
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
                                backgroundColor: `${theme.primary}25`,
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
                    placeholderTextColor={
                        isDarkMode ? "#64748b" : "#94a3b8"
                    }
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
                        fontSize: 13,
                        borderWidth: 0,
                        backgroundColor: "transparent",
                        ...({ outlineStyle: "none" } as any),
                    }}
                />
            </Pressable>

            {hasError && errorText && (
                <Text
                    style={{
                        color: "#ef4444",
                        fontSize: 11,
                        paddingHorizontal: 4,
                        marginTop: 4,
                    }}
                >
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
                        borderColor: baseDelimiter,
                        borderWidth: 1,
                        borderRadius: 10,

                        // ✅ Taller dropdown, clamped so it fits on
                        // small screens and grows naturally with
                        // the list (see dynamicMaxHeight).
                        height: dynamicMaxHeight,
                        maxHeight: dynamicMaxHeight,

                        overflow: "hidden",
                        zIndex: 9999,
                        // @ts-ignore web-only
                        boxShadow: isDarkMode
                            ? "0 8px 24px rgba(0,0,0,0.35)"
                            : "0 8px 24px rgba(15,23,42,0.08)",
                    }}
                >
                    {/* ✅ Independent scroll.
                         • keyboardShouldPersistTaps="always" keeps the
                           dropdown open when the user taps a row on
                           iOS — otherwise the first tap is consumed
                           by dismissing the keyboard.
                         • nestedScrollEnabled lets the inner scroll
                           win over the outer modal's ScrollView on
                           Android.
                         • On web, React Native Web maps ScrollView to
                           a div with overflow:auto, so it scrolls
                           natively. overscrollBehavior: 'contain'
                           prevents the wheel from bubbling to the
                           outer scroll when the list reaches its end. */}
                    <ScrollView
                        style={{
                            flex: 1,
                            // @ts-ignore web-only
                            overscrollBehavior: "contain",
                        }}
                        contentContainerStyle={{
                            paddingVertical: 2,
                        }}
                        keyboardShouldPersistTaps="always"
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        // On iOS, bounce gives a clearer "this list
                        // scrolls independently" signal.
                        bounces={Platform.OS === 'ios'}
                        scrollEventThrottle={16}
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
                                        fontSize: 12,
                                    }}
                                    className="font-medium text-center"
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
                                        style={({ pressed }) => ({
                                            backgroundColor:
                                                pressed
                                                    ? isDarkMode
                                                        ? "rgba(148,163,184,0.08)"
                                                        : "rgba(15,23,42,0.04)"
                                                    : "transparent",
                                            borderBottomColor:
                                                baseDelimiter,
                                            borderBottomWidth: 1,
                                        })}
                                        className="px-4 py-3"
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