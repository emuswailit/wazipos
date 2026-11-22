// app/(tabs)/hotels.tsx — Hotels tab: book a room, order from the hotel kitchen, My stays.
// Separate from Restaurants (app/(tabs)/restaurants.tsx), which lists restaurants only.

import RestaurantsHome from '@/components/restaurants/customer/RestaurantsHome';

export default function HotelsScreen() {
    return <RestaurantsHome kind="hotel" />;
}
