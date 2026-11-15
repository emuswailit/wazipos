// components/hotels/HotelStayView.tsx
//
// A guest books a room at a hotel (from the hotel's page in the Restaurants
// tab), then sees the booking and can pay for it straight away.

import type { Restaurant } from '@/api/diningApi';
import type { RoomBooking } from '@/api/hotelApi';
import { SheetButton, useListTokens } from '@/components/common/listScreen';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { StayCard } from './MyStays';
import RoomBooker from './RoomBooker';

export function HotelStayView({ hotel, onBack }: { hotel: Restaurant; onBack: () => void }) {
    const { theme } = useListTokens();
    const [booked, setBooked] = useState<RoomBooking | null>(null);

    if (!booked) return <RoomBooker entity={hotel.id} mode="guest" onBooked={setBooked} onBack={onBack} backLabel={hotel.title} />;
    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 4 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>{booked.status === 'CANCELLED' ? 'Booking cancelled' : 'Room booked'}</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {booked.status === 'CANCELLED' ? 'Nothing more to do.' : 'The hotel has your booking. Pay now to secure it, or pay at the hotel. Find it later under My stays.'}
                </Text>
            </View>
            <StayCard booking={booked} expanded onChanged={setBooked} />
            <SheetButton label="Book another room" icon="add" variant="secondary" onPress={() => setBooked(null)} />
            <SheetButton label={`Back to ${hotel.title}`} variant="ghost" onPress={onBack} />
        </ScrollView>
    );
}
