// app/(hotel)/hotelMenu/index.tsx — Hotel section. The hotel's menu.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantMenu from '@/components/restaurants/owner/RestaurantMenu';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelMenuRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantMenu />
        </DiningKindProvider>
    );
}
