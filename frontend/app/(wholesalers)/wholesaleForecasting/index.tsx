// app/(wholesalers)/wholesaleForecasting/index.tsx — wholesale demand, profit & turnover + AI analyst.

import ForecastInsights from '@/components/retailers/forecast/ForecastInsights';
import { PosHeader } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp } from 'lucide-react-native';
import { View } from 'react-native';

export default function WholesaleForecastingRoute() {
    const { theme } = useAuth();
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, maxWidth: 1240, width: '100%', alignSelf: 'center' }}>
                <PosHeader icon={TrendingUp} title="Forecasting" subtitle="What retailers will order from you, and the profit it brings" />
            </View>
            <ForecastInsights />
        </View>
    );
}
