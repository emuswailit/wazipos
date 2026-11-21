// app/(hotel)/hotelOrders/index.tsx — Hotel section. Orders & table bookings for the hotel's restaurant.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantOrders from '@/components/restaurants/owner/RestaurantOrders';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelOrdersRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantOrders />
        </DiningKindProvider>
    );
}
