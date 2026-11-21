// app/(tabs)/restaurants.tsx — Restaurants tab: order in, pick up, or book a table.
// Restaurants only; hotels have their own tab (app/(tabs)/hotels.tsx).

import RestaurantsHome from '@/components/restaurants/customer/RestaurantsHome';

export default function RestaurantsScreen() {
    return <RestaurantsHome kind="restaurant" />;
}
