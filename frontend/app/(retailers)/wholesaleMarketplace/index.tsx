import { ChevronRight, MapPin, Search, SlidersHorizontal, Tag } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../../../context/AuthContext';

export interface WholesaleEntity { id: string; title: string; address: string; category: string; }
interface WholesaleListProps { onItemPress?: (item: WholesaleEntity) => void; }

const MOCK_DATA: WholesaleEntity[] = [
    { id: '1', title: 'Apex Global Distributors', address: '102 Industrial Pkwy, Sector 4', category: 'Electronics' },
    { id: '2', title: 'Prime Foods Wholesale', address: '443 Market St, Suite A', category: 'Groceries' },
    { id: '3', title: 'Vanguard Apparel Group', address: '78 Fashion Ave', category: 'Clothing & Textiles' },
    { id: '4', title: 'Matrix Logistics & Supply', address: '910 Freight Way', category: 'Automotive' },
    { id: '5', title: 'Summit Pharma Hub', address: '12 Medical Plaza Dr', category: 'Healthcare' },
    { id: '6', title: 'EcoPack Solutions Inc', address: '55 Green Renewable Rd', category: 'Packaging' },
];

export default function WholesaleListManager({ onItemPress }: WholesaleListProps) {
    const { width: windowWidth } = useWindowDimensions();
    const { theme, isDarkMode } = useAuth();

    const [search, setSearch] = useState('');
    const [userCols, setUserCols] = useState<number | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => { setIsMounted(true); }, []);

    const width = isMounted ? windowWidth : 375;
    const isLarge = width >= 768;
    const effectiveWidth = isLarge ? Math.min(width, 1152) : width;
    const columns = userCols ?? (isLarge ? 3 : 1);
    const options = isLarge ? [3, 4, 5] : [1, 2];

    const filtered = useMemo(() => MOCK_DATA.filter(i =>
        `${i.title} ${i.address} ${i.category}`.toLowerCase().includes(search.toLowerCase())
    ), [search]);

    const cardWidth = useMemo(() => (effectiveWidth - (12 * (columns + 1))) / columns, [effectiveWidth, columns]);

    return (
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
            <View className="p-4 border-b" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                <View className="w-full md:max-w-6xl md:self-center md:flex-row md:justify-between md:items-center gap-3">
                    <View className="flex-row items-center rounded-xl border flex-1 px-3 h-10 md:max-w-[350px]" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                        <Search size={16} color={theme.textDark} className="mr-2" />
                        <TextInput className="flex-1 h-full bg-transparent border-0 outline-none" placeholder="Filter entities..." placeholderTextColor={theme.textDark} value={search} onChangeText={setSearch} clearButtonMode="while-editing" style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.base, color: theme.text }} />
                    </View>
                    <View className="flex-row items-center gap-2">
                        <SlidersHorizontal size={14} color={theme.textDark} />
                        <Text style={{ fontFamily: theme.font.medium, fontSize: theme.fontSize.base, color: theme.textDark }}>Cols:</Text>
                        <View className="flex-row rounded-lg p-0.5" style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
                            {options.map(o => (
                                <TouchableOpacity key={o} className="px-2.5 py-1 rounded-md" style={{ backgroundColor: columns === o ? theme.panel : 'transparent' }} onPress={() => setUserCols(o)}>
                                    <Text style={{ fontSize: theme.fontSize.sm, fontFamily: columns === o ? theme.font.bold : theme.font.medium, color: columns === o ? theme.primary : theme.textDark }}>{o}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </View>

            <FlatList
                data={filtered}
                keyExtractor={item => item.id}
                key={columns}
                numColumns={columns}
                className="w-full md:max-w-6xl md:self-center flex-1"
                // flexGrow: 1 allows the list view container to fill empty layout footprints
                // justifyContent centers elements vertically on large preview viewports
                contentContainerStyle={{
                    padding: 12,
                    flexGrow: 1,
                    justifyContent: isLarge ? 'center' : 'flex-start'
                }}
                // Setting to center balances incomplete matrix layouts evenly horizontally
                columnWrapperStyle={columns > 1 ? { justifyContent: 'center' } : undefined}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => onItemPress?.(item)}
                        className="rounded-xl p-4 m-1.5 border justify-between ios:shadow-sm android:elevation-2 transition-transform duration-200 ease-out web:cursor-pointer"
                        style={({ hovered }: any) => ({
                            width: cardWidth,
                            minHeight: 150,
                            backgroundColor: theme.panel,
                            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                            transform: [{ scale: hovered && isLarge ? 1.03 : 1 }]
                        })}
                    >
                        <View className="flex-row justify-between items-center mb-2">
                            <View className="flex-row items-center px-2 py-0.5 rounded-md" style={{ backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff' }}>
                                <Tag size={11} color={isDarkMode ? '#93c5fd' : '#1e40af'} className="mr-1" />
                                <Text className="uppercase tracking-wider" style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: isDarkMode ? '#93c5fd' : '#1e40af' }}>{item.category}</Text>
                            </View>
                            <ChevronRight size={16} color={theme.textDark} />
                        </View>
                        <Text className="mb-2 leading-5 flex-1" numberOfLines={2} style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }}>{item.title}</Text>
                        <View className="flex-row items-start">
                            <MapPin size={13} color={theme.textDark} className="mr-1 mt-0.5" />
                            <Text className="flex-1 leading-4" numberOfLines={2} style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.textDark }}>{item.address}</Text>
                        </View>
                    </Pressable>
                )}
                ListEmptyComponent={
                    <View className="flex-1 justify-center items-center py-10">
                        <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.base, color: theme.textDark }}>No entities found.</Text>
                    </View>
                }
            />
        </View>
    );
}
