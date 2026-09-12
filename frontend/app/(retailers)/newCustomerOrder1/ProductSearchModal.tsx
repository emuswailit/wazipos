import React, { useRef } from 'react';
import { FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProductItem } from './index';

interface ProductSearchModalProps {
    isOpen: boolean;
    searchQuery: string;
    theme: any;
    filteredOptions: ProductItem[];
    onSearchChange: (text: string) => void;
    onSelectProduct: (prod: ProductItem) => void;
    onClose: () => void;
}

export default function ProductSearchModal({
    isOpen,
    searchQuery,
    theme,
    filteredOptions,
    onSearchChange,
    onSelectProduct,
    onClose,
}: ProductSearchModalProps) {
    const inputRef = useRef<TextInput>(null);

    const handleModalOpenedFocus = () => {
        if (inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, Platform.OS === 'web' ? 50 : 120);
        }
    };

    const renderHighlightedText = (fullText: string, searchTxt: string, dimText: boolean) => {
        if (!searchTxt.trim()) {
            return <Text className="text-sm font-medium" style={{ color: dimText ? `${theme.text}40` : theme.text }}>{fullText}</Text>;
        }

        const escapedSearch = searchTxt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedSearch})`, 'gi');
        const parts = fullText.split(regex);

        return (
            <Text className="text-sm font-medium" style={{ color: dimText ? `${theme.text}40` : theme.text }}>
                {parts.map((part, index) =>
                    part.toLowerCase() === searchTxt.toLowerCase() ? (
                        <Text key={index} style={{ color: dimText ? `${theme.primary}50` : theme.primary, backgroundColor: dimText ? 'transparent' : `${theme.primary}15` }} className="font-bold">
                            {part}
                        </Text>
                    ) : (
                        <Text key={index}>{part}</Text>
                    )
                )}
            </Text>
        );
    };

    return (
        <Modal
            visible={isOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
            onShow={handleModalOpenedFocus}
        >
            <View className="flex-1 bg-black/60 justify-end md:justify-center items-center p-0 md:p-6">
                <View className="rounded-t-3xl md:rounded-3xl p-5 w-full md:w-3/4 max-w-5xl max-h-[85%] shadow-xl" style={{ backgroundColor: theme.panel }}>
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-lg font-bold" style={{ color: theme.text }}>Choose Product</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text className="font-bold text-base" style={{ color: theme.primary }}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    {/* AUTOCOMPLETE CONTAINER STYLING BLOCK */}
                    <View
                        className="flex-row items-center border-[0.5px] rounded-xl px-3.5 h-12 mb-4 w-full shadow-sm"
                        style={{
                            backgroundColor: theme.background,
                            borderColor: `${theme.textDark}30`
                        }}
                    >
                        <Text className="text-base mr-2 text-black/40">🔍</Text>

                        <TextInput
                            ref={inputRef}
                            autoFocus={Platform.OS === 'web'}
                            placeholder="Type standard catalog descriptions..."
                            placeholderTextColor={`${theme.textDark}70`}
                            value={searchQuery}
                            onChangeText={onSearchChange}
                            className="text-sm flex-1 h-full p-0 m-0 font-normal outline-none bg-transparent"
                            style={{ color: theme.text }}
                        />

                        {searchQuery.length > 0 && (
                            <TouchableOpacity
                                onPress={() => onSearchChange('')}
                                className="w-5 h-5 items-center justify-center rounded-full bg-black/5 active:bg-black/10 ml-1 mr-1"
                            >
                                <Text className="text-[10px] font-bold text-black/40">✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <FlatList
                        data={filteredOptions}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => {
                                    onSelectProduct(item);
                                    onClose();
                                }}
                                className="py-3 border-b border-black/5 flex-row justify-between items-center"
                            >
                                <View>
                                    {renderHighlightedText(item.title, searchQuery, false)}
                                    {item.sku && (
                                        <Text className="text-xs mt-0.5 text-black/40">SKU: {item.sku}</Text>
                                    )}
                                </View>
                                <Text className="text-sm font-bold" style={{ color: theme.text }}>
                                    {renderHighlightedText(String(item.available), searchQuery, true)} units
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </View>
        </Modal>
    );
}
