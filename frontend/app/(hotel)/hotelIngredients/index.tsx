// app/(hotel)/hotelIngredients/index.tsx — Hotel section. Kitchen ingredients.
// Same screen as the Restaurant section, worded for a hotel.

import RestaurantIngredients from '@/components/restaurants/owner/RestaurantIngredients';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function HotelIngredientsRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <RestaurantIngredients />
        </DiningKindProvider>
    );
}
