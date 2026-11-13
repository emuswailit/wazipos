// components/common/listScreen/DateRangeFilter.tsx
//
// "From – To" date filter for list toolbars (web) and under the mobile search bar.

import { DateField } from '@/components/common/DateField';
import React from 'react';
import { Text, View } from 'react-native';

import { useListTokens } from './tokens';

export function DateRangeFilter({
    from,
    to,
    onFromChange,
    onToChange,
    variant = 'web',
}: {
    from: string;
    to: string;
    onFromChange: (d: string) => void;
    onToChange: (d: string) => void;
    variant?: 'web' | 'mobile';
}) {
    const { theme } = useListTokens();
    const mobile = variant === 'mobile';
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: mobile ? '100%' : 300 }}>
            <View style={{ flex: 1 }}>
                <DateField value={from} onChangeText={onFromChange} placeholder="From" size="sm" bare />
            </View>
            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>–</Text>
            <View style={{ flex: 1 }}>
                <DateField value={to} onChangeText={onToChange} placeholder="To" size="sm" bare />
            </View>
        </View>
    );
}
