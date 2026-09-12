// app/(wholesalers)/wholesaleInventory/ProductAutocomplete.tsx

import React, {
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    Image,
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

    /*
     * Optional. Prevents a runtime crash when the parent
     * does not provide it.
     */
    onSelect?: (id: string, title: string) => void;

    zIndexValue?: number;

    /*
     * Products list passed down from the modal.
     * The context hook is no longer called inside this
     * component.
     */
    products: any[];
}

interface ProductOption {
    id: string;
    title: string;
    barcode: string;
    images: any[];
    thumbnail_url: string | null;
}

const FALLBACK_BASE_URL = 'https://api.wazipos.co.ke';

export default function ProductAutocomplete({
    theme,
    isDarkMode,
    selectedValue = '',
    hasError = false,
    initialTitle = '',
    onSelect,
    zIndexValue = 999,
    products = [],
}: ProductAutocompleteProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(initialTitle);

    /*
     * Keep the text synchronized when the parent changes
     * the initially selected product.
     */
    useEffect(() => {
        setSearch(initialTitle ?? '');
    }, [initialTitle]);

    /*
     * Build a usable image URL from an image array.
     * Used only as a fallback when the pre-resolved
     * thumbnail_url is missing.
     */
    const getImageUrl = (
        images: any[]
    ): string | null => {
        if (!Array.isArray(images) || images.length === 0) {
            return null;
        }

        const firstImage = images[0];

        const rawPath =
            typeof firstImage === 'string'
                ? firstImage
                : firstImage?.thumbnail ||
                firstImage?.image ||
                firstImage?.url ||
                null;

        if (
            !rawPath ||
            typeof rawPath !== 'string'
        ) {
            return null;
        }

        const trimmedPath = rawPath.trim();
        if (!trimmedPath) return null;

        if (
            trimmedPath.startsWith('http://') ||
            trimmedPath.startsWith('https://')
        ) {
            return trimmedPath;
        }

        const cleanPath = trimmedPath.startsWith('/')
            ? trimmedPath.substring(1)
            : trimmedPath;

        return `${FALLBACK_BASE_URL}/${cleanPath
            .split('/')
            .map((segment) =>
                encodeURIComponent(segment)
            )
            .join('/')}`;
    };

    /*
     * Normalize products from the parent.
     *
     * Prefer the pre-resolved `thumbnail_url` set by the
     * ProductsSyncContext. Fall back to resolving the raw
     * images array in this component.
     */
    const options = useMemo<ProductOption[]>(() => {
        if (!Array.isArray(products)) {
            return [];
        }

        return products
            .map((item: any): ProductOption => ({
                id: String(item?.id ?? ''),
                title:
                    item?.long_title ||
                    item?.title ||
                    item?.product_name ||
                    'UNSPECIFIED',
                barcode: String(item?.bar_code ?? ''),
                images: Array.isArray(item?.images)
                    ? item.images
                    : [],
                thumbnail_url:
                    item?.thumbnail_url ||
                    item?.image_url ||
                    getImageUrl(
                        Array.isArray(item?.images)
                            ? item.images
                            : []
                    ),
            }))
            .filter((item) => item.id);
    }, [products]);

    /*
     * Filter products by title or barcode.
     */
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return options.slice(0, 20);
        }

        return options
            .filter((item) => {
                const titleMatch = item.title
                    .toLowerCase()
                    .includes(query);

                const barcodeMatch = item.barcode
                    .toLowerCase()
                    .includes(query);

                return titleMatch || barcodeMatch;
            })
            .slice(0, 20);
    }, [options, search]);

    /*
     * Handle product selection.
     *
     * onSelect is optional so this component can never crash
     * because the callback was not supplied.
     */
    const handleSelect = (
        id: string,
        title: string
    ): void => {
        setSearch(title);
        setOpen(false);

        if (typeof onSelect === 'function') {
            onSelect(id, title);
        } else {
            console.warn(
                '[ProductAutocomplete] onSelect callback was not provided.',
                { id, title }
            );
        }
    };

    return (
        <View
            style={{
                zIndex: zIndexValue,
                elevation: zIndexValue,
            }}
            className="items-start w-full relative"
        >
            {/* Label */}
            <Text
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font?.bold,
                }}
                className="text-[10px] uppercase font-black tracking-wider mb-1"
            >
                Select Catalog Product *
            </Text>

            {/* Search input */}
            <TextInput
                value={search}
                onFocus={() => setOpen(true)}
                onChangeText={(text: string) => {
                    setSearch(text);
                    setOpen(true);
                }}
                placeholder="Type to filter and select catalog item..."
                placeholderTextColor={
                    isDarkMode ? '#64748b' : '#94a3b8'
                }
                autoCorrect={false}
                autoCapitalize="none"
                style={{
                    backgroundColor: theme.background,
                    borderColor: hasError
                        ? '#ef4444'
                        : isDarkMode
                            ? '#475569'
                            : theme.primary,
                    color: theme.text,
                    fontFamily: theme.font?.medium,
                }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium"
            />

            {/* Dropdown */}
            {open && (
                <View
                    style={{
                        backgroundColor: isDarkMode
                            ? '#0f172a'
                            : '#ffffff',
                        borderColor: theme.primary,
                        zIndex: 9999,
                        elevation: 30,
                    }}
                    className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg overflow-hidden"
                >
                    <ScrollView
                        keyboardShouldPersistTaps="always"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        persistentScrollbar
                        style={{ maxHeight: 360 }}
                        contentContainerStyle={{
                            paddingVertical: 2,
                        }}
                    >
                        {filtered.length === 0 ? (
                            <View className="p-5">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                    }}
                                    className="text-xs text-center"
                                >
                                    No catalog items matched
                                    query.
                                </Text>
                            </View>
                        ) : (
                            filtered.map((item) => {
                                const imageUrl =
                                    item.thumbnail_url;

                                const isSelected =
                                    selectedValue === item.id;

                                return (
                                    <Pressable
                                        key={item.id}
                                        onPress={() =>
                                            handleSelect(
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
                                                        ? '#1e293b'
                                                        : '#f1f5f9'
                                                    : isSelected
                                                        ? isDarkMode
                                                            ? '#172554'
                                                            : '#eff6ff'
                                                        : 'transparent',
                                        })}
                                        className="min-h-[76px] px-3.5 py-2.5 flex-row items-center border-b border-slate-700/10"
                                    >
                                        {/* Product image */}
                                        <View
                                            style={{
                                                width: 54,
                                                height: 54,
                                                backgroundColor:
                                                    isDarkMode
                                                        ? '#1e293b'
                                                        : '#f1f5f9',
                                                borderColor:
                                                    isDarkMode
                                                        ? '#334155'
                                                        : '#e2e8f0',
                                            }}
                                            className="rounded-xl border items-center justify-center overflow-hidden flex-shrink-0"
                                        >
                                            {imageUrl ? (
                                                <Image
                                                    source={{
                                                        uri: imageUrl,
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                    }}
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <Text className="text-lg">
                                                    📦
                                                </Text>
                                            )}
                                        </View>

                                        {/* Product details */}
                                        <View className="flex-1 px-3 min-w-0">
                                            <Text
                                                style={{
                                                    color:
                                                        isSelected
                                                            ? theme.primary
                                                            : theme.text,
                                                    fontFamily:
                                                        isSelected
                                                            ? theme
                                                                .font
                                                                ?.bold
                                                            : theme
                                                                .font
                                                                ?.medium,
                                                }}
                                                className="text-xs"
                                                numberOfLines={2}
                                            >
                                                {item.title}
                                            </Text>

                                            {item.barcode ? (
                                                <Text
                                                    style={{
                                                        color:
                                                            theme.textDark,
                                                    }}
                                                    className="text-[9px] mt-1"
                                                    numberOfLines={1}
                                                >
                                                    SKU:{' '}
                                                    {item.barcode}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Selected check */}
                                        {isSelected && (
                                            <View className="w-6 h-6 rounded-full items-center justify-center">
                                                <Text
                                                    style={{
                                                        color:
                                                            theme.primary,
                                                    }}
                                                    className="text-sm font-black"
                                                >
                                                    ✓
                                                </Text>
                                            </View>
                                        )}
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}