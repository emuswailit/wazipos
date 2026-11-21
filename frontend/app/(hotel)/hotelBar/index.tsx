// app/(hotel)/hotelBar/index.tsx — Hotel section. The hotel bar: bottles & tots, tabs, bar stock.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantBar from '@/components/restaurants/owner/RestaurantBar';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelBarRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantBar />
        </DiningKindProvider>
    );
}
