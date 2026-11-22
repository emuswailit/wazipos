// app/(hotel)/hotelRecipeRequests/index.tsx — Hotel section. Guests' own dishes to price.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantRecipeRequests from '@/components/restaurants/owner/RestaurantRecipeRequests';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelRecipeRequestsRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantRecipeRequests />
        </DiningKindProvider>
    );
}
