// app/(wholesalers)/wholesaleInventory/EntityAutocomplete.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
    Image,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

interface EntityAutocompleteProps {
    theme: any;
    isDarkMode: boolean;

    /**
     * Form field name, e.g. "received_from"
     */
    name: string;

    /**
     * Selected entity UUID.
     */
    selectedValue: string;

    /**
     * One or more entity types to include.
     *
     * Example:
     *   entityTypes={['GeneralWholesaler']}
     *
     * Multiple types:
     *   entityTypes={['GeneralWholesaler', 'Retailer']}
     */
    entityTypes: string[];

    hasError: boolean;

    initialTitle?: string;

    /**
     * Called when an entity is selected.
     */
    onSelect: (id: string, title: string) => void;

    /**
     * Stacking order when multiple autocomplete components render together.
     */
    zIndexValue: number;

    label?: string;
    placeholder?: string;

    /**
     * Entities passed down from the parent (InventoryContainer).
     * The parent owns the useEntitiesSync() call so the modal
     * doesn't re-fetch on every open.
     */
    entities: any[];
}

const FALLBACK_BASE_URL = 'https://api.wazipos.co.ke';

export default function EntityAutocomplete({
    theme,
    isDarkMode,
    name,
    selectedValue,
    entityTypes,
    hasError,
    initialTitle,
    onSelect,
    zIndexValue,
    label = 'Select Entity',
    placeholder = 'Type to filter and select entity...',
    entities = [],
}: EntityAutocompleteProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setSearch(initialTitle || '');
    }, [initialTitle]);

    /**
     * Filter entities by the supplied entityTypes array.
     *
     * If entityTypes is empty, no entities are returned intentionally —
     * this prevents accidentally showing every entity in the database.
     */
    const options = useMemo(() => {
        if (
            !Array.isArray(entityTypes) ||
            entityTypes.length === 0
        ) {
            return [];
        }

        if (!Array.isArray(entities)) return [];

        const allowedTypes = new Set(
            entityTypes
                .filter(Boolean)
                .map((type) =>
                    String(type).trim().toLowerCase()
                )
        );

        return entities
            .filter((entity: any) => {
                const entityType = String(
                    entity.entity_type || ''
                )
                    .trim()
                    .toLowerCase();

                return allowedTypes.has(entityType);
            })
            .map((entity: any) => ({
                id: String(entity.id),
                title:
                    entity.title ||
                    entity.entity_name ||
                    entity.name ||
                    'UNSPECIFIED',
                entity_type: entity.entity_type || '',
                phone: entity.phone || '',
                town: entity.town || '',
                images: Array.isArray(entity.images)
                    ? entity.images
                    : [],
                logos: Array.isArray(entity.logos)
                    ? entity.logos
                    : [],
            }));
    }, [entities, entityTypes]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        if (!q) return options;

        return options.filter((item) => {
            return (
                item.title.toLowerCase().includes(q) ||
                item.entity_type
                    .toLowerCase()
                    .includes(q) ||
                item.phone.toLowerCase().includes(q) ||
                item.town.toLowerCase().includes(q)
            );
        });
    }, [options, search]);

    /**
     * Resolve the first usable image/logo path into a full URL.
     */
    const getImageUrl = (entity: any): string | null => {
        const rawImage =
            entity.logos?.[0]?.image ||
            entity.logos?.[0]?.thumbnail ||
            entity.logos?.[0] ||
            entity.images?.[0]?.image ||
            entity.images?.[0]?.thumbnail ||
            entity.images?.[0];

        if (
            typeof rawImage !== 'string' ||
            !rawImage.trim()
        ) {
            return null;
        }

        const trimmed = rawImage.trim();

        if (
            trimmed.startsWith('http://') ||
            trimmed.startsWith('https://')
        ) {
            return trimmed;
        }

        const cleanPath = trimmed.startsWith('/')
            ? trimmed.substring(1)
            : trimmed;

        return `${FALLBACK_BASE_URL}/${cleanPath
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/')}`;
    };

    return (
        <View
            style={{ zIndex: zIndexValue }}
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
                {label} *
            </Text>

            {/* Search input */}
            <TextInput
                onFocus={() => setOpen(true)}
                onChangeText={(text) => {
                    setSearch(text);
                    setOpen(true);
                }}
                value={search}
                placeholder={placeholder}
                placeholderTextColor="#64748b"
                style={{
                    backgroundColor: theme.background,
                    borderColor: hasError
                        ? '#ef4444'
                        : theme.primary,
                    color: theme.text,
                    fontFamily: theme.font?.medium,
                }}
                className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium"
                autoCapitalize="none"
            />

            {open && (
                <View
                    style={{
                        backgroundColor: isDarkMode
                            ? '#0f172a'
                            : '#ffffff',
                        borderColor: hasError
                            ? '#ef4444'
                            : theme.primary,
                        zIndex: 9999,
                    }}
                    className="absolute top-[68px] left-0 right-0 border rounded-xl shadow-lg overflow-hidden"
                >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        style={{ maxHeight: 300 }}
                        contentContainerStyle={{
                            flexGrow: 1,
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
                                    No matching entities found.
                                </Text>
                            </View>
                        ) : (
                            filtered.map((item) => {
                                const imageUrl =
                                    getImageUrl(item);
                                const isSelected =
                                    selectedValue === item.id;

                                return (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => {
                                            onSelect(
                                                item.id,
                                                item.title
                                            );
                                            setSearch(
                                                item.title
                                            );
                                            setOpen(false);
                                        }}
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
                                        className="px-3 py-2.5 border-b border-slate-700/5 flex-row items-center"
                                    >
                                        {/* Entity logo/image on LEFT */}
                                        <View
                                            className="rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden flex-shrink-0"
                                            style={{
                                                width: 40,
                                                height: 40,
                                            }}
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
                                                <Text className="text-sm">
                                                    🏢
                                                </Text>
                                            )}
                                        </View>

                                        {/* Entity details */}
                                        <View className="flex-1 ml-3 min-w-0">
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? theme.primary
                                                        : theme.text,
                                                    fontFamily:
                                                        theme.font
                                                            ?.bold,
                                                }}
                                                className={`text-xs ${isSelected
                                                    ? 'font-black'
                                                    : 'font-semibold'
                                                    }`}
                                                numberOfLines={1}
                                            >
                                                {item.title}
                                            </Text>

                                            <View className="flex-row items-center mt-1">
                                                <Text
                                                    style={{
                                                        color:
                                                            theme.textDark,
                                                    }}
                                                    className="text-[9px] uppercase font-bold"
                                                    numberOfLines={1}
                                                >
                                                    {
                                                        item.entity_type
                                                    }
                                                </Text>

                                                {!!item.town && (
                                                    <Text
                                                        style={{
                                                            color:
                                                                theme.textDark,
                                                        }}
                                                        className="text-[9px] ml-2"
                                                        numberOfLines={
                                                            1
                                                        }
                                                    >
                                                        •{' '}
                                                        {
                                                            item.town
                                                        }
                                                    </Text>
                                                )}
                                            </View>

                                            {!!item.phone && (
                                                <Text
                                                    style={{
                                                        color:
                                                            theme.textDark,
                                                    }}
                                                    className="text-[9px] mt-0.5"
                                                    numberOfLines={1}
                                                >
                                                    {item.phone}
                                                </Text>
                                            )}
                                        </View>

                                        {isSelected && (
                                            <Text
                                                style={{
                                                    color:
                                                        theme.primary,
                                                }}
                                                className="text-sm font-black ml-2"
                                            >
                                                ✓
                                            </Text>
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