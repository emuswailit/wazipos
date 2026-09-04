import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { TextInput, View } from 'react-native';

interface OrderListSearchBarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export default function OrderListSearchBar({ searchQuery, setSearchQuery }: OrderListSearchBarProps) {
    const { theme, isDarkMode } = useAuth();

    return (
        <View className="w-full">
            <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search reference, customer account..."
                placeholderTextColor={isDarkMode ? '#4b5563' : '#9ca3af'}
                style={{
                    backgroundColor: theme.panel,
                    color: theme.text,
                    borderColor: `${theme.textDark}15`,
                }}
                className="w-full h-12 px-4 rounded-xl border text-sm font-semibold tracking-tight shadow-2xs"
            />
        </View>
    );
}
