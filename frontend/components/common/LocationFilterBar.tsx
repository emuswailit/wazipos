// components/common/LocationFilterBar.tsx
//
// County + sub-county autocomplete pickers.
//
// NESTED INTERACTIVES
//   On react-native-web, View with accessibilityRole="button"
//   renders as a real <button type="button"> element — same as
//   TouchableOpacity and Pressable. A <button> cannot contain
//   another <button>, so the trigger and the clear button inside
//   a picker row are SIBLINGS under a plain <div>, never parent
//   and child. Handlers use:
//     web    → onClick (with stopPropagation where needed)
//     native → onStartShouldSetResponder + onResponderRelease
//
// Data sourcing:
//   1. Counties are fetched once on mount from `fetchCounties()`.
//   2. If a county object carries nested sub-counties, they're used
//      directly — no extra request.
//   3. Otherwise, `fetchSubCounties(countyId)` is called.

import client from "@/api/client";
import { Check, ChevronDown, Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    Text,
    TextInput,
    View,
} from "react-native";

const isWeb = Platform.OS === "web";
const webPointer = isWeb ? ({ cursor: "pointer" } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: "none" } as any) : {};

/* ════════════════════════════════════════════════════════════
 *  Data source
 * ════════════════════════════════════════════════════════════ */

interface LocationOption {
    id: string;
    label: string;
    /** Present when the backend nests sub-counties inside a county. */
    subCounties?: LocationOption[];
}

function normalizeSubCounty(s: any): LocationOption | null {
    const id = String(s?.id ?? s?.uuid ?? s?.value ?? "");
    const label = String(
        s?.title ?? s?.name ?? s?.sub_county ?? s?.label ?? "",
    );
    if (!id || !label) return null;
    return { id, label };
}

function normalizeCounty(c: any): LocationOption | null {
    const id = String(c?.id ?? c?.uuid ?? c?.value ?? "");
    const label = String(c?.title ?? c?.name ?? c?.county ?? c?.label ?? "");
    if (!id || !label) return null;

    const rawSubs =
        c?.sub_counties ??
        c?.subcounties ??
        c?.subCounties ??
        c?.sub_locations ??
        null;

    const subCounties = Array.isArray(rawSubs)
        ? (rawSubs.map(normalizeSubCounty).filter(Boolean) as LocationOption[])
        : undefined;

    return { id, label, subCounties };
}

async function fetchCounties(): Promise<LocationOption[]> {
    const res: any = await client.post("/authentication/counties", {
        action: "GetCounties",
    });

    const rows = res?.data?.results ?? res?.data ?? res;
    console.log("[LocationFilterBar] counties raw response:", res?.data ?? res);

    return (Array.isArray(rows) ? rows : [])
        .map(normalizeCounty)
        .filter(Boolean) as LocationOption[];
}

async function fetchSubCounties(countyId: string): Promise<LocationOption[]> {
    const res: any = await client.post("/authentication/sub-counties", {
        action: "GetSubCounties",
        county: countyId,
    });

    console.log(
        "[LocationFilterBar] sub-counties raw response for county",
        countyId,
        ":",
        res?.data ?? res,
    );

    const rows = res?.data?.results ?? res?.data ?? res;
    return (Array.isArray(rows) ? rows : [])
        .map(normalizeSubCounty)
        .filter(Boolean) as LocationOption[];
}

/* ════════════════════════════════════════════════════════════
 *  Props
 * ════════════════════════════════════════════════════════════ */

interface LocationFilterBarProps {
    county: string;
    subCounty: string;
    onChangeCounty: (id: string) => void;
    onChangeSubCounty: (id: string) => void;
    theme: any;
    isDarkMode: boolean;
    countyLabel?: string;
    subCountyLabel?: string;
    gap?: number;
    horizontal?: boolean;
}

/* ════════════════════════════════════════════════════════════
 *  Single autocomplete picker
 * ════════════════════════════════════════════════════════════ */

interface LocationPickerProps {
    label: string;
    placeholder: string;
    value: string;
    options: LocationOption[];
    loading: boolean;
    disabled?: boolean;
    theme: any;
    isDarkMode: boolean;
    onChange: (id: string) => void;
    horizontal?: boolean;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
    label,
    placeholder,
    value,
    options,
    loading,
    disabled = false,
    theme,
    isDarkMode,
    onChange,
    horizontal = false,
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const borderColor = isDarkMode ? "#334155" : "#e2e8f0";
    const subtleBg = isDarkMode ? "#0f172a" : "#f1f5f9";
    const rowDivider = isDarkMode ? "#1e293b" : "#f1f5f9";

    const selected = options.find((o) => o.id === value);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, query]);

    /* ── Handlers ─────────────────────────────────────────── */

    const handleOpen = () => {
        if (disabled || loading) return;
        setQuery("");
        setOpen(true);
    };

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
    };

    const handleClear = () => {
        onChange("");
    };

    /* Reusable handler bundles — the platform shape every View
       below uses to behave like a button without rendering a
       nested one. */
    const pressHandlers = (
        onPress: () => void,
        stopPropagation = false,
    ) =>
        isWeb
            ? {
                onClick: (e: any) => {
                    if (stopPropagation) e?.stopPropagation?.();
                    onPress();
                },
            }
            : {
                onStartShouldSetResponder: () => true,
                onResponderRelease: (e: any) => {
                    if (stopPropagation) e?.stopPropagation?.();
                    onPress();
                },
            };

    /* ── Render ───────────────────────────────────────────── */

    return (
        <View
            style={{
                flex: horizontal ? 1 : undefined,
                minWidth: 0,
            }}
        >
            {/* Label */}
            <Text
                style={{
                    fontFamily: theme.font.bold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: theme.textDark,
                    marginBottom: 4,
                }}
            >
                {label}
            </Text>

            {/* ═══ Trigger row ═══
                Outer is a plain View (renders as <div>). The
                trigger and the clear button are SIBLINGS inside
                it — never parent/child — so each can be a real
                <button> without React DOM complaining about
                nested buttons. */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    height: 38,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor:
                        disabled || loading ? subtleBg : theme.panel,
                    opacity: disabled ? 0.6 : 1,
                    paddingRight: value ? 4 : 0,
                }}
            >
                {/* Trigger — the clickable region that opens the
                    dropdown. Owns the left/center padding so the
                    whole text area is tappable. */}
                <View
                    {...(disabled || loading ? {} : pressHandlers(handleOpen))}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled }}
                    style={{
                        flex: 1,
                        height: "100%",
                        flexDirection: "row",
                        alignItems: "center",
                        minWidth: 0,
                        paddingHorizontal: 10,
                        ...(disabled || loading ? {} : webPointer),
                    }}
                >
                    {loading && !selected ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.textDark}
                            style={{ marginRight: 6 }}
                        />
                    ) : null}

                    <Text
                        numberOfLines={1}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: selected
                                ? theme.font.medium
                                : theme.font.regular,
                            fontSize: 13,
                            color: selected ? theme.text : theme.textDark,
                        }}
                    >
                        {selected?.label ?? placeholder}
                    </Text>

                    {!value && (
                        <ChevronDown size={14} color={theme.textDark} />
                    )}
                </View>

                {/* Clear button — sibling of the trigger, not a
                    child. Renders only when there's a value to
                    clear. */}
                {value ? (
                    <View
                        {...pressHandlers(handleClear, true)}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear ${label}`}
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: subtleBg,
                            marginRight: 6,
                            ...webPointer,
                        }}
                    >
                        <X size={11} color={theme.textDark} />
                    </View>
                ) : null}
            </View>

            {/* Dropdown */}
            <Modal
                visible={open}
                transparent
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                {/* Backdrop — a View, never a Pressable */}
                <View
                    {...pressHandlers(() => setOpen(false))}
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.35)",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 16,
                    }}
                >
                    {/* Content — a View; clicks do not dismiss */}
                    <View
                        {...pressHandlers(() => { }, true)}
                        style={{
                            width: "100%",
                            maxWidth: 380,
                            maxHeight: "70%",
                            backgroundColor: theme.panel,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor,
                            overflow: "hidden",
                        }}
                    >
                        {/* Header */}
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: borderColor,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                    color: theme.text,
                                }}
                            >
                                {label}
                            </Text>
                            <View
                                {...pressHandlers(() => setOpen(false))}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 13,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: subtleBg,
                                    ...webPointer,
                                }}
                            >
                                <X size={12} color={theme.text} />
                            </View>
                        </View>

                        {/* Search */}
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                marginHorizontal: 12,
                                marginTop: 12,
                                marginBottom: 6,
                                paddingHorizontal: 10,
                                height: 36,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor: subtleBg,
                            }}
                        >
                            <Search size={13} color={theme.textDark} />
                            <TextInput
                                placeholder={placeholder}
                                placeholderTextColor={theme.textDark}
                                value={query}
                                onChangeText={setQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoFocus={isWeb}
                                style={{
                                    flex: 1,
                                    height: "100%",
                                    marginLeft: 8,
                                    fontFamily: theme.font.regular,
                                    fontSize: 13,
                                    color: theme.text,
                                    ...webNoOutline,
                                }}
                            />
                            {query.length > 0 && (
                                <View
                                    {...pressHandlers(() => setQuery(""))}
                                    accessibilityRole="button"
                                    accessibilityLabel="Clear search"
                                    style={webPointer}
                                >
                                    <X size={12} color={theme.textDark} />
                                </View>
                            )}
                        </View>

                        {/* Body */}
                        {loading ? (
                            <View
                                style={{
                                    paddingVertical: 32,
                                    alignItems: "center",
                                }}
                            >
                                <ActivityIndicator
                                    size="small"
                                    color={theme.primary}
                                />
                            </View>
                        ) : filtered.length === 0 ? (
                            <View
                                style={{
                                    paddingVertical: 32,
                                    paddingHorizontal: 16,
                                }}
                            >
                                <Text
                                    style={{
                                        textAlign: "center",
                                        fontFamily: theme.font.regular,
                                        fontSize: 13,
                                        color: theme.textDark,
                                    }}
                                >
                                    No matches.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filtered}
                                keyExtractor={(o) => o.id}
                                keyboardShouldPersistTaps="handled"
                                style={{ maxHeight: 320 }}
                                ItemSeparatorComponent={() => (
                                    <View
                                        style={{
                                            height: 1,
                                            backgroundColor: rowDivider,
                                        }}
                                    />
                                )}
                                renderItem={({ item }) => {
                                    const active = item.id === value;
                                    return (
                                        <View
                                            {...pressHandlers(() =>
                                                handleSelect(item.id),
                                            )}
                                            accessibilityRole="button"
                                            accessibilityLabel={item.label}
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                paddingHorizontal: 14,
                                                paddingVertical: 10,
                                                backgroundColor: active
                                                    ? `${theme.primary}15`
                                                    : "transparent",
                                                ...webPointer,
                                            }}
                                        >
                                            <Text
                                                numberOfLines={1}
                                                style={{
                                                    flex: 1,
                                                    fontFamily: active
                                                        ? theme.font.semibold
                                                        : theme.font.regular,
                                                    fontSize: 13,
                                                    color: active
                                                        ? theme.primary
                                                        : theme.text,
                                                }}
                                            >
                                                {item.label}
                                            </Text>
                                            {active && (
                                                <Check
                                                    size={14}
                                                    color={theme.primary}
                                                />
                                            )}
                                        </View>
                                    );
                                }}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
};

/* ════════════════════════════════════════════════════════════
 *  Bar
 * ════════════════════════════════════════════════════════════ */

export default function LocationFilterBar({
    county,
    subCounty,
    onChangeCounty,
    onChangeSubCounty,
    theme,
    isDarkMode,
    countyLabel = "County",
    subCountyLabel = "Sub-county",
    gap = 8,
    horizontal = false,
}: LocationFilterBarProps) {
    const [counties, setCounties] = useState<LocationOption[]>([]);
    const [subCounties, setSubCounties] = useState<LocationOption[]>([]);
    const [loadingCounties, setLoadingCounties] = useState(false);
    const [loadingSubCounties, setLoadingSubCounties] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadingCounties(true);
        fetchCounties()
            .then((rows) => {
                if (cancelled) return;
                setCounties(rows);
                console.log(
                    "[LocationFilterBar] counties loaded:",
                    rows.length,
                    "· sample:",
                    rows[0],
                );
            })
            .catch((e) => {
                console.warn("[LocationFilterBar] counties fetch failed:", e);
                if (!cancelled) setCounties([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingCounties(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!county) {
            setSubCounties([]);
            return;
        }

        const parent = counties.find((c) => c.id === county);

        if (parent?.subCounties && parent.subCounties.length > 0) {
            setSubCounties(parent.subCounties);
            setLoadingSubCounties(false);
            return;
        }

        let cancelled = false;
        setLoadingSubCounties(true);
        fetchSubCounties(county)
            .then((rows) => {
                if (!cancelled) setSubCounties(rows);
            })
            .catch((e) => {
                console.warn(
                    "[LocationFilterBar] sub-counties fetch failed:",
                    e,
                );
                if (!cancelled) setSubCounties([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingSubCounties(false);
            });

        return () => {
            cancelled = true;
        };
    }, [county, counties]);

    return (
        <View
            style={{
                flexDirection: horizontal ? "row" : "column",
                alignItems: horizontal ? "flex-start" : "stretch",
                gap,
            }}
        >
            <LocationPicker
                label={countyLabel}
                placeholder="Type to filter counties…"
                value={county}
                options={counties}
                loading={loadingCounties}
                theme={theme}
                isDarkMode={isDarkMode}
                onChange={onChangeCounty}
                horizontal={horizontal}
            />

            <LocationPicker
                label={subCountyLabel}
                placeholder={
                    county
                        ? "Type to filter sub-counties…"
                        : "Pick a county first"
                }
                value={subCounty}
                options={subCounties}
                loading={loadingSubCounties}
                disabled={!county}
                theme={theme}
                isDarkMode={isDarkMode}
                onChange={onChangeSubCounty}
                horizontal={horizontal}
            />
        </View>
    );
}