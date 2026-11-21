// app/(hotel)/hotelTables/index.tsx — Hotel section. The hotel's restaurant tables.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantTables from '@/components/restaurants/owner/RestaurantTables';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelTablesRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantTables />
        </DiningKindProvider>
    );
}
