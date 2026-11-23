// app/(dining)/restaurantForecast/index.tsx — supplies & bar forecasts + AI analyst.

import KitchenForecast from '@/components/restaurants/forecast/KitchenForecast';

export default function RestaurantForecastRoute() {
    return <KitchenForecast noun="restaurant" />;
}
