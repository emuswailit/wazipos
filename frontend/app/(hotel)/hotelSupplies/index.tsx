// app/(hotel)/hotelSupplies/index.tsx — Hotel section. Food stock, cleaning materials, utilities, packaging.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantSupplies from '@/components/restaurants/owner/RestaurantSupplies';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelSuppliesRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantSupplies />
        </DiningKindProvider>
    );
}
