// app/(wholesalers)/wholesaleInventory/ProductAutocomplete.tsx

import { ProductItem } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Dimensions,
    Image,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

interface ProductAutocompleteProps {
    theme: any;
    isDarkMode: boolean;
    selectedValue?: string;
    hasError?: boolean;
    initialTitle?: string;
    onSelect: (remoteId: string, title: string) => void;
    zIndexValue?: number;
    products: ProductItem[];
}

const log = (...args: any[]) => {
    if (__DEV__) console.log('[ProductAutocomplete]', ...args);
};

function pickThumbnail(p: ProductItem): string | null {
    const first = Array.isArray(p.images) ? p.images[0] : null;
    if (!first) return null;
    return first.thumbnail || first.image || null;
}

/* ---------------------------------------------------------
 * Constants
 * ------------------------------------------------------- */
const HEADER_HEIGHT = 36;
const MIN_DROPDOWN_HEIGHT = 140;
const MAX_DROPDOWN_HEIGHT = 560;
const SAFETY_BUFFER = 16;

export default function ProductAutocomplete({
    theme,
    isDarkMode,
    selectedValue = '',
    hasError = false,
    initialTitle = '',
    onSelect,
    zIndexValue = 100,
    products,
}: ProductAutocompleteProps) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [dropdownHeight, setDropdownHeight] = useState(320);
    const [dropdownTop, setDropdownTop] = useState(48);

    const containerRef = useRef<View>(null);
    const inputRef = useRef<TextInput>(null);

    const backgroundColor = isDarkMode ? '#1e293b' : '#f8fafc';
    const dropdownBackground = isDarkMode
        ? '#0f172a'
        : '#ffffff';
    const textColor = theme?.text || '#0f172a';
    const borderColor = hasError
        ? '#ef4444'
        : isDarkMode
            ? '#475569'
            : '#cbd5e1';
    const primary = theme?.primary || '#2563eb';
    const dividerColor = isDarkMode ? '#334155' : '#e5e7eb';

    /* ---------------------------------------------------------
     * Measure — dropdown fills from below the input to the
     * bottom of the viewport, within a sane min/max range.
     * ------------------------------------------------------- */
    const measure = useCallback(() => {
        if (!containerRef.current) return;

        containerRef.current.measureInWindow(
            (_x, y, _w, h) => {
                if (!h) return;

                const windowHeight =
                    Dimensions.get('window').height;

                // Space from the bottom of the input to the
                // bottom of the window (web) / safe area (native).
                const availableBelow =
                    windowHeight - y - h - SAFETY_BUFFER;

                // Space above the input.
                const availableAbove = y - SAFETY_BUFFER;

                // If there's more room above than below, prefer
                // flipping the dropdown upward.
                const flipUp =
                    availableBelow < MIN_DROPDOWN_HEIGHT &&
                    availableAbove > availableBelow;

                const space = flipUp
                    ? availableAbove
                    : availableBelow;

                const clamped = Math.max(
                    MIN_DROPDOWN_HEIGHT,
                    Math.min(MAX_DROPDOWN_HEIGHT, space)
                );

                setDropdownHeight(clamped);

                if (flipUp) {
                    // Anchor so the panel grows upward from the top
                    // of the input.
                    setDropdownTop(-clamped - 4);
                } else {
                    setDropdownTop(h + 4);
                }
            }
        );
    }, []);

    useEffect(() => {
        if (!open) return;

        const raf = requestAnimationFrame(measure);

        // Re-measure on layout changes:
        //  - native: orientation change / keyboard
        //  - web: window resize
        const sub = Dimensions.addEventListener(
            'change',
            measure
        );

        let webCleanup: (() => void) | undefined;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const onResize = () => measure();
            window.addEventListener('resize', onResize);
            window.addEventListener('scroll', onResize, true);
            webCleanup = () => {
                window.removeEventListener('resize', onResize);
                window.removeEventListener(
                    'scroll',
                    onResize,
                    true
                );
            };
        }

        return () => {
            cancelAnimationFrame(raf);
            sub?.remove?.();
            webCleanup?.();
        };
    }, [open, measure]);

    /* ---------------------------------------------------------
     * Filter
     * ------------------------------------------------------- */
    const filtered = useMemo(() => {
        const list = Array.isArray(products) ? products : [];
        const q = query.trim().toLowerCase();

        if (!q) return list.slice(0, 200);

        return list
            .filter((p) => {
                const title = String(p.title || '').toLowerCase();
                const longTitle = String(
                    p.long_title || ''
                ).toLowerCase();
                const productName = String(
                    p.product_name || ''
                ).toLowerCase();
                const barcode = String(
                    p.bar_code || ''
                ).toLowerCase();

                return (
                    title.includes(q) ||
                    longTitle.includes(q) ||
                    productName.includes(q) ||
                    barcode.includes(q)
                );
            })
            .slice(0, 200);
    }, [products, query]);

    /* ---------------------------------------------------------
     * Select
     * ------------------------------------------------------- */
    const handleSelect = useCallback(
        (product: ProductItem) => {
            const remoteId = String(
                product.remote_id ?? ''
            );
            const title = String(
                product.title ||
                product.long_title ||
                product.product_name ||
                ''
            );

            if (!remoteId) {
                console.warn(
                    '[ProductAutocomplete] Selected product has no remote_id:',
                    product
                );
                return;
            }

            onSelect(remoteId, title);
            setQuery('');
            setOpen(false);
        },
        [onSelect]
    );

    const displayValue = useMemo(() => {
        if (query) return query;
        if (selectedValue) return initialTitle || 'Selected product';
        return '';
    }, [query, selectedValue, initialTitle]);

    // Height of the scrollable list area, always at least
    // MIN_DROPDOWN_HEIGHT minus the header, and at most the
    // available dropdown height minus the header.
    const listHeight = Math.max(
        80,
        dropdownHeight - HEADER_HEIGHT
    );

    return (
        <View
            className="w-full"
            style={{
                zIndex: open ? zIndexValue + 1000 : zIndexValue,
                elevation: open
                    ? zIndexValue + 1000
                    : zIndexValue,
            }}
        >
            <Text
                style={{
                    color: theme?.textDark,
                    fontFamily: theme?.font?.bold,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                }}
            >
                Select Catalog Product *
            </Text>

            <View
                ref={containerRef}
                onLayout={measure}
                style={{ width: '100%', position: 'relative' }}
            >
                <TextInput
                    ref={inputRef}
                    value={displayValue}
                    onChangeText={(text) => {
                        setQuery(text);
                        setOpen(true);
                    }}
                    onFocus={() => {
                        setOpen(true);
                        requestAnimationFrame(measure);
                    }}
                    placeholder="Type to filter and select catalog item..."
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={{
                        backgroundColor,
                        color: textColor,
                        fontFamily: theme?.font?.medium,
                        borderColor,
                        borderWidth: 1,
                        height: 44,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        fontSize: 14,
                    }}
                />

                {open && (
                    <View
                        style={{
                            position: 'absolute',
                            top: dropdownTop,
                            left: 0,
                            right: 0,
                            height: dropdownHeight,
                            backgroundColor: dropdownBackground,
                            borderColor: primary,
                            borderWidth: 1,
                            borderRadius: 12,
                            zIndex: 10000,
                            elevation: 10000,
                            // `overflow: 'hidden'` clips the
                            // ScrollView corners to the panel's
                            // rounded corners.
                            overflow: 'hidden',
                        }}
                    >
                        {/* ---- Header (non-scrolling) ---- */}
                        <View
                            style={{
                                height: HEADER_HEIGHT,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 12,
                                borderBottomColor: dividerColor,
                                borderBottomWidth: 1,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme?.textDark,
                                    fontFamily: theme?.font?.bold,
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                }}
                            >
                                {filtered.length} match
                                {filtered.length === 1 ? '' : 'es'}
                            </Text>
                            <Pressable
                                onPress={() => setOpen(false)}
                                hitSlop={8}
                            >
                                <Text
                                    style={{
                                        color: theme?.textDark,
                                        fontFamily:
                                            theme?.font?.bold,
                                        fontSize: 10,
                                        textTransform: 'uppercase',
                                        letterSpacing: 1,
                                    }}
                                >
                                    Close ✕
                                </Text>
                            </Pressable>
                        </View>

                        {/* ---- Scrollable list ---- */}
                        <ScrollView
                            style={{ flex: 1, height: listHeight }}
                            contentContainerStyle={{
                                flexGrow: 1,
                                paddingBottom: 4,
                            }}
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator
                            scrollEventThrottle={16}
                            // Works well when a parent ScrollView
                            // tries to steal the gesture on native.
                            onStartShouldSetResponderCapture={() =>
                                true
                            }
                            {...(Platform.OS === 'web' && {
                                // Prevent parent scroll from
                                // hijacking wheel events.
                                onWheel: (e: any) =>
                                    e.stopPropagation?.(),
                            })}
                        >
                            {filtered.length === 0 ? (
                                <View
                                    style={{
                                        padding: 16,
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme?.textDark,
                                            fontFamily:
                                                theme?.font?.medium,
                                            fontSize: 12,
                                            textAlign: 'center',
                                        }}
                                    >
                                        No catalog items matched query.
                                    </Text>
                                </View>
                            ) : (
                                filtered.map((p, idx) => {
                                    const isSelected =
                                        String(p.remote_id) ===
                                        String(selectedValue);
                                    const thumb = pickThumbnail(p);
                                    const isLast =
                                        idx === filtered.length - 1;

                                    return (
                                        <Pressable
                                            key={
                                                p.remote_id ||
                                                String(p.id)
                                            }
                                            onPress={() =>
                                                handleSelect(p)
                                            }
                                            style={({ pressed }) => ({
                                                backgroundColor:
                                                    pressed
                                                        ? isDarkMode
                                                            ? '#1e293b'
                                                            : '#f1f5f9'
                                                        : isSelected
                                                            ? isDarkMode
                                                                ? '#172554'
                                                                : '#eff6ff'
                                                            : 'transparent',
                                            })}
                                        >
                                            <View
                                                style={{
                                                    flexDirection:
                                                        'row',
                                                    alignItems:
                                                        'center',
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 10,
                                                    borderBottomWidth:
                                                        isLast
                                                            ? 0
                                                            : 1,
                                                    borderBottomColor:
                                                        dividerColor,
                                                }}
                                            >
                                                {/* Thumbnail */}
                                                <View
                                                    style={{
                                                        width: 56,
                                                        height: 56,
                                                        borderRadius: 10,
                                                        marginRight: 12,
                                                        backgroundColor:
                                                            isDarkMode
                                                                ? '#0f172a'
                                                                : '#f1f5f9',
                                                        borderWidth: 1,
                                                        borderColor:
                                                            dividerColor,
                                                        alignItems:
                                                            'center',
                                                        justifyContent:
                                                            'center',
                                                        overflow:
                                                            'hidden',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {thumb ? (
                                                        <Image
                                                            source={{
                                                                uri: thumb,
                                                            }}
                                                            style={{
                                                                width: 56,
                                                                height: 56,
                                                            }}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <Text
                                                            style={{
                                                                fontSize: 22,
                                                                color: theme
                                                                    ?.textDark,
                                                                opacity: 0.4,
                                                            }}
                                                        >
                                                            📦
                                                        </Text>
                                                    )}
                                                </View>

                                                {/* Details */}
                                                <View
                                                    style={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                        justifyContent:
                                                            'center',
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            color: isSelected
                                                                ? primary
                                                                : textColor,
                                                            fontFamily:
                                                                theme
                                                                    ?.font
                                                                    ?.bold,
                                                            fontSize: 14,
                                                        }}
                                                        numberOfLines={2}
                                                    >
                                                        {p.title ||
                                                            p.long_title ||
                                                            p.product_name ||
                                                            '(untitled)'}
                                                    </Text>

                                                    <View
                                                        style={{
                                                            flexDirection:
                                                                'row',
                                                            flexWrap:
                                                                'wrap',
                                                            alignItems:
                                                                'center',
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        {p.category_title ? (
                                                            <>
                                                                <Text
                                                                    style={{
                                                                        color: theme
                                                                            ?.textDark,
                                                                        fontFamily:
                                                                            theme
                                                                                ?.font
                                                                                ?.medium,
                                                                        fontSize: 11,
                                                                    }}
                                                                    numberOfLines={
                                                                        1
                                                                    }
                                                                >
                                                                    {
                                                                        p.category_title
                                                                    }
                                                                </Text>
                                                                <Text
                                                                    style={{
                                                                        color: theme
                                                                            ?.textDark,
                                                                        marginHorizontal: 6,
                                                                        opacity: 0.5,
                                                                        fontSize: 11,
                                                                    }}
                                                                >
                                                                    •
                                                                </Text>
                                                            </>
                                                        ) : null}
                                                        <Text
                                                            style={{
                                                                color: theme
                                                                    ?.textDark,
                                                                fontFamily:
                                                                    theme
                                                                        ?.font
                                                                        ?.medium,
                                                                fontSize: 11,
                                                                opacity:
                                                                    p.bar_code
                                                                        ? 1
                                                                        : 0.6,
                                                            }}
                                                            numberOfLines={1}
                                                        >
                                                            {p.bar_code
                                                                ? `BC: ${p.bar_code}`
                                                                : 'No barcode'}
                                                        </Text>
                                                    </View>

                                                    {(p.manufacturer_title ||
                                                        p.final_unit_selling_price) && (
                                                            <View
                                                                style={{
                                                                    flexDirection:
                                                                        'row',
                                                                    flexWrap:
                                                                        'wrap',
                                                                    alignItems:
                                                                        'center',
                                                                    marginTop: 1,
                                                                }}
                                                            >
                                                                {p.manufacturer_title ? (
                                                                    <Text
                                                                        style={{
                                                                            color: theme
                                                                                ?.textDark,
                                                                            fontFamily:
                                                                                theme
                                                                                    ?.font
                                                                                    ?.medium,
                                                                            opacity: 0.75,
                                                                            fontSize: 10,
                                                                        }}
                                                                        numberOfLines={
                                                                            1
                                                                        }
                                                                    >
                                                                        {
                                                                            p.manufacturer_title
                                                                        }
                                                                    </Text>
                                                                ) : null}
                                                                {p.final_unit_selling_price ? (
                                                                    <>
                                                                        <Text
                                                                            style={{
                                                                                color: theme
                                                                                    ?.textDark,
                                                                                marginHorizontal: 6,
                                                                                opacity: 0.5,
                                                                                fontSize: 10,
                                                                            }}
                                                                        >
                                                                            •
                                                                        </Text>
                                                                        <Text
                                                                            style={{
                                                                                color: primary,
                                                                                fontFamily:
                                                                                    theme
                                                                                        ?.font
                                                                                        ?.bold,
                                                                                fontSize: 10,
                                                                            }}
                                                                        >
                                                                            KES{' '}
                                                                            {Number(
                                                                                p.final_unit_selling_price
                                                                            ).toFixed(
                                                                                2
                                                                            )}
                                                                        </Text>
                                                                    </>
                                                                ) : null}
                                                            </View>
                                                        )}
                                                </View>

                                                {isSelected && (
                                                    <Text
                                                        style={{
                                                            color: primary,
                                                            fontFamily:
                                                                theme
                                                                    ?.font
                                                                    ?.bold,
                                                            fontSize: 16,
                                                            marginLeft: 8,
                                                        }}
                                                    >
                                                        ✓
                                                    </Text>
                                                )}
                                            </View>
                                        </Pressable>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>
        </View>
    );
}