// components/admin/products/AdminProductDetailsModal.tsx
//
// Inline (not overlay) details view for a product.

import { useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { ProductItem } from './types';

const FALLBACK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface Props {
    routeItem: ProductItem | null;
    onClose: () => void;
    theme: any;
    formatDateHandler: (dateString: string) => string;
    onOpenEditTrigger: (item: ProductItem) => void;
}

export default function AdminProductDetailsModal({
    routeItem,
    onClose,
    theme,
    formatDateHandler,
    onOpenEditTrigger,
}: Props) {
    const [mainImage, setMainImage] =
        useState<string>(FALLBACK_IMAGE);

    useEffect(() => {
        if (
            routeItem &&
            Array.isArray(routeItem.images) &&
            routeItem.images.length > 0
        ) {
            setMainImage(routeItem.images[0]);
        } else {
            setMainImage(FALLBACK_IMAGE);
        }
    }, [routeItem]);

    if (!routeItem) return null;

    const handleEditAction = () => {
        onClose();
        onOpenEditTrigger(routeItem);
    };

    return (
        <ScrollView
            className="flex-1 w-full"
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
                paddingBottom: 40,
                paddingHorizontal: 16,
                paddingTop: 16,
            }}
        >
            {/* Header bar */}
            <View
                style={{
                    backgroundColor: theme.panel,
                    borderColor: theme.border,
                }}
                className="h-14 w-full border rounded-xl px-4 flex-row justify-between items-center mb-4"
            >
                <Text
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.sm,
                    }}
                    numberOfLines={1}
                >
                    {routeItem.title}
                </Text>
                <TouchableOpacity
                    onPress={onClose}
                    activeOpacity={0.7}
                    className="py-1 px-3 bg-red-500/10 active:bg-red-500/20 rounded-lg"
                >
                    <Text
                        className="text-red-500 text-xs"
                        style={{ fontFamily: theme.font.bold }}
                    >
                        ✕ Close Specs
                    </Text>
                </TouchableOpacity>
            </View>

            <View className="w-full max-w-3xl mx-auto flex-col gap-y-4">
                {/* Image card */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-4 rounded-2xl border items-center w-full flex-col gap-y-3"
                >
                    <View
                        className="w-full h-56 rounded-xl overflow-hidden border"
                        style={{
                            borderColor: theme.border,
                            backgroundColor: theme.background,
                        }}
                    >
                        <Image
                            source={{ uri: mainImage }}
                            style={{
                                width: '100%',
                                height: '100%',
                            }}
                            resizeMode="contain"
                        />
                    </View>

                    {routeItem.images &&
                        routeItem.images.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={
                                    false
                                }
                                contentContainerStyle={{
                                    gap: 10,
                                    paddingVertical: 2,
                                }}
                                className="flex-row w-full"
                            >
                                {routeItem.images.map(
                                    (imgUri, idx) => {
                                        const isSelected =
                                            mainImage === imgUri;
                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                activeOpacity={0.8}
                                                onPress={() =>
                                                    setMainImage(
                                                        imgUri
                                                    )
                                                }
                                                style={{
                                                    borderColor:
                                                        isSelected
                                                            ? theme.primary
                                                            : theme.border,
                                                    opacity:
                                                        isSelected
                                                            ? 1
                                                            : 0.6,
                                                }}
                                                className="w-14 h-16 rounded-xl border-2 overflow-hidden p-0.5"
                                            >
                                                <Image
                                                    source={{
                                                        uri: imgUri,
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        borderRadius: 8,
                                                    }}
                                                    resizeMode="cover"
                                                />
                                            </TouchableOpacity>
                                        );
                                    }
                                )}
                            </ScrollView>
                        )}
                </View>

                {/* Identity + timestamps */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-5 rounded-2xl border items-start w-full flex-col gap-y-3"
                >
                    <View className="w-full">
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[10px] uppercase tracking-wider mb-1"
                        >
                            Full Product Name
                        </Text>
                        <Text
                            style={{
                                color: theme.primary,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.lg,
                            }}
                            className="text-left"
                        >
                            {routeItem.product_name ||
                                routeItem.title}
                        </Text>
                    </View>
                    <View
                        style={{ borderTopColor: theme.border }}
                        className="w-full flex-row justify-between items-center pt-2.5 border-t flex-wrap gap-2"
                    >
                        <View className="items-start">
                            <Text
                                style={{ color: theme.textDark }}
                                className="text-[9px] uppercase tracking-wider"
                            >
                                Initialized On
                            </Text>
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.semibold,
                                    fontSize: theme.fontSize.xs,
                                    marginTop: 2,
                                }}
                            >
                                {formatDateHandler(
                                    routeItem.created
                                )}
                            </Text>
                        </View>
                        <View className="items-end web:items-start">
                            <Text
                                style={{ color: theme.textDark }}
                                className="text-[9px] uppercase tracking-wider"
                            >
                                Last Ledger Sync
                            </Text>
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily:
                                        theme.font.semibold,
                                    fontSize: theme.fontSize.xs,
                                    marginTop: 2,
                                }}
                            >
                                {formatDateHandler(
                                    routeItem.updated
                                )}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Barcode card */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-5 rounded-2xl border items-start w-full flex-col"
                >
                    <Text
                        style={{ color: theme.textDark }}
                        className="text-[10px] uppercase tracking-wider mb-2"
                    >
                        Device Barcode Log Metrics (SKU / GTIN)
                    </Text>
                    {routeItem.bar_code ? (
                        <View
                            className="flex-row items-center gap-x-2 px-3 py-2 rounded-xl w-full border"
                            style={{
                                backgroundColor:
                                    'rgba(16,185,129,0.10)',
                                borderColor:
                                    'rgba(16,185,129,0.20)',
                            }}
                        >
                            <Text className="text-emerald-500 text-xs font-black">
                                🏷️
                            </Text>
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.mono,
                                    fontSize: theme.fontSize.sm,
                                }}
                                className="font-bold tracking-widest"
                            >
                                {routeItem.bar_code}
                            </Text>
                        </View>
                    ) : (
                        <View
                            className="flex-row items-center gap-x-2 px-3 py-2 rounded-xl w-full border"
                            style={{
                                backgroundColor:
                                    'rgba(245,158,11,0.10)',
                                borderColor:
                                    'rgba(245,158,11,0.20)',
                            }}
                        >
                            <Text className="text-amber-500 text-xs font-black">
                                ⚠️
                            </Text>
                            <Text
                                className="text-amber-500 text-xs uppercase tracking-wider"
                                style={{
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                Not Scanned — Registry Empty
                            </Text>
                        </View>
                    )}
                </View>

                {/* Composition card */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-5 rounded-2xl border w-full flex-row justify-between gap-3 flex-wrap"
                >
                    <View className="items-start min-w-[140px] flex-1">
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[10px] uppercase tracking-wider mb-1"
                        >
                            Formula Composition
                        </Text>
                        <View
                            className="px-2 py-0.5 rounded mt-1.5 self-start"
                            style={{
                                backgroundColor:
                                    'rgba(148,163,184,0.15)',
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                }}
                                className="uppercase"
                            >
                                {routeItem.long_preparation_title ||
                                    routeItem.preparation_title ||
                                    'GENERAL MERCHANDISE'}
                            </Text>
                        </View>
                    </View>
                    <View className="items-start min-w-[120px] flex-1">
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[10px] uppercase tracking-wider mb-1"
                        >
                            Form Formulation
                        </Text>
                        <View
                            className="px-2 py-0.5 rounded mt-1.5 self-start"
                            style={{
                                backgroundColor:
                                    'rgba(59,130,246,0.12)',
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.primary,
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                }}
                                className="uppercase"
                            >
                                {routeItem.formulation_title || '—'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Manufacturer + pack card */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-5 rounded-2xl border w-full flex-row justify-between gap-3 flex-wrap"
                >
                    <View className="items-start min-w-[140px] flex-1">
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[10px] uppercase tracking-wider mb-1"
                        >
                            Manufacturer
                        </Text>
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                                marginTop: 6,
                            }}
                            className="uppercase"
                        >
                            {routeItem.manufacturer_title || '—'}
                        </Text>
                    </View>
                    <View className="items-start min-w-[100px]">
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[10px] uppercase tracking-wider mb-1"
                        >
                            Pack Quantity Matrix
                        </Text>
                        <View
                            className="px-2.5 py-0.5 rounded mt-1.5 self-start"
                            style={{
                                backgroundColor:
                                    'rgba(148,163,184,0.10)',
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {routeItem.units_per_pack} items /
                                unit pack (
                                {routeItem.pack_tag || '—'})
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Category card */}
                <View
                    style={{
                        backgroundColor: theme.panel,
                        borderColor: theme.border,
                    }}
                    className="p-5 rounded-2xl border items-start w-full"
                >
                    <Text
                        style={{ color: theme.textDark }}
                        className="text-[10px] uppercase tracking-wider mb-1.5"
                    >
                        Category Parameter Ledger Status
                    </Text>
                    <Text
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.medium,
                            fontSize: theme.fontSize.xs,
                            lineHeight: 20,
                        }}
                    >
                        Ledger Category Group Allocation:{' '}
                        <Text
                            className="text-emerald-500"
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {(
                                routeItem.category_title || '—'
                            ).toUpperCase()}
                        </Text>{' '}
                        | Origin Country Hub Location:{' '}
                        <Text
                            style={{
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {(
                                routeItem.country_of_origin || '—'
                            ).toUpperCase()}
                        </Text>
                    </Text>
                </View>

                {/* Actions */}
                <View className="flex-row items-center gap-x-3 mt-2 w-full">
                    <TouchableOpacity
                        onPress={handleEditAction}
                        style={{ borderColor: theme.border }}
                        className="flex-1 h-11 rounded-xl border items-center justify-center active:opacity-70"
                    >
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                            className="uppercase"
                        >
                            Modify Record
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onClose}
                        style={{ backgroundColor: theme.primary }}
                        className="flex-1 h-11 rounded-xl items-center justify-center active:opacity-90"
                    >
                        <Text
                            className="text-white uppercase"
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.xs,
                            }}
                        >
                            Return To List
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}